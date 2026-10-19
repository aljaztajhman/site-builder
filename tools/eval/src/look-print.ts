/**
 * The look distance `pnpm variety` (set-variety.ts) measures a set by: the genome's axes (spec genome-rules.ts), the
 * homepage's composition signature (its intents and layouts in order), the palette in Lab and a perceptual hash of the
 * first screens at 360 and 1280 px. Free and local: no model call. Moved here from the engine's design studio when the
 * studio was removed (2026-10-19); nothing at runtime uses it. LOOK_WEIGHTS are the studio's calibrated weights.
 */
import sharp from "sharp";
import { GENOME_AXES, genomeDistance, genomeOf, hexToLab, intentOfSection, type GenomeView, type SiteSpec } from "@sb/spec";

/** How much each part counts in the distance (calibrated 2026-10-10 on the goldens and twins). */
export const LOOK_WEIGHTS = { genome: 1, composition: 1, palette: 1, phash: 1, stance: 0.5 } as const;
export type LookWeights = Record<keyof typeof LOOK_WEIGHTS, number>;

/** The colour roles a look's palette is compared by. */
export const PALETTE_ROLES = ["background", "primary", "band", "accent"] as const;
export type PaletteLab = Record<(typeof PALETTE_ROLES)[number], [number, number, number]>;

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

export const PHASH_BITS = 64;

/**
 * dHash of a first screen: the screenshot in grey at 9 × 8, one bit per pair of horizontal neighbours (is the left one
 * brighter), 64 bits as 16 hex characters. It keeps the layout's large light and dark blocks and ignores colour.
 */
export async function phash(png: Uint8Array): Promise<string> {
  const px = await sharp(png).flatten({ background: "#ffffff" }).greyscale().resize(9, 8, { fit: "fill", kernel: "lanczos3" }).raw().toBuffer();
  let hex = "";
  for (let y = 0; y < 8; y++) {
    let byte = 0;
    for (let x = 0; x < 8; x++) byte = (byte << 1) | (px[y * 9 + x]! > px[y * 9 + x + 1]! ? 1 : 0);
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

/** The number of bits two hashes differ in (0 to 64). */
export function hamming(a: string, b: string): number {
  if (a.length !== b.length) throw new Error(`hashes of different lengths: ${a.length} and ${b.length}`);
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let x = Number.parseInt(a[i]!, 16) ^ Number.parseInt(b[i]!, 16);
    for (; x; x &= x - 1) d++;
  }
  return d;
}

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

/** 0..1: the edit distance of two composition signatures over the longer one; another layout of the same intent costs half. */
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

/** ΔE at which two colours count as entirely different (as look-distance.ts). */
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

export function lookDistance(a: LookPrint, b: LookPrint, weights: LookWeights = LOOK_WEIGHTS): LookDistance {
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
