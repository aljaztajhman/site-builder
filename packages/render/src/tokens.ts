import { DIRECTIONS, fontPair, type Colors, type Design, type FontFace, type Motif, type SubMotif } from "@sb/spec";

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

/**
 * Per-site CSS custom properties. Deterministic output for identical input. `sub`: the sub-trade motif drawn on the
 * template's layout (spec siteMotif); its pieces replace the template motif's.
 */
export function tokensCss(design: Design, sub?: SubMotif): string {
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
    if (sub) Object.assign(vars, subMotifVars(sub, c));
  } else if (c.band !== undefined) {
    vars["--c-band"] = c.band;
    vars["--c-on-band"] = c.onBand ?? c.onPrimary;
  }
  const scheme = luminanceLight(c.background) ? "light" : "dark";
  return `:root{color-scheme:${scheme};${Object.entries(vars)
    .map(([k, v]) => `${k}:${v}`)
    .join(";")}}`;
}

/** The red of the Slovenian trail blaze (Knafelčeva markacija). */
const TRAIL_RED = "#c8202a";
/** The mountain ridge, 1440 × 90, drawn up from the bottom edge. */
export const RIDGE_PATH = "M0 90V58l70-22 46 14 88-46 62 38 54-18 96 44 82-52 60 26 110-40 74 36 66-20 92 46 84-58 70 34 58-16 100 40 90-48 78 30 60-12v84z";

/** `fg` at `share` over `bg`, as hex. */
export function mix(fg: string, bg: string, share: number): string {
  const ch = (hex: string, i: number) => parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16);
  return `#${[0, 1, 2]
    .map((i) => Math.round(ch(fg, i) * share + ch(bg, i) * (1 - share)).toString(16).padStart(2, "0"))
    .join("")}`;
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
    case "mirror":
      // The frames, branch, arches and wordmark take the site's tokens directly in the shared stylesheet.
      return {};
    case "smile": {
      // A smile arc in the accent colour: the brand mark, the line under the round hero photo, the list bullets.
      const arc = (w: number, h: number, d: string, sw: number) =>
        svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><path d="${d}" stroke="${c.accent}" stroke-width="${sw}" stroke-linecap="round" fill="none"/></svg>`);
      return {
        "--motif-brand": arc(40, 24, "M4 5c5 18 27 18 32 0", 6),
        "--motif-arc": arc(600, 150, "M40 20c110 150 410 150 520 0", 22),
        "--motif-bullet": arc(24, 14, "M3 3c4 10 14 10 18 0", 4.5),
      };
    }
    case "trail": {
      // The Slovenian trail blaze (a red ring, a white centre) is fixed by the marking, like the plate's colours;
      // on a sign the ring turns white around a red centre.
      const blaze = (ring: string, centre: string) =>
        svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26"><circle cx="13" cy="13" r="9" fill="${centre}" stroke="${ring}" stroke-width="8"/></svg>`);
      return {
        "--motif-brand": blaze(TRAIL_RED, "#ffffff"),
        "--motif-bullet": blaze(TRAIL_RED, "#ffffff"),
        "--motif-blaze-sign": blaze("#ffffff", TRAIL_RED),
        // The mountain ridge as a mask: the section that carries it paints it in its own ground colour.
        "--motif-ridge": svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 90" preserveAspectRatio="none"><path d="${RIDGE_PATH}"/></svg>`),
        // The signpost's wood, fixed by the material.
        "--motif-wood": "#5b3d24",
        // A trail sign: an arrow pointing right, the point 1.625 rem deep.
        "--shape-sign": "polygon(0 0, calc(100% - 1.625rem) 0, 100% 50%, calc(100% - 1.625rem) 100%, 0 100%)",
      };
    }
    case "bend":
      return {
        // The limb behind the hero: the primary colour at 20 % on the page.
        "--motif-limb": mix(c.primary, c.background, 0.2),
        // One cut corner (bottom right) on photos, tiles and price cards; the cut's size is set per piece (--fold).
        "--shape-fold": "polygon(0 0, 100% 0, 100% calc(100% - var(--fold, 4rem)), calc(100% - var(--fold, 4rem)) 100%, 0 100%)",
      };
    case "spoon":
      return {
        // A brass spoon (the inn's name): the brand mark and the divider between the offers, in the band colour.
        "--motif-brand": svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="22" height="104" viewBox="0 0 22 104"><ellipse cx="11" cy="19" rx="10.5" ry="18" fill="${band}"/><path d="M8.5 34h5l1.5 62a4 4 0 0 1-8 0z" fill="${band}"/></svg>`),
      };
  }
}

/**
 * A sub-trade motif's repeating pieces (variety engine Step 3), in the same tokens as its template motif's, so the
 * template's layout rules draw them: the brand mark, the divider where the ground changes and the list bullets.
 */
export function subMotifVars(sub: SubMotif, c: Colors): Record<string, string> {
  const band = c.band ?? c.primary;
  const svg = (w: number, h: number, body: string) => svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`);
  switch (sub) {
    case "wire": {
      // A wire run along a wall: a right-angle bend ending in a terminal ring.
      const bullet = (ink: string) => svg(56, 40, `<path d="M4 9h22v22h18" stroke="${ink}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" fill="none"/><circle cx="48" cy="31" r="5" fill="none" stroke="${ink}" stroke-width="4"/>`);
      return {
        "--motif-brand": svg(34, 14, `<path d="M2 4h18M2 10h18" stroke="${c.primary}" stroke-width="3" stroke-linecap="round"/><rect x="20" y="1" width="12" height="12" rx="2" fill="${band}"/>`),
        // A cable of three conductors with a clamp every 220 px.
        "--motif-divider": svg(220, 44, `<path d="M0 11h220" stroke="${c.primary}" stroke-width="6"/><path d="M0 22h220" stroke="${band}" stroke-width="6"/><path d="M0 33h220" stroke="${c.text}" stroke-width="6"/><rect x="98" y="2" width="16" height="40" rx="3" fill="${c.text}"/><rect x="102" y="6" width="8" height="32" rx="1" fill="${c.background}"/>`),
        "--motif-divider-h": "44px",
        "--motif-divider-w": "220px",
        "--motif-bullet": bullet(c.primary),
        "--motif-bullet-2": bullet(band),
      };
    }
    case "joint": {
      // Dovetails: a tail on the end of its board.
      const tail = (ink: string) => svg(56, 40, `<path d="M4 30h48v8H4z" fill="${ink}"/><path d="M20 31L10 4h36l-10 27z" fill="${ink}"/>`);
      return {
        "--motif-brand": svg(34, 14, `<path d="M3 13L1 1h12l-2 12z" fill="${c.primary}"/><path d="M19 13l-2-12h12l-2 12z" fill="${band}"/>`),
        // Two boards meeting along the divider: the band board above, the primary board's tails reaching into it.
        "--motif-divider": svg(48, 32, `<rect width="48" height="32" fill="${band}"/><path d="M0 18h14l-6-16h28l-6 16h18v14H0z" fill="${c.primary}"/>`),
        "--motif-divider-h": "32px",
        "--motif-divider-w": "48px",
        "--motif-bullet": tail(c.primary),
        "--motif-bullet-2": tail(band),
      };
    }
    case "tiles": {
      // Courses of round-ended roof tiles, the lower course offset by half a tile; gables as bullets.
      const row = (y: number, x0: number, ink: string) =>
        [0, 1, 2].map((i) => `<path d="M${x0 + i * 24} ${y}h24v10a12 9 0 0 1-24 0z" fill="${ink}" stroke="${c.background}" stroke-width="2"/>`).join("");
      const gable = (ink: string) => svg(56, 40, `<path d="M6 32L28 9l22 23" stroke="${ink}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`);
      return {
        "--motif-brand": svg(34, 14, `<path d="M3 12L17 2l14 10" stroke="${c.primary}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`),
        "--motif-divider": svg(48, 38, `${row(0, 0, band)}${row(14, -12, c.primary)}`),
        "--motif-divider-h": "38px",
        "--motif-divider-w": "48px",
        "--motif-bullet": gable(c.primary),
        "--motif-bullet-2": gable(band),
      };
    }
    case "strip": {
      // A painter's colour strip: chips in the site's own colours; a roller as the bullet.
      const chips = [...new Set([c.primary, band, c.accent, c.inverse, c.muted])];
      const roller = (ink: string) => svg(56, 40, `<rect x="4" y="4" width="34" height="15" rx="3" fill="${ink}"/><path d="M38 11h8v13H23v12" stroke="${c.text}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`);
      return {
        "--motif-brand": svg(34, 14, chips.slice(0, 3).map((ink, i) => `<rect x="${i * 12}" y="2" width="10" height="10" rx="1.5" fill="${ink}"/>`).join("")),
        "--motif-divider": svg(chips.length * 40, 28, chips.map((ink, i) => `<rect x="${i * 40}" width="36" height="28" fill="${ink}"/>`).join("")),
        "--motif-divider-h": "28px",
        "--motif-divider-w": `${chips.length * 40}px`,
        "--motif-bullet": roller(c.primary),
        "--motif-bullet-2": roller(band),
      };
    }
    case "stem":
      // A tulip on its stem as the brand mark's shape (a mask: the header paints it in its own text colour, whatever
      // its tone). The label cards and price labels draw the stem inline.
      return { "--motif-brand": svg(40, 16, `<path d="M2 12C12 12 20 10 28 8" stroke="${c.text}" stroke-width="2" stroke-linecap="round" fill="none"/><ellipse cx="14" cy="8" rx="6" ry="2.4" transform="rotate(-24 14 8)" fill="${c.text}"/><path d="M28 8c0-5 3-7 5-7s5 2 5 7c0 3-2 5-5 5s-5-2-5-5z" fill="${c.text}"/>`) };
    case "tag":
      // A hang tag on its string as the brand mark's shape (a mask, as the stem's).
      return { "--motif-brand": svg(40, 16, `<path d="M2 8c6-6 10 6 16 0" stroke="${c.text}" stroke-width="1.6" fill="none"/><path fill-rule="evenodd" d="M18 3h18v10H18l-4-5zM19.5 6.4a1.6 1.6 0 1 0 0 3.2a1.6 1.6 0 1 0 0-3.2z" fill="${c.text}"/>`) };
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
