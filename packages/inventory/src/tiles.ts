/**
 * The drawn tile of each asset the dot/grid detector checks (checks.ts patternCheck), by asset id: a texture's
 * data-URI or SVG tile. Empty until textures are registered (I4c); a texture registered without its tile here fails the
 * per-asset check.
 */
import type { DrawingLike, Repeat } from "./pattern-detector.ts";

export interface PatternTile {
  tile: string | DrawingLike;
  /** Default: xy for a string tile, none for a drawing (pass "x" for a REPEATABLE drawing). */
  repeat?: Repeat;
}

export const PATTERN_TILES: Readonly<Record<string, PatternTile>> = {};
