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

/** The own ground of a fact object that paints one (before a fill): the role and, on a band or inverse section, the flipped one (composed.css). */
export function factObjectGround(treatment: string, tone: "default" | "alt" | "inverse" | "band"): ColorRole | undefined {
  switch (treatment) {
    case "ticket":
      return tone === "band" ? "onBand" : "primary";
    case "seal":
      return tone === "band" ? "onBand" : "band";
    case "tag":
      return tone === "inverse" ? "onInverse" : "inverse";
    default:
      return undefined;
  }
}
