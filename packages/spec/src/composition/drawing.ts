/**
 * The Drawing format (spec v20, docs/plans/studio-phase1-design.md §3.1): a motif or ornament from the inventory as
 * path data, colours as roles only. Asset data, not part of a site spec: a spec names a drawing by its id (DrawingId)
 * and the components render `drawings/data/<kind>/<name>.ts`.
 */
import { z } from "zod";
import { DecorPath } from "./schema.ts";
import { DrawingId } from "./vocab.ts";

export const DrawingStyle = z.enum(["line", "solid", "cut"]);
export type DrawingStyle = z.infer<typeof DrawingStyle>;

const ViewSide = z.number().int().min(8).max(400);

export const Drawing = z.strictObject({
  id: DrawingId,
  /** line: strokes (non-scaling, ≥ 1.5 px when rendered); solid: filled shapes; cut: cut-paper shapes. */
  style: DrawingStyle,
  /** [width, height] of the viewBox, 8–400 each. */
  viewBox: z.tuple([ViewSide, ViewSide]),
  paths: z.array(DecorPath).min(1).max(24),
  /** Tiles along x into a strip (REPEATABLE drawings only); `gap` in viewBox units between tiles. */
  repeat: z.strictObject({ axis: z.enum(["x"]), gap: z.number().min(0).max(400) }).optional(),
});
export type Drawing = z.infer<typeof Drawing>;
