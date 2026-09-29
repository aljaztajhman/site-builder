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
});
export type Colors = z.infer<typeof Colors>;

export const Design = z.strictObject({
  direction: z.string().regex(/^[a-z-]+$/),
  fontPair: z.string().regex(/^[a-z0-9-]+$/),
  colors: Colors,
  radius: z.number().int().min(0).max(12).describe("px; pill shapes are banned"),
  baseFontSize: z.number().int().min(16).max(19),
  scale: z.number().min(1.125).max(1.414).describe("Modular type scale ratio"),
  headingWeight: z.number().int().min(400).max(850),
  headingCase: HeadingCase,
  headingTracking: z.number().min(-0.04).max(0.08).describe("em"),
  density: Density,
  shadow: Shadow,
  imagery: Imagery,
});
export type Design = z.infer<typeof Design>;

type Range = [number, number];

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
  layout: {
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
