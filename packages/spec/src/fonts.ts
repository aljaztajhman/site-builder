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
  ebGaramond: face("EB Garamond", "eb-garamond", "serif", [400, 800]),
  karla: face("Karla", "karla", "sans-serif", [200, 800]),
  archivo: face("Archivo", "archivo", "sans-serif", [100, 900]),
  manrope: face("Manrope", "manrope", "sans-serif", [200, 800]),
  publicSans: face("Public Sans", "public-sans", "sans-serif", [100, 900]),
  bitter: face("Bitter", "bitter", "serif", [100, 900]),
  nunitoSans: face("Nunito Sans", "nunito-sans", "sans-serif", [200, 1000]),
  // Headings only (editorial: 400–500); cut to 300–700 to keep the file under the 60 KB per-family budget.
  newsreader: face("Newsreader", "newsreader", "serif", [300, 700]),
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
  { id: "garamond-karla", label: "EB Garamond / Karla", heading: FONTS.ebGaramond, body: FONTS.karla },
  { id: "archivo-archivo", label: "Archivo / Archivo", heading: FONTS.archivo, body: FONTS.archivo },
  { id: "manrope-public-sans", label: "Manrope / Public Sans", heading: FONTS.manrope, body: FONTS.publicSans },
  { id: "bitter-nunito-sans", label: "Bitter / Nunito Sans", heading: FONTS.bitter, body: FONTS.nunitoSans },
  { id: "newsreader-libre-franklin", label: "Newsreader / Libre Franklin", heading: FONTS.newsreader, body: FONTS.libreFranklin },
  { id: "bricolage-figtree", label: "Bricolage Grotesque / Figtree", heading: FONTS.bricolage, body: FONTS.figtree },
  { id: "space-grotesk-plex", label: "Space Grotesk / IBM Plex Sans", heading: FONTS.spaceGrotesk, body: FONTS.ibmPlexSans },
  { id: "lora-dm-sans", label: "Lora / DM Sans", heading: FONTS.lora, body: FONTS.dmSans },
  // Trade templates (docs/design/templates): M Tablica, S Cevi, J Skorja.
  { id: "archivo-public-sans", label: "Archivo / Public Sans", heading: FONTS.archivo, body: FONTS.publicSans },
  { id: "space-grotesk-public-sans", label: "Space Grotesk / Public Sans", heading: FONTS.spaceGrotesk, body: FONTS.publicSans },
  { id: "bitter-karla", label: "Bitter / Karla", heading: FONTS.bitter, body: FONTS.karla },
  // R Račun, T Etiketa.
  { id: "ibm-plex-sans", label: "IBM Plex Sans", heading: FONTS.ibmPlexSans, body: FONTS.ibmPlexSans },
  { id: "lora-karla", label: "Lora / Karla", heading: FONTS.lora, body: FONTS.karla },
  // K Jedilnik, L Ogledalo.
  { id: "garamond-figtree", label: "EB Garamond / Figtree", heading: FONTS.ebGaramond, body: FONTS.figtree },
  { id: "inter-tight-dm-sans", label: "Inter Tight / DM Sans", heading: FONTS.interTight, body: FONTS.dmSans },
  // O Nasmeh.
  { id: "figtree-figtree", label: "Figtree", heading: FONTS.figtree, body: FONTS.figtree },
  // N Markacija, P Pregib.
  { id: "fraunces-nunito-sans", label: "Fraunces / Nunito Sans", heading: FONTS.fraunces, body: FONTS.nunitoSans },
  { id: "bricolage-public-sans", label: "Bricolage Grotesque / Public Sans", heading: FONTS.bricolage, body: FONTS.publicSans },
];

export function fontPair(id: string): FontPair {
  const p = FONT_PAIRS.find((f) => f.id === id);
  if (!p) throw new Error(`Unknown font pair: ${id}`);
  return p;
}

export function allFontFaces(): FontFace[] {
  return Object.values(FONTS);
}

// -------------------------------------------------------------------------------------------------
// Type inventory (design studio I1, docs/plans/design-studio.md §4.1)

/**
 * A family in the design inventory. Not used by any direction yet, so it is kept out of FONTS: allFontFaces, the shared
 * bundle and every existing site stay byte-identical. Built by `pnpm fonts:inventory` from the upright file in the
 * google/fonts repository at GOOGLE_FONTS_COMMIT, subset like FONTS (Latin + Latin Extended-A), one woff2 per family.
 */
export interface InventoryFontFace extends Omit<FontFace, "fallback"> {
  /** Path of the upright source file under ofl/ in google/fonts; its OFL.txt sits next to it. */
  source: string;
  fallback: FontFace["fallback"] | "monospace";
  /** display: headings with character; text: reading at 16 px; utility: figures for prices and hours (tabular). */
  role: "display" | "text" | "utility";
  /** Axes other than wght, pinned to these values (otherwise to the axis default). */
  pin?: Record<string, number>;
  /** What the family brings, in a few words. */
  note: string;
}

/** The google/fonts commit the inventory files are built from. */
export const GOOGLE_FONTS_COMMIT = "bd8f81ddb5c74d5c8897b36ad88b440266245103";

function inv(
  family: string,
  file: string,
  source: string,
  fallback: InventoryFontFace["fallback"],
  weights: [number, number],
  role: InventoryFontFace["role"],
  note: string,
  pin?: Record<string, number>,
): InventoryFontFace {
  return { family, file, source, fallback, weights, role, note, ...(pin ? { pin } : {}) };
}

export const INVENTORY_FONTS = {
  // Slab and Clarendon
  aleo: inv("Aleo", "aleo", "aleo/Aleo[wght].ttf", "serif", [100, 900], "display", "soft slab, warm"),
  rokkitt: inv("Rokkitt", "rokkitt", "rokkitt/Rokkitt[wght].ttf", "serif", [100, 900], "display", "narrow geometric slab, signage"),
  besley: inv("Besley", "besley", "besley/Besley[wght].ttf", "serif", [400, 900], "display", "Clarendon, print and posters"),
  // Condensed grotesques
  oswald: inv("Oswald", "oswald", "oswald/Oswald[wght].ttf", "sans-serif", [200, 700], "display", "condensed gothic"),
  bigShoulders: inv("Big Shoulders", "big-shoulders", "bigshoulders/BigShoulders[opsz,wght].ttf", "sans-serif", [100, 900], "display", "very condensed signage gothic", { opsz: 72 }),
  sofiaSansCondensed: inv("Sofia Sans Condensed", "sofia-sans-condensed", "sofiasanscondensed/SofiaSansCondensed[wght].ttf", "sans-serif", [100, 900], "display", "condensed grotesque"),
  // Wide grotesques
  unbounded: inv("Unbounded", "unbounded", "unbounded/Unbounded[wght].ttf", "sans-serif", [200, 900], "display", "wide, rounded corners, loud"),
  syne: inv("Syne", "syne", "syne/Syne[wght].ttf", "sans-serif", [400, 800], "display", "widens with weight, art-school"),
  kronaOne: inv("Krona One", "krona-one", "kronaone/KronaOne-Regular.ttf", "sans-serif", [400, 400], "display", "wide grotesque, signage (one weight)"),
  // Didone and modern serifs
  bodoniModa: inv("Bodoni Moda", "bodoni-moda", "bodonimoda/BodoniModa[opsz,wght].ttf", "serif", [400, 900], "display", "didone (text optical size: hairlines hold on phones)"),
  dmSerifDisplay: inv("DM Serif Display", "dm-serif-display", "dmserifdisplay/DMSerifDisplay-Regular.ttf", "serif", [400, 400], "display", "high-contrast display serif (one weight)"),
  // Old-style display
  cormorant: inv("Cormorant", "cormorant", "cormorant/Cormorant[wght].ttf", "serif", [300, 700], "display", "Garamond display, quiet"),
  youngSerif: inv("Young Serif", "young-serif", "youngserif/YoungSerif-Regular.ttf", "serif", [400, 400], "display", "heavy warm old-style (one weight)"),
  // Geometric
  jost: inv("Jost", "jost", "jost/Jost[wght].ttf", "sans-serif", [100, 900], "display", "Futura-like geometric"),
  leagueSpartan: inv("League Spartan", "league-spartan", "leaguespartan/LeagueSpartan[wght].ttf", "sans-serif", [100, 900], "display", "bold geometric"),
  // Signage, stencil, grotesques with character
  overpass: inv("Overpass", "overpass", "overpass/Overpass[wght].ttf", "sans-serif", [100, 900], "display", "highway-sign gothic"),
  bigShouldersStencil: inv("Big Shoulders Stencil", "big-shoulders-stencil", "bigshouldersstencil/BigShouldersStencil[opsz,wght].ttf", "sans-serif", [100, 900], "display", "condensed stencil", { opsz: 72 }),
  chivo: inv("Chivo", "chivo", "chivo/Chivo[wght].ttf", "sans-serif", [100, 900], "display", "grotesque, heavy weights for posters"),
  epilogue: inv("Epilogue", "epilogue", "epilogue/Epilogue[wght].ttf", "sans-serif", [100, 900], "display", "grotesque with a sharp black"),
  // Typewriter (docket stances: fact objects such as dockets and receipts, never labels or eyebrows)
  courierPrime: inv("Courier Prime", "courier-prime", "courierprime/CourierPrime-Regular.ttf", "monospace", [400, 400], "utility", "typewriter (one weight)"),
  sometypeMono: inv("Sometype Mono", "sometype-mono", "sometypemono/SometypeMono[wght].ttf", "monospace", [400, 700], "utility", "typewriter-like mono"),
  // Central European heritage
  brygada1918: inv("Brygada 1918", "brygada-1918", "brygada1918/Brygada1918[wght].ttf", "serif", [400, 700], "text", "Polish 1918 serif revival"),
  poltawskiNowy: inv("Poltawski Nowy", "poltawski-nowy", "poltawskinowy/PoltawskiNowy[wght].ttf", "serif", [400, 700], "display", "Polish 1920s antiqua (Półtawski)"),
  yrsa: inv("Yrsa", "yrsa", "yrsa/Yrsa[wght].ttf", "serif", [300, 700], "text", "text serif from Rosetta (Brno)"),
  signika: inv("Signika", "signika", "signika/Signika[GRAD,wght].ttf", "sans-serif", [300, 700], "text", "wayfinding sans (Polish designer)"),
  // Text serifs
  sourceSerif4: inv("Source Serif 4", "source-serif-4", "sourceserif4/SourceSerif4[opsz,wght].ttf", "serif", [200, 900], "text", "transitional text serif"),
  literata: inv("Literata", "literata", "literata/Literata[opsz,wght].ttf", "serif", [200, 900], "text", "book serif for screens"),
  crimsonPro: inv("Crimson Pro", "crimson-pro", "crimsonpro/CrimsonPro[wght].ttf", "serif", [200, 900], "text", "Garamond-like text serif"),
  alegreya: inv("Alegreya", "alegreya", "alegreya/Alegreya[wght].ttf", "serif", [400, 900], "text", "calligraphic humanist serif"),
  vollkorn: inv("Vollkorn", "vollkorn", "vollkorn/Vollkorn[wght].ttf", "serif", [400, 900], "text", "dark, warm text serif"),
  libreCaslonText: inv("Libre Caslon Text", "libre-caslon-text", "librecaslontext/LibreCaslonText[wght].ttf", "serif", [400, 700], "text", "Caslon for screens"),
  // Text sans
  atkinsonNext: inv("Atkinson Hyperlegible Next", "atkinson-hyperlegible-next", "atkinsonhyperlegiblenext/AtkinsonHyperlegibleNext[wght].ttf", "sans-serif", [200, 800], "text", "legibility-first grotesque"),
  workSans: inv("Work Sans", "work-sans", "worksans/WorkSans[wght].ttf", "sans-serif", [100, 900], "text", "early-grotesque text sans"),
  schibstedGrotesk: inv("Schibsted Grotesk", "schibsted-grotesk", "schibstedgrotesk/SchibstedGrotesk[wght].ttf", "sans-serif", [400, 900], "text", "newspaper grotesque"),
  instrumentSans: inv("Instrument Sans", "instrument-sans", "instrumentsans/InstrumentSans[wdth,wght].ttf", "sans-serif", [400, 700], "text", "contemporary grotesque"),
  albertSans: inv("Albert Sans", "albert-sans", "albertsans/AlbertSans[wght].ttf", "sans-serif", [100, 900], "text", "Scandinavian geometric grotesque"),
  // Utility: tabular figures for prices and hours
  ibmPlexMono: inv("IBM Plex Mono", "ibm-plex-mono", "ibmplexmono/IBMPlexMono-Regular.ttf", "monospace", [400, 400], "utility", "mono for figures (one weight)"),
  redHatMono: inv("Red Hat Mono", "red-hat-mono", "redhatmono/RedHatMono[wght].ttf", "monospace", [300, 700], "utility", "mono for figures"),
} satisfies Record<string, InventoryFontFace>;

export function inventoryFontFaces(): InventoryFontFace[] {
  return Object.values(INVENTORY_FONTS);
}

type AnyFace = FontFace | InventoryFontFace;

/**
 * A pairing in the design inventory: a display face for headings, a text face for reading and, optionally, a utility
 * face for figures (prices, hours). Faces come from INVENTORY_FONTS or FONTS. Not in FONT_PAIRS: no direction offers it
 * yet, and the editor's font menu is unchanged.
 */
export interface InventoryFontPair {
  id: string;
  label: string;
  heading: AnyFace;
  body: AnyFace;
  utility?: AnyFace;
}

function ipair(heading: AnyFace, body: AnyFace, utility?: AnyFace): InventoryFontPair {
  const files = [heading.file, ...(body.file === heading.file ? [] : [body.file]), ...(utility ? [utility.file] : [])];
  const families = [heading.family, ...(body.family === heading.family ? [] : [body.family]), ...(utility ? [utility.family] : [])];
  return { id: files.join("--"), label: families.join(" / "), heading, body, ...(utility ? { utility } : {}) };
}

const I = INVENTORY_FONTS;
const F = FONTS;

export const INVENTORY_FONT_PAIRS: InventoryFontPair[] = [
  ipair(I.besley, I.workSans, I.courierPrime),
  ipair(I.rokkitt, F.karla, I.courierPrime),
  ipair(I.chivo, F.ibmPlexSans, I.ibmPlexMono),
  ipair(I.schibstedGrotesk, I.sourceSerif4),
  ipair(I.chivo, I.sourceSerif4),
  ipair(I.poltawskiNowy, I.schibstedGrotesk),
  ipair(I.libreCaslonText, I.libreCaslonText),
  ipair(I.literata, F.libreFranklin),
  ipair(I.sofiaSansCondensed, I.atkinsonNext, I.redHatMono),
  ipair(I.youngSerif, I.alegreya),
  ipair(I.vollkorn, I.workSans),
  ipair(I.schibstedGrotesk, I.schibstedGrotesk, I.sometypeMono),
  ipair(I.overpass, I.albertSans, I.redHatMono),
  ipair(I.besley, I.literata),
  ipair(I.workSans, I.literata, I.ibmPlexMono),
  ipair(I.crimsonPro, I.workSans),
  ipair(I.bigShoulders, I.atkinsonNext),
  ipair(I.bigShoulders, F.publicSans),
  ipair(I.bigShoulders, I.literata),
  ipair(I.oswald, F.sourceSans3),
  ipair(I.oswald, I.crimsonPro),
  ipair(I.overpass, I.overpass),
  ipair(I.signika, I.signika),
  ipair(I.kronaOne, I.workSans),
  ipair(I.kronaOne, F.karla),
  ipair(I.leagueSpartan, F.libreFranklin),
  ipair(I.rokkitt, I.signika),
  ipair(I.bigShouldersStencil, F.ibmPlexSans, I.ibmPlexMono),
  ipair(I.bigShouldersStencil, I.workSans),
  ipair(I.sofiaSansCondensed, F.publicSans),
  ipair(I.besley, F.publicSans),
  ipair(I.chivo, I.atkinsonNext, I.redHatMono),
  ipair(I.youngSerif, I.workSans),
  ipair(I.youngSerif, F.dmSans),
  ipair(I.aleo, F.karla),
  ipair(I.aleo, F.nunitoSans),
  ipair(I.aleo, I.aleo),
  ipair(I.aleo, I.signika),
  ipair(I.vollkorn, I.vollkorn),
  ipair(I.vollkorn, F.karla),
  ipair(I.alegreya, I.albertSans),
  ipair(I.alegreya, I.alegreya),
  ipair(I.poltawskiNowy, I.atkinsonNext),
  ipair(F.fraunces, I.atkinsonNext),
  ipair(F.fraunces, I.workSans),
  ipair(F.fraunces, I.albertSans),
  ipair(I.bigShouldersStencil, F.karla),
  ipair(F.bitter, I.atkinsonNext),
  ipair(I.jost, I.jost),
  ipair(I.jost, I.literata),
  ipair(I.jost, F.newsreader),
  ipair(I.leagueSpartan, I.sourceSerif4),
  ipair(F.archivo, I.sourceSerif4),
  ipair(F.archivo, I.literata),
  ipair(I.sofiaSansCondensed, I.instrumentSans),
  ipair(I.kronaOne, F.sourceSans3),
  ipair(I.brygada1918, I.brygada1918),
  ipair(I.brygada1918, I.albertSans),
  ipair(I.brygada1918, F.libreFranklin),
  ipair(I.albertSans, I.sourceSerif4),
  ipair(I.epilogue, I.sourceSerif4),
  ipair(I.cormorant, I.albertSans),
  ipair(I.cormorant, F.karla),
  ipair(I.cormorant, I.atkinsonNext),
  ipair(I.alegreya, I.signika),
  ipair(I.yrsa, I.atkinsonNext),
  ipair(I.yrsa, I.workSans),
  ipair(I.besley, I.albertSans),
  ipair(I.rokkitt, I.albertSans),
  ipair(I.crimsonPro, I.crimsonPro),
  ipair(F.lora, I.albertSans),
  ipair(F.ebGaramond, I.albertSans),
  ipair(I.unbounded, I.instrumentSans),
  ipair(I.unbounded, I.workSans),
  ipair(I.syne, I.instrumentSans),
  ipair(I.syne, I.literata),
  ipair(I.bodoniModa, I.workSans),
  ipair(I.bodoniModa, I.instrumentSans),
  ipair(I.bodoniModa, I.literata),
  ipair(I.dmSerifDisplay, I.instrumentSans),
  ipair(I.dmSerifDisplay, I.atkinsonNext),
  ipair(I.epilogue, I.literata),
  ipair(I.epilogue, I.epilogue),
  ipair(I.chivo, I.chivo),
  ipair(I.atkinsonNext, I.atkinsonNext),
  ipair(I.instrumentSans, I.sourceSerif4),
  ipair(F.newsreader, I.instrumentSans),
  ipair(F.bricolage, I.literata),
];
