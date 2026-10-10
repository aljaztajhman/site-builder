/**
 * The owner's gallery decisions (docs/plans/studio-phase1-design.md §5, steps 5–7): `decisions.json` maps an asset id to
 * the status the owner gave it in the approval gallery. An asset's status is its decision when there is one, else its
 * registered default. Rejected assets stay registered as `rejected` (taste data). `pnpm inventory:decide <export.json>`
 * merges a gallery export into the file.
 */
import { z } from "zod";
import { AssetStatus, parseAssetId, type Asset } from "./schema.ts";
import decisionsJson from "./decisions.json" with { type: "json" };

/** An id the asset id scheme accepts (@sb/spec parseAssetId). */
const DecisionId = z.string().refine(
  (id) => {
    try {
      parseAssetId(id);
      return true;
    } catch {
      return false;
    }
  },
  { message: "not an asset id (parseAssetId)" },
);

export const Decision = z.strictObject({
  status: AssetStatus,
  at: z.iso.datetime(),
  reason: z.string().min(1).max(400).optional(),
});
export type Decision = z.infer<typeof Decision>;

export const Decisions = z.record(DecisionId, Decision);
export type Decisions = z.infer<typeof Decisions>;

/** One row of a gallery export. Other fields the gallery adds (kind, tags …) are ignored. */
export const GalleryRow = z.object({ id: DecisionId, status: AssetStatus, reason: z.string().max(400).optional() });
export const GalleryExport = z.array(GalleryRow);
export type GalleryRow = z.infer<typeof GalleryRow>;

/** The checked-in decisions (packages/inventory/src/decisions.json), validated. */
export function shippedDecisions(): Decisions {
  return Decisions.parse(decisionsJson);
}

/** Decision ids that name no asset in the list (a typo, or an asset that was removed). */
export function unknownDecisionIds(assets: readonly Asset[], decisions: Decisions): string[] {
  const ids = new Set(assets.map((a) => a.id));
  return Object.keys(decisions).filter((id) => !ids.has(id));
}

/**
 * The assets with their decided status (else the registered default). Throws when a decision names an asset that isn't
 * registered: the decision must be removed or the asset registered again.
 */
export function applyDecisions(assets: readonly Asset[], decisions: Decisions): Asset[] {
  const unknown = unknownDecisionIds(assets, decisions);
  if (unknown.length) throw new Error(`decisions.json names unknown asset ids: ${unknown.join(", ")}`);
  return assets.map((a) => {
    const d = decisions[a.id];
    return d && d.status !== a.status ? { ...a, status: d.status } : a;
  });
}

/**
 * A gallery export merged into the decisions: each exported row replaces that id's decision (with `at` = now), other
 * decisions are kept; the result is sorted by id. A later row for the same id wins.
 */
export function mergeDecisions(current: Decisions, rows: readonly GalleryRow[], now: Date): Decisions {
  const at = now.toISOString();
  const merged: Decisions = { ...Decisions.parse(current) };
  for (const row of GalleryExport.parse(rows)) {
    const reason = row.reason?.trim();
    merged[row.id] = { status: row.status, at, ...(reason ? { reason } : {}) };
  }
  return Object.fromEntries(
    Object.keys(merged)
      .sort()
      .map((id) => [id, merged[id]!]),
  );
}

/** decisions.json as written: two-space JSON, ending in a newline. */
export const formatDecisions = (d: Decisions): string => `${JSON.stringify(d, null, 2)}\n`;
