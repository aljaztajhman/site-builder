import { OFF_BLACK_MIN, OFF_WHITE_MAX, clampLuminance, contrast, ensureContrast, isCreamOrOffWhite, isWarmCream, luminance } from "./color.ts";
import type { Colors, Design, Direction } from "./design.ts";

/** Text colours: never pure black, never pure white. (Button text, onPrimary, may be white.) */
export const TEXT_TOKENS = ["text", "muted", "onInverse"] as const satisfies readonly (keyof Colors)[];
/** Surface colours: never pure black. A pure white page is allowed (the white directions require it). */
export const SURFACE_TOKENS = ["background", "surface", "inverse"] as const satisfies readonly (keyof Colors)[];

/** The off-black / off-white issues of a palette (see OFF_BLACK_MIN, OFF_WHITE_MAX). */
export function offBlackWhiteIssues(c: Colors): DesignIssue[] {
  const issues: DesignIssue[] = [];
  for (const k of [...TEXT_TOKENS, ...SURFACE_TOKENS]) {
    if (luminance(c[k]) < OFF_BLACK_MIN) issues.push({ path: `/design/colors/${k}`, message: `${k} ${c[k]} is pure black; use an off-black` });
  }
  for (const k of TEXT_TOKENS) {
    if (luminance(c[k]) > OFF_WHITE_MAX) issues.push({ path: `/design/colors/${k}`, message: `${k} ${c[k]} is pure white; use an off-white` });
  }
  return issues;
}

/** In place: moves text and surface colours inside the off-black / off-white bounds. */
export function clampOffBlackWhite(c: Colors): void {
  for (const k of TEXT_TOKENS) c[k] = clampLuminance(c[k], OFF_BLACK_MIN, OFF_WHITE_MAX);
  for (const k of SURFACE_TOKENS) c[k] = clampLuminance(c[k], OFF_BLACK_MIN);
}

/** Contrast pairs enforced in code: [foreground, background, minimum ratio]. */
export const CONTRAST_RULES: [keyof Colors, keyof Colors, number][] = [
  ["text", "background", 4.5],
  ["text", "surface", 4.5],
  ["muted", "background", 4.5],
  ["muted", "surface", 4.5],
  ["onPrimary", "primary", 4.5],
  ["primary", "background", 3],
  ["primary", "surface", 3],
  ["onInverse", "inverse", 4.5],
  ["accent", "background", 3],
  ["accent", "inverse", 3],
  ["onBand", "band", 4.5],
];

export interface DesignIssue {
  path: string;
  message: string;
}

export function checkDesign(design: Design, dir: Direction | undefined): DesignIssue[] {
  const issues: DesignIssue[] = [];
  const c = design.colors;
  for (const [fg, bg, min] of CONTRAST_RULES) {
    const a = c[fg];
    const b = c[bg];
    // band and onBand are optional; a band without its text colour is reported below.
    if (a === undefined || b === undefined) continue;
    const r = contrast(a, b);
    if (r < min) issues.push({ path: `/design/colors/${fg}`, message: `${fg} on ${bg} contrast ${r.toFixed(2)} < ${min}` });
  }
  if ((c.band === undefined) !== (c.onBand === undefined)) issues.push({ path: "/design/colors/onBand", message: "band and onBand go together" });
  if (isCreamOrOffWhite(c.background)) issues.push({ path: "/design/colors/background", message: "cream or off-white page background is banned" });
  if (isWarmCream(c.surface))
    issues.push({ path: "/design/colors/surface", message: "cream section background is banned" });
  issues.push(...offBlackWhiteIssues(c));
  if (!dir) {
    issues.push({ path: "/design/direction", message: `unknown direction ${design.direction}` });
    return issues;
  }
  for (const [fg, bg] of dir.template?.textPairs ?? []) {
    const a = c[fg];
    const b = c[bg];
    if (a === undefined || b === undefined) continue;
    const ratio = contrast(a, b);
    if (ratio < 4.5) issues.push({ path: `/design/colors/${fg}`, message: `${fg} on ${bg} contrast ${ratio.toFixed(2)} < 4.5 (text in ${dir.id})` });
  }
  if (!dir.fontPairs.includes(design.fontPair)) issues.push({ path: "/design/fontPair", message: `font pair ${design.fontPair} not in direction ${dir.id}` });
  const r = dir.ranges;
  const inRange = (key: "radius" | "baseFontSize" | "scale" | "headingWeight" | "headingTracking") => {
    const [lo, hi] = r[key];
    const v = design[key];
    if (v < lo - 1e-9 || v > hi + 1e-9) issues.push({ path: `/design/${key}`, message: `${key} ${v} outside ${lo}..${hi} for ${dir.id}` });
  };
  inRange("radius");
  inRange("baseFontSize");
  inRange("scale");
  inRange("headingWeight");
  inRange("headingTracking");
  if (!r.headingCase.includes(design.headingCase)) issues.push({ path: "/design/headingCase", message: `headingCase not allowed for ${dir.id}` });
  if (!r.density.includes(design.density)) issues.push({ path: "/design/density", message: `density not allowed for ${dir.id}` });
  if (!r.shadow.includes(design.shadow)) issues.push({ path: "/design/shadow", message: `shadow not allowed for ${dir.id}` });
  if (design.imagery !== dir.imagery) issues.push({ path: "/design/imagery", message: `imagery must be ${dir.imagery} for ${dir.id}` });
  const bgKind = dir.palette.background;
  if (bgKind === "white" && c.background !== "#ffffff") issues.push({ path: "/design/colors/background", message: "direction requires a white page" });
  if (bgKind === "dark" && luminance(c.background) > 0.05) issues.push({ path: "/design/colors/background", message: "direction requires a dark page" });
  if (bgKind === "tint" && luminance(c.background) < 0.6) issues.push({ path: "/design/colors/background", message: "direction requires a light tinted page" });
  return issues;
}

/** White or near-black, whichever reads better on `bg`. */
function bestText(bg: string): string {
  return contrast("#ffffff", bg) >= contrast("#111111", bg) ? "#ffffff" : "#111111";
}

const clamp = (v: number, [lo, hi]: [number, number]) => Math.min(hi, Math.max(lo, v));

/**
 * Brings a proposed design inside its direction: clamps numeric tokens, picks allowed enums,
 * replaces a banned background, and fixes contrast by moving lightness. Idempotent.
 */
export function enforceDesign(design: Design, dir: Direction): Design {
  const r = dir.ranges;
  const out: Design = {
    ...design,
    direction: dir.id,
    fontPair: dir.fontPairs.includes(design.fontPair) ? design.fontPair : dir.fontPairs[0]!,
    radius: Math.round(clamp(design.radius, r.radius)),
    baseFontSize: Math.round(clamp(design.baseFontSize, r.baseFontSize)),
    scale: clamp(design.scale, r.scale),
    headingWeight: Math.round(clamp(design.headingWeight, r.headingWeight) / 50) * 50,
    headingTracking: clamp(design.headingTracking, r.headingTracking),
    headingCase: r.headingCase.includes(design.headingCase) ? design.headingCase : r.headingCase[0]!,
    density: r.density.includes(design.density) ? design.density : r.density[0]!,
    shadow: r.shadow.includes(design.shadow) ? design.shadow : r.shadow[0]!,
    imagery: dir.imagery,
    colors: { ...design.colors },
  };
  out.headingWeight = clamp(out.headingWeight, r.headingWeight);
  const c = out.colors;
  const fb = dir.palette.fallback;
  if (dir.palette.background === "white") c.background = "#ffffff";
  if (isCreamOrOffWhite(c.background) || (dir.palette.background === "dark" && luminance(c.background) > 0.05)) c.background = fb.background;
  if (dir.palette.background === "tint" && luminance(c.background) < 0.6) c.background = fb.background;
  if (isWarmCream(c.surface)) c.surface = fb.surface;
  clampOffBlackWhite(c);
  // Body text must pass on both the page and the section surface, so the surface stays on the page's
  // side of light/dark. A mid-grey surface on a white page left no text colour that passes on both
  // (live eval, "Barve naj bodo temnejše, bolj resne": the edit was rejected instead of repaired).
  const lightPage = luminance(c.background) > 0.5;
  if (lightPage ? luminance(c.surface) < 0.4 : luminance(c.surface) > 0.08) c.surface = fb.surface;
  // Contrast: adjust foregrounds, never the page background.
  for (let pass = 0; pass < 3; pass++) {
    c.text = ensureContrast(c.text, c.surface, 4.5);
    c.text = ensureContrast(c.text, c.background, 4.5);
    c.muted = ensureContrast(c.muted, c.surface, 4.5);
    c.muted = ensureContrast(c.muted, c.background, 4.5);
    c.primary = ensureContrast(c.primary, c.surface, 3);
    c.primary = ensureContrast(c.primary, c.background, 3);
    c.onPrimary = ensureContrast(c.onPrimary, c.primary, 4.5);
    c.onInverse = ensureContrast(c.onInverse, c.inverse, 4.5);
    c.accent = ensureContrast(c.accent, c.background, 3);
    c.accent = ensureContrast(c.accent, c.inverse, 3);
    // Pairs a template sets as text (poster-size figures and prices in its primary colour) read like body text.
    for (const [fg, bg] of dir.template?.textPairs ?? []) {
      const a = c[fg];
      const b = c[bg];
      if (a !== undefined && b !== undefined) c[fg] = ensureContrast(a, b, 4.5);
    }
    // ensureContrast's last resort is pure black or white; pull text back inside the bounds.
    clampOffBlackWhite(c);
    // A mid-tone inverse can leave no off-white or off-black text that passes; darken the inverse instead.
    if (contrast(c.onInverse, c.inverse) < 4.5) c.inverse = clampLuminance(ensureContrast(c.inverse, c.onInverse, 4.5), OFF_BLACK_MIN);
    if (c.band !== undefined) c.onBand = ensureContrast(c.onBand ?? bestText(c.band), c.band, 4.5);
  }
  if (c.band === undefined) delete c.onBand;
  return out;
}
