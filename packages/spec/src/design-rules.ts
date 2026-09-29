import { contrast, ensureContrast, isCreamOrOffWhite, isWarmCream, luminance } from "./color.ts";
import type { Colors, Design, Direction } from "./design.ts";

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
];

export interface DesignIssue {
  path: string;
  message: string;
}

export function checkDesign(design: Design, dir: Direction | undefined): DesignIssue[] {
  const issues: DesignIssue[] = [];
  const c = design.colors;
  for (const [fg, bg, min] of CONTRAST_RULES) {
    const r = contrast(c[fg], c[bg]);
    if (r < min) issues.push({ path: `/design/colors/${fg}`, message: `${fg} on ${bg} contrast ${r.toFixed(2)} < ${min}` });
  }
  if (isCreamOrOffWhite(c.background)) issues.push({ path: "/design/colors/background", message: "cream or off-white page background is banned" });
  if (isWarmCream(c.surface))
    issues.push({ path: "/design/colors/surface", message: "cream section background is banned" });
  if (!dir) {
    issues.push({ path: "/design/direction", message: `unknown direction ${design.direction}` });
    return issues;
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
  }
  return out;
}
