import { enforceDesign } from "./design-rules.ts";
import type { Colors, Design, Direction } from "./design.ts";
import { hexToHsl, hexToRgb, hslToHex } from "./color.ts";

/**
 * The landing page's trade showcase: one fictional business per trade (the eval's golden sites), shown in
 * a colourway of its own. A client's site never gets these colours: trade templates keep their own
 * palette, and the engine moves any other design off a showcase's combination (engine: awayFromShowcases).
 * Rendered by `pnpm examples:build` into apps/web/src/ui/examples/primer-<golden>/.
 */
export interface Showcase {
  /** In the landing URL, `/?primer=<id>`. */
  id: string;
  /** The golden site (tools/eval/golden/<golden>.json) and its fixture photos. */
  golden: string;
  /** The chip's label. */
  label: string;
  /** The golden's direction and font pair (tested against the golden). */
  direction: string;
  fontPair: string;
  /** "Takole bi lahko izgledala stran za …" */
  forWhom: string;
  /** Replaces the golden's colours; contrast and design rules hold as they are (tested). */
  colors: Colors;
}

export const SHOWCASES: Showcase[] = [
  {
    id: "frizer",
    golden: "frizerstvo-lana",
    direction: "ogledalo",
    fontPair: "inter-tight-dm-sans",
    label: "Frizer",
    forWhom: "frizerski salon",
    colors: { background: "#ffffff", surface: "#f0e9f6", text: "#1c0f29", muted: "#52455f", primary: "#4b2a6b", onPrimary: "#ffffff", accent: "#8f6bb3", border: "#dbd2e4", inverse: "#261636", onInverse: "#f5f2f8", band: "#4b2a6b", onBand: "#ffffff" },
  },
  {
    id: "zobozdravnik",
    golden: "zobozdravstvo-lebar",
    direction: "nasmeh",
    fontPair: "figtree-figtree",
    label: "Zobozdravnik",
    forWhom: "zobozdravstveno ordinacijo",
    colors: { background: "#ffffff", surface: "#e9ecf6", text: "#0f1429", muted: "#454a5f", primary: "#3c4fa0", onPrimary: "#ffffff", accent: "#d9604a", border: "#d2d6e4", inverse: "#161c36", onInverse: "#f2f3f8", band: "#3c4fa0", onBand: "#ffffff" },
  },
  {
    id: "avtoservis",
    golden: "avtoservis-mrak",
    direction: "bold-local",
    fontPair: "archivo-archivo",
    label: "Avtoservis",
    forWhom: "avtoservis",
    colors: { background: "#ffffff", surface: "#f2efee", text: "#29170f", muted: "#5f4c45", primary: "#c2410c", onPrimary: "#ffffff", accent: "#ea580c", border: "#dedad9", inverse: "#362016", onInverse: "#f8f4f2" },
  },
  {
    id: "gostilna",
    golden: "gostilna-zlata-zlica",
    direction: "jedilnik",
    fontPair: "garamond-figtree",
    label: "Gostilna",
    forWhom: "gostilno",
    colors: { background: "#ffffff", surface: "#f6e9ec", text: "#290f15", muted: "#5f454a", primary: "#5a1f2b", onPrimary: "#ffffff", accent: "#a8762f", border: "#e4d2d6", inverse: "#36161d", onInverse: "#f8f2f3", band: "#d9b46a", onBand: "#2a1a10" },
  },
  {
    id: "pekarna",
    golden: "pekarna-kvas",
    direction: "warm-craft",
    fontPair: "fraunces-source-sans",
    label: "Pekarna",
    forWhom: "pekarno",
    colors: { background: "#ffffff", surface: "#f2f6e9", text: "#20290f", muted: "#565f45", primary: "#4a5a2c", onPrimary: "#ffffff", accent: "#a87a2c", border: "#dee4d2", inverse: "#2b3616", onInverse: "#f4f6ef" },
  },
  {
    id: "trgovina",
    golden: "trgovina-oljka-in-sol",
    direction: "etiketa",
    fontPair: "lora-karla",
    label: "Trgovina",
    forWhom: "trgovino",
    colors: { background: "#ffffff", surface: "#e9f4f6", text: "#0f2429", muted: "#455a5f", primary: "#1f5f6e", onPrimary: "#ffffff", accent: "#b5832a", border: "#d2e1e4", inverse: "#163036", onInverse: "#f0f6f7", band: "#1f5f6e", onBand: "#ffffff" },
  },
  {
    id: "fizioterapija",
    golden: "fizioterapija-pregib",
    direction: "pregib",
    fontPair: "bricolage-public-sans",
    label: "Fizioterapija",
    forWhom: "fizioterapijo",
    colors: { background: "#ffffff", surface: "#e9eff6", text: "#0f1b29", muted: "#45505f", primary: "#1f4f8a", onPrimary: "#ffffff", accent: "#679c22", border: "#d2dae4", inverse: "#162536", onInverse: "#f2f4f8", band: "#1f4f8a", onBand: "#ffffff" },
  },
  {
    id: "racunovodstvo",
    golden: "racunovodstvo-seliskar",
    direction: "racun",
    fontPair: "ibm-plex-sans",
    label: "Računovodstvo",
    forWhom: "računovodski servis",
    colors: { background: "#ffffff", surface: "#e9f0f6", text: "#0f1c29", muted: "#45525f", primary: "#2f3a45", onPrimary: "#ffffff", accent: "#a65a2a", border: "#d2dbe4", inverse: "#162636", onInverse: "#f2f5f8", band: "#2f3a45", onBand: "#ffffff" },
  },
  {
    id: "kmetija",
    golden: "kmetija-grabnar",
    direction: "markacija",
    fontPair: "fraunces-nunito-sans",
    label: "Turistična kmetija",
    forWhom: "turistično kmetijo",
    colors: { background: "#ffffff", surface: "#e9f6ec", text: "#0f2916", muted: "#455f4b", primary: "#2e5e3a", onPrimary: "#ffffff", accent: "#a8822b", border: "#d2e4d7", inverse: "#16361e", onInverse: "#f0f7f1", band: "#2e5e3a", onBand: "#ffffff" },
  },
  {
    id: "instalater",
    golden: "instalacije-rebernik",
    direction: "industrial",
    fontPair: "space-grotesk-plex",
    label: "Inštalater",
    forWhom: "inštalaterja",
    colors: { background: "#121619", surface: "#1a2025", text: "#eef3f6", muted: "#a3b0b9", primary: "#35c4e8", onPrimary: "#0e1114", accent: "#35c4e8", border: "#2f3940", inverse: "#24303a", onInverse: "#f2f6f8" },
  },
];

export const showcaseById = (id: string): Showcase | undefined => SHOWCASES.find((s) => s.id === id);

const distance = (a: string, b: string): number => {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};

/** Colours closer than this (RGB distance) read as the same colour. */
export const SAME_COLOUR = 48;

/** The showcase a design would look like: same direction, same fonts, a primary colour hard to tell apart. */
export function showcaseLookalike(d: Design): Showcase | undefined {
  return SHOWCASES.find((s) => s.direction === d.direction && s.fontPair === d.fontPair && distance(s.colors.primary, d.colors.primary) < SAME_COLOUR);
}

/** Turned around the hue wheel; a near-grey gets enough saturation for the turn to show. */
const turn = (hex: string, deg: number): string => {
  const hsl = hexToHsl(hex);
  return hslToHex({ ...hsl, h: (hsl.h + deg + 360) % 360, s: Math.max(hsl.s, 0.45) });
};

/**
 * A client's design never equals a showcase on the landing page: one that would turns its brand colours
 * around the hue wheel until it no longer does (and stays inside its direction's rules).
 */
export function awayFromShowcases(d: Design, dir: Direction): Design {
  let out = d;
  for (let step = 1; step <= 6 && showcaseLookalike(out); step++) {
    const c = { ...d.colors, primary: turn(d.colors.primary, 35 * step), accent: turn(d.colors.accent, 35 * step) };
    out = enforceDesign({ ...d, colors: c }, dir);
  }
  return out;
}
