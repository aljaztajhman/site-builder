/**
 * @sb/inventory: the design inventory (docs/plans/design-studio.md §4.2). Every design asset is a typed record in the
 * registry; retrieval builds a shortlist per stance; per-asset checks run in CI (packages/inventory/test); contact
 * sheets come from `pnpm inventory:sheet`.
 */
import { Registry } from "./registry.ts";
import { draftAssets, todaysAssets } from "./sources.ts";
import { inventoryFontAssets, inventoryPairingAssets } from "./type-inventory.ts";

export * from "./schema.ts";
export * from "./registry.ts";
export * from "./shortlist.ts";
export * from "./export.ts";
export * from "./checks.ts";
export { todaysAssets, draftAssets, curatedPaletteAssets, groundOf, temperatureOf, paletteOf } from "./sources.ts";
export { CURATED_PALETTES, type CuratedPalette } from "./palettes/curated.ts";
export { fontFile, fontLicenseFile } from "./bytes.ts";
export { inventoryFontAssets, inventoryPairingAssets, FONT_TAGS, STANCE_FAMILIES, VOICES, type PairingTags, type StanceFamily, type Voice } from "./type-inventory.ts";
export { PAIRING_TAGS } from "./pairing-tags.ts";

let cached: Registry | undefined;

/** The registry: every asset that ships today (approved), then the drafts (curated palettes, the type inventory), built once. */
export function inventory(): Registry {
  return (cached ??= new Registry().registerAll([...todaysAssets(), ...draftAssets(), ...inventoryFontAssets(), ...inventoryPairingAssets()]));
}
