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
  intentOfSection,
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
  type ImageAsset,
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
  /**
   * Fixed picks instead of the seed's, for a page built to show one design (the hero-bar sheet): the hero preset, the
   * palette, the pairing and the wordmark by asset id, the imagery treatment; `drawing: null` keeps the drawing layer off. Each must be usable in
   * the catalogue; a pinned hero that doesn't fill throws rather than falling back to another.
   */
  pin?: { hero?: string; palette?: string; pairing?: string; wordmark?: string; drawing?: null; imagery?: Design["imagery"] };
  /** AI-made pictures (origin "generated") the hero may use, ahead of the client's photos; no other section sees them (validateSite allows them only in the opener). */
  pictures?: readonly ImageAsset[];
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
  /** With a director's choice: the picks that fell back to the composer's own ("palette <id>", "<intent> <preset id>"). */
  fallbacks?: string[];
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

/** What a page is filled from: the business, its images, the brief, and the copy written for each intent. */
export type ComposeSources = Omit<PresetSources, "copy"> & { copy: Record<string, PresetSources["copy"]> };
type FixtureSources = ComposeSources;

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
 * The brief with only the steps and questions the client's text holds verbatim (the fact check wants a client's steps and
 * answers in their own words, engine composed-facts.ts); the rest of the brief as it is.
 */
export function clientWordsOnly<B extends PresetSources["brief"]>(brief: B | undefined, clientText: string): PresetSources["brief"] {
  const text = verbatimForm(clientText);
  const said = (s: string): boolean => verbatimForm(s) !== "" && text.includes(verbatimForm(s));
  const { steps, faq, ...rest } = brief ?? {};
  const keptSteps = (steps ?? []).filter((s) => said(s.title) && said(s.text));
  const keptFaq = (faq ?? []).filter((q) => said(q.question) && said(q.answer));
  return { ...rest, ...(keptSteps.length ? { steps: keptSteps } : {}), ...(keptFaq.length ? { faq: keptFaq } : {}) };
}

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
    const description = (JSON.parse(readFileSync(new URL(`../../../tools/eval/fixtures/${id}/brief.json`, import.meta.url), "utf8")) as { description: string }).description;
    const out: FixtureSources = { ...f, brief: clientWordsOnly(f.brief, description) };
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

function choose(st: Stance, type: BusinessType, word: string | undefined, seed: number, catalogue: ComposerCatalogue, prefer: ReadonlySet<string>, pin: NonNullable<ComposeInput["pin"]>): Chosen {
  const pinned = (list: Asset[], id: string | undefined, what: string): Asset[] => {
    if (id === undefined) return list;
    const hit = list.filter((a) => a.id === id);
    if (!hit.length) throw new ComposerError(`pinned ${what} ${id} is not a usable ${catalogue} ${what}`);
    return hit;
  };
  const palettes = pinned(
    assetsOf("palette", catalogue).filter((a) => paletteOf(a.id)),
    pin.palette,
    "palette",
  );
  const pairings = pinned(
    assetsOf("pairing", catalogue).filter((a) => RENDERABLE_PAIRS.has(a.id.slice("pairing/".length))),
    pin.pairing,
    "pairing",
  );
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

function designFor(st: Stance, type: BusinessType, ch: Chosen, seed: number, pinnedImagery?: Design["imagery"]): Design {
  const ground = ch.palette.tags.ground[0] ?? "white";
  const dir = pickDirection(type, ground, seed, st.id);
  const pickOf = <T>(xs: readonly T[], salt: string): T => xs[Math.floor(unit(seed, salt, st.id) * xs.length)]!;
  const shape = pickOf(st.axes.shape.filter((s) => (SHAPES as readonly string[]).includes(s)), "shape");
  const density = pickOf(st.axes.density, "density");
  const imagery = pinnedImagery ?? pickOf(st.axes.imagery, "imagery");
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

/**
 * The studio director's picks (engine studio/director.ts), already checked against the shortlist by the engine. Each one is
 * a preference: an id the catalogue doesn't offer here, or a preset that can't be filled or breaks a guard, falls back to
 * the composer's own deterministic pick for that intent.
 */
export interface ComposeChoice {
  palette?: string;
  pairing?: string;
  wordmark?: string;
  /**
   * The page's sections in order (the hero is moved first and the contact last, added when missing; an intent at most
   * twice). `preset` absent: the composer's own pick. `copy`: the section's headline and lead, over the sources' copy for
   * the intent's first section; a second section of an intent has only its own copy.
   */
  sections?: readonly ChoiceSection[];
}

export interface ChoiceSection {
  intent: string;
  preset?: string;
  copy?: { headline?: string; lead?: string };
}

/** A homepage composed over any site spec (the live studio), not only the eval fixtures. */
export interface BaseComposeInput {
  /** The site as today's pipeline wrote it: its business, photos, other pages and system pages are kept. */
  base: SiteSpec;
  sources: ComposeSources;
  stance: string;
  seed: number;
  catalogue: ComposerCatalogue;
  prefer?: readonly string[];
  /** The trade word drawings are named by, for a site without a subtype ("plumbing"). */
  tradeWord?: string;
  choice?: ComposeChoice;
  /** Names the page in `used` and in errors (the fixture id, or the site's slug). */
  label?: string;
  /** The fixture pages' own slug and no logo (approval pages); live sites keep both. */
  fixture?: { slug: string };
  /** An intent no preset can fill keeps the base homepage's own section of that intent (live: never lose a section the site had). */
  keepBaseSections?: boolean;
  /** At most this many prop presets (isProp) on the page; absent: no cap (fixture and approval pages). */
  maxProps?: number;
  /** The live studio: presets studio 0.5 doesn't offer (LIVE_EXCLUDED) are never picked. */
  live?: boolean;
  /** Fixed picks (ComposeInput.pin): a pinned hero, palette, pairing or wordmark that can't be honoured throws. */
  pin?: ComposeInput["pin"];
  /** AI-made pictures the hero may use (ComposeInput.pictures). */
  pictures?: ComposeInput["pictures"];
}

export function composeHomepageDetailed(input: ComposeInput): ComposeResult {
  const { fixtureId, seed } = input;
  if (!Number.isInteger(seed) || seed < 0) throw new ComposerError(`seed must be a whole number ≥ 0, not ${seed}`);
  const st = STANCES.find((s) => s.id === input.stance);
  if (!st) throw new ComposerError(`unknown stance ${input.stance}`);
  const base = golden(fixtureId);
  if (!stanceFitsSubtype(st, base.business.type, base.business.subtype)) throw new ComposerError(`stance ${st.id} does not fit ${base.business.type}`);
  const word = base.business.subtype ?? FIXTURE_TRADE_WORD[fixtureId];
  return composeFromBase({
    base,
    sources: fixtureSources(fixtureId),
    stance: st.id,
    seed,
    catalogue: input.catalogue,
    ...(input.prefer ? { prefer: input.prefer } : {}),
    ...(word ? { tradeWord: word } : {}),
    label: fixtureId,
    fixture: { slug: `${`${fixtureId}-${st.id}`.slice(0, 40).replace(/-+$/, "")}-${seed}` },
    ...(input.pin ? { pin: input.pin } : {}),
    ...(input.pictures ? { pictures: input.pictures } : {}),
  });
}

interface PlannedSection {
  intent: string;
  /** 0 for the intent's first section on the page, 1 for its second. */
  nth: number;
  want?: string;
  copy?: { headline?: string; lead?: string };
}

/** The page plan the director chose: its sections in its order, one hero first, one contact last, a middle intent at most twice. */
function choicePlan(choice: readonly ChoiceSection[]): PlannedSection[] {
  const known = new Set<string>(["hero", ...MIDDLE_ORDER, "contact"]);
  const one = (intent: string): PlannedSection => {
    const c = choice.find((x) => x.intent === intent);
    return { intent, nth: 0, ...(c?.preset ? { want: c.preset } : {}), ...(c?.copy ? { copy: c.copy } : {}) };
  };
  const seen = new Map<string, number>();
  const middle: PlannedSection[] = [];
  for (const c of choice) {
    if (!known.has(c.intent) || c.intent === "hero" || c.intent === "contact") continue;
    const nth = seen.get(c.intent) ?? 0;
    if (nth >= 2) continue;
    seen.set(c.intent, nth + 1);
    middle.push({ intent: c.intent, nth, ...(c.preset ? { want: c.preset } : {}), ...(c.copy ? { copy: c.copy } : {}) });
  }
  return [one("hero"), ...middle, one("contact")];
}

/** A homepage composed over `base` (see BaseComposeInput). Throws ComposerError when it cannot be built. */
export function composeFromBase(input: BaseComposeInput): ComposeResult {
  const { seed, catalogue, sources, choice } = input;
  if (!Number.isInteger(seed) || seed < 0) throw new ComposerError(`seed must be a whole number ≥ 0, not ${seed}`);
  const st = STANCES.find((s) => s.id === input.stance);
  if (!st) throw new ComposerError(`unknown stance ${input.stance}`);
  const base = structuredClone(input.base);
  const label = input.label ?? base.slug;
  const type = base.business.type;
  if (!stanceFitsSubtype(st, type, base.business.subtype)) throw new ComposerError(`stance ${st.id} does not fit ${type}`);
  const word = base.business.subtype ?? input.tradeWord;
  const prefer = new Set(input.prefer ?? []);
  const pin = input.pin ?? {};
  const baseSections = home(base).sections.slice();
  const fallbacks: string[] = [];

  // The look: a palette and a pairing that fit the stance and the trade, tokens from the stance's axes.
  const chosen = choose(st, type, word, seed, catalogue, prefer, pin);
  if (choice?.palette !== undefined && pin.palette === undefined) {
    const p = assetsOf("palette", catalogue).find((a) => a.id === choice.palette && paletteOf(a.id));
    if (p) Object.assign(chosen, { palette: p, colors: { ...paletteOf(p.id)!.colors } });
    else fallbacks.push(`palette ${choice.palette}`);
  }
  if (choice?.pairing !== undefined && pin.pairing === undefined) {
    const p = assetsOf("pairing", catalogue).find((a) => a.id === choice.pairing && RENDERABLE_PAIRS.has(a.id.slice("pairing/".length)));
    if (p) Object.assign(chosen, { pairing: p, pairId: p.id.slice("pairing/".length) });
    else fallbacks.push(`pairing ${choice.pairing}`);
  }
  const spec = base;
  if (input.fixture) spec.slug = input.fixture.slug;
  spec.design = designFor(st, type, chosen, seed, pin.imagery);
  if (input.fixture) delete spec.assets.logo;
  const pictures = (input.pictures ?? []).map((p) => ({ ...p, origin: "generated" as const }));
  spec.assets.images.push(...pictures);
  home(spec).sections = [];
  if (spec.design.wordmark) delete spec.design.wordmark;

  // The wordmark: a typographic mark for the header, from the wordmark styles the catalogue allows (a site with its own logo keeps the logo).
  const wordmarks = spec.assets.logo
    ? []
    : assetsOf("wordmark", catalogue)
        .map((a) => a.id.slice("wordmark/".length))
        .filter((w) => wordmarkFits(spec.business.name, w as never, "header") && (pin.wordmark === undefined || `wordmark/${w}` === pin.wordmark));
  let wordmarkOrder = ranked(wordmarks, (w) => (prefer.has(`wordmark/${w}`) ? 3 : 0), (w) => w, seed, `wordmark:${st.id}`, 1);
  if (choice?.wordmark !== undefined && pin.wordmark === undefined) {
    const w = choice.wordmark.slice("wordmark/".length);
    if (wordmarkOrder.includes(w)) wordmarkOrder = [w, ...wordmarkOrder.filter((x) => x !== w)];
    else fallbacks.push(`wordmark ${choice.wordmark}`);
  }

  const skipped: string[] = [];
  const sections: Section[] = [];
  const used: string[] = [];
  const src = (plan: PlannedSection, at: number): PresetSources => {
    const own = plan.nth === 0 ? sources.copy[plan.intent] : undefined;
    const copy = plan.copy ? { ...own, ...plan.copy } : plan.nth === 0 ? sources.copy[plan.intent] : undefined;
    return {
      ...sources,
      // AI-made pictures only in the hero, ahead of the client's photos.
      images: [...(plan.intent === "hero" ? pictures.map((p) => ({ id: p.id, origin: "generated" as const })) : []), ...rotated(sources.images ?? [], at)],
      colors: spec.design.colors,
      ...(copy ? { copy } : {}),
    } as PresetSources;
  };
  const plan: PlannedSection[] = choice?.sections?.length ? choicePlan(choice.sections) : pagePlan(type, seed, st.id, prefer).map((intent) => ({ intent, nth: 0 }));

  for (const p of plan) {
    const { intent, want } = p;
    let placed = false;
    // A second section of an intent takes another preset than the first; a pinned hero is the only hero candidate.
    let candidates = candidatesFor(intent, st, type, word, catalogue, seed, prefer)
      .filter((c) => p.nth === 0 || !used.includes(c.id))
      .filter((c) => input.maxProps === undefined || !isProp(c.id) || used.filter(isProp).length < input.maxProps)
      .filter((c) => !input.live || !LIVE_EXCLUDED.has(c.id))
      .filter((c) => intent !== "hero" || pin.hero === undefined || c.id === pin.hero);
    if (intent === "hero" && pin.hero !== undefined && !candidates.length) throw new ComposerError(`pinned hero ${pin.hero} is not a usable ${catalogue} hero preset for ${label}`);
    if (want !== undefined) {
      const hit = candidates.find((c) => c.id === want);
      if (hit) candidates = [hit, ...candidates.filter((c) => c !== hit)];
    }
    for (const preset of candidates) {
      const filled = fillPreset(preset, src(p, sections.length));
      if (!filled.ok) {
        skipped.push(`${preset.id}: ${filled.reason}`);
        continue;
      }
      const section = presetSection(preset, filled.props as ComposedProps, p.nth === 0 ? `s_${intent}` : `s_${intent}_${p.nth + 1}`) as unknown as Section;
      if (!addsNoIssue(spec, sections, section)) {
        skipped.push(`${preset.id}: guards`);
        continue;
      }
      sections.push(section);
      used.push(preset.id);
      placed = true;
      break;
    }
    if (want !== undefined && used.at(-1) !== want) fallbacks.push(`${intent} ${want}`);
    if (!placed && input.keepBaseSections) {
      // Today's section of this intent, when the site had one and it still fits the new page.
      const own = baseSections.find((s) => intentOfSection(s) === intent && !sections.includes(s));
      if (own && addsNoIssue(spec, sections, own)) {
        sections.push(own);
        used.push(`kept:${own.type}`);
        placed = true;
      }
    }
    if (!placed && intent === "hero") throw new ComposerError(`no ${catalogue} hero preset fills for ${label} under ${st.id}`);
  }
  if (sections.length < 3) throw new ComposerError(`only ${sections.length} sections could be composed for ${label} under ${st.id} (${catalogue})`);
  home(spec).sections = sections;

  // A drawing behind one section (the hero first), when one suits the trade and the guards agree.
  let drawing: string | null = null;
  for (const d of pin.drawing === null ? [] : drawingCandidates(st, type, word, catalogue, seed, prefer)) {
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
  if (!result.ok) throw new ComposerError(`${label} under ${st.id} (seed ${seed}) does not validate: ${result.issues.slice(0, 3).map((i) => `${i.path} ${i.message}`).join("; ")}`);
  return {
    spec: result.spec,
    used: { fixtureId: label, stance: st.id, seed, catalogue, presets: used, palette: chosen.palette.id, pairing: chosen.pairing.id, drawing, wordmark: wordmark && `wordmark/${wordmark}`, skipped, ...(choice ? { fallbacks } : {}) },
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

/** An eval fixture as the composer reads it: its golden spec, its sources, its trade word and the client's own text (the studio's proof-of-concept runs). */
export function composerFixture(fixtureId: string): { base: SiteSpec; sources: ComposeSources; tradeWord?: string; description: string } {
  const base = golden(fixtureId);
  const description = (JSON.parse(readFileSync(new URL(`../../../tools/eval/fixtures/${fixtureId}/brief.json`, import.meta.url), "utf8")) as { description: string }).description;
  const word = FIXTURE_TRADE_WORD[fixtureId];
  return { base, sources: fixtureSources(fixtureId), ...(word ? { tradeWord: word } : {}), description };
}

// ---------- the studio's shortlist ----------

export interface ShortlistEntry {
  id: string;
  /** One line for the director. */
  line: string;
  /** A trade prop (a number plate, price tags, a signpost, a docket or receipt, a stamp): at most one per page, never the idea. */
  prop?: true;
}

/** Stances whose idea is a trade prop (owner, 2026-10-11: plates and price tags everywhere): never offered live. */
export const PROP_STANCE = /docket|receipt|plate|sign|timetable|ledger|tag|stamp|crate|label|packet|fascia|shadow-board|wayfinding|transit/;
/** Presets built around a trade prop. */
const PROP_PRESET = /plate|ribbon|signpost|tags|docket|receipt|ledger|stamp|station-board/;
export const isProp = (presetId: string): boolean => PROP_PRESET.test(presetId.slice(presetId.lastIndexOf("/") + 1));
/** The heroes the owner picked in the hero bar (2026-10-11), offered first. */
export const HERO_PICKS: readonly string[] = ["composition/hero/shop-window-tags", "composition/hero/hands-and-hours", "composition/hero/night-print-centred", "composition/hero/workshop-door", "composition/hero/poster-call-block"];
/** Not offered live in studio 0.5: painting-on-dark is built for a per-site AI picture, which 0.5 doesn't make. */
const LIVE_EXCLUDED: ReadonlySet<string> = new Set(["composition/hero/painting-on-dark"]);

/** What the live studio may offer the director for one site: approved assets only, each one usable here. */
export interface StudioShortlist {
  stances: ShortlistEntry[];
  /** Per intent, the approved presets that fill from this site's sources. */
  presets: Record<string, ShortlistEntry[]>;
  palettes: ShortlistEntry[];
  pairings: ShortlistEntry[];
  wordmarks: ShortlistEntry[];
}

const oneLine = (s: string | undefined, max = 140): string => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

/**
 * The approved assets that fit the site: stances that fit its trade, per intent the approved presets that fit the trade and
 * fill from its sources (no colours yet: the contrast guards run when the page is composed), approved palettes, the
 * approved pairings a spec can set, the approved wordmark styles that fit the name (none when the site has its own logo).
 */
export function studioShortlist(base: SiteSpec, sources: ComposeSources, tradeWord?: string, opts: { general?: boolean } = {}): StudioShortlist {
  const type = base.business.type;
  const word = base.business.subtype ?? tradeWord;
  const general = opts.general === true;
  // Never a prop as the page's idea: prop-led stances are not offered. An unknown trade gets the stances for any trade.
  const fitting = STANCES.filter((s) => stanceFitsSubtype(s, type, base.business.subtype) && !PROP_STANCE.test(s.id));
  const anyTrade = fitting.filter((s) => s.trades.fit.includes("*"));
  const stances = (general && anyTrade.length ? anyTrade : [...anyTrade, ...fitting.filter((s) => !anyTrade.includes(s))]).map((s) => ({ id: s.id, line: `${s.name} (${s.family}): ${oneLine(s.pitch)}` }));
  const approved = new Set(assetsOf("composition", "approved").map((a) => a.id));
  const presets: Record<string, ShortlistEntry[]> = {};
  for (const p of COMPOSITION_PRESETS) {
    if (!approved.has(p.id) || LIVE_EXCLUDED.has(p.id) || tradeFit(p.tags?.trades ?? [], type, word) === "no") continue;
    if (general && p.tags?.trades?.length) continue;
    const intent = intentOf(p.id);
    const copy = sources.copy[intent];
    const filled = fillPreset(p, { ...sources, ...(copy ? { copy } : {}) } as PresetSources);
    if (!filled.ok) continue;
    const mood = p.tags?.mood?.length ? ` [${p.tags.mood.join(", ")}]` : "";
    const prop = isProp(p.id);
    (presets[intent] ??= []).push({ id: p.id, line: `${oneLine(p.note) || p.id}${mood}${prop ? " [PROP: at most one per page]" : ""}`, ...(prop ? { prop: true } : {}) });
  }
  // The owner's picked heroes first, then presets for any business, then trade-tagged ones, props last.
  const rank = (e: ShortlistEntry): number => (HERO_PICKS.includes(e.id) ? 0 : e.prop ? 3 : COMPOSITION_PRESETS.find((p) => p.id === e.id)?.tags?.trades?.length ? 2 : 1);
  for (const list of Object.values(presets)) list.sort((a, b) => rank(a) - rank(b));
  const tagLine = (a: Asset): string => [a.tags.mood.join(", "), a.tags.ground.length ? `ground ${a.tags.ground.join("/")}` : ""].filter(Boolean).join("; ");
  const palettes = assetsOf("palette", "approved")
    .filter((a) => paletteOf(a.id) && tradeFit(a.tags.trades, type, word) !== "no")
    .map((a) => {
      const c = paletteOf(a.id)!.colors;
      return { id: a.id, line: `${tagLine(a)}; ${c.background} / ${c.primary} / ${c.text}${a.note ? `; ${oneLine(a.note, 90)}` : ""}` };
    });
  const pairings = assetsOf("pairing", "approved")
    .filter((a) => RENDERABLE_PAIRS.has(a.id.slice("pairing/".length)))
    .map((a) => ({ id: a.id, line: oneLine(a.note, 100) || FONT_PAIRS.find((f) => `pairing/${f.id}` === a.id)?.id || a.id }));
  const wordmarks = base.assets.logo
    ? []
    : assetsOf("wordmark", "approved")
        .filter((a) => wordmarkFits(base.business.name, a.id.slice("wordmark/".length) as never, "header"))
        .map((a) => ({ id: a.id, line: oneLine(a.note, 100) || a.id }));
  return { stances, presets, palettes, pairings, wordmarks };
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
