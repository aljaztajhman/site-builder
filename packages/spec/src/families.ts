/**
 * Template families (docs/plans/variety-engine.md, Step 1): each hand-made trade template becomes a family of
 * equally good looks instead of one page. Per template: 2–3 palettes, 2–3 font pairs that fit its character and
 * 2–3 heroes, the template's own first. Code still enforces contrast on whichever palette is used (enforceDesign),
 * and the banned list is untouched (no gradients, no off-white pages, no pure black). Used only when config
 * `variety.families` is on; validation accepts a family's font pairs either way, so a site keeps validating when the
 * switch changes.
 */
import type { Colors, Direction } from "./design.ts";
import { DIRECTIONS } from "./directions.ts";

export interface FamilyPalette {
  /** Short id, unique within the template, e.g. "signal". The first is the template's own palette. */
  id: string;
  colors: Colors;
}

export interface TemplateFamily {
  palettes: FamilyPalette[];
  /** Font pair ids (FONT_PAIRS); the first is the template's own. */
  fontPairs: string[];
  /** Hero "type:variant" choices; the first is the template's own signature hero. */
  heroes: string[];
}

const own = (dir: string): Colors => DIRECTIONS.find((d) => d.id === dir)!.palette.fallback;
/** The template's palette with some roles changed: the neutrals stay. */
const vary = (dir: string, change: Partial<Colors>): Colors => ({ ...own(dir), ...change });

export const FAMILIES: Record<string, TemplateFamily> = {
  // M Tablica: asphalt with signal yellow, or a safety orange, or a workshop blue.
  tablica: {
    palettes: [
      { id: "signal", colors: own("tablica") },
      { id: "orange", colors: vary("tablica", { band: "#ff7a1a", onBand: "#15181c", accent: "#a84d00" }) },
      // A light workshop blue: the band is also the hero's eyebrow on the dark overlay (textPairs band on inverse).
      { id: "blue", colors: vary("tablica", { band: "#3d8bfd", onBand: "#15181c", accent: "#3d8bfd", surface: "#e9eef6" }) },
    ],
    fontPairs: ["archivo-public-sans", "archivo-archivo", "space-grotesk-public-sans"],
    heroes: ["hero-signature:photo", "hero-split:image-right", "hero-type:with-facts"],
  },
  // S Cevi: hot and cold pipes, or copper and night blue, or green and amber.
  cevi: {
    palettes: [
      { id: "hot-cold", colors: own("cevi") },
      { id: "copper", colors: vary("cevi", { primary: "#a8481a", accent: "#a8481a", band: "#12395e", onBand: "#ffffff", surface: "#eef1f4" }) },
      { id: "green", colors: vary("cevi", { primary: "#1f6e47", accent: "#1f6e47", band: "#f2b705", onBand: "#101820", surface: "#e8f0eb" }) },
    ],
    fontPairs: ["space-grotesk-public-sans", "space-grotesk-plex", "manrope-public-sans"],
    heroes: ["hero-signature:drawing", "hero-type:with-facts", "hero-type:large"],
  },
  // J Skorja: roast and wheat, or rye and oat, or poppy red and honey.
  skorja: {
    palettes: [
      { id: "wheat", colors: own("skorja") },
      { id: "rye", colors: vary("skorja", { primary: "#5b3a29", accent: "#b5652a", band: "#d8c29a", onBand: "#24130a", surface: "#f1ece4" }) },
      { id: "poppy", colors: vary("skorja", { primary: "#8c2a2a", accent: "#a33a2e", band: "#ecc56a", onBand: "#24130a", surface: "#f4ece8" }) },
    ],
    fontPairs: ["bitter-karla", "fraunces-source-sans", "bitter-nunito-sans"],
    heroes: ["hero-signature:arch", "hero-split:image-right", "hero-image:overlay-bottom"],
  },
  // R Račun: ledger green, or ink blue, or plum.
  racun: {
    palettes: [
      { id: "ledger", colors: own("racun") },
      { id: "ink", colors: vary("racun", { text: "#0d1e36", muted: "#3f4f66", primary: "#1d3f73", accent: "#3d6fb0", band: "#1d3f73", onBand: "#ffffff", surface: "#e6edf6", border: "#d0dbe8", inverse: "#0d1e36", onInverse: "#eef2f8" }) },
      { id: "plum", colors: vary("racun", { text: "#2a1230", muted: "#5a4660", primary: "#5a2a5e", accent: "#8d4f92", band: "#5a2a5e", onBand: "#ffffff", surface: "#f1e6f2", border: "#e3d3e5", inverse: "#2a1230", onInverse: "#f6eff7" }) },
    ],
    fontPairs: ["ibm-plex-sans", "space-grotesk-plex", "manrope-public-sans"],
    heroes: ["hero-signature:receipt", "hero-type:with-facts", "hero-type:large"],
  },
  // T Etiketa: terracotta and olive, or sea blue and ochre, or wine and sage.
  etiketa: {
    palettes: [
      { id: "terracotta", colors: own("etiketa") },
      { id: "sea", colors: vary("etiketa", { primary: "#1f5f7a", band: "#1f5f7a", onBand: "#ffffff", accent: "#b07a22", surface: "#e2eef2", border: "#cadde4", inverse: "#12384a" }) },
      { id: "wine", colors: vary("etiketa", { primary: "#7b2d4a", band: "#7b2d4a", onBand: "#ffffff", accent: "#7f8f52", surface: "#f0e4ea", border: "#e2d0d8", inverse: "#3b1a28" }) },
    ],
    fontPairs: ["lora-karla", "garamond-karla", "newsreader-libre-franklin"],
    heroes: ["hero-signature:label", "hero-split:image-left", "hero-image:overlay-left"],
  },
  // K Jedilnik: forest and gold, or burgundy and brass, or navy and honey.
  jedilnik: {
    palettes: [
      { id: "forest", colors: own("jedilnik") },
      { id: "burgundy", colors: vary("jedilnik", { primary: "#5a1a23", inverse: "#5a1a23", band: "#d9b36c", onBand: "#2a0c10", surface: "#f4ecec", border: "#e4d6d6" }) },
      { id: "navy", colors: vary("jedilnik", { primary: "#1b2a44", inverse: "#1b2a44", band: "#e0b75a", onBand: "#101a2c", surface: "#ecf0f5", border: "#d5dce6" }) },
    ],
    fontPairs: ["garamond-figtree", "newsreader-libre-franklin", "fraunces-source-sans"],
    heroes: ["hero-signature:card", "hero-image:overlay-bottom", "hero-split:image-right"],
  },
  // L Ogledalo: wine and rose, or sage, or ink and blush.
  ogledalo: {
    palettes: [
      { id: "wine", colors: own("ogledalo") },
      { id: "sage", colors: vary("ogledalo", { text: "#17241c", muted: "#47584d", primary: "#3e5c4a", band: "#3e5c4a", accent: "#6f9a7e", surface: "#e7efe9", border: "#d3ddd6", inverse: "#17241c", onInverse: "#eef3ef" }) },
      { id: "ink", colors: vary("ogledalo", { text: "#16172a", muted: "#4a4b60", primary: "#2b2d42", band: "#2b2d42", accent: "#c4646c", surface: "#ececf2", border: "#d8d8e2", inverse: "#16172a", onInverse: "#f1f1f6" }) },
    ],
    fontPairs: ["inter-tight-dm-sans", "bricolage-figtree", "lora-dm-sans"],
    heroes: ["hero-signature:mirrors", "hero-split:image-right", "hero-type:large"],
  },
  // O Nasmeh: teal and coral, or clinic blue and apricot, or navy and coral.
  nasmeh: {
    palettes: [
      { id: "teal", colors: own("nasmeh") },
      { id: "blue", colors: vary("nasmeh", { text: "#0f2340", muted: "#44566f", primary: "#1e5aa8", band: "#1e5aa8", accent: "#d9662a", surface: "#e3edf8", border: "#cfdcec", inverse: "#0f2340", onInverse: "#eef3f9" }) },
      { id: "navy", colors: vary("nasmeh", { text: "#13213a", muted: "#47546a", primary: "#1d3557", band: "#1d3557", accent: "#d4573c", surface: "#e8edf3", border: "#d3dbe5", inverse: "#13213a", onInverse: "#eef1f6" }) },
    ],
    fontPairs: ["figtree-figtree", "manrope-public-sans", "inter-tight-inter"],
    heroes: ["hero-signature:disc", "hero-split:image-right", "hero-type:with-facts"],
  },
  // N Markacija: trail red, or alpine blue, or pine green.
  markacija: {
    palettes: [
      { id: "trail", colors: own("markacija") },
      { id: "alpine", colors: vary("markacija", { primary: "#1f5aa6", band: "#1f5aa6", surface: "#e6eef7", border: "#d0dcea", inverse: "#1b2e4a" }) },
      { id: "pine", colors: vary("markacija", { primary: "#2f6b3a", band: "#2f6b3a", accent: "#d6514a", surface: "#e6f0e2" }) },
    ],
    fontPairs: ["fraunces-nunito-sans", "bitter-nunito-sans", "newsreader-libre-franklin"],
    heroes: ["hero-signature:view", "hero-image:overlay-bottom", "hero-split:image-left"],
  },
  // P Pregib: teal and orange, or ink navy and amber, or rust and teal.
  pregib: {
    palettes: [
      { id: "teal", colors: own("pregib") },
      { id: "navy", colors: vary("pregib", { text: "#141c33", muted: "#465068", primary: "#233d6b", band: "#233d6b", accent: "#cb851f", surface: "#e8ecf4", border: "#d2d9e6", inverse: "#141c33", onInverse: "#e8ecf4" }) },
      { id: "rust", colors: vary("pregib", { text: "#2b140b", muted: "#5e463c", primary: "#a6431f", band: "#a6431f", accent: "#30928c", surface: "#e9eef0", border: "#d9dee1", inverse: "#2b140b", onInverse: "#f6e9e2" }) },
    ],
    fontPairs: ["bricolage-public-sans", "bricolage-figtree", "manrope-public-sans"],
    heroes: ["hero-signature:bend", "hero-split:image-left", "hero-type:large"],
  },
};

export function familyOf(dir: Direction): TemplateFamily | undefined {
  return dir.template ? FAMILIES[dir.id] : undefined;
}

/** The font pairs a direction accepts: its own, and its family's when it has one. */
export function acceptedFontPairs(dir: Direction): string[] {
  return [...new Set([...dir.fontPairs, ...(familyOf(dir)?.fontPairs ?? [])])];
}

/**
 * One place in a template's homepage outline. required: always there (the closing call); optional: there when the
 * client gave what it needs (prices, people, a second photo); one-of: exactly one of the options (the hero).
 */
export interface OutlineSlot {
  kind: "required" | "optional" | "one-of";
  /** "type:variant" choices for this place. */
  options: string[];
  /** The template's own line for the content step (what goes in it). */
  note: string;
}

/**
 * The template's homepage outline as slots: the hero is one of the family's heroes, the closing section is required,
 * the sections between are optional (each needs facts a client may not have given). With `hero`, the hero slot has
 * that one option (the design step's choice).
 */
export function outlineSlots(dir: Direction, hero?: string): OutlineSlot[] {
  const lines = dir.template?.homepage ?? [];
  const family = familyOf(dir);
  return lines.map((line, i) => {
    const head = line.split(":").slice(0, 2).join(":").split(/\s/)[0]!;
    if (i === 0) return { kind: "one-of" as const, options: hero ? [hero] : (family?.heroes ?? [head]), note: line };
    return { kind: i === lines.length - 1 ? ("required" as const) : ("optional" as const), options: [head], note: line };
  });
}

/** What breaks the outline: a missing required or one-of slot, sections out of order or not in it. Empty when it fits. */
export function validateOutline(sections: { type: string; variant: string }[], slots: OutlineSlot[]): string[] {
  const issues: string[] = [];
  let at = 0;
  for (const slot of slots) {
    const s = sections[at];
    if (s && slot.options.includes(`${s.type}:${s.variant}`)) {
      at++;
      continue;
    }
    if (slot.kind !== "optional") issues.push(`missing ${slot.kind === "one-of" ? `one of ${slot.options.join(", ")}` : slot.options[0]} (position ${at + 1})`);
  }
  for (const s of sections.slice(at)) issues.push(`${s.type}:${s.variant} is not in the outline, or out of order`);
  return issues;
}
