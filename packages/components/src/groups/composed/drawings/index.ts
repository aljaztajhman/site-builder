import type { Drawing } from "@sb/spec";
import { wheatEarLine } from "./motif-bakery-wheat-ear-line.ts";
import { ropeLine } from "./ornament-rope-line.ts";

/**
 * The inventory's drawings as path data (spec Drawing format, docs/plans/studio-phase1-design.md §3.1), by their full
 * asset id (spec DRAWINGS). F1b ships the two samples; batch I5 adds one file per drawing and one line here. A spec that
 * names a drawing missing here renders nothing in its place (the guard G8 drops unknown names before that).
 */
export const DRAWING_DATA: Readonly<Record<string, Drawing>> = {
  [wheatEarLine.id]: wheatEarLine,
  [ropeLine.id]: ropeLine,
};

export function drawingData(id: string): Drawing | undefined {
  return Object.hasOwn(DRAWING_DATA, id) ? DRAWING_DATA[id] : undefined;
}
