/**
 * What a texture or a photo treatment does to the ground under text, as numbers the contrast guards read (G3 over a
 * photo, G27 on a textured section). The CSS is the source: a test (packages/inventory/test/textures.test.ts for the
 * textures, imagery.test.ts for the treatments) fails when a number here disagrees with the partial or the core sheet.
 * Spec cannot import the stylesheets, so the numbers are repeated here once, as ROLES in roles.ts.
 */
import type { IMAGE_TREATMENTS, TEXTURES } from "./vocab.ts";

export interface TextureMeta {
  /** The `::before` opacity: the most the texture mixes the section's text colour into its ground (the mask's alpha is at most 1). */
  maxAlpha: number;
}

/**
 * Per texture, the largest share of the ink (the section's text colour: text on paper and alt, onInverse on inverse, onBand
 * on band; composed.css `.cx-tex-*`, styles/vocab/textures/*.css) the texture paints over the ground. `none` paints nothing.
 */
export const TEXTURE_META: Readonly<Record<(typeof TEXTURES)[number], TextureMeta>> = {
  none: { maxAlpha: 0 },
  grain: { maxAlpha: 0.07 },
  lines: { maxAlpha: 0.07 },
  "press-grain": { maxAlpha: 0.12 },
  "linen-weave": { maxAlpha: 0.11 },
  stone: { maxAlpha: 0.1 },
  bark: { maxAlpha: 0.1 },
  "raw-board": { maxAlpha: 0.1 },
  "board-concrete": { maxAlpha: 0.1 },
  "laid-paper": { maxAlpha: 0.1 },
  "kraft-fibre": { maxAlpha: 0.12 },
  gouge: { maxAlpha: 0.11 },
  terrazzo: { maxAlpha: 0.12 },
};

export interface TreatmentMeta {
  /**
   * lighten: the treatment can lift a pixel toward white (a brighter filter, a veil, a lighten blend); the guards take
   * the worst case. darken: it caps the brightest pixel. neutral: it does neither (hue, saturation, contrast only).
   */
  shift: "lighten" | "darken" | "neutral";
  /**
   * lighten: the share of the way to white a pixel can be moved (an upper bound: a veil of alpha a lifts a pixel by at most
   * a of the distance to white). darken: the grey the brightest pixel is capped at is 1 − factor. neutral: 0.
   */
  factor: number;
}

const NEUTRAL: TreatmentMeta = { shift: "neutral", factor: 0 };
const lighten = (factor: number): TreatmentMeta => ({ shift: "lighten", factor });
const darken = (factor: number): TreatmentMeta => ({ shift: "darken", factor });

/**
 * Per image treatment: tint is a veil of the primary at 0.3, high-key brightness 1.12, faded brightness 1.08 and a lifted
 * black, grade a soft-light veil of the accent at 0.45 (soft-light lifts at most a quarter of the range: 0.11), matte and
 * newsprint lift the shadows with a lighten blend (bounded at 0.15), mono-contrast brightness 1.04; dim caps brightness at
 * 0.5 (low-key at 0.82). The rest change colour or contrast, never the lightest or darkest value.
 */
export const TREATMENT_META: Readonly<Record<(typeof IMAGE_TREATMENTS)[number], TreatmentMeta>> = {
  none: NEUTRAL,
  duotone: NEUTRAL,
  tint: lighten(0.3),
  grain: NEUTRAL,
  "mono-contrast": lighten(0.04),
  bleach: NEUTRAL,
  "high-key": lighten(0.12),
  "low-key": darken(0.18),
  faded: lighten(0.08),
  matte: lighten(0.15),
  toned: NEUTRAL,
  newsprint: lighten(0.15),
  grade: lighten(0.12),
  overprint: NEUTRAL,
  field: NEUTRAL,
  dim: darken(0.5),
};

/** Image frames (masks) a `field` treatment can't combine with: the field sets the photo's inset, as these frames do. */
export const FIELD_CLASH_MASKS = ["postcard", "ruled", "crop"] as const;
