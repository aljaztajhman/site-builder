import { z } from "zod";
import { HexColor } from "./common.ts";
import type { BusinessType } from "./business.ts";

/** How photos are presented. Implemented as CSS in packages/components/styles/imagery.css. */
export const Imagery = z.enum(["natural", "rounded", "framed", "full-bleed", "monochrome", "arched", "offset-block", "duotone"]);
export type Imagery = z.infer<typeof Imagery>;

export const Density = z.enum(["compact", "regular", "airy"]);
export const Shadow = z.enum(["none", "subtle"]);
export const HeadingCase = z.enum(["normal", "uppercase"]);

export const Colors = z.strictObject({
  background: HexColor,
  surface: HexColor.describe("Alternate section background"),
  text: HexColor,
  muted: HexColor.describe("Secondary text; must still meet 4.5:1 on background and surface"),
  primary: HexColor.describe("Buttons and key accents"),
  onPrimary: HexColor.describe("Text on primary"),
  accent: HexColor.describe("Small highlights, rules, links on inverse sections"),
  border: HexColor,
  inverse: HexColor.describe("Background of inverse-tone sections"),
  onInverse: HexColor,
  band: HexColor.optional().describe("Saturated ground of band-tone sections (signal yellow, wheat, a cold blue); primary when absent"),
  onBand: HexColor.optional().describe("Text on band; must meet 4.5:1"),
});
export type Colors = z.infer<typeof Colors>;

export const Design = z.strictObject({
  direction: z.string().regex(/^[a-z-]+$/),
  fontPair: z.string().regex(/^[a-z0-9-]+$/),
  colors: Colors,
  radius: z.number().int().min(0).max(12).describe("px; pill shapes are banned"),
  baseFontSize: z.number().int().min(16).max(19),
  scale: z.number().min(1.125).max(1.414).describe("Modular type scale ratio"),
  headingWeight: z.number().int().min(400).max(900),
  headingCase: HeadingCase,
  headingTracking: z.number().min(-0.04).max(0.08).describe("em"),
  density: Density,
  shadow: Shadow,
  imagery: Imagery,
});
export type Design = z.infer<typeof Design>;

type Range = [number, number];

/**
 * A trade motif, drawn in code (inline SVG and CSS from the site's own colours) and used three or four
 * times on a page: plate (the phone number as a Slovenian registration plate, prices as plates, a tyre
 * tread between sections), pipes (a radiator fed by a hot and a cold pipe, the pipes as dividers, step
 * line and service-area line), crust (a loaf's three scoring cuts as section mark, the photo in an oven
 * arch, the opening time on a round seal), ledger (a tilted paper receipt with check marks, a torn edge and a
 * double-ruled total, ruled rows, wall-sized figures), label (a bottle label: a framed card with a double inner
 * rule and an olive branch, prices on labels, photos in arches and discs).
 */
export const MOTIFS = ["plate", "pipes", "crust", "ledger", "label"] as const;
export type Motif = (typeof MOTIFS)[number];

export interface DirectionTemplate {
  /** Letter in docs/design/templates (M, S, J, R, T …). */
  id: string;
  motif: Motif;
  /** Hero headline size in px at a 360 px and a 1280 px viewport. */
  display: Range;
  /** Section heading (h2) size in px at 360 and 1280. */
  h2: Range;
  /** Business types this template is the first choice for. */
  firstFor: BusinessType[];
  /** Photos the template needs: 0 works without any. */
  minPhotos: number;
  /** Homepage outline the content step follows, top to bottom ("type:variant tone …, what goes in it"). */
  homepage: string[];
  /**
   * Colour pairs the template sets as text beyond the base contrast rules (e.g. primary on the page for
   * poster-size figures and prices), as [text, ground]. Held at 4.5:1 like body text (checkDesign, enforceDesign).
   */
  textPairs?: [keyof Colors, keyof Colors][];
}

/** A curated design direction. The model picks one and fills tokens inside these ranges; code clamps. */
export interface Direction {
  id: string;
  name: string;
  /** For the model: what it looks like and when to choose it (English). */
  summary: string;
  bestFor: BusinessType[];
  fontPairs: string[];
  palette: {
    /** "white": #ffffff page; "tint": cool tinted light page; "dark": dark page. */
    background: "white" | "tint" | "dark";
    /** Default colours used when the logo/photos give nothing usable. Must pass all contrast checks. */
    fallback: Colors;
    /** Allowed hue range for primary, or null to take it from the logo. */
    primaryHue: Range | null;
    primarySaturation: Range;
  };
  ranges: {
    radius: Range;
    baseFontSize: Range;
    scale: Range;
    headingWeight: Range;
    headingTracking: Range;
    headingCase: z.infer<typeof HeadingCase>[];
    density: z.infer<typeof Density>[];
    shadow: z.infer<typeof Shadow>[];
  };
  imagery: Imagery;
  /**
   * Set when the direction implements one of the hand-made trade templates (docs/design/templates):
   * the motif the renderer draws, the type sizes and the homepage outline the content step follows.
   */
  template?: DirectionTemplate;
  layout: {
    /** Header background the direction always uses (set in code after generation); absent: the model's choice. */
    headerTone?: "default" | "alt" | "inverse";
    header: "bar" | "split-cta" | "stacked";
    footer: "columns" | "compact";
    /** Preferred "type:variant" choices, first is strongest. Used by the content prompt and by typography-led fallbacks. */
    heroes: string[];
    /** Section tone rhythm down the page. */
    rhythm: "alternate" | "flat" | "inverse-accents";
    /** Preferred variants for other section types, "type:variant". */
    prefer: string[];
  };
}
