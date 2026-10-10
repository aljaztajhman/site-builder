/**
 * The drawn tile of each asset the dot/grid detector checks (checks.ts patternCheck), by asset id: a texture's
 * data-URI or SVG tile (none registered until I4c; a texture registered without its tile here fails the per-asset
 * check), and every REPEATABLE drawing's path data, tiled along x as a strip draws it.
 */
import { REPEATABLE } from "@sb/spec";
import { DRAWING_DATA } from "./drawings.ts";
import type { DrawingLike, Repeat } from "./pattern-detector.ts";

export interface PatternTile {
  tile: string | DrawingLike;
  /** Default: xy for a string tile, none for a drawing (pass "x" for a REPEATABLE drawing). */
  repeat?: Repeat;
}

const drawingTiles: Record<string, PatternTile> = {};
for (const id of REPEATABLE) {
  const d = DRAWING_DATA[id];
  if (d) drawingTiles[id] = { tile: { width: d.viewBox[0] + (d.repeat?.gap ?? 0), height: d.viewBox[1], paths: d.paths }, repeat: "x" };
}

export const PATTERN_TILES: Readonly<Record<string, PatternTile>> = { ...drawingTiles };
