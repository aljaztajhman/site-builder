/**
 * Font pairs. Files are self-hosted, subset to Latin + Latin Extended-A plus typographic punctuation
 * (see packages/render/scripts/build-fonts.ts). `family` is the @font-face name render emits.
 */
export interface FontFace {
  family: string;
  /** @fontsource-variable package that provides the source file. */
  source: string;
  /** File stem under _shared/fonts/, e.g. "inter" -> inter.woff2 */
  file: string;
  fallback: "sans-serif" | "serif";
  /** Variable weight axis range. */
  weights: [number, number];
}

export interface FontPair {
  id: string;
  label: string;
  heading: FontFace;
  body: FontFace;
}

function face(family: string, pkg: string, fallback: FontFace["fallback"], weights: [number, number]): FontFace {
  return { family, source: `@fontsource-variable/${pkg}`, file: pkg, fallback, weights };
}

export const FONTS = {
  interTight: face("Inter Tight", "inter-tight", "sans-serif", [100, 900]),
  inter: face("Inter", "inter", "sans-serif", [100, 900]),
  fraunces: face("Fraunces", "fraunces", "serif", [100, 900]),
  sourceSans3: face("Source Sans 3", "source-sans-3", "sans-serif", [200, 900]),
  cormorant: face("Cormorant Garamond", "cormorant-garamond", "serif", [300, 700]),
  karla: face("Karla", "karla", "sans-serif", [200, 800]),
  archivo: face("Archivo", "archivo", "sans-serif", [100, 900]),
  manrope: face("Manrope", "manrope", "sans-serif", [200, 800]),
  publicSans: face("Public Sans", "public-sans", "sans-serif", [100, 900]),
  bitter: face("Bitter", "bitter", "serif", [100, 900]),
  nunitoSans: face("Nunito Sans", "nunito-sans", "sans-serif", [200, 1000]),
  newsreader: face("Newsreader", "newsreader", "serif", [200, 800]),
  libreFranklin: face("Libre Franklin", "libre-franklin", "sans-serif", [100, 900]),
  bricolage: face("Bricolage Grotesque", "bricolage-grotesque", "sans-serif", [200, 800]),
  figtree: face("Figtree", "figtree", "sans-serif", [300, 900]),
  spaceGrotesk: face("Space Grotesk", "space-grotesk", "sans-serif", [300, 700]),
  ibmPlexSans: face("IBM Plex Sans", "ibm-plex-sans", "sans-serif", [100, 700]),
  lora: face("Lora", "lora", "serif", [400, 700]),
  dmSans: face("DM Sans", "dm-sans", "sans-serif", [100, 1000]),
} satisfies Record<string, FontFace>;

export const FONT_PAIRS: FontPair[] = [
  { id: "inter-tight-inter", label: "Inter Tight / Inter", heading: FONTS.interTight, body: FONTS.inter },
  { id: "fraunces-source-sans", label: "Fraunces / Source Sans 3", heading: FONTS.fraunces, body: FONTS.sourceSans3 },
  { id: "cormorant-karla", label: "Cormorant Garamond / Karla", heading: FONTS.cormorant, body: FONTS.karla },
  { id: "archivo-archivo", label: "Archivo / Archivo", heading: FONTS.archivo, body: FONTS.archivo },
  { id: "manrope-public-sans", label: "Manrope / Public Sans", heading: FONTS.manrope, body: FONTS.publicSans },
  { id: "bitter-nunito-sans", label: "Bitter / Nunito Sans", heading: FONTS.bitter, body: FONTS.nunitoSans },
  { id: "newsreader-libre-franklin", label: "Newsreader / Libre Franklin", heading: FONTS.newsreader, body: FONTS.libreFranklin },
  { id: "bricolage-figtree", label: "Bricolage Grotesque / Figtree", heading: FONTS.bricolage, body: FONTS.figtree },
  { id: "space-grotesk-plex", label: "Space Grotesk / IBM Plex Sans", heading: FONTS.spaceGrotesk, body: FONTS.ibmPlexSans },
  { id: "lora-dm-sans", label: "Lora / DM Sans", heading: FONTS.lora, body: FONTS.dmSans },
];

export function fontPair(id: string): FontPair {
  const p = FONT_PAIRS.find((f) => f.id === id);
  if (!p) throw new Error(`Unknown font pair: ${id}`);
  return p;
}

export function allFontFaces(): FontFace[] {
  return Object.values(FONTS);
}
