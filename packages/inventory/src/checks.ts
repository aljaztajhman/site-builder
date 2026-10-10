/**
 * What every asset is held to (the per-asset checks in packages/inventory/test, and the numbers on the contact sheets):
 * byte budgets per kind, the Slovene letters every font must draw, and the contrast of a palette's text roles.
 */
import {
  CONTRAST_RULES,
  OFF_BLACK_MIN,
  OFF_WHITE_MAX,
  contrast,
  enforceDesign,
  hexToHsl,
  isBeige,
  isCreamOrOffWhite,
  isWarmCream,
  luminance,
  offBlackWhiteIssues,
  type Colors,
  type Design,
  type Direction,
} from "@sb/spec";
import type { AssetKind, Ground } from "./schema.ts";
import { groundOf } from "./sources.ts";

/**
 * Bytes an asset may add to a page, per kind. Fonts: per file (a pairing is two files). Motifs and the rest: the CSS
 * rules that apply only when the asset is used (bytes.ts); a motif's inline SVG is in the page HTML and not counted.
 * composed:free carries the whole composed stylesheet (linked only by pages with a composed section), hence its own line.
 */
export const BYTE_BUDGET: Partial<Record<AssetKind, number>> = {
  font: 120 * 1024,
  pairing: 240 * 1024,
  palette: 0,
  motif: 6 * 1024,
  submotif: 1.5 * 1024,
  treatment: 2 * 1024,
  shape: 2 * 1024,
  factObject: 2 * 1024,
  header: 2 * 1024,
  footer: 2 * 1024,
  section: 4 * 1024,
};
export const COMPOSED_SHEET_BUDGET = 20 * 1024;

export function byteBudget(a: { id: string; kind: AssetKind }): number | undefined {
  return a.id === "section/composed:free" ? COMPOSED_SHEET_BUDGET : BYTE_BUDGET[a.kind];
}

/** The Slovene letters (and Croatian/Serbian ć đ that Slovene names use) every font must draw. */
export const SLOVENE_GLYPHS = "čšžćđČŠŽĆĐ";

export interface ContrastCheck {
  fg: keyof Colors;
  bg: keyof Colors;
  ratio: number;
  min: number;
  ok: boolean;
}

/**
 * Contrast of a palette's text roles: the code-enforced pairs (spec CONTRAST_RULES) and the template's own extra text
 * pairs (DirectionTemplate.textPairs, held at 4.5:1). Pairs whose colours the palette doesn't set (no band) are left out.
 */
export function paletteContrast(colors: Colors, dir?: Direction): ContrastCheck[] {
  const pairs: [keyof Colors, keyof Colors, number][] = [...CONTRAST_RULES, ...(dir?.template?.textPairs ?? []).map(([fg, bg]): [keyof Colors, keyof Colors, number] => [fg, bg, 4.5])];
  const out: ContrastCheck[] = [];
  for (const [fg, bg, min] of pairs) {
    const a = colors[fg];
    const b = colors[bg];
    if (!a || !b) continue;
    const ratio = Math.round(contrast(a, b) * 100) / 100;
    out.push({ fg, bg, ratio, min, ok: ratio >= min });
  }
  return out;
}

/**
 * The colours a site with this palette renders: the palette after the design rules' contrast repair (enforceDesign),
 * on the direction's first values for everything else. A palette as stored may be nudged here (the spec's families test
 * allows ΔE < 6 per role); the stored values are what the director sees, so their misses are reported too.
 */
export function shippedColors(colors: Colors, dir: Direction): Colors {
  const design: Design = {
    direction: dir.id,
    fontPair: dir.fontPairs[0]!,
    colors: { ...colors },
    radius: dir.ranges.radius[0],
    baseFontSize: dir.ranges.baseFontSize[0],
    scale: dir.ranges.scale[0],
    headingWeight: dir.ranges.headingWeight[0],
    headingCase: dir.ranges.headingCase[0]!,
    headingTracking: dir.ranges.headingTracking[0],
    density: dir.ranges.density[0]!,
    shadow: dir.ranges.shadow[0]!,
    imagery: dir.imagery,
  };
  return enforceDesign(design, dir).colors;
}

const inRange = (v: number, lo: number, hi: number): boolean => v >= lo && v <= hi;
/** A light warm colour (cream, beige, sand, peach-cream). */
const warmLight = (hex: string): boolean => {
  const { h, s, l } = hexToHsl(hex);
  return inRange(h, 15, 75) && s >= 0.15 && l >= 0.8;
};
/** Terracotta, brick or rust: a mid red-orange of moderate saturation. */
const terracotta = (hex: string): boolean => {
  const { h, s, l } = hexToHsl(hex);
  return inRange(h, 5, 30) && inRange(s, 0.3, 0.85) && inRange(l, 0.3, 0.62);
};
const acidGreen = (hex: string): boolean => {
  const { h, s, l } = hexToHsl(hex);
  return inRange(h, 65, 160) && s >= 0.55 && l >= 0.45;
};
const violet = (hex: string): boolean => {
  const { h, s, l } = hexToHsl(hex);
  return inRange(h, 255, 300) && s >= 0.3 && inRange(l, 0.15, 0.85);
};
const blue = (hex: string): boolean => {
  const { h, s, l } = hexToHsl(hex);
  return h >= 200 && h < 255 && s >= 0.3 && inRange(l, 0.15, 0.85);
};

/**
 * The colour give-aways of generated sites (an artifact or AI look): warm cream with terracotta, near-black with an
 * acid green, purple with blue. Read from the palette's grounds and its loud roles (primary, accent, band).
 */
export function paletteTells(c: Colors): string[] {
  const loud = [c.primary, c.accent, ...(c.band ? [c.band] : [])];
  const out: string[] = [];
  if ((warmLight(c.background) || warmLight(c.surface)) && loud.some(terracotta)) out.push("warm cream with terracotta");
  if (luminance(c.background) < 0.03 && loud.some(acidGreen)) out.push("near-black with acid green");
  if (loud.some(violet) && loud.some(blue)) out.push("purple with blue");
  return out;
}

/**
 * What a curated palette is held to as stored, with no render-time repair: every contrast pair (paletteContrast), no
 * pure black or white text or pure black surface (onBand included), no cream or beige page or section ground, the
 * ground it is tagged with (a dark page dark enough for the dark directions, a tinted page light enough for the tint
 * directions), the section surface on the page's side of light and dark (as enforceDesign keeps it), band and onBand
 * together, and none of the give-away combinations (paletteTells).
 */
export function paletteIssues(c: Colors, ground: Ground): string[] {
  const out = paletteContrast(c)
    .filter((x) => !x.ok)
    .map((x) => `${x.fg} on ${x.bg} ${x.ratio} < ${x.min}`);
  out.push(...offBlackWhiteIssues(c).map((i) => i.message));
  if (c.onBand && (luminance(c.onBand) > OFF_WHITE_MAX || luminance(c.onBand) < OFF_BLACK_MIN)) out.push(`onBand ${c.onBand} is pure white or black`);
  if ((c.band === undefined) !== (c.onBand === undefined)) out.push("band and onBand go together");
  if (isCreamOrOffWhite(c.background, { beige: true })) out.push(`background ${c.background} is cream, beige or off-white`);
  if (isWarmCream(c.surface) || isBeige(c.surface)) out.push(`surface ${c.surface} is cream or beige`);
  if (groundOf(c) !== ground) out.push(`ground is ${groundOf(c)}, tagged ${ground}`);
  const bg = luminance(c.background);
  if (ground === "dark" && bg > 0.05) out.push(`dark page ${c.background} too light for the dark directions`);
  if (ground === "tint" && bg < 0.6) out.push(`tinted page ${c.background} too dark for the tint directions`);
  const light = bg > 0.5;
  if (light ? luminance(c.surface) < 0.4 : luminance(c.surface) > 0.08) out.push(`surface ${c.surface} is on the other side of light and dark from the page`);
  out.push(...paletteTells(c));
  return out;
}
