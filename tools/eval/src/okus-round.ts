/**
 * Okus (docs/plans/design-studio.md §8): the owner rates homepages so taste becomes measurable. This module is the
 * round's data model, pure: which items a round holds (round 1: the 19 hand-made references, the 10 goldens and the
 * 3 composed sheet specs; lab sketches have a slot for later rounds), the order the owner sees them in, and the
 * pairwise "which is better" questions. Rendering is tools/eval/src/okus-items.ts; calibration okus-calibrate.ts.
 * Everything here is deterministic: the same inputs give byte-identical items.json and pairs.json.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, "../../..");
export const OKUS_DIR = path.join(REPO_ROOT, "tools/okus");
export const roundDir = (round: number): string => path.join(OKUS_DIR, "rounds", String(round));

/** Item and pair ids become document ids in the artifact's database: letters, digits, `-` only. */
const Id = z.string().regex(/^[a-z0-9][a-z0-9-]{0,80}$/);

export const ItemKind = z.enum(["reference", "golden", "composed", "sketch"]);
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

export const PairKind = z.enum(["reference-golden", "golden-composed", "reference-composed", "within-trade", "cross-trade"]);
export type PairKind = z.infer<typeof PairKind>;

export const OkusPair = z.strictObject({ id: Id, kind: PairKind, a: Id, b: Id });
export type OkusPair = z.infer<typeof OkusPair>;

export const PairsFile = z.strictObject({ round: z.number().int().min(1), pairs: z.array(OkusPair) });
export type PairsFile = z.infer<typeof PairsFile>;

/** rounds/index.json: the rounds that exist; the rating page opens the last one. */
export const RoundsIndex = z.strictObject({ rounds: z.array(z.number().int().min(1)).min(1) });

/** A source page before rendering: an item without its images, plus how to render it. */
export type ItemSource = Omit<OkusItem, "images"> &
  ({ render: "html"; file: string } | { render: "spec"; specFile: string; fixture: string });

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
      return { id: `golden-${fixture}`, kind: "golden" as const, label: `${brief.name} (golden)`, trade: brief.businessType, fixture, source: specFile, render: "spec" as const, specFile };
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
    };
  });
}

/**
 * The sources of a round, in the order the owner sees them: shuffled with the round as the seed, so kinds and trades
 * interleave and nothing about the order gives away which page is hand-made. Lab sketches join from round 2.
 */
export function roundSources(round: number): ItemSource[] {
  if (round !== 1) throw new Error(`Round ${round} is not defined yet (round 1 only; lab sketches come with round 2)`);
  return shuffle([...referenceSources(), ...goldenSources(), ...composedSources()], `okus-round-${round}`);
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

  const r = rng(`${seed}:sides`);
  const sided = out.map((p) => (r() < 0.5 ? p : { ...p, a: p.b, b: p.a }));
  return shuffle(sided, `${seed}:order`).map((p, i) => ({ id: `p${String(i + 1).padStart(2, "0")}`, ...p }));
}

/** The JSON text of a round's files, as written (stable key order, trailing newline). */
export function itemsJson(round: number, items: OkusItem[]): string {
  return `${JSON.stringify(ItemsFile.parse({ round, items }), null, 2)}\n`;
}
export function pairsJson(round: number, pairs: OkusPair[]): string {
  return `${JSON.stringify(PairsFile.parse({ round, pairs }), null, 2)}\n`;
}
