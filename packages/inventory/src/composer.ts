/**
 * The preset composer (docs/plans/studio-phase2-design.md, unit P4a): a homepage for a (fixture, stance, seed) built
 * from the inventory's presets, palettes and type pairings with no model call. Two jobs:
 *
 *  - the owner's approval round (review §6.5): about 30 example pages that together show as many draft presets,
 *    palettes, pairings and drawings as possible, in context (`approvalPlan`);
 *  - the studio's no-model baseline: one concept per stance, the control the tournament is measured against (S4).
 *
 * Deterministic: the same input gives a byte-identical spec (the seed is hashed with each asset id, nothing else is
 * random). Nothing is invented: every word and fact comes from `fillPreset` over the fixture's sources (golden business,
 * recorded brief, the golden's own section copy); a preset that can't be filled for the business is skipped. A section
 * joins the page only when the full spec validates with no issue the page didn't have before, so the result passes the
 * composition guards (G1–G25, across sections too) and the design rules by construction; `composeHomepage` checks the
 * whole spec once more and throws when it does not validate.
 *
 * Catalogue: "drafts" treats every non-rejected asset as usable (eval and approval pages only, review §6.5); "approved"
 * uses only approved ones. Pairings: only the 20 starter pairs (spec FONT_PAIRS) can be set in a spec today; the 88
 * inventory pairs (INVENTORY_FONT_PAIRS) have no type system or renderer entry yet, so they can't appear on a page.
 */
import { readFileSync } from "node:fs";
import {
  DIRECTIONS,
  DRAWINGS,
  FONT_PAIRS,
  SHAPES,
  STANCES,
  enforceDesign,
  fillPreset,
  migrateSpec,
  presetSection,
  semanticIssues,
  stanceFitsSubtype,
  validateSite,
  wordmarkFits,
  type BusinessType,
  type ComposedProps,
  type CompositionPreset,
  type Design,
  type Direction,
  type PresetSources,
  type Section,
  type SiteSpec,
  type Stance,
} from "@sb/spec";
import { inventory } from "./index.ts";
import { COMPOSITION_PRESETS } from "./compositions/index.ts";
import { DRAWING_META } from "./drawings.ts";
import { paletteOf } from "./sources.ts";
import type { Asset } from "./schema.ts";

// ---------- input and output ----------

export const COMPOSER_FIXTURES = ["pekarna-kvas", "avtoservis-mrak", "instalacije-rebernik"] as const;
export type ComposerFixture = (typeof COMPOSER_FIXTURES)[number];
export type ComposerCatalogue = "drafts" | "approved";

export interface ComposeInput {
  fixtureId: string;
  stance: string;
  seed: number;
  catalogue: ComposerCatalogue;
  /** Asset ids to favour when they fit (the approval planner passes the ones no page shows yet). */
  prefer?: readonly string[];
}

/** What a page is made of, for the coverage report and the approval pages' captions. */
export interface ComposeUsed {
  fixtureId: string;
  stance: string;
  seed: number;
  catalogue: ComposerCatalogue;
  presets: string[];
  palette: string;
  pairing: string;
  drawing: string | null;
  wordmark: string | null;
  /** Presets that could not be filled or did not validate here, as "id: reason". */
  skipped: string[];
}

export interface ComposeResult {
  spec: SiteSpec;
  used: ComposeUsed;
}

/** The composer can't build this page (a stance that doesn't fit the trade, nothing usable for an intent, a spec that does not validate). */
export class ComposerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ComposerError";
  }
}

// ---------- the fixtures ----------

type FixtureSources = Omit<PresetSources, "copy"> & { copy: Record<string, PresetSources["copy"]> };

/** The engine's verbatimForm (composed-facts.ts; the inventory can't import the engine): quote marks dropped, whitespace collapsed, a leading or trailing ellipsis dropped. */
const verbatimForm = (s: string): string =>
  s
    .replace(/["'„“”«»‚‘’‹›`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(?:…|\.\.\.)\s*/, "")
    .replace(/\s*(?:…|\.\.\.)$/, "")
    .trim();

/**
 * The fixture's sources. The recorded brief's steps and questions were written by the extraction model; the fact check
 * wants a client's steps and answers in their own words (engine composed-facts.ts), so the ones the client's text does not
 * hold verbatim are left out here and a preset that needs them is skipped.
 */
const fixtureSources = (() => {
  const cache = new Map<string, FixtureSources>();
  let raw: Record<string, FixtureSources> | undefined;
  return (id: string): FixtureSources => {
    const hit = cache.get(id);
    if (hit) return hit;
    raw ??= JSON.parse(readFileSync(new URL("../test/fixtures/preset-sources.json", import.meta.url), "utf8")) as Record<string, FixtureSources>;
    const f = raw[id];
    if (!f) throw new ComposerError(`no preset sources for fixture ${id}`);
    const text = verbatimForm((JSON.parse(readFileSync(new URL(`../../../tools/eval/fixtures/${id}/brief.json`, import.meta.url), "utf8")) as { description: string }).description);
    const said = (s: string): boolean => verbatimForm(s) !== "" && text.includes(verbatimForm(s));
    const { steps, faq, ...brief } = f.brief ?? {};
    const keptSteps = (steps ?? []).filter((s) => said(s.title) && said(s.text));
    const keptFaq = (faq ?? []).filter((q) => said(q.question) && said(q.answer));
    const out: FixtureSources = { ...f, brief: { ...brief, ...(keptSteps.length ? { steps: keptSteps } : {}), ...(keptFaq.length ? { faq: keptFaq } : {}) } };
    cache.set(id, out);
    return out;
  };
})();

const goldens = new Map<string, SiteSpec>();
/** The fixture's golden spec (its business, photos and system pages), migrated to the current version. */
function golden(id: string): SiteSpec {
  let g = goldens.get(id);
  if (!g) {
    g = migrateSpec(JSON.parse(readFileSync(new URL(`../../../tools/eval/golden/${id}.json`, import.meta.url), "utf8"))) as SiteSpec;
    goldens.set(id, g);
  }
  return structuredClone(g);
}

/** The trade within the type that drawings are named by (DRAWING_META trades: "plumbing", "florist" …), for fixtures whose golden has no subtype. */
const FIXTURE_TRADE_WORD: Readonly<Record<string, string>> = { "instalacije-rebernik": "plumbing" };

// ---------- seeded choice ----------

/** FNV-1a, 32 bits: the composer's only source of variation. */
function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
/** A number in [0, 1) from the seed, a salt and a key. */
const unit = (seed: number, salt: string, key: string): number => hash32(`${seed}:${salt}:${key}`) / 2 ** 32;

/** Highest score first; ties and near ties broken by the seed. */
function ranked<T>(items: readonly T[], score: (t: T) => number, key: (t: T) => string, seed: number, salt: string, jitter = 1.5): T[] {
  return items
    .map((t) => ({ t, s: score(t) + unit(seed, salt, key(t)) * jitter }))
    .sort((a, b) => b.s - a.s || (key(a.t) < key(b.t) ? -1 : 1))
    .map((x) => x.t);
}

// ---------- the catalogue ----------

const usable = (a: Asset, catalogue: ComposerCatalogue): boolean => (catalogue === "approved" ? a.status === "approved" : a.status !== "rejected");

const FAMILY_TAG: Readonly<Record<string, string>> = { place: "nature" };

function assetsOf(kind: Asset["kind"], catalogue: ComposerCatalogue): Asset[] {
  return inventory()
    .byKind(kind)
    .filter((a) => usable(a, catalogue));
}

const intentOf = (id: string): string => id.split("/")[1]!;

/** Whether a tag list that names trades (empty: any) includes this business type or its trade word. */
function tradeFit(tags: readonly string[], type: string, word?: string): "any" | "yes" | "no" {
  if (!tags.length) return "any";
  return tags.some((t) => t === type || t.startsWith(`${type}/`) || (word !== undefined && (t === word || t.endsWith(`/${word}`)))) ? "yes" : "no";
}

// ---------- the page plan ----------

/** What each trade's page sells; the middle of the page is built around it. */
const MAIN_INTENT: Readonly<Record<BusinessType, string>> = {
  bakery: "products",
  restaurant: "menu",
  shop: "products",
  "tourist-farm": "rooms",
  "car-repair": "services",
  builder: "services",
  hairdresser: "services",
  accountant: "services",
  dental: "services",
  physio: "services",
};

/** The order the middle intents appear in, top to bottom. */
const MIDDLE_ORDER = ["notice", "highlights", "story", "services", "products", "menu", "rooms", "prices", "steps", "gallery", "faq", "team", "hours", "area", "call", "booking"] as const;
/** Intents the seed may add beside the trade's main one; menu only where a menu of what the client sells reads true. */
const OPTIONAL_MIDDLE = ["highlights", "story", "prices", "steps", "gallery", "faq", "team", "hours", "area", "call", "booking", "notice", "menu"] as const;
const MENU_TRADES: ReadonlySet<string> = new Set(["bakery", "shop", "restaurant", "tourist-farm"]);

/** hero, the trade's main intent, two or three optional ones by the seed, hours (when not drawn), and the contact last. */
function pagePlan(type: BusinessType, seed: number, stance: string, prefer: ReadonlySet<string>): string[] {
  const wanted = new Set([...prefer].filter((id) => id.startsWith("composition/")).map(intentOf));
  const main = MAIN_INTENT[type];
  const picks = ranked(OPTIONAL_MIDDLE, (i) => (wanted.has(i) ? 1.5 : 0), (i) => i, seed, `plan:${stance}`, 1)
    .filter((i) => i !== main && (i !== "menu" || MENU_TRADES.has(type)))
    .slice(0, 3 + (hash32(`${seed}:n:${stance}`) % 2));
  const middle = new Set<string>([main, ...picks]);
  if (!middle.has("hours")) middle.add("hours");
  return ["hero", ...MIDDLE_ORDER.filter((i) => middle.has(i)), "contact"];
}

// ---------- the design ----------

const SHAPE_RADIUS: Readonly<Record<string, number>> = { square: 0, soft: 8, cut: 2, arch: 8 };

function pickDirection(type: BusinessType, ground: string, seed: number, stance: string): Direction {
  const plain = DIRECTIONS.filter((d) => !d.template);
  const fitting = plain.filter((d) => d.bestFor.includes(type));
  const pool = (fitting.length ? fitting : plain).slice();
  const sameGround = pool.filter((d) => d.palette.background === ground);
  const from = sameGround.length ? sameGround : pool;
  return ranked(from, () => 0, (d) => d.id, seed, `dir:${stance}`, 1)[0]!;
}

interface Chosen {
  palette: Asset;
  colors: Design["colors"];
  pairing: Asset;
  pairId: string;
}

function scorePalette(a: Asset, st: Stance, type: string, word: string | undefined, prefer: ReadonlySet<string>): number {
  let s = 0;
  const trade = tradeFit(a.tags.trades, type, word);
  s += trade === "yes" ? 3 : trade === "no" ? -4 : 0;
  if (a.tags.stances.includes(st.id)) s += 4;
  else if (a.tags.stances.includes(FAMILY_TAG[st.family] ?? st.family)) s += 2;
  s += Math.min(2, a.tags.mood.filter((m) => (st.axes.palette as readonly string[]).includes(m)).length);
  if (a.tags.ground.some((g) => (st.axes.ground as readonly string[]).includes(g))) s += 1;
  if (prefer.has(a.id)) s += 3;
  return s;
}

function scorePairing(a: Asset, st: Stance, type: string, prefer: ReadonlySet<string>): number {
  let s = 0;
  const trade = tradeFit(a.tags.trades, type);
  s += trade === "yes" ? 2 : trade === "no" ? -2 : 0;
  if (st.axes.type.includes(a.id.slice("pairing/".length))) s += 5;
  if (a.tags.stances.includes(FAMILY_TAG[st.family] ?? st.family)) s += 2;
  if (prefer.has(a.id)) s += 3;
  return s;
}

/** The pairings a spec can set today: the starter pairs. */
const RENDERABLE_PAIRS: ReadonlySet<string> = new Set(FONT_PAIRS.map((p) => p.id));

function choose(st: Stance, type: BusinessType, word: string | undefined, seed: number, catalogue: ComposerCatalogue, prefer: ReadonlySet<string>): Chosen {
  const palettes = assetsOf("palette", catalogue).filter((a) => paletteOf(a.id));
  const pairings = assetsOf("pairing", catalogue).filter((a) => RENDERABLE_PAIRS.has(a.id.slice("pairing/".length)));
  if (!palettes.length) throw new ComposerError(`no ${catalogue} palette`);
  if (!pairings.length) throw new ComposerError(`no ${catalogue} pairing that a spec can set`);
  const pick = <T>(list: T[], score: (t: T) => number, key: (t: T) => string, salt: string): T => {
    const scores = list.map(score);
    const best = Math.max(...scores);
    const pool = list.filter((_, i) => scores[i]! >= best - 2).slice(0, 8);
    const order = ranked(pool, score, key, seed, salt, 2);
    return order[0]!;
  };
  const palette = pick(palettes, (a) => scorePalette(a, st, type, word, prefer), (a) => a.id, `pal:${st.id}`);
  const pairing = pick(pairings, (a) => scorePairing(a, st, type, prefer), (a) => a.id, `pair:${st.id}`);
  return { palette, colors: { ...paletteOf(palette.id)!.colors }, pairing, pairId: pairing.id.slice("pairing/".length) };
}

function designFor(st: Stance, type: BusinessType, ch: Chosen, seed: number): Design {
  const ground = ch.palette.tags.ground[0] ?? "white";
  const dir = pickDirection(type, ground, seed, st.id);
  const pickOf = <T>(xs: readonly T[], salt: string): T => xs[Math.floor(unit(seed, salt, st.id) * xs.length)]!;
  const shape = pickOf(st.axes.shape.filter((s) => (SHAPES as readonly string[]).includes(s)), "shape");
  const density = pickOf(st.axes.density, "density");
  const imagery = pickOf(st.axes.imagery, "imagery");
  const design: Design = {
    direction: dir.id,
    fontPair: ch.pairId,
    colors: ch.colors,
    radius: SHAPE_RADIUS[shape] ?? 4,
    baseFontSize: 17,
    scale: 1.25,
    headingWeight: 700,
    headingCase: "normal",
    headingTracking: -0.01,
    density,
    shadow: "none",
    imagery,
    motion: st.axes.motion,
    seed: seed.toString(36).padStart(6, "0"),
    genome: { source: "picked", palette: "preset", rhythm: st.axes.rhythm?.[0] ?? "alternate", shape },
  };
  return enforceDesign(design, dir);
}

// ---------- building the page ----------

const issueKey = (i: { path: string; message: string }): string => `${i.path}|${i.message}`;

/** Home page sections of a candidate spec. */
const home = (spec: SiteSpec) => spec.pages.find((p) => p.kind === "home")!;

/** A section is allowed on the page when the spec has no issue it didn't have before. */
function addsNoIssue(spec: SiteSpec, sections: Section[], next: Section): boolean {
  home(spec).sections = sections;
  const before = new Set(semanticIssues(spec).map(issueKey));
  home(spec).sections = [...sections, next];
  const after = semanticIssues(spec).map(issueKey);
  home(spec).sections = sections;
  return after.every((k) => before.has(k));
}

/** Rotates the photos so different sections open on different pictures. */
function rotated<T>(xs: readonly T[], by: number): T[] {
  if (!xs.length) return [];
  const n = by % xs.length;
  return [...xs.slice(n), ...xs.slice(0, n)];
}

function candidatesFor(intent: string, st: Stance, type: string, word: string | undefined, catalogue: ComposerCatalogue, seed: number, prefer: ReadonlySet<string>): CompositionPreset[] {
  const ids = new Set(assetsOf("composition", catalogue).map((a) => a.id));
  const list = COMPOSITION_PRESETS.filter((p) => intentOf(p.id) === intent && ids.has(p.id) && tradeFit(p.tags?.trades ?? [], type, word) !== "no");
  const score = (p: CompositionPreset): number => {
    let s = 0;
    if (st.signatures.includes(p.id)) s += 6;
    const tagged = p.tags?.stances ?? [];
    if (tagged.includes(st.id)) s += 4;
    else if (tagged.length) s -= 1;
    if (tradeFit(p.tags?.trades ?? [], type, word) === "yes") s += 1;
    if (prefer.has(p.id)) s += 3;
    return s;
  };
  return ranked(list, score, (p) => p.id, seed, `preset:${intent}:${st.id}`, 2);
}

/** Drawings that suit the trade and (preferably) the stance. */
function drawingCandidates(st: Stance, type: string, word: string | undefined, catalogue: ComposerCatalogue, seed: number, prefer: ReadonlySet<string>): string[] {
  const ids = new Set(assetsOf("motif", catalogue).concat(assetsOf("ornament", catalogue)).map((a) => a.id));
  const list = (DRAWINGS as readonly string[]).filter((d) => ids.has(d) && DRAWING_META[d as keyof typeof DRAWING_META] && tradeFit(DRAWING_META[d as keyof typeof DRAWING_META].trades, type, word) !== "no");
  const score = (d: string): number => {
    const m = DRAWING_META[d as keyof typeof DRAWING_META];
    let s = tradeFit(m.trades, type, word) === "yes" ? 3 : 0;
    if (m.stances.includes(st.id)) s += 3;
    if (prefer.has(d)) s += 4;
    return s;
  };
  return ranked(list, score, (d) => d, seed, `drawing:${st.id}`, 1.5);
}

export function composeHomepageDetailed(input: ComposeInput): ComposeResult {
  const { fixtureId, seed, catalogue } = input;
  if (!Number.isInteger(seed) || seed < 0) throw new ComposerError(`seed must be a whole number ≥ 0, not ${seed}`);
  const st = STANCES.find((s) => s.id === input.stance);
  if (!st) throw new ComposerError(`unknown stance ${input.stance}`);
  const base = golden(fixtureId);
  const type = base.business.type;
  if (!stanceFitsSubtype(st, type, base.business.subtype)) throw new ComposerError(`stance ${st.id} does not fit ${type}`);
  const sources = fixtureSources(fixtureId);
  const word = base.business.subtype ?? FIXTURE_TRADE_WORD[fixtureId];
  const prefer = new Set(input.prefer ?? []);

  // The look: a palette and a pairing that fit the stance and the trade, tokens from the stance's axes.
  const chosen = choose(st, type, word, seed, catalogue, prefer);
  const spec = base;
  spec.slug = `${`${fixtureId}-${st.id}`.slice(0, 40).replace(/-+$/, "")}-${seed}`;
  spec.design = designFor(st, type, chosen, seed);
  delete spec.assets.logo;
  home(spec).sections = [];
  if (spec.design.wordmark) delete spec.design.wordmark;

  // The wordmark: a typographic mark for the header, from the wordmark styles the catalogue allows.
  const wordmarks = assetsOf("wordmark", catalogue)
    .map((a) => a.id.slice("wordmark/".length))
    .filter((w) => wordmarkFits(spec.business.name, w as never, "header"));
  const wordmarkOrder = ranked(wordmarks, (w) => (prefer.has(`wordmark/${w}`) ? 3 : 0), (w) => w, seed, `wordmark:${st.id}`, 1);

  const skipped: string[] = [];
  const sections: Section[] = [];
  const used: string[] = [];
  const src = (intent: string, at: number): PresetSources => ({
    ...fixtureSources(fixtureId),
    images: rotated(sources.images ?? [], at),
    colors: spec.design.colors,
    ...(sources.copy[intent] ? { copy: sources.copy[intent] } : {}),
  }) as PresetSources;

  for (const intent of pagePlan(type, seed, st.id, prefer)) {
    let placed = false;
    for (const preset of candidatesFor(intent, st, type, word, catalogue, seed, prefer)) {
      const filled = fillPreset(preset, src(intent, sections.length));
      if (!filled.ok) {
        skipped.push(`${preset.id}: ${filled.reason}`);
        continue;
      }
      const section = presetSection(preset, filled.props as ComposedProps, `s_${intent}`) as unknown as Section;
      if (!addsNoIssue(spec, sections, section)) {
        skipped.push(`${preset.id}: guards`);
        continue;
      }
      sections.push(section);
      used.push(preset.id);
      placed = true;
      break;
    }
    if (!placed && intent === "hero") throw new ComposerError(`no ${catalogue} hero preset fills for ${fixtureId} under ${st.id}`);
  }
  if (sections.length < 3) throw new ComposerError(`only ${sections.length} sections could be composed for ${fixtureId} under ${st.id} (${catalogue})`);
  home(spec).sections = sections;

  // A drawing behind one section (the hero first), when one suits the trade and the guards agree.
  let drawing: string | null = null;
  for (const d of drawingCandidates(st, type, word, catalogue, seed, prefer)) {
    for (const i of [0, sections.length - 1, 1, 2].filter((x, n, a) => x >= 0 && x < sections.length && a.indexOf(x) === n)) {
      const s = sections[i]!;
      const props = s.props as { background?: { kind: string }[] };
      if ((props.background ?? []).some((l) => l.kind === "drawing") || (props.background ?? []).length >= 2) continue;
      const trial = structuredClone(s) as Section & { props: { background?: unknown[] } };
      trial.props.background = [...(props.background ?? []), { kind: "drawing", drawing: d, scale: 3, anchor: "end" }];
      const probe = structuredClone(spec);
      home(probe).sections = sections.map((x, k) => (k === i ? trial : x));
      const before = new Set(semanticIssues(spec).map(issueKey));
      if (semanticIssues(probe).every((x) => before.has(issueKey(x)))) {
        sections[i] = trial;
        home(spec).sections = sections;
        drawing = d;
        break;
      }
    }
    if (drawing) break;
  }

  // The wordmark, when the whole page still validates with it.
  let wordmark: string | null = null;
  for (const w of wordmarkOrder) {
    const before = new Set(semanticIssues(spec).map(issueKey));
    spec.design.wordmark = { style: w as never };
    if (semanticIssues(spec).every((x) => before.has(issueKey(x)))) {
      wordmark = w;
      break;
    }
    delete spec.design.wordmark;
  }

  const result = validateSite(spec);
  if (!result.ok) throw new ComposerError(`${fixtureId} under ${st.id} (seed ${seed}) does not validate: ${result.issues.slice(0, 3).map((i) => `${i.path} ${i.message}`).join("; ")}`);
  return {
    spec: result.spec,
    used: { fixtureId, stance: st.id, seed, catalogue, presets: used, palette: chosen.palette.id, pairing: chosen.pairing.id, drawing, wordmark: wordmark && `wordmark/${wordmark}`, skipped },
  };
}

/** A homepage for the fixture under the stance: presets, a palette and a pairing picked by the seed. Throws ComposerError when it cannot be built. */
export function composeHomepage(input: ComposeInput): SiteSpec {
  return composeHomepageDetailed(input).spec;
}

// ---------- which stances fit which fixture ----------

/** The stances that fit the fixture's trade (and sub-trade), in the deck's order. */
export function fittingStances(fixtureId: string): Stance[] {
  const g = golden(fixtureId);
  return STANCES.filter((s) => stanceFitsSubtype(s, g.business.type, g.business.subtype));
}

// ---------- the approval set ----------

export interface ApprovalPage {
  fixtureId: string;
  stance: string;
  seed: number;
  /** "named": one of the 9 pages the design names (3 fixtures × 3 stances of different families); "extra": added for coverage. */
  kind: "named" | "extra";
}

export interface CoverageKind {
  covered: number;
  total: number;
  missing: string[];
}
export type Coverage = Record<"compositions" | "palettes" | "pairings" | "drawings" | "wordmarks" | "stances", CoverageKind>;

/** The draft assets that count as coverable, per kind. */
export function coverableAssets(): Record<keyof Coverage, string[]> {
  const drafts = (kind: Asset["kind"]) => inventory().byKind(kind).filter((a) => a.status === "draft").map((a) => a.id);
  return {
    compositions: drafts("composition"),
    palettes: drafts("palette"),
    pairings: drafts("pairing"),
    drawings: [...drafts("motif"), ...drafts("ornament")].filter((d) => (DRAWINGS as readonly string[]).includes(d)),
    wordmarks: drafts("wordmark"),
    stances: STANCES.map((s) => s.id),
  };
}

/** The coverage of a set of composed pages: how many draft assets of each kind appear on at least one page. */
export function coverageOf(pages: readonly ComposeUsed[]): Coverage {
  const all = coverableAssets();
  const seen: Record<keyof Coverage, Set<string>> = {
    compositions: new Set(pages.flatMap((p) => p.presets)),
    palettes: new Set(pages.map((p) => p.palette)),
    pairings: new Set(pages.map((p) => p.pairing)),
    drawings: new Set(pages.flatMap((p) => (p.drawing ? [p.drawing] : []))),
    wordmarks: new Set(pages.flatMap((p) => (p.wordmark ? [p.wordmark] : []))),
    stances: new Set(pages.map((p) => p.stance)),
  };
  const out = {} as Coverage;
  for (const k of Object.keys(all) as (keyof Coverage)[]) {
    const missing = all[k].filter((id) => !seen[k].has(id));
    out[k] = { covered: all[k].length - missing.length, total: all[k].length, missing };
  }
  return out;
}

/** Three stances of different families that fit the fixture, favouring ones the presets are tagged for and ones not yet used by another fixture. */
function namedStances(fixtureId: string, taken: ReadonlySet<string>): string[] {
  const tagged = (id: string) => COMPOSITION_PRESETS.filter((p) => p.tags?.stances?.includes(id)).length;
  const pool = fittingStances(fixtureId).filter((s) => !taken.has(s.id));
  const out: Stance[] = [];
  while (out.length < 3 && pool.length) {
    const families = new Set(out.map((s) => s.family));
    const best = pool
      .filter((s) => !families.has(s.family) || families.size >= 6)
      .sort((a, b) => tagged(b.id) - tagged(a.id) || (a.id < b.id ? -1 : 1))[0];
    if (!best) break;
    out.push(best);
    pool.splice(pool.indexOf(best), 1);
  }
  return out.map((s) => s.id);
}

export interface ApprovalPlan {
  pages: ApprovalPage[];
  /** The composed pages, in the order of `pages` (the extra ones were built with `prefer`, so they are kept, not rebuilt). */
  results: ComposeResult[];
  used: ComposeUsed[];
  coverage: Coverage;
}

/**
 * The approval set (review §6.5): the 9 named pages, then pages added one at a time, each the (fixture, stance, seed)
 * out of a deterministic pool that shows the most drafts no earlier page shows. Total `count` pages (default 30).
 */
export function approvalPlan(opts: { count?: number; pool?: number } = {}): ApprovalPlan {
  const count = opts.count ?? 30;
  const poolSize = opts.pool ?? 24;
  const pages: ApprovalPage[] = [];
  const results: ComposeResult[] = [];
  const used: ComposeUsed[] = [];
  const taken = new Set<string>();
  const keyOf = (f: string, s: string, n: number) => `${f}|${s}|${n}`;
  const done = new Set<string>();
  const add = (kind: ApprovalPage["kind"], r: ComposeResult) => {
    pages.push({ fixtureId: r.used.fixtureId, stance: r.used.stance, seed: r.used.seed, kind });
    results.push(r);
    used.push(r.used);
    done.add(keyOf(r.used.fixtureId, r.used.stance, r.used.seed));
  };
  for (const f of COMPOSER_FIXTURES) {
    for (const s of namedStances(f, taken)) {
      taken.add(s);
      add("named", composeHomepageDetailed({ fixtureId: f, stance: s, seed: 1, catalogue: "drafts" }));
    }
  }
  const all = coverableAssets();
  const wanted = new Set([...all.compositions, ...all.palettes, ...all.drawings, ...all.wordmarks]);
  const gain = (u: ComposeUsed, seen: ReadonlySet<string>): number => {
    const ids = [...u.presets, u.palette, ...(u.drawing ? [u.drawing] : []), ...(u.wordmark ? [u.wordmark] : [])];
    return ids.filter((id) => wanted.has(id) && !seen.has(id)).length + (seen.has(`stance:${u.stance}`) ? 0 : 0.5);
  };
  const seenIds = (): Set<string> => new Set(used.flatMap((u) => [...u.presets, u.palette, ...(u.drawing ? [u.drawing] : []), ...(u.wordmark ? [u.wordmark] : []), `stance:${u.stance}`]));
  for (let n = 0; pages.length < count && n < count * 4; n++) {
    const seen = seenIds();
    const prefer = [...wanted].filter((id) => !seen.has(id));
    // A deterministic pool of (fixture, stance) pairs, rotating through the fixtures and the stances not used much yet.
    const used_ = new Map<string, number>();
    for (const u of used) used_.set(u.stance, (used_.get(u.stance) ?? 0) + 1);
    const pairs = COMPOSER_FIXTURES.flatMap((f) => fittingStances(f).map((s) => ({ f, s: s.id })));
    const order = pairs
      .map((p) => ({ p, k: (used_.get(p.s) ?? 0) * 10 + hash32(`${p.f}:${p.s}:${pages.length}`) / 2 ** 32 }))
      .sort((a, b) => a.k - b.k)
      .slice(0, poolSize);
    let best: { r: ComposeResult; g: number } | undefined;
    for (const { p } of order) {
      const seed = 2 + pages.length;
      if (done.has(keyOf(p.f, p.s, seed))) continue;
      let r: ComposeResult;
      try {
        r = composeHomepageDetailed({ fixtureId: p.f, stance: p.s, seed, catalogue: "drafts", prefer });
      } catch {
        continue;
      }
      const g = gain(r.used, seen);
      if (!best || g > best.g) best = { r, g };
    }
    if (!best) break;
    add("extra", best.r);
  }
  return { pages, results, used, coverage: coverageOf(used) };
}
