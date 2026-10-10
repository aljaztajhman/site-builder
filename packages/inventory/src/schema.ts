/**
 * The design inventory's asset record (docs/plans/design-studio.md §4.2): one typed record per design asset. Every
 * asset the AI director may use goes through it; only approved assets reach the runtime catalogue (shortlist.ts).
 */
import { z } from "zod";
import { INTENTS } from "@sb/spec";

/**
 * Asset kinds. The plan's list (§4.2) plus what today's code already has as its own unit: sub-trade motifs, header and
 * footer families, section presets (`section`, today's type:variant; `composition` is the composition-language preset
 * that later phases add) and shapes (masks and frames).
 */
export const ASSET_KINDS = [
  "font",
  "pairing",
  "palette",
  "section",
  "composition",
  "shape",
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
  "header",
  "footer",
  "stance",
  "constraint",
  "reference",
] as const;
export const AssetKind = z.enum(ASSET_KINDS);
export type AssetKind = z.infer<typeof AssetKind>;

/** The id prefix per kind: an asset id is `<prefix>/<name>` ("font/archivo", "section/hero-split:image-left"). */
export const KIND_PREFIX: Record<AssetKind, string> = {
  font: "font",
  pairing: "pairing",
  palette: "palette",
  section: "section",
  composition: "composition",
  shape: "shape",
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
  header: "header",
  footer: "footer",
  stance: "stance",
  constraint: "constraint",
  reference: "reference",
};

export const GROUNDS = ["white", "tint", "dark"] as const;
export const Ground = z.enum(GROUNDS);
export type Ground = z.infer<typeof Ground>;
export const DENSITIES = ["compact", "regular", "airy"] as const;

/** `<prefix>/<name>`, name segments in lower case with digits, hyphens and the section's type:variant colon. */
export const AssetId = z.string().regex(/^[a-z]+(?:-[a-z]+)*\/[a-z0-9-]+(?::[a-z0-9-]+)?(?:\/[a-z0-9-]+(?::[a-z0-9-]+)?)*$/);

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
