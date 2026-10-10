/**
 * The design inventory's asset record (docs/plans/design-studio.md §4.2): one typed record per design asset. Every
 * asset the AI director may use goes through it; only approved assets reach the runtime catalogue (shortlist.ts).
 */
import { z } from "zod";
import { AssetId, AssetKind, INTENTS, KIND_PREFIX } from "@sb/spec";

/** The asset id scheme (kinds, prefixes, ids) is @sb/spec's (packages/spec/src/assets.ts); re-exported here. */
export { ASSET_KINDS, AssetKind, KIND_PREFIX, AssetId, assetId, parseAssetId, type AssetPrefix } from "@sb/spec";

export const GROUNDS = ["white", "tint", "dark"] as const;
export const Ground = z.enum(GROUNDS);
export type Ground = z.infer<typeof Ground>;
export const DENSITIES = ["compact", "regular", "airy"] as const;

const tag = z.string().regex(/^[a-z0-9-]+(?:\/[a-z0-9-]+)?$/);

export const AssetTags = z.strictObject({
  /** Business types ("builder") and trades within them ("builder/electrical", spec SUBTYPES). Empty: fits any trade. */
  trades: z.array(tag),
  /** Stance ids (§5.2); empty until the stance deck exists (I8). */
  stances: z.array(tag),
  intents: z.array(z.enum(INTENTS)),
  /** Words read from the asset's data (serif, warm, uppercase …), never invented. */
  mood: z.array(tag),
  ground: z.array(Ground),
  density: z.array(z.enum(DENSITIES)),
});
export type AssetTags = z.infer<typeof AssetTags>;

export const License = z.enum(["own", "OFL-1.1", "ISC", "MIT", "Apache-2.0", "CC0-1.0"]);
export type License = z.infer<typeof License>;

export const AssetStatus = z.enum(["draft", "approved", "rejected"]);
export type AssetStatus = z.infer<typeof AssetStatus>;

export const Asset = z
  .strictObject({
    id: AssetId,
    kind: AssetKind,
    tags: AssetTags,
    /** A phone rendering is required unless desktop-only (decor). adapted: the asset changes its form on phones. */
    phone: z.enum(["ok", "desktop-only", "adapted"]),
    /** What it adds to a page that uses it (font files, CSS rules); 0 when it adds nothing of its own. */
    bytes: z.number().int().min(0),
    license: License,
    status: AssetStatus,
    /**
     * false: registered for the gallery and the checks, never offered to the director (system-only and owner-only
     * sections). Absent: pickable.
     */
    pickable: z.boolean().optional(),
    note: z.string().max(400).optional(),
  })
  .refine((a) => a.id.startsWith(`${KIND_PREFIX[a.kind]}/`), { message: "id prefix must match the kind (KIND_PREFIX)", path: ["id"] });
export type Asset = z.infer<typeof Asset>;

/** The name part of an id ("font/archivo" → "archivo"). */
export const assetName = (id: string): string => id.slice(id.indexOf("/") + 1);
