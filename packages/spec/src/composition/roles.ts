import type { ColorRole } from "./schema.ts";

/**
 * The text role on each ground role, named once. The guards (G3, G9) read it; the stylesheet repeats it as the
 * `--cx-ro` of `.cx-ro-<role>` (layers, header) and the `--cx-o` of `.cx-bg-<role>` (an element's own fill) in
 * composed-v2.css, and a test (packages/components/test) fails when the two disagree. A pair here is not always
 * readable (accent with text on a weak palette); that is what the guards are for.
 */
export const ON_ROLE: Readonly<Record<ColorRole, ColorRole>> = {
  background: "text",
  surface: "text",
  text: "background",
  muted: "background",
  primary: "onPrimary",
  onPrimary: "primary",
  accent: "text",
  border: "text",
  inverse: "onInverse",
  onInverse: "inverse",
  band: "onBand",
  onBand: "band",
};

/**
 * The own ground of a fact object that paints one (before a fill): the role and, on a section whose tone is that role, the
 * flipped one (composed.css for the starters, components styles/vocab/fact-objects/<name>.css for the rest; the CSS role
 * test in packages/render/test/composed-roles.test.ts holds each to this table). Every ground here is one of the palette's
 * guaranteed pairs (design-rules CONTRAST_RULES: onPrimary/primary, onInverse/inverse, onBand/band, text/surface,
 * text/background), so the object's own ink always reads; G9 checks an own colour or a fill against it.
 */
export function factObjectGround(treatment: string, tone: "default" | "alt" | "inverse" | "band"): ColorRole | undefined {
  switch (treatment) {
    case "ticket":
    case "house-number":
    case "index-tab":
      return tone === "band" ? "onBand" : "primary";
    case "seal":
    case "signpost":
    case "door-plate":
      return tone === "band" ? "onBand" : "band";
    case "tag":
    case "timetable":
      return tone === "inverse" ? "onInverse" : "inverse";
    case "receipt":
    case "calendar":
      return tone === "alt" ? "background" : "surface";
    default:
      return undefined;
  }
}

/**
 * The own ground of a heading type treatment that paints one (before a fill): fascia-lettering (a sign board in the band
 * colour) and marker-highlight (a flat band behind each line, in the primary colour), flipped on a band section
 * (components styles/vocab/type-treatments/<name>.css). Guaranteed pairs only, as for fact objects; G9 checks an own
 * colour or a fill against it.
 */
export function typeTreatmentGround(treatment: string | undefined, tone: "default" | "alt" | "inverse" | "band"): ColorRole | undefined {
  switch (treatment) {
    case "fascia-lettering":
      return tone === "band" ? "onBand" : "band";
    case "marker-highlight":
      return tone === "band" ? "onBand" : "primary";
    default:
      return undefined;
  }
}
