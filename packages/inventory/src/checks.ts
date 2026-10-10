/**
 * What every asset is held to (the per-asset checks in packages/inventory/test, and the numbers on the contact sheets):
 * byte budgets per kind, the Slovene letters every font must draw, and the contrast of a palette's text roles.
 */
import { CONTRAST_RULES, contrast, enforceDesign, type Colors, type Design, type Direction } from "@sb/spec";
import { detectPattern, type PatternVerdict } from "./pattern-detector.ts";
import type { Asset, AssetKind } from "./schema.ts";
import { PATTERN_TILES, type PatternTile } from "./tiles.ts";

/**
 * Bytes an asset may add to a page, per kind. Fonts: per file (a pairing is two files). Motifs and the rest: the CSS
 * rules that apply only when the asset is used (bytes.ts); a motif's inline SVG is in the page HTML and not counted.
 * composed:free carries the whole composed stylesheet (linked only by pages with a composed section), hence its own line.
 */
export const BYTE_BUDGET: Partial<Record<AssetKind, number>> = {
  font: 120 * 1024,
  pairing: 240 * 1024,
  palette: 0,
  motif: 6 * 1024,
  submotif: 1.5 * 1024,
  treatment: 2 * 1024,
  mask: 2 * 1024,
  factObject: 2 * 1024,
  header: 2 * 1024,
  footer: 2 * 1024,
  section: 4 * 1024,
};
export const COMPOSED_SHEET_BUDGET = 20 * 1024;

export function byteBudget(a: { id: string; kind: AssetKind }): number | undefined {
  return a.id === "section/composed:free" ? COMPOSED_SHEET_BUDGET : BYTE_BUDGET[a.kind];
}

/** The Slovene letters (and Croatian/Serbian ć đ that Slovene names use) every font must draw. */
export const SLOVENE_GLYPHS = "čšžćđČŠŽĆĐ";

export interface ContrastCheck {
  fg: keyof Colors;
  bg: keyof Colors;
  ratio: number;
  min: number;
  ok: boolean;
}

/**
 * Contrast of a palette's text roles: the code-enforced pairs (spec CONTRAST_RULES) and the template's own extra text
 * pairs (DirectionTemplate.textPairs, held at 4.5:1). Pairs whose colours the palette doesn't set (no band) are left out.
 */
export function paletteContrast(colors: Colors, dir?: Direction): ContrastCheck[] {
  const pairs: [keyof Colors, keyof Colors, number][] = [...CONTRAST_RULES, ...(dir?.template?.textPairs ?? []).map(([fg, bg]): [keyof Colors, keyof Colors, number] => [fg, bg, 4.5])];
  const out: ContrastCheck[] = [];
  for (const [fg, bg, min] of pairs) {
    const a = colors[fg];
    const b = colors[bg];
    if (!a || !b) continue;
    const ratio = Math.round(contrast(a, b) * 100) / 100;
    out.push({ fg, bg, ratio, min, ok: ratio >= min });
  }
  return out;
}

/**
 * The colours a site with this palette renders: the palette after the design rules' contrast repair (enforceDesign),
 * on the direction's first values for everything else. A palette as stored may be nudged here (the spec's families test
 * allows ΔE < 6 per role); the stored values are what the director sees, so their misses are reported too.
 */
export function shippedColors(colors: Colors, dir: Direction): Colors {
  const design: Design = {
    direction: dir.id,
    fontPair: dir.fontPairs[0]!,
    colors: { ...colors },
    radius: dir.ranges.radius[0],
    baseFontSize: dir.ranges.baseFontSize[0],
    scale: dir.ranges.scale[0],
    headingWeight: dir.ranges.headingWeight[0],
    headingCase: dir.ranges.headingCase[0]!,
    headingTracking: dir.ranges.headingTracking[0],
    density: dir.ranges.density[0]!,
    shadow: dir.ranges.shadow[0]!,
    imagery: dir.imagery,
  };
  return enforceDesign(design, dir).colors;
}

/**
 * The kinds the dot/grid detector checks (G19). Textures only for now: REPEATABLE drawings join when the drawing list
 * and its REPEATABLE set exist (I5), through a tag or this list.
 */
export const PATTERN_CHECKED_KINDS: readonly AssetKind[] = ["texture"];

export const needsPatternCheck = (a: Pick<Asset, "kind">): boolean => PATTERN_CHECKED_KINDS.includes(a.kind);

/** The dot/grid verdict for an asset's tile (tiles.ts); an asset that needs the check and has no tile fails. */
export function patternCheck(a: Pick<Asset, "id">, tiles: Readonly<Record<string, PatternTile>> = PATTERN_TILES): PatternVerdict | { ok: false; reason: "no-tile"; detail: string } {
  const t = tiles[a.id];
  if (!t) return { ok: false, reason: "no-tile", detail: `${a.id} has no tile in packages/inventory/src/tiles.ts` };
  return detectPattern(t.tile, t.repeat ? { repeat: t.repeat } : {});
}
