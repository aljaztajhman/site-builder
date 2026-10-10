/**
 * Resolving a stance signature (an asset id the stance names, packages/spec/src/studio/stances.ts) against the registry.
 * A signature may name an asset whose kind's batch hasn't merged yet; that is "pending", not an error. Anything that
 * can never resolve (a malformed id, a name missing from a kind whose batch is done) is "unknown" and fails the test.
 */
import { parseAssetId, type AssetKind } from "./schema.ts";
import type { Registry } from "./registry.ts";
import { MUST_DRAW_MOTIFS } from "./must-draw.ts";

/**
 * The kinds whose batches have merged: every asset of them is registered, so a name missing from the registry is
 * unknown, not pending. Add a kind here in the PR that merges its batch.
 */
export const KIND_COMPLETE: ReadonlySet<AssetKind> = new Set<AssetKind>([
  "font",
  "pairing",
  "palette",
  "section",
  "mask",
  "treatment",
  "factObject",
  "header",
  "footer",
  "motif",
  "submotif",
]);

export type SignatureState = "resolved" | "pending" | "unknown";

/**
 * resolved: registered (any status). pending: a valid id of a kind whose batch hasn't merged. unknown: anything else. A motif on the must-draw list is pending until batch I5 draws it.
 */
export function resolveSignature(id: string, registry: Registry): SignatureState {
  if (registry.byId(id)) return "resolved";
  if (MUST_DRAW_MOTIFS.includes(id)) return "pending";
  let kind: AssetKind;
  try {
    kind = parseAssetId(id).kind;
  } catch {
    return "unknown";
  }
  return KIND_COMPLETE.has(kind) ? "unknown" : "pending";
}
