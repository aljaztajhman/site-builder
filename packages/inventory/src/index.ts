/**
 * @sb/inventory: the design inventory (docs/plans/design-studio.md §4.2). Every design asset is a typed record in the
 * registry; retrieval builds a shortlist per stance; per-asset checks run in CI (packages/inventory/test); contact
 * sheets come from `pnpm inventory:sheet`.
 */
import { Registry } from "./registry.ts";
import { applyDecisions, shippedDecisions } from "./decisions.ts";
import { todaysAssets } from "./sources.ts";

export * from "./schema.ts";
export * from "./decisions.ts";
export * from "./pattern-detector.ts";
export { PATTERN_TILES } from "./tiles.ts";
export * from "./registry.ts";
export * from "./shortlist.ts";
export * from "./export.ts";
export * from "./checks.ts";
export { todaysAssets, groundOf, temperatureOf, paletteOf } from "./sources.ts";
export { fontFile, fontLicenseFile } from "./bytes.ts";

let cached: Registry | undefined;

/** The registry with every asset that ships today, each with the owner's gallery decision applied (built once). */
export function inventory(): Registry {
  return (cached ??= new Registry().registerAll(applyDecisions(todaysAssets(), shippedDecisions())));
}
