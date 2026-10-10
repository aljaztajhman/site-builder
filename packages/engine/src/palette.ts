import sharp from "sharp";
import { MAX_INPUT_PIXELS } from "./images.ts";
import {
  CONTRAST_RULES,
  OFF_BLACK_MIN,
  OFF_WHITE_MAX,
  clampLuminance,
  contrast,
  hexToHsl,
  hexToRgb,
  hslToHex,
  isBeige,
  isCreamOrOffWhite,
  isWarmCream,
  luminance,
  rgbToHex,
  type Colors,
  type Hsl,
  type Rgb,
} from "@sb/spec";

export interface Swatch {
  hex: string;
  /** Share of sampled pixels, 0..1. */
  weight: number;
  source: "logo" | "photo";
}

/**
 * Dominant colours of an image by coarse quantisation of a 64×64 sample. For logos, near-white,
 * near-black and grey pixels are skipped (backgrounds and outlines), so the brand colour wins.
 */
export async function extractSwatches(data: Uint8Array, source: Swatch["source"], max = 4): Promise<Swatch[]> {
  const { data: px, info } = await sharp(data, { density: 72, limitInputPixels: MAX_INPUT_PIXELS })
    .flatten({ background: "#ffffff" })
    .resize(64, 64, { fit: "inside" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const buckets = new Map<string, { sum: Rgb; n: number }>();
  let total = 0;
  for (let i = 0; i < px.length; i += info.channels) {
    const rgb: Rgb = [px[i]!, px[i + 1]!, px[i + 2]!];
    const { s, l } = hexToHsl(rgbToHex(rgb));
    total++;
    if (source === "logo" && (l > 0.92 || l < 0.08 || s < 0.15)) continue;
    const key = rgb.map((c) => c >> 5).join(",");
    const b = buckets.get(key) ?? { sum: [0, 0, 0], n: 0 };
    b.sum = [b.sum[0] + rgb[0], b.sum[1] + rgb[1], b.sum[2] + rgb[2]];
    b.n++;
    buckets.set(key, b);
  }
  return [...buckets.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, max)
    .map((b) => ({ hex: rgbToHex([b.sum[0] / b.n, b.sum[1] / b.n, b.sum[2] / b.n]), weight: b.n / Math.max(1, total), source }));
}

// ---------------------------------------------------------------- palettes from the owner's photos (design-studio.md §4.1)

/** The colour roles read from a set of photos. */
export type PhotoRole = "vivid" | "muted" | "dark" | "light";

/** The characteristic colours of a set of owner photos (photoSwatches). */
export interface PhotoSwatches {
  /** The most common colour that is neither near-white nor near-black. */
  dominant: string;
  /** The most saturated colour that covers a real share of the photos, at mid lightness. */
  vivid: string;
  /** The most common soft colour: low saturation, mid lightness. */
  muted: string;
  /** The most common dark colour (the more saturated weighs more). */
  dark: string;
  /** The most common light colour (the more saturated weighs more). */
  light: string;
  /** The heaviest colour clusters across all photos, heaviest first. */
  swatches: Swatch[];
  /** Roles the photos had no colour for: derived from the dominant colour instead. */
  derived: PhotoRole[];
}

interface Cluster {
  hex: string;
  hsl: Hsl;
  weight: number;
}

/** A cluster must cover this share of the photos to stand for a role (one stray red sign doesn't make a palette). */
const MIN_SHARE = 0.01;

/** Colour clusters of the photos (8 levels per channel of a 64 px sample), every photo weighing the same. */
async function photoClusters(buffers: readonly Uint8Array[]): Promise<Cluster[]> {
  const buckets = new Map<string, { sum: Rgb; w: number }>();
  for (const data of buffers) {
    const { data: px, info } = await sharp(data, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .flatten({ background: "#ffffff" })
      .resize(64, 64, { fit: "inside" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const w = 1 / ((px.length / info.channels) * buffers.length);
    for (let i = 0; i < px.length; i += info.channels) {
      const rgb: Rgb = [px[i]!, px[i + 1]!, px[i + 2]!];
      const key = rgb.map((c) => c >> 5).join(",");
      const b = buckets.get(key) ?? { sum: [0, 0, 0], w: 0 };
      b.sum = [b.sum[0] + rgb[0] * w, b.sum[1] + rgb[1] * w, b.sum[2] + rgb[2] * w];
      b.w += w;
      buckets.set(key, b);
    }
  }
  return [...buckets.values()]
    .map((b) => {
      const hex = rgbToHex([b.sum[0] / b.w, b.sum[1] / b.w, b.sum[2] / b.w]);
      return { hex, hsl: hexToHsl(hex), weight: b.w };
    })
    .sort((a, b) => b.weight - a.weight || (a.hex < b.hex ? -1 : a.hex > b.hex ? 1 : 0));
}

function best(clusters: Cluster[], fits: (c: Hsl) => boolean, score: (c: Cluster) => number): Cluster | undefined {
  let top: Cluster | undefined;
  for (const c of clusters) if (c.weight >= MIN_SHARE && fits(c.hsl) && (!top || score(c) > score(top))) top = c;
  return top;
}

/**
 * The dominant, vivid, muted, dark and light colours of the owner's photos, and their `n` heaviest colour clusters.
 * Read from the pixels with sharp; no model call. A role the photos have no colour for (no dark pixels in a set of
 * snow pictures) is derived from the dominant colour and listed in `derived`.
 */
export async function photoSwatches(buffers: readonly Uint8Array[], n = 6): Promise<PhotoSwatches> {
  if (!buffers.length) throw new Error("photoSwatches needs at least one photo");
  const clusters = await photoClusters(buffers);
  const dominant = best(clusters, (c) => c.l >= 0.08 && c.l <= 0.92, (c) => c.weight) ?? clusters[0]!;
  const d = dominant.hsl;
  const derived: PhotoRole[] = [];
  const role = (name: PhotoRole, found: Cluster | undefined, fallback: Hsl): string => {
    if (found) return found.hex;
    derived.push(name);
    return hslToHex(fallback);
  };
  const vivid = role("vivid", best(clusters, (c) => c.s >= 0.3 && c.l >= 0.2 && c.l <= 0.75, (c) => c.hsl.s * c.hsl.s * Math.sqrt(c.weight)), {
    // Grey photos have no vivid colour: a quiet slate of their hue, not an invented loud one (a green-grey surgery
    // made a signal green).
    h: d.h,
    s: Math.min(Math.max(d.s * 2, 0.2), 0.35),
    l: 0.4,
  });
  const muted = role("muted", best(clusters, (c) => c.s >= 0.06 && c.s <= 0.35 && c.l >= 0.25 && c.l <= 0.75, (c) => c.weight), { h: d.h, s: Math.min(Math.max(d.s, 0.12), 0.25), l: 0.5 });
  const dark = role("dark", best(clusters, (c) => c.l < 0.25, (c) => c.weight * (0.4 + c.hsl.s)), { h: d.h, s: Math.min(d.s, 0.4), l: 0.14 });
  const light = role("light", best(clusters, (c) => c.l > 0.75, (c) => c.weight * (0.4 + c.hsl.s)), { h: d.h, s: Math.min(d.s, 0.35), l: 0.92 });
  return {
    dominant: dominant.hex,
    vivid,
    muted,
    dark,
    light,
    swatches: clusters.slice(0, n).map((c) => ({ hex: c.hex, weight: c.weight, source: "photo" })),
    derived,
  };
}

/** The page ground of a proposed palette. */
export type PhotoGround = "white" | "tint" | "dark";

export interface PhotoPalette {
  colors: Colors;
  /** The ground the palette has: a tinted page falls back to white when every photo colour is warm (it would be cream). */
  ground: PhotoGround;
}

/** Cream, beige and sand hues: a light page or surface of one of these reads as cream (banned). */
const warmHue = (h: number): boolean => h >= 15 && h <= 75;
const isViolet = (c: Hsl): boolean => c.h >= 255 && c.h <= 300 && c.s >= 0.3;
const isBlue = (c: Hsl): boolean => c.h >= 200 && c.h < 255 && c.s >= 0.3;

/** The lightness nearest `base`'s (its hue and saturation kept) whose colour passes `ok`. */
function solveLightness(base: Hsl, ok: (hex: string) => boolean, prefer: "darker" | "lighter" | "either" = "either"): string | undefined {
  const start = hslToHex(base);
  if (ok(start)) return start;
  const dirs = prefer === "darker" ? [-1] : prefer === "lighter" ? [1] : [-1, 1];
  for (let i = 1; i <= 200; i++) {
    for (const dir of dirs) {
      const l = base.l + dir * i * 0.005;
      if (l < 0 || l > 1) continue;
      const c = hslToHex({ ...base, l });
      if (ok(c)) return c;
    }
  }
  return undefined;
}

const mixHex = (a: string, b: string, t: number): string => {
  const p = hexToRgb(a);
  const q = hexToRgb(b);
  return rgbToHex([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t]);
};

/**
 * A palette proposed from photo swatches, every role assigned so it passes as stored: the code-enforced contrast pairs
 * (spec CONTRAST_RULES), no pure black or white text, no cream or beige page or section ground. The vivid colour
 * becomes the button and the band, the dark one the text and the inverse ground, a contrasting photo colour the
 * accent; a tinted page and the section surface take a cool photo hue. Deterministic; no model call.
 */
export function paletteFromSwatches(p: PhotoSwatches, ground: PhotoGround = "white"): PhotoPalette {
  const v = hexToHsl(p.vivid);
  const dk = hexToHsl(p.dark);
  const lt = hexToHsl(p.light);
  const coolHue = [lt, hexToHsl(p.muted), v, hexToHsl(p.dominant)].find((c) => !warmHue(c.h) && c.s >= 0.08)?.h;
  const g: PhotoGround = ground === "tint" && coolHue === undefined ? "white" : ground;
  const darkPage = g === "dark";

  const background =
    g === "white" ? "#ffffff" : g === "tint" ? hslToHex({ h: coolHue!, s: 0.35, l: 0.93 }) : clampLuminance(hslToHex({ h: dk.h, s: Math.min(dk.s, 0.35), l: 0.09 }), 0.008, 0.03);
  const surface = darkPage
    ? clampLuminance(hslToHex({ h: dk.h, s: Math.min(dk.s, 0.3), l: 0.14 }), 0.012, 0.06)
    : hslToHex({ h: coolHue ?? 210, s: coolHue === undefined ? 0.15 : 0.28, l: g === "tint" ? 0.965 : 0.955 });
  const onBoth = (x: string, min: number) => contrast(x, background) >= min && contrast(x, surface) >= min;

  const text = darkPage
    ? solveLightness({ h: lt.h, s: Math.min(lt.s, 0.2), l: 0.92 }, (x) => luminance(x) <= OFF_WHITE_MAX - 0.02 && onBoth(x, 7), "darker")!
    : solveLightness({ h: dk.h, s: Math.min(dk.s, 0.35), l: 0.13 }, (x) => luminance(x) >= OFF_BLACK_MIN && onBoth(x, 7))!;
  let muted = text;
  for (let t = 0.01; t <= 0.8; t += 0.01) {
    const m = mixHex(text, background, t);
    if (!onBoth(m, 5)) break;
    muted = m;
  }

  // The button: the vivid colour, darkened under white text on a light page or lightened over a dark one. A lightened
  // green on a near-black page is the acid-green give-away: its saturation is capped there.
  const pv = darkPage && v.h >= 65 && v.h <= 160 ? { ...v, s: Math.min(v.s, 0.45) } : v;
  const primary = darkPage
    ? solveLightness(pv, (x) => onBoth(x, 3) && contrast(background, x) >= 4.5, "lighter")!
    : solveLightness(pv, (x) => onBoth(x, 3) && contrast("#ffffff", x) >= 4.5, "darker")!;
  const onPrimary = darkPage ? background : "#ffffff";

  const inverse = darkPage
    ? clampLuminance(hslToHex({ h: v.h, s: Math.min(v.s, 0.45), l: 0.17 }), 0.02, 0.05)
    : clampLuminance(hslToHex({ h: dk.h, s: Math.min(Math.max(dk.s, 0.2), 0.5), l: 0.16 }), 0.012, 0.035);
  const ih = hexToHsl(inverse);
  const onInverse = clampLuminance(hslToHex({ h: ih.h, s: Math.min(ih.s, 0.25), l: 0.95 }), OFF_BLACK_MIN, OFF_WHITE_MAX - 0.02);

  // The accent: the photo colour furthest in hue from the vivid one (a second colour), else the vivid hue.
  const hueGap = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
  const candidates = [p.dominant, p.muted, p.light, p.dark]
    .map(hexToHsl)
    .filter((c) => c.s >= 0.15 && !((isViolet(v) && isBlue(c)) || (isBlue(v) && isViolet(c))))
    .sort((a, b) => hueGap(b.h, v.h) - hueGap(a.h, v.h));
  const ah = candidates[0] && hueGap(candidates[0].h, v.h) >= 30 ? candidates[0] : v;
  const accentBase = { h: ah.h, s: Math.min(Math.max(ah.s, 0.4), darkPage && ah.h >= 65 && ah.h <= 160 ? 0.45 : 0.8), l: 0.5 };
  const accent = solveLightness(accentBase, (x) => contrast(x, background) >= 3 && contrast(x, inverse) >= 3)!;

  let border = surface;
  for (let t = 0.01; t <= 1; t += 0.01) {
    border = mixHex(surface, text, t);
    if (contrast(border, background) >= 1.3) break;
  }

  // The band: the vivid colour as found, with whichever text reads best on it.
  const bandBase = darkPage && v.h >= 65 && v.h <= 160 ? hslToHex(pv) : p.vivid;
  const bandTexts = [darkPage ? background : text, onInverse];
  const pickText = (b: string) => [...bandTexts].sort((x, y) => contrast(y, b) - contrast(x, b))[0]!;
  const band = contrast(pickText(bandBase), bandBase) >= 4.5 ? bandBase : solveLightness(hexToHsl(bandBase), (b) => contrast(pickText(b), b) >= 4.5)!;
  const onBand = pickText(band);

  const colors: Colors = { background, surface, text, muted, primary, onPrimary, accent, border, inverse, onInverse, band, onBand };
  return { colors, ground: g };
}

/** What a proposed photo palette breaks (empty when it holds): the contrast pairs and the cream and off-black/white bans. */
export function photoPaletteIssues(c: Colors): string[] {
  const out: string[] = [];
  for (const [fg, bg, min] of CONTRAST_RULES) {
    const a = c[fg];
    const b = c[bg];
    if (a !== undefined && b !== undefined && contrast(a, b) < min) out.push(`${fg} on ${bg} ${contrast(a, b).toFixed(2)} < ${min}`);
  }
  for (const k of ["text", "muted", "onInverse", "onBand"] as const) {
    const x = c[k];
    if (x !== undefined && (luminance(x) > OFF_WHITE_MAX || luminance(x) < OFF_BLACK_MIN)) out.push(`${k} ${x} is pure white or black`);
  }
  for (const k of ["background", "surface", "inverse"] as const) if (luminance(c[k]) < OFF_BLACK_MIN) out.push(`${k} ${c[k]} is pure black`);
  if (isCreamOrOffWhite(c.background, { beige: true })) out.push(`background ${c.background} is cream or beige`);
  if (isWarmCream(c.surface) || isBeige(c.surface)) out.push(`surface ${c.surface} is cream or beige`);
  return out;
}
