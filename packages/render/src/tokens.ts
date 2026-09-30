import { fontPair, type Design, type FontFace } from "@sb/spec";

const px = (n: number) => `${Math.round(n * 100) / 100}px`;
const rem = (n: number) => `${Math.round((n / 16) * 1000) / 1000}rem`;

/** Fluid size: `min` at 360 px viewport, `max` at 1280 px. */
function fluid(min: number, max: number): string {
  if (max <= min) return rem(min);
  const slope = (max - min) / (1280 - 360);
  const base = min - slope * 360;
  return `clamp(${rem(min)}, ${rem(base)} + ${Math.round(slope * 10000) / 100}vw, ${rem(max)})`;
}

const SPACE: Record<Design["density"], [number, number, number]> = {
  // section padding mobile, desktop, block gap
  compact: [32, 64, 24],
  regular: [44, 88, 32],
  airy: [56, 112, 40],
};

export function fontStack(f: FontFace): string {
  const generic = f.fallback === "serif" ? 'Georgia, "Times New Roman", serif' : 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
  return `"${f.family}", ${generic}`;
}

/** Per-site CSS custom properties. Deterministic output for identical input. */
export function tokensCss(design: Design): string {
  const pair = fontPair(design.fontPair);
  const c = design.colors;
  const b = design.baseFontSize;
  const s = design.scale;
  // Headings shrink more on mobile so long Slovene words fit at 360 px.
  const h1 = [Math.min(b * s ** 3, 40), b * s ** 5];
  const h2 = [Math.min(b * s ** 2, 30), b * s ** 3.5];
  const h3 = [b * s, b * s ** 1.5];
  const [spMob, spDesk, block] = SPACE[design.density];
  const vars: Record<string, string> = {
    "--c-bg": c.background,
    "--c-surface": c.surface,
    "--c-text": c.text,
    "--c-muted": c.muted,
    "--c-primary": c.primary,
    "--c-on-primary": c.onPrimary,
    "--c-accent": c.accent,
    "--c-border": c.border,
    "--c-inverse": c.inverse,
    "--c-on-inverse": c.onInverse,
    "--radius": px(design.radius),
    "--font-heading": fontStack(pair.heading),
    "--font-body": fontStack(pair.body),
    "--fw-heading": String(design.headingWeight),
    "--tracking-heading": `${design.headingTracking}em`,
    "--case-heading": design.headingCase === "uppercase" ? "uppercase" : "none",
    "--fs-base": rem(b),
    "--fs-sm": rem(Math.max(14, b / s)),
    "--fs-lg": fluid(b * 1.06, b * s),
    "--fs-h1": fluid(h1[0]!, h1[1]!),
    "--fs-h2": fluid(h2[0]!, h2[1]!),
    "--fs-h3": fluid(h3[0]!, h3[1]!),
    "--space-section": fluid(spMob, spDesk),
    "--space-block": rem(block),
    "--shadow": design.shadow === "subtle" ? "0 1px 2px rgb(0 0 0 / 0.06), 0 2px 8px rgb(0 0 0 / 0.05)" : "none",
  };
  const scheme = luminanceLight(c.background) ? "light" : "dark";
  return `:root{color-scheme:${scheme};${Object.entries(vars)
    .map(([k, v]) => `${k}:${v}`)
    .join(";")}}`;
}

function luminanceLight(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const bl = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * bl > 140;
}

/** @font-face rules for one pair. Paths relative to the stylesheet-less page: `fontsBase` ends with "/". */
export function fontFaceCss(design: Design, fontsBase: string): string {
  const pair = fontPair(design.fontPair);
  const faces = pair.heading.file === pair.body.file ? [pair.heading] : [pair.heading, pair.body];
  return faces
    .map(
      (f) =>
        `@font-face{font-family:"${f.family}";src:url("${fontsBase}${f.file}.woff2") format("woff2");font-weight:${f.weights[0]} ${f.weights[1]};font-style:normal;font-display:swap;unicode-range:U+0000-017F,U+2000-206F,U+20AC,U+2122}`,
    )
    .join("");
}

export function fontFiles(design: Design): string[] {
  const pair = fontPair(design.fontPair);
  return [...new Set([pair.heading.file, pair.body.file])].map((f) => `${f}.woff2`);
}
