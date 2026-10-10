/**
 * inventory.json: what the owner's approval gallery reads (published later by the director as an artifact with an
 * approve/reject button per asset). One entry per asset: id, kind, tags, status and its thumbnail (a contact-sheet
 * picture path relative to the JSON, or null when the asset has no picture yet).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { AssetKind, AssetStatus, AssetTags } from "./schema.ts";
import type { Registry } from "./registry.ts";

export interface InventoryEntry {
  id: string;
  kind: AssetKind;
  tags: AssetTags;
  status: AssetStatus;
  thumbnail: string | null;
}

export interface InventoryJson {
  version: 1;
  counts: Record<string, number>;
  assets: InventoryEntry[];
}

/** File-safe slug of an asset id ("section/hero-split:image-left" → "section--hero-split--image-left"). */
export const assetSlug = (id: string): string => id.replace(/[/:]/g, "--");

export function inventoryJson(registry: Registry, thumbnail: (id: string) => string | null): InventoryJson {
  return {
    version: 1,
    counts: registry.counts(),
    assets: registry.all().map((a) => ({ id: a.id, kind: a.kind, tags: a.tags, status: a.status, thumbnail: thumbnail(a.id) })),
  };
}

export function writeInventoryJson(file: string, registry: Registry, thumbnail: (id: string) => string | null): InventoryJson {
  const json = inventoryJson(registry, thumbnail);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(json, null, 1)}\n`);
  return json;
}
