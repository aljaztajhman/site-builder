/**
 * Okus (docs/plans/design-studio.md §8): the owner rates homepages so taste becomes measurable. This module is the
 * round's data model, pure: which items a round holds (round 1: the 19 hand-made references, the 10 goldens and the
 * 3 composed sheet specs; round 2: the studio references of tools/eval/references with the goldens and the 19
 * hand-made references; round 3: studio homepages from a studio-poc run against today's homepage of the same business;
 * lab sketches have a slot for later rounds), the order the owner sees them in, and the pairwise "which is better"
 * questions. Rendering is tools/eval/src/okus-items.ts; calibration okus-calibrate.ts.
 * Everything here is deterministic: the same inputs give byte-identical items.json and pairs.json.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, "../../..");
export const OKUS_DIR = path.join(REPO_ROOT, "tools/okus");
export const roundDir = (round: number): string => path.join(OKUS_DIR, "rounds", String(round));

/** Item and pair ids become document ids in the artifact's database: letters, digits, `-` only. */
const Id = z.string().regex(/^[a-z0-9][a-z0-9-]{0,80}$/);

/**
 * reference: hand-made HTML (round 1); studio: a studio reference in the composition language (tools/eval/references, I10);
 * studio-run: a homepage the design studio built in a studio-poc run (round 3); today: today's pipeline homepage of the
 * same business (round 3).
 */
export const ItemKind = z.enum(["reference", "golden", "composed", "sketch", "studio", "studio-run", "today"]);
export type ItemKind = z.infer<typeof ItemKind>;

/** Image paths are relative to the round's directory (or absolute URLs, when the director rewrites them to assets). */
export const ItemImages = z.strictObject({ desk: z.string(), deskFull: z.string(), phone: z.string(), phoneFull: z.string() });

export const OkusItem = z.strictObject({
  id: Id,
  kind: ItemKind,
  /** For the director and the harness; the rating page never shows it (the owner rates blind). */
  label: z.string().min(1),
  trade: z.string().min(1),
  /** The eval fixture the page is about, when it has one (goldens, composed, references J–T). */
  fixture: z.string().nullable(),
  /** Where it came from, relative to the repo root. */
  source: z.string(),
  images: ItemImages,
});
export type OkusItem = z.infer<typeof OkusItem>;

export const ItemsFile = z.strictObject({ round: z.number().int().min(1), items: z.array(OkusItem).min(1) });
export type ItemsFile = z.infer<typeof ItemsFile>;

export const PairKind = z.enum(["reference-golden", "golden-composed", "reference-composed", "within-trade", "cross-trade", "studio-golden", "studio-reference", "studio-today"]);
export type PairKind = z.infer<typeof PairKind>;

export const OkusPair = z.strictObject({ id: Id, kind: PairKind, a: Id, b: Id });
export type OkusPair = z.infer<typeof OkusPair>;

export const PairsFile = z.strictObject({ round: z.number().int().min(1), pairs: z.array(OkusPair) });
export type PairsFile = z.infer<typeof PairsFile>;

/** rounds/index.json: the rounds that exist; the rating page opens the last one. */
export const RoundsIndex = z.strictObject({ rounds: z.array(z.number().int().min(1)).min(1) });

/** The four screenshots of a page, as okus-items.ts shoot() names them. */
export const SHOT_NAMES = ["desk", "deskFull", "phone", "phoneFull"] as const;
export type ShotName = (typeof SHOT_NAMES)[number];

/**
 * A source page before rendering: an item without its images, plus how to get its pictures: render hand-made HTML or a
 * spec (`media`: the fixture whose photos the spec uses), or copy four PNGs another run already shot (`pngs`, absolute).
 */
export type ItemSource = Omit<OkusItem, "images"> &
  ({ render: "html"; file: string } | { render: "spec"; specFile: string; media: string | null } | { render: "copy"; pngs: Record<ShotName, string> });

// ---------------------------------------------------------------------------------------------------------------
// Determinism helpers

/** FNV-1a, 32 bit: a stable hash of a string. */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 seeded from a string: a small deterministic PRNG in [0, 1). */
export function rng(seed: string): () => number {
  let a = hash32(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates with a seeded PRNG; returns a new array. */
export function shuffle<T>(xs: readonly T[], seed: string): T[] {
  const out = [...xs];
  const r = rng(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Round 1 sources

interface TemplateEntry {
  id: string;
  name: string;
  file: string;
  fixture: string | null;
  trade: string;
}

/** The composed sheet specs (tools/eval/composed): the hand-made template each re-expresses and its fixture. */
export const COMPOSED_SOURCES = [
  { letter: "m", name: "Tablica", fixture: "avtoservis-mrak" },
  { letter: "s", name: "Cevi", fixture: "instalacije-rebernik" },
  { letter: "j", name: "Skorja", fixture: "pekarna-kvas" },
] as const;

const readJson = (rel: string): unknown => JSON.parse(readFileSync(path.join(REPO_ROOT, rel), "utf8")) as unknown;

/** The 19 hand-made references (docs/design/templates/templates.json lists all of them, swim-landing included). */
export function referenceSources(): ItemSource[] {
  const { templates } = readJson("docs/design/templates/templates.json") as { templates: TemplateEntry[] };
  return templates.map((t) => {
    const file = path.posix.normalize(path.posix.join("docs/design/templates", t.file));
    return {
      id: `ref-${t.id.toLowerCase()}`,
      kind: "reference" as const,
      label: `${t.id} ${t.name} (hand-made)`,
      trade: t.trade,
      fixture: t.fixture,
      source: file,
      render: "html" as const,
      file,
    };
  });
}

function fixtureBrief(id: string): { name: string; businessType: string } {
  return readJson(`tools/eval/fixtures/${id}/brief.json`) as { name: string; businessType: string };
}

/** The goldens (tools/eval/golden/*.json), rendered by the shared component library with the fixture's photos. */
export function goldenSources(): ItemSource[] {
  return readdirSync(path.join(REPO_ROOT, "tools/eval/golden"))
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => {
      const fixture = f.replace(/\.json$/, "");
      const brief = fixtureBrief(fixture);
      const specFile = `tools/eval/golden/${f}`;
      return { id: `golden-${fixture}`, kind: "golden" as const, label: `${brief.name} (golden)`, trade: brief.businessType, fixture, source: specFile, render: "spec" as const, specFile, media: fixture };
    });
}

/** The composed sheet specs (spec v19 composed sections re-expressing templates M, S, J). */
export function composedSources(): ItemSource[] {
  return COMPOSED_SOURCES.map((c) => {
    const specFile = `tools/eval/composed/${c.letter}.json`;
    return {
      id: `composed-${c.letter}`,
      kind: "composed" as const,
      label: `${c.letter.toUpperCase()} ${c.name} (composed, spec v19)`,
      trade: fixtureBrief(c.fixture).businessType,
      fixture: c.fixture,
      source: specFile,
      render: "spec" as const,
      specFile,
      media: c.fixture,
    };
  });
}

/**
 * The studio references (tools/eval/references/<id>/: site.json, brief.json, meta.json; harness references.ts), rendered
 * from their v20 site spec with the photos their brief borrows. They are about a fixture business of their own, so
 * `fixture` is null; pairs match them by trade.
 */
export function studioSources(): ItemSource[] {
  const dir = path.join(REPO_ROOT, "tools/eval/references");
  if (!existsSync(dir)) return [];
  const ids = readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
  return ids.map((id) => {
    const base = `tools/eval/references/${id}`;
    const meta = readJson(`${base}/meta.json`) as { title: string; stance: string };
    const brief = readJson(`${base}/brief.json`) as { businessType: string; photos: { fixture: string } | null };
    const specFile = `${base}/site.json`;
    return {
      id: `studio-${id}`,
      kind: "studio" as const,
      label: `${meta.title} (studio reference, ${meta.stance})`,
      trade: brief.businessType,
      fixture: null,
      source: specFile,
      render: "spec" as const,
      specFile,
      media: brief.photos?.fixture ?? null,
    };
  });
}

/**
 * The sources of a round, in the order the owner sees them: shuffled with the round as the seed, so kinds and trades
 * interleave and nothing about the order gives away which page is hand-made. Lab sketches join from round 2.
 */
export function roundSources(round: number, opts: { from?: string } = {}): ItemSource[] {
  if (round === 1) return shuffle([...referenceSources(), ...goldenSources(), ...composedSources()], `okus-round-${round}`);
  if (round === 2) return shuffle([...studioSources(), ...goldenSources(), ...referenceSources()], `okus-round-${round}`);
  if (round === 3) {
    if (!opts.from) throw new Error("Round 3 needs --from <studio-poc runs dir>");
    return runSources(opts.from).sources;
  }
  throw new Error(`Round ${round} is not defined yet (rounds 1 to 3)`);
}

/** The pairwise questions of a round: round 1 buildPairs, round 2 buildStudioPairs, round 3 buildRunPairs. */
export function roundPairs(round: number, items: readonly Lite[]): OkusPair[] {
  const seed = `okus-round-${round}`;
  if (round === 2) return buildStudioPairs(items, seed);
  if (round === 3) return buildRunPairs(items, seed);
  return buildPairs(items, seed);
}

/** Where an item's four pictures go, relative to the round's directory. */
export function imagePaths(id: string): OkusItem["images"] {
  return { desk: `img/${id}-desk.jpg`, deskFull: `img/${id}-desk-full.jpg`, phone: `img/${id}-phone.jpg`, phoneFull: `img/${id}-phone-full.jpg` };
}

export function toItem(s: ItemSource): OkusItem {
  return { id: s.id, kind: s.kind, label: s.label, trade: s.trade, fixture: s.fixture, source: s.source, images: imagePaths(s.id) };
}

// ---------------------------------------------------------------------------------------------------------------
// Pairs

type Lite = Pick<OkusItem, "id" | "kind" | "trade" | "fixture">;

/** How many of each kind of question; the rest of the plan's ~30 comes from the same-fixture pairs. */
const PAIR_QUOTA = { withinTrade: 5, crossGoldens: 4, crossReferenceGolden: 5 } as const;

/**
 * The pairwise questions of a round, deterministic for the same items and seed: every reference vs the golden of its
 * fixture; every composed spec vs its fixture's golden and vs its hand-made template; a few within-trade pairs of the
 * swim-school references (the only trade with many); and cross-trade pairs (golden vs golden, reference vs golden).
 * Each unordered pair appears once; which side is left is random per pair; question order is shuffled.
 */
export function buildPairs(items: readonly Lite[], seed: string): OkusPair[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const seen = new Set<string>();
  const out: Omit<OkusPair, "id">[] = [];
  const add = (kind: PairKind, a: Lite | undefined, b: Lite | undefined): boolean => {
    if (!a || !b || a.id === b.id) return false;
    const key = [a.id, b.id].sort().join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    out.push({ kind, a: a.id, b: b.id });
    return true;
  };
  const of = (k: ItemKind) => items.filter((i) => i.kind === k).sort((x, y) => x.id.localeCompare(y.id));
  const refs = of("reference");
  const goldens = of("golden");
  const composed = of("composed");
  const goldenOf = (fixture: string | null) => (fixture ? byId.get(`golden-${fixture}`) : undefined);

  for (const r of refs) add("reference-golden", r, goldenOf(r.fixture));
  for (const c of composed) {
    add("golden-composed", goldenOf(c.fixture), c);
    add("reference-composed", refs.find((r) => r.fixture === c.fixture), c);
  }
  /** Takes `n` of the seeded candidates: first pairs whose items are both still unused (spread), then any. */
  const pick = (kind: PairKind, cands: (readonly [Lite, Lite])[], n: number, tag: string) => {
    const order = shuffle(cands, `${seed}:${tag}`);
    const used = new Set<string>();
    let made = 0;
    for (const spread of [true, false]) {
      for (const [x, y] of order) {
        if (made >= n) return;
        if (spread && (used.has(x.id) || used.has(y.id))) continue;
        if (add(kind, x, y)) {
          made++;
          used.add(x.id).add(y.id);
        }
      }
    }
  };
  // Within a trade: the trade with the most references (swimming school in round 1).
  const trades = [...new Set(refs.map((r) => r.trade))].sort();
  const biggest = trades.map((t) => ({ t, n: refs.filter((r) => r.trade === t).length })).sort((x, y) => y.n - x.n || x.t.localeCompare(y.t))[0];
  if (biggest && biggest.n >= 2) {
    const same = refs.filter((r) => r.trade === biggest.t);
    pick("within-trade", same.flatMap((x, i) => same.slice(i + 1).map((y) => [x, y] as const)), PAIR_QUOTA.withinTrade, "within");
  }
  // Across trades.
  const across = (xs: Lite[], ys: Lite[]) => xs.flatMap((x) => ys.filter((y) => y.trade !== x.trade).map((y) => [x, y] as const));
  pick("cross-trade", across(goldens, goldens).filter(([x, y]) => x.id < y.id), PAIR_QUOTA.crossGoldens, "cross-goldens");
  pick("cross-trade", across(refs, goldens), PAIR_QUOTA.crossReferenceGolden, "cross-ref-golden");

  return finishPairs(out, seed);
}

/** Which side is left is random per pair; question order is shuffled; ids p01, p02 … in that order. */
function finishPairs(out: readonly Omit<OkusPair, "id">[], seed: string): OkusPair[] {
  const r = rng(`${seed}:sides`);
  const sided = out.map((p) => (r() < 0.5 ? p : { ...p, a: p.b, b: p.a }));
  return shuffle(sided, `${seed}:order`).map((p, i) => ({ id: `p${String(i + 1).padStart(2, "0")}`, ...p }));
}

/** Round 2: how many studio-vs-studio pairs within a trade. */
const STUDIO_WITHIN_TRADE = 6;

/**
 * Round 2's questions, every one about a studio reference: each against a golden of its trade (seeded pick) and a
 * hand-made reference of its trade (seeded pick); a studio reference whose trade has neither gets a cross-trade golden;
 * then up to STUDIO_WITHIN_TRADE pairs of studio references of one trade, spread so no reference repeats while others
 * are unused. Deterministic for the same items and seed; each unordered pair once.
 */
export function buildStudioPairs(items: readonly Lite[], seed: string): OkusPair[] {
  const seen = new Set<string>();
  const out: Omit<OkusPair, "id">[] = [];
  const add = (kind: PairKind, a: Lite | undefined, b: Lite | undefined): boolean => {
    if (!a || !b || a.id === b.id) return false;
    const key = [a.id, b.id].sort().join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    out.push({ kind, a: a.id, b: b.id });
    return true;
  };
  const of = (k: ItemKind) => items.filter((i) => i.kind === k).sort((x, y) => x.id.localeCompare(y.id));
  const studio = of("studio");
  const goldens = of("golden");
  const handMade = of("reference");
  const pickOne = (xs: Lite[], tag: string) => shuffle(xs, `${seed}:${tag}`)[0];
  for (const s of studio) {
    const g = pickOne(goldens.filter((x) => x.trade === s.trade), `${s.id}:golden`);
    const h = pickOne(handMade.filter((x) => x.trade === s.trade), `${s.id}:reference`);
    add("studio-golden", s, g);
    add("studio-reference", s, h);
    if (!g && !h) add("cross-trade", s, pickOne(goldens, `${s.id}:cross`));
  }
  const within = shuffle(studio.flatMap((x, i) => studio.slice(i + 1).filter((y) => y.trade === x.trade).map((y) => [x, y] as const)), `${seed}:within`);
  const used = new Set<string>();
  let made = 0;
  for (const spread of [true, false]) {
    for (const [x, y] of within) {
      if (made >= STUDIO_WITHIN_TRADE) break;
      if (spread && (used.has(x.id) || used.has(y.id))) continue;
      if (add("within-trade", x, y)) {
        made++;
        used.add(x.id).add(y.id);
      }
    }
  }
  return finishPairs(out, seed);
}

// ---------------------------------------------------------------------------------------------------------------
// Round 3: studio homepages (a studio-poc run) against today's homepage of the same business

/** What a studio-poc run leaves per business (`<id>.studio.json`), as far as Okus reads it. */
const StudioRun = z.object({
  ok: z.boolean(),
  path: z.string().nullable().optional(),
  idea: z.string().nullable().optional(),
  businessType: z.string().optional(),
  mockup: z.object({ ok: z.boolean().optional(), eur: z.record(z.string(), z.number()).optional() }).nullable().optional(),
  art: z.record(z.string(), z.unknown()).nullable().optional(),
  eur: z.number().optional(),
});
type StudioRun = z.infer<typeof StudioRun>;

/** `<id>.prompts.json`: every model call of the run with its prompts, and the image prompt of the mockup. */
const RunPrompts = z.object({
  fixture: z.string().optional(),
  at: z.string().optional(),
  calls: z
    .array(z.object({ stage: z.string(), model: z.string().optional(), system: z.unknown().optional(), messages: z.array(z.object({ role: z.string(), text: z.unknown() })).default([]), response: z.unknown().optional() }))
    .default([]),
  mockup: z.object({ prompt: z.string().optional(), references: z.array(z.unknown()).optional(), image: z.unknown().optional() }).nullable().optional(),
});
type RunPrompts = z.infer<typeof RunPrompts>;

const PaletteEntry = z.strictObject({ role: z.string().nullable(), hex: z.string() });

/** The direction fields worth reading (the art director's brief), all optional. */
export const MadeDirection = z.strictObject({
  name: z.string().optional(),
  idea: z.string().optional(),
  palette: z.array(PaletteEntry).optional(),
  pairing: z.string().optional(),
  typeCharacter: z.string().optional(),
  composition: z.string().optional(),
  imagery: z.string().optional(),
  signature: z.string().optional(),
  copy: z.record(z.string(), z.string()).optional(),
});
type MadeDirection = z.infer<typeof MadeDirection>;

export const MadeCall = z.strictObject({
  stage: z.string(),
  model: z.string().nullable(),
  system: z.string(),
  messages: z.array(z.strictObject({ role: z.string(), text: z.string() })),
  response: z.string(),
});

/**
 * rounds/3/made/<itemId>.json: how a studio homepage was made, shown on the rating page only after the owner rated it
 * (it would give the page away). Kept out of items.json. `mockupImage` is relative to the round's directory.
 */
export const MadeFile = z.strictObject({
  itemId: Id,
  fixture: z.string(),
  idea: z.string().nullable(),
  direction: MadeDirection,
  mockupImage: z.string().nullable(),
  calls: z.array(MadeCall),
  mockupPrompt: z.string().nullable(),
  mockupReferences: z.array(z.string()),
  /** € per pipeline stage (the run's own numbers) and the run's total. */
  eur: z.record(z.string(), z.number()),
  eurTotal: z.number().nullable(),
});
export type MadeFile = z.infer<typeof MadeFile>;

/** Prompts and responses as text: strings as they are, text blocks joined, anything else pretty-printed JSON. */
function asText(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "string") return v;
  if (Array.isArray(v) && v.every((b) => b && typeof b === "object" && typeof (b as { text?: unknown }).text === "string")) {
    return v.map((b) => (b as { text: string }).text).join("\n\n");
  }
  return JSON.stringify(v, null, 2);
}

const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v : undefined);

function direction(art: Record<string, unknown> | null | undefined): MadeDirection {
  if (!art) return {};
  const out: MadeDirection = {};
  for (const k of ["name", "idea", "pairing", "typeCharacter", "composition", "imagery", "signature"] as const) {
    const v = str(art[k]);
    if (v) out[k] = v;
  }
  if (Array.isArray(art.palette)) {
    out.palette = art.palette.flatMap((p: unknown): z.infer<typeof PaletteEntry>[] => {
      if (typeof p === "string") return [{ role: null, hex: p }];
      if (p && typeof p === "object" && typeof (p as { hex?: unknown }).hex === "string") return [{ role: str((p as { role?: unknown }).role) ?? null, hex: (p as { hex: string }).hex }];
      return [];
    });
  }
  if (art.copy && typeof art.copy === "object") {
    out.copy = Object.fromEntries(Object.entries(art.copy as Record<string, unknown>).flatMap(([k, v]) => (typeof v === "string" && v.trim() ? [[k, v]] : [])));
  }
  return out;
}

/** The made/ document of one studio run (pure). */
export function madeDoc(itemId: string, fixture: string, run: StudioRun, prompts: RunPrompts | null, mockupImage: string | null): MadeFile {
  return MadeFile.parse({
    itemId,
    fixture,
    idea: str(run.idea) ?? str(run.art?.idea) ?? null,
    direction: direction(run.art),
    mockupImage,
    calls: (prompts?.calls ?? []).map((c) => ({
      stage: c.stage,
      model: c.model ?? null,
      system: asText(c.system),
      messages: c.messages.map((m) => ({ role: m.role, text: asText(m.text) })),
      response: asText(c.response),
    })),
    mockupPrompt: str(prompts?.mockup?.prompt) ?? str(run.art?.imagePrompt) ?? null,
    mockupReferences: (prompts?.mockup?.references ?? []).map((r) => (typeof r === "string" ? r : JSON.stringify(r))),
    eur: run.mockup?.eur ?? {},
    eurTotal: run.eur ?? null,
  });
}

/** The business type of a fixture: its brief in the fixtures, the edge fixtures or the hard set; else the run's own; else "unknown". */
function runTrade(fixture: string, run: StudioRun): string {
  for (const d of ["tools/eval/fixtures", "tools/eval/fixtures-edge", "tools/eval/hard"]) {
    const f = path.join(REPO_ROOT, d, fixture, "brief.json");
    if (existsSync(f)) {
      const t = (JSON.parse(readFileSync(f, "utf8")) as { businessType?: unknown }).businessType;
      if (typeof t === "string" && t) return t;
    }
  }
  return run.businessType ?? "unknown";
}

export interface RunSources {
  /** Shuffled with the round as the seed, run and today items mixed. */
  sources: ItemSource[];
  /** Businesses left out, with why. */
  skipped: { fixture: string; reason: string }[];
  /** One per run item: its made/ document and the mockup JPEG to copy (absolute), when there is one. */
  made: { itemId: string; doc: MadeFile; mockupJpg: string | null }[];
}

/** Where a run item's mockup picture goes, relative to the round's directory. */
export const mockupImagePath = (itemId: string): string => `img/${itemId}-mockup.jpg`;
/** Where a run item's made/ document goes, relative to the round's directory. */
export const madePath = (itemId: string): string => `made/${itemId}.json`;

const posixRel = (abs: string) => path.relative(REPO_ROOT, abs).split(path.sep).join("/");

/**
 * Round 3's items from a studio-poc runs dir: per business that built on the mockup path (`<id>.studio.json` with ok
 * true and path "mockup") and has all eight screenshots (`<id>-<shot>.png`, `<id>-today-<shot>.png`), a `run-<id>`
 * and a `today-<id>` item whose pictures are copied, not rendered. Everything else is skipped with a reason.
 */
export function runSources(fromDir: string, round = 3): RunSources {
  const from = path.resolve(fromDir);
  if (!existsSync(from)) throw new Error(`No runs dir at ${from}`);
  const ids = readdirSync(from)
    .filter((f) => f.endsWith(".studio.json"))
    .map((f) => f.slice(0, -".studio.json".length))
    .sort();
  const sources: ItemSource[] = [];
  const skipped: RunSources["skipped"] = [];
  const made: RunSources["made"] = [];
  for (const id of ids) {
    if (!Id.safeParse(`today-${id}`).success) {
      skipped.push({ fixture: id, reason: "id is not a lowercase slug" });
      continue;
    }
    const parsed = StudioRun.safeParse(JSON.parse(readFileSync(path.join(from, `${id}.studio.json`), "utf8")));
    if (!parsed.success) {
      skipped.push({ fixture: id, reason: `studio.json unreadable: ${parsed.error.issues[0]?.message ?? "invalid"}` });
      continue;
    }
    const run = parsed.data;
    if (!run.ok) {
      skipped.push({ fixture: id, reason: "studio run did not build (ok false)" });
      continue;
    }
    if (run.path !== "mockup") {
      skipped.push({ fixture: id, reason: `studio run took path ${JSON.stringify(run.path ?? null)}, not the mockup path` });
      continue;
    }
    const pngs = (stem: string) => Object.fromEntries(SHOT_NAMES.map((s) => [s, path.join(from, `${stem}-${s}.png`)])) as Record<ShotName, string>;
    const runPngs = pngs(id);
    const todayPngs = pngs(`${id}-today`);
    const missing = [...Object.values(runPngs), ...Object.values(todayPngs)].filter((f) => !existsSync(f)).map((f) => path.basename(f));
    if (missing.length) {
      skipped.push({ fixture: id, reason: `missing screenshots: ${missing.join(", ")}` });
      continue;
    }
    const trade = runTrade(id, run);
    const runId = `run-${id}`;
    const idea = str(run.art?.name) ?? str(run.idea) ?? "studio homepage";
    sources.push({ id: runId, kind: "studio-run", label: `studio run: ${idea}`, trade, fixture: id, source: posixRel(path.join(from, `${id}.studio.json`)), render: "copy", pngs: runPngs });
    sources.push({ id: `today-${id}`, kind: "today", label: `today: ${id}`, trade, fixture: id, source: posixRel(todayPngs.desk), render: "copy", pngs: todayPngs });
    const promptsFile = path.join(from, `${id}.prompts.json`);
    const prompts = existsSync(promptsFile) ? RunPrompts.parse(JSON.parse(readFileSync(promptsFile, "utf8"))) : null;
    const jpg = path.join(from, `${id}-mockup.jpg`);
    const mockupJpg = existsSync(jpg) ? jpg : null;
    made.push({ itemId: runId, doc: madeDoc(runId, id, run, prompts, mockupJpg ? mockupImagePath(runId) : null), mockupJpg });
  }
  return { sources: shuffle(sources, `okus-round-${round}`), skipped, made };
}

/** Round 3's questions: per business its studio homepage against today's; which side is left is random per pair. */
export function buildRunPairs(items: readonly Lite[], seed: string): OkusPair[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const out: Omit<OkusPair, "id">[] = [];
  for (const r of items.filter((i) => i.kind === "studio-run").sort((x, y) => x.id.localeCompare(y.id))) {
    const t = byId.get(`today-${r.id.slice("run-".length)}`);
    if (t && t.kind === "today") out.push({ kind: "studio-today", a: r.id, b: t.id });
  }
  return finishPairs(out, seed);
}

/** The JSON text of a round's files, as written (stable key order, trailing newline). */
export function itemsJson(round: number, items: OkusItem[]): string {
  return `${JSON.stringify(ItemsFile.parse({ round, items }), null, 2)}\n`;
}
export function pairsJson(round: number, pairs: OkusPair[]): string {
  return `${JSON.stringify(PairsFile.parse({ round, pairs }), null, 2)}\n`;
}
