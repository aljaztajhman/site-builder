import { DIRECTIONS, fontPair, type Colors, type Design, type FontFace, type Motif } from "@sb/spec";

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
  const template = DIRECTIONS.find((d) => d.id === design.direction)?.template;
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
  // Trade templates: band colours, display sizes and the motif's drawn pieces in the site's own colours.
  if (template) {
    vars["--c-band"] = c.band ?? c.primary;
    vars["--c-on-band"] = c.onBand ?? c.onPrimary;
    vars["--fs-display"] = fluid(template.display[0], template.display[1]);
    vars["--fs-h2"] = fluid(template.h2[0], template.h2[1]);
    Object.assign(vars, motifVars(template.motif, c));
  } else if (c.band !== undefined) {
    vars["--c-band"] = c.band;
    vars["--c-on-band"] = c.onBand ?? c.onPrimary;
  }
  const scheme = luminanceLight(c.background) ? "light" : "dark";
  return `:root{color-scheme:${scheme};${Object.entries(vars)
    .map(([k, v]) => `${k}:${v}`)
    .join(";")}}`;
}

const svgUrl = (svg: string) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

/**
 * The motif's repeating pieces as SVG images coloured with the site's tokens, so the shared stylesheet
 * draws them without a colour of its own (dividers between sections, list bullets, section marks).
 */
export function motifVars(motif: Motif, c: Colors): Record<string, string> {
  const band = c.band ?? c.primary;
  switch (motif) {
    case "plate":
      return {
        // Tyre tread: dark chevrons on the band colour.
        "--motif-divider": svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="28"><rect width="40" height="28" fill="${band}"/><path d="M0 0h10l10 14 10-14h10v6L26 28H14L0 6z" fill="${c.inverse}"/></svg>`),
        "--motif-divider-h": "28px",
        "--motif-divider-w": "40px",
        // A Slovenian plate's own colours (fixed by the plate, not by the brand): white, black, the EU blue.
        "--plate-ground": "#ffffff",
        "--plate-ink": "#111111",
        "--plate-eu": "#0b3fa8",
      };
    case "pipes":
      return {
        // Hot and cold pipe side by side with a flange every 220 px.
        "--motif-divider": svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="220" height="44"><rect y="5" width="220" height="14" fill="${c.primary}"/><rect y="25" width="220" height="14" fill="${band}"/><rect x="96" width="12" height="44" rx="3" fill="${c.text}"/></svg>`),
        "--motif-divider-h": "44px",
        "--motif-divider-w": "220px",
        // T-joints as list bullets, hot and cold.
        "--motif-bullet": svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="56" height="40" viewBox="0 0 56 40"><path d="M5 12h46M28 12v24" stroke="${c.primary}" stroke-width="10" stroke-linecap="round" fill="none"/></svg>`),
        "--motif-bullet-2": svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="56" height="40" viewBox="0 0 56 40"><path d="M5 12h46M28 12v24" stroke="${band}" stroke-width="10" stroke-linecap="round" fill="none"/></svg>`),
        "--motif-brand": svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="34" height="14"><circle cx="7" cy="7" r="6" fill="${c.primary}"/><circle cx="22" cy="7" r="6" fill="${band}"/></svg>`),
      };
    case "crust":
      return {
        // The loaf's three scoring cuts, above section headings.
        "--motif-mark": svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="74" height="40" viewBox="0 0 74 40"><path d="M6 6l14 28M30 6l14 28M54 6l14 28" stroke="${c.accent}" stroke-width="7" stroke-linecap="round" fill="none"/></svg>`),
        "--motif-mark-inverse": svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="74" height="40" viewBox="0 0 74 40"><path d="M6 6l14 28M30 6l14 28M54 6l14 28" stroke="${band}" stroke-width="7" stroke-linecap="round" fill="none"/></svg>`),
      };
    case "ledger":
      return {
        // A check mark per receipt line, in the primary (ledger) colour.
        "--motif-check": svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="16" viewBox="0 0 20 16"><path d="M2 8.5l5.5 5L18 2.5" stroke="${c.primary}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`),
        // The receipt's torn edge: teeth in the paper's colour (the page colour).
        "--motif-tear": svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="14"><path d="M0 0h20L10 14z" fill="${c.background}"/></svg>`),
        "--motif-tear-h": "14px",
        "--motif-tear-w": "20px",
        // Red ink for the double rule under the name, as a book-keeper closes a total (fixed by the motif, like the plate's blue).
        "--motif-ink": "#c2362b",
      };
    case "label":
      // An olive branch: leaves in the label's frame colour (inverse), two olives in the primary colour.
      return {
        "--motif-branch": svgUrl(
          `<svg xmlns="http://www.w3.org/2000/svg" width="132" height="58" viewBox="0 0 132 58"><path d="M4 44C36 40 82 30 128 8" stroke="${c.inverse}" stroke-width="3" stroke-linecap="round" fill="none"/>${[
            [30, 30, 15, 5.5, -38],
            [40, 50, 15, 5.5, 22],
            [62, 22, 15, 5.5, -42],
            [74, 42, 15, 5.5, 18],
            [96, 10, 14, 5, -44],
            [106, 30, 14, 5, 14],
          ]
            .map(([cx, cy, rx, ry, a]) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" transform="rotate(${a} ${cx} ${cy})" fill="${c.inverse}"/>`)
            .join("")}<circle cx="52" cy="40" r="7" fill="${c.primary}"/><circle cx="88" cy="28" r="6" fill="${c.primary}"/></svg>`,
        ),
      };
  }
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
