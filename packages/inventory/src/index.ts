/**
 * @sb/inventory: the design inventory (docs/plans/design-studio.md §4.2). Every design asset is a typed record in the
 * registry; retrieval builds a shortlist per stance; per-asset checks run in CI (packages/inventory/test); contact
 * sheets come from `pnpm inventory:sheet`.
 */
import { Registry } from "./registry.ts";
import { applyDecisions, shippedDecisions } from "./decisions.ts";
import { draftAssets, todaysAssets } from "./sources.ts";
import { compositionAssets } from "./compositions/index.ts";
import { inventoryFontAssets, inventoryPairingAssets } from "./type-inventory.ts";
import { drawingAssets } from "./drawings.ts";
import { iconAssets } from "./icons.ts";
import { imageryDraftAssets } from "./imagery.ts";
import { textureAssets } from "./textures.ts";
import { motionAssets } from "./motion.ts";
import { factObjectDraftAssets, typeTreatmentDraftAssets } from "./type-and-facts.ts";
import { referenceAssets } from "./references.ts";
import type { Asset } from "./schema.ts";

export * from "./schema.ts";
export * from "./decisions.ts";
export * from "./pattern-detector.ts";
export { PATTERN_TILES } from "./tiles.ts";
export * from "./registry.ts";
export * from "./shortlist.ts";
export * from "./export.ts";
export * from "./checks.ts";
export * from "./signatures.ts";
export * from "./must-draw.ts";
export { todaysAssets, draftAssets, curatedPaletteAssets, groundOf, temperatureOf, paletteOf } from "./sources.ts";
export { CURATED_PALETTES, type CuratedPalette } from "./palettes/curated.ts";
export { fontFile, fontLicenseFile } from "./bytes.ts";
export { COMPOSITION_PRESETS, compositionAssets, compositionPreset } from "./compositions/index.ts";
export { inventoryFontAssets, inventoryPairingAssets, FONT_TAGS, STANCE_FAMILIES, VOICES, type PairingTags, type StanceFamily, type Voice } from "./type-inventory.ts";
export { PAIRING_TAGS } from "./pairing-tags.ts";
export { DRAWING_DATA, DRAWING_META, drawingAssets, drawingBytes, drawingStyleOf } from "./drawings.ts";
export { ICON_NOTES, iconAssets, iconBytes } from "./icons.ts";
export { MASK_DRAFTS, TREATMENT_DRAFTS, addedNames, imageryDraftAssets, type ImageryDraft } from "./imagery.ts";
export { TEXTURE_TAGS, starterTextureAssets, starterTextureTile, textureAssets, textureNames, texturePartial, texturePartialFile, type TexturePartial } from "./textures.ts";
export { motionAssets, motionBytes } from "./motion.ts";
export { STUDIO_REFERENCES, referenceAssets, type ReferenceEntry } from "./references.ts";
export { FACT_OBJECT_DRAFTS, TYPE_TREATMENT_DRAFTS, factObjectDraftAssets, typeTreatmentDraftAssets } from "./type-and-facts.ts";

/**
 * Every registered asset: what ships today (approved), then the drafts (curated palettes, the type inventory, the
 * composition presets, then the inventory batches: drawings, practical-fact icons, masks and treatments, textures, motion presets, type treatments, fact objects, studio references), before the owner's decisions are applied.
 */
export function registeredAssets(): Asset[] {
  return [
    ...todaysAssets(),
    ...draftAssets(),
    ...inventoryFontAssets(),
    ...inventoryPairingAssets(),
    ...compositionAssets(),
    ...drawingAssets(),
    ...iconAssets(),
    ...imageryDraftAssets(),
    ...textureAssets(),
    ...motionAssets(),
    ...typeTreatmentDraftAssets(),
    ...factObjectDraftAssets(),
    ...referenceAssets(),
  ];
}

let cached: Registry | undefined;

/** The registry with every registered asset, each with the owner's gallery decision applied (built once). */
export function inventory(): Registry {
  return (cached ??= new Registry().registerAll(applyDecisions(registeredAssets(), shippedDecisions())));
}
