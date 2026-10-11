/** Colour maths for contrast enforcement and banned-background checks. Hex colours are #rrggbb. */

export type Rgb = [number, number, number];

export function hexToRgb(hex: string): Rgb {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) throw new Error(`Invalid hex colour: ${hex}`);
  return [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)];
}

export function rgbToHex([r, g, b]: Rgb): string {
  const h = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** CIE L*a*b* (D65) of a hex colour. */
export function hexToLab(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex).map(channel) as Rgb;
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/** Perceptual colour difference ΔE*76 (Euclidean in L*a*b*): about 2 is just noticeable, over 30 clearly different. */
export function deltaE(a: string, b: string): number {
  const p = hexToLab(a);
  const q = hexToLab(b);
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

/** WCAG 2.x contrast ratio. */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Blends `a` over `b` at opacity `alpha` (0–1), per sRGB channel: alpha·a + (1 − alpha)·b. A scrim over a pixel. */
export function mix(a: string, b: string, alpha: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return rgbToHex(x.map((v, i) => alpha * v + (1 - alpha) * y[i]!) as Rgb);
}

export interface Hsl {
  h: number; // 0..360
  s: number; // 0..1
  l: number; // 0..1
}

export function hexToHsl(hex: string): Hsl {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255) as Rgb;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h * 60, s, l };
}

export function hslToHex({ h, s, l }: Hsl): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let rgb: Rgb;
  if (hp < 1) rgb = [c, x, 0];
  else if (hp < 2) rgb = [x, c, 0];
  else if (hp < 3) rgb = [0, c, x];
  else if (hp < 4) rgb = [0, x, c];
  else if (hp < 5) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  const m = l - c / 2;
  return rgbToHex(rgb.map((v) => (v + m) * 255) as Rgb);
}

/**
 * Moves `fg` lightness away from `bg` until contrast >= min. Keeps hue and saturation.
 * Returns the adjusted colour (black or white as the last resort).
 */
export function ensureContrast(fg: string, bg: string, min: number): string {
  if (contrast(fg, bg) >= min) return fg;
  const hsl = hexToHsl(fg);
  const darker = luminance(bg) > 0.18;
  for (let i = 1; i <= 100; i++) {
    const l = darker ? hsl.l - i * 0.01 : hsl.l + i * 0.01;
    if (l < 0 || l > 1) break;
    const candidate = hslToHex({ ...hsl, l });
    if (contrast(candidate, bg) >= min) return candidate;
  }
  return darker ? "#000000" : "#ffffff";
}

/**
 * Off-black and off-white bounds (WCAG relative luminance). Pure #000 text or surfaces and pure #fff text
 * are an AI-site give-away (docs/PRODUCT.md). OFF_BLACK_MIN admits #0e0e0e and lighter; OFF_WHITE_MAX
 * admits #f5f5f5 and darker. A pure white page stays allowed: the white directions require it.
 */
export const OFF_BLACK_MIN = 0.004;
export const OFF_WHITE_MAX = 0.92;

/**
 * Moves `hex` along its lightness (hue and saturation kept) until its luminance is within [lo, hi].
 * Returns it unchanged when it already is.
 */
export function clampLuminance(hex: string, lo: number, hi = 1): string {
  const lum = luminance(hex);
  if (lum >= lo && lum <= hi) return hex;
  const hsl = hexToHsl(hex);
  const up = lum < lo;
  for (let i = 1; i <= 200; i++) {
    const l = up ? hsl.l + i * 0.005 : hsl.l - i * 0.005;
    if (l < 0 || l > 1) break;
    const candidate = hslToHex({ ...hsl, l });
    const cl = luminance(candidate);
    if (cl >= lo && cl <= hi) return candidate;
  }
  return hex;
}

/**
 * Banned: cream or off-white page backgrounds. Light backgrounds must be pure white
 * or a clearly tinted cool colour; warm near-whites and greyish near-whites are rejected.
 */
export function isCreamOrOffWhite(hex: string, opts: { beige?: boolean } = {}): boolean {
  const c = hex.toLowerCase();
  if (c === "#ffffff") return false;
  const { h, s, l } = hexToHsl(c);
  // Config promptFixes.beige: a light warm beige or sand just under the near-white band (#ece3d0, #e8d5b7) is cream too.
  if (opts.beige && isBeige(c)) return true;
  if (l < 0.88) return false;
  if (s < 0.2) return true; // grey/ivory near-white
  return h >= 20 && h <= 75; // warm cream, beige, ivory
}

/** Light warm beige, sand or greige below the near-white band (lightness 0.78–0.88, hue 20–75°, not grey). */
export function isBeige(hex: string): boolean {
  const { h, s, l } = hexToHsl(hex.toLowerCase());
  return l >= 0.78 && l < 0.88 && s >= 0.1 && h >= 20 && h <= 75;
}

/**
 * A warm tint that isn't cream (config promptFixes.warmSurface): peach, apricot or a terracotta-tinted light colour,
 * clearly coloured (saturation ≥ 0.45) and redder than cream and beige (hue 8–30°), light enough for body text.
 */
export function isWarmTint(hex: string): boolean {
  const { h, s, l } = hexToHsl(hex.toLowerCase());
  return h >= 8 && h <= 30 && s >= 0.45 && l >= 0.82 && l <= 0.92;
}

/** The nearest warm tint (isWarmTint) to a warm colour: its hue pulled into 12–28°, saturation ≥ 0.55, lightness 0.85–0.9. */
export function toWarmTint(hex: string): string {
  if (isWarmTint(hex)) return hex.toLowerCase();
  const { h, s, l } = hexToHsl(hex.toLowerCase());
  const hue = h >= 12 && h <= 28 ? h : h > 28 && h < 200 ? 28 : 12;
  return hslToHex({ h: hue, s: Math.max(s, 0.55), l: Math.min(0.9, Math.max(0.85, l)) });
}

/** Warm cream/beige near-white (used for section surfaces, where cool greys are fine). */
export function isWarmCream(hex: string): boolean {
  const { h, s, l } = hexToHsl(hex.toLowerCase());
  return l >= 0.85 && s >= 0.2 && h >= 20 && h <= 75;
}
