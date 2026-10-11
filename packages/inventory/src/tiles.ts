/**
 * The drawn tile of each asset the dot/grid detector checks (checks.ts patternCheck), by asset id. Textures: the SVG
 * data-URI tile of the mask in the texture's CSS partial (textures.ts reads it, so the tile checked is the tile shipped).
 * A texture registered without a partial has no tile here and fails the per-asset check.
 */
import type { DrawingLike, Repeat } from "./pattern-detector.ts";
import { textureNames, texturePartial } from "./textures.ts";

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
  return out;
}

export const PATTERN_TILES: Readonly<Record<string, PatternTile>> = textureTiles();
