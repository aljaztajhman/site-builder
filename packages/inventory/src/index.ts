/**
 * @sb/inventory: the design inventory (docs/plans/design-studio.md §4.2). Every design asset is a typed record in the
 * registry; retrieval builds a shortlist per stance; per-asset checks run in CI (packages/inventory/test); contact
 * sheets come from `pnpm inventory:sheet`.
 */
import { Registry } from "./registry.ts";
import { applyDecisions, shippedDecisions } from "./decisions.ts";
import { todaysAssets } from "./sources.ts";
import { drawingAssets } from "./drawings.ts";
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
export { todaysAssets, groundOf, temperatureOf, paletteOf } from "./sources.ts";
export { fontFile, fontLicenseFile } from "./bytes.ts";
export { DRAWING_DATA, DRAWING_META, drawingAssets, drawingBytes, drawingStyleOf } from "./drawings.ts";

/** Every registered asset: what ships today (approved) and the drawn inventory batches (drafts until decided). */
export function registeredAssets(): Asset[] {
  return [...todaysAssets(), ...drawingAssets()];
}

let cached: Registry | undefined;

/** The registry with every registered asset, each with the owner's gallery decision applied (built once). */
export function inventory(): Registry {
  return (cached ??= new Registry().registerAll(applyDecisions(registeredAssets(), shippedDecisions())));
}
