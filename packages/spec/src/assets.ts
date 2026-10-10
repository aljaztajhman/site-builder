/**
 * The one asset id scheme (docs/plans/studio-phase1-design.md §4). An asset id is `<prefix>/<name>`: the prefix names
 * the inventory kind, the name is what a spec field holds (`image.mask: "arch"` ↔ `mask/arch`). Drawing fields hold the
 * full id, because one field spans two kinds (motif, ornament). The inventory (@sb/inventory) re-exports this table;
 * nothing else defines a kind → prefix map.
 */
import { z } from "zod";

/**
 * Inventory asset kinds. `section` is today's type:variant preset, `composition` the composition-language preset;
 * `mask` is an image mask (was `shape`); `wordmark` a wordmark style (I9). The order is the shortlist's round-robin
 * order across kinds (inventory shortlist.ts).
 */
export const ASSET_KINDS = [
  "font",
  "pairing",
  "palette",
  "section",
  "composition",
  "mask",
  "treatment",
  "texture",
  "motif",
  "submotif",
  "ornament",
  "divider",
  "typeTreatment",
  "factObject",
  "icon",
  "motion",
  "wordmark",
  "header",
  "footer",
  "stance",
  "constraint",
  "reference",
] as const;
export const AssetKind = z.enum(ASSET_KINDS);
export type AssetKind = z.infer<typeof AssetKind>;

/** The id prefix per kind. Only two differ from the kind's own name: typeTreatment and factObject. */
export const KIND_PREFIX = {
  font: "font",
  pairing: "pairing",
  palette: "palette",
  section: "section",
  composition: "composition",
  mask: "mask",
  treatment: "treatment",
  texture: "texture",
  motif: "motif",
  submotif: "submotif",
  ornament: "ornament",
  divider: "divider",
  typeTreatment: "type-treatment",
  factObject: "fact",
  icon: "icon",
  motion: "motion",
  wordmark: "wordmark",
  header: "header",
  footer: "footer",
  stance: "stance",
  constraint: "constraint",
  reference: "reference",
} as const satisfies Record<AssetKind, string>;
export type AssetPrefix = (typeof KIND_PREFIX)[AssetKind];

const KIND_OF_PREFIX: ReadonlyMap<string, AssetKind> = new Map(ASSET_KINDS.map((k) => [KIND_PREFIX[k], k]));

/** One name segment: lower case, digits, hyphens; a section preset adds its type:variant colon. */
const SEGMENT = "[a-z0-9-]+(?::[a-z0-9-]+)?";
const ID_RE = new RegExp(`^([a-z]+(?:-[a-z]+)*)/(${SEGMENT}(?:/${SEGMENT})*)$`);

/** `<prefix>/<name>` with a known prefix ("font/archivo", "section/hero-split:image-left", "motif/bakery/peel-line"). */
export const AssetId = z
  .string()
  .regex(ID_RE)
  .refine((id) => KIND_OF_PREFIX.has(id.slice(0, id.indexOf("/"))), { message: "unknown asset id prefix (KIND_PREFIX)" });
export type AssetId = `${AssetPrefix}/${string}`;

/** The id of a kind's asset by name: assetId("mask", "arch") → "mask/arch". */
export function assetId(kind: AssetKind, name: string): AssetId {
  const id = `${KIND_PREFIX[kind]}/${name}` as const;
  if (!ID_RE.test(id)) throw new Error(`Invalid asset name for ${kind}: ${JSON.stringify(name)}`);
  return id;
}

/** Splits an id into its kind and name ("type-treatment/stacked" → { kind: "typeTreatment", name: "stacked" }). */
export function parseAssetId(id: string): { kind: AssetKind; name: string } {
  const m = ID_RE.exec(id);
  const kind = m && KIND_OF_PREFIX.get(m[1]!);
  if (!m || !kind) throw new Error(`Invalid asset id: ${JSON.stringify(id)}`);
  return { kind, name: m[2]! };
}
