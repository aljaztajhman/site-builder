/**
 * What the inventory reads from @sb/spec, plus the enums the composition schema keeps inline (image masks and
 * treatments, fact treatments), read from the zod schemas themselves so a new value there shows up here.
 */
import { FactElement, ImageElement } from "@sb/spec";
import { composedStylesheet } from "@sb/render";

export {
  DIRECTIONS,
  FAMILIES,
  FONTS,
  FONT_PAIRS,
  FOOTER_FAMILIES,
  HEADER_FAMILIES,
  Imagery,
  MOTIFS,
  SECTION_DEFS,
  SUBMOTIFS,
  SUBMOTIF_BASE,
  SUBTYPE_MOTIF,
  acceptedFontPairs,
  hexToHsl,
  intentOf,
  luminance,
  subtypesOf,
  type BusinessType,
  type Colors,
  type Direction,
  type FontFace,
} from "@sb/spec";

/** Image masks of the composition language, without "none". */
export const IMAGE_MASKS = ImageElement.shape.mask.unwrap().options.filter((m) => m !== "none");
/** Image treatments of the composition language, without "none". */
export const IMAGE_TREATMENTS = ImageElement.shape.treatment.unwrap().options.filter((t) => t !== "none");
/** Fact element treatments (fact objects). */
export const FACT_TREATMENTS = FactElement.shape.treatment.options;

export const composedStylesheetBytes = (): number => Buffer.byteLength(composedStylesheet().css, "utf8");
