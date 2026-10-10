/**
 * The uniqueness registry's look distance and gate (docs/plans/design-studio.md §5.4). Today's look distance (the
 * genome's axes, spec genome-rules.ts; the palette in Lab, tools/eval look-distance.ts) extended with the composition
 * signature (the homepage's intents and layouts in order) and a perceptual hash of the first screens at 360 and 1280 px.
 * Weights and thresholds come from config `studio.uniqueness`, never from code. Pure; the platform's look_fingerprints
 * table stores the prints (Repo.looks).
 */
import type { AppConfig } from "@sb/config";
import { GENOME_AXES, genomeDistance, genomeOf, hexToLab, intentOfSection, type GenomeView, type SiteSpec } from "@sb/spec";
import { PHASH_BITS, hamming } from "./phash.ts";

export type UniquenessConfig = AppConfig["studio"]["uniqueness"];

/** The colour roles a look's palette is compared by. */
export const PALETTE_ROLES = ["background", "primary", "band", "accent"] as const;
export type PaletteLab = Record<(typeof PALETTE_ROLES)[number], [number, number, number]>;

/** What the registry keeps of a look (a look_fingerprints row without its ids). */
export interface LookPrint {
  trade: string;
  town: string | null;
  stance: string | null;
  genome: GenomeView;
  /** The homepage's sections as "intent:type/variant" ("composed/<width>" for a composed section), space-separated. */
  composition: string;
  paletteLab: PaletteLab;
  phash360: string | null;
  phash1280: string | null;
}

/** One section's place in the composition signature. */
function sectionToken(s: SiteSpec["pages"][number]["sections"][number]): string {
  const intent = intentOfSection(s) ?? "none";
  const layout = s.type === "composed" ? `composed/${(s.props as { width: string }).width}` : `${s.type}/${s.variant}`;
  return `${intent}:${layout}`;
}

/** The homepage's composition signature: its sections' intents and layout classes, top to bottom. */
export function compositionSignature(spec: Pick<SiteSpec, "pages">): string {
  const home = spec.pages.find((p) => p.kind === "home") ?? spec.pages[0];
  return (home?.sections ?? []).map(sectionToken).join(" ");
}

export function paletteLab(colors: SiteSpec["design"]["colors"]): PaletteLab {
  return {
    background: hexToLab(colors.background),
    primary: hexToLab(colors.primary),
    band: hexToLab(colors.band ?? colors.primary),
    accent: hexToLab(colors.accent),
  };
}

/** A site's look print from its spec; the hashes when the first screens were rendered. */
export function lookPrintOf(spec: SiteSpec, o: { trade: string; town: string | null; stance?: string | null; phash360?: string | null; phash1280?: string | null }): LookPrint {
  return {
    trade: o.trade,
    town: o.town,
    stance: o.stance ?? spec.design.art?.stance ?? null,
    genome: genomeOf(spec),
    composition: compositionSignature(spec),
    paletteLab: paletteLab(spec.design.colors),
    phash360: o.phash360 ?? null,
    phash1280: o.phash1280 ?? null,
  };
}

/**
 * 0..1: the edit distance of two composition signatures over the longer one. Replacing a section by another layout of
 * the same intent costs half; by another intent, one.
 */
export function compositionDistance(a: string, b: string): number {
  const x = a ? a.split(" ") : [];
  const y = b ? b.split(" ") : [];
  if (!x.length && !y.length) return 0;
  const intent = (t: string) => t.slice(0, t.indexOf(":"));
  const sub = (p: string, q: string) => (p === q ? 0 : intent(p) === intent(q) ? 0.5 : 1);
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    for (let j = 1; j <= y.length; j++) cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + sub(x[i - 1]!, y[j - 1]!));
    prev = cur;
  }
  return prev[y.length]! / Math.max(x.length, y.length);
}

/** ΔE at which two colours count as entirely different (as tools/eval look-distance.ts). */
const DELTA_E_FULL = 50;

/** 0..1: the mean over the palette roles of ΔE76, capped at DELTA_E_FULL. */
export function paletteDistance(a: PaletteLab, b: PaletteLab): number {
  const d = (p: [number, number, number], q: [number, number, number]) => Math.min(1, Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) / DELTA_E_FULL);
  return PALETTE_ROLES.reduce((s, r) => s + d(a[r], b[r]), 0) / PALETTE_ROLES.length;
}

/** 0..1: the mean Hamming distance of the first-screen hashes both looks have (null: no width in common). */
export function phashDistance(a: Pick<LookPrint, "phash360" | "phash1280">, b: Pick<LookPrint, "phash360" | "phash1280">): number | null {
  const ds: number[] = [];
  if (a.phash360 && b.phash360) ds.push(hamming(a.phash360, b.phash360) / PHASH_BITS);
  if (a.phash1280 && b.phash1280) ds.push(hamming(a.phash1280, b.phash1280) / PHASH_BITS);
  return ds.length ? ds.reduce((s, x) => s + x, 0) / ds.length : null;
}

export interface LookDistance {
  /** The weighted mean of the parts both looks have, 0 (the same look) to 1. */
  total: number;
  parts: { genome: number; composition: number; palette: number; phash: number | null; stance: number | null };
}

export function lookDistance(a: LookPrint, b: LookPrint, weights: UniquenessConfig["weights"]): LookDistance {
  const parts: LookDistance["parts"] = {
    genome: genomeDistance(a.genome, b.genome) / GENOME_AXES.length,
    composition: compositionDistance(a.composition, b.composition),
    palette: paletteDistance(a.paletteLab, b.paletteLab),
    phash: phashDistance(a, b),
    stance: a.stance && b.stance ? (a.stance === b.stance ? 0 : 1) : null,
  };
  let sum = 0;
  let wsum = 0;
  for (const k of Object.keys(parts) as (keyof LookDistance["parts"])[]) {
    const v = parts[k];
    if (v === null || weights[k] <= 0) continue;
    sum += weights[k] * v;
    wsum += weights[k];
  }
  return { total: wsum ? sum / wsum : 0, parts };
}

const sameTown = (a: string | null, b: string | null) => !!a && !!b && a.trim().toLocaleLowerCase("sl") === b.trim().toLocaleLowerCase("sl");

/** The distance a neighbour must keep: sameTownMin in the same town, sameTradeMin in the same trade (the stricter of both); null: neither. */
export function requiredDistance(candidate: Pick<LookPrint, "trade" | "town">, neighbour: Pick<LookPrint, "trade" | "town">, config: UniquenessConfig): number | null {
  const mins: number[] = [];
  if (candidate.trade === neighbour.trade) mins.push(config.sameTradeMin);
  if (sameTown(candidate.town, neighbour.town)) mins.push(config.sameTownMin);
  return mins.length ? Math.max(...mins) : null;
}

export interface UniqueVerdict<N extends LookPrint> {
  ok: boolean;
  /** The neighbour of the same trade or town that comes closest (null: none). */
  closest: N | null;
  distance: number | null;
  /** The neighbours it is too close to, closest first. */
  tooClose: { neighbour: N; distance: number; required: number }[];
}

/** The gate (§5.4): a look is unique enough when it keeps the required distance from every same-trade and same-town neighbour. */
export function uniqueEnough<N extends LookPrint>(candidate: LookPrint, neighbours: readonly N[], config: UniquenessConfig): UniqueVerdict<N> {
  let closest: N | null = null;
  let distance: number | null = null;
  const tooClose: UniqueVerdict<N>["tooClose"] = [];
  for (const n of neighbours) {
    const required = requiredDistance(candidate, n, config);
    if (required === null) continue;
    const d = lookDistance(candidate, n, config.weights).total;
    if (distance === null || d < distance) {
      closest = n;
      distance = d;
    }
    if (d < required) tooClose.push({ neighbour: n, distance: d, required });
  }
  tooClose.sort((x, y) => x.distance - y.distance);
  return { ok: tooClose.length === 0, closest, distance, tooClose };
}
