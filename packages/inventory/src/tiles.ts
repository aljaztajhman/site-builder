/**
 * The drawn tile of each asset the dot/grid detector checks (checks.ts patternCheck), by asset id. Textures (the starters' from the core sheet): the SVG
 * data-URI tile of the mask in the texture's CSS partial (textures.ts reads it, so the tile checked is the tile shipped);
 * a texture registered without a partial has no tile here and fails the per-asset check. Drawings: every REPEATABLE
 * drawing's path data, tiled along x as a strip draws it.
 */
import { REPEATABLE } from "@sb/spec";
import { DRAWING_DATA } from "./drawings.ts";
import type { DrawingLike, Repeat } from "./pattern-detector.ts";
import { STARTER_NAMES } from "@sb/render";
import { starterTextureTile, textureNames, texturePartial } from "./textures.ts";

export interface PatternTile {
  tile: string | DrawingLike;
  /** Default: xy for a string tile, none for a drawing (pass "x" for a REPEATABLE drawing). */
  repeat?: Repeat;
}

function textureTiles(): Record<string, PatternTile> {
  const out: Record<string, PatternTile> = {};
  for (const name of textureNames()) {
    const p = texturePartial(name);
    if (p) out[`texture/${name}`] = { tile: p.tile };
  }
  for (const name of STARTER_NAMES.textures) if (name !== "none") out[`texture/${name}`] = { tile: starterTextureTile(name) };
  return out;
}

const drawingTiles: Record<string, PatternTile> = {};
for (const id of REPEATABLE) {
  const d = DRAWING_DATA[id];
  if (d) drawingTiles[id] = { tile: { width: d.viewBox[0] + (d.repeat?.gap ?? 0), height: d.viewBox[1], paths: d.paths }, repeat: "x" };
}

export const PATTERN_TILES: Readonly<Record<string, PatternTile>> = { ...textureTiles(), ...drawingTiles };
