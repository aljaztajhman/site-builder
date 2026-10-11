import { describe, expect, it } from "vitest";
import { BusinessType, STANCES, SUBTYPES, TEXTURES, contrast, direction, mix, type Colors } from "@sb/spec";
import { STARTER_NAMES, vocabFamilySheets } from "@sb/render";
import { PATTERN_TILES, TEXTURE_TAGS, detectPattern, inventory, paletteOf, shippedColors, textureNames, texturePartial } from "../src/index.ts";
import { SHEET_PALETTES } from "../scripts/pages.ts";

/**
 * Section textures (docs/plans/studio-phase1-design.md §5 I4c): each TEXTURES name beyond the starters is one CSS
 * partial painted in the section's text colour through one SVG data-URI tile, registered as a draft, free of dot and
 * grid patterns, and quiet enough that text on it keeps its contrast where the texture is darkest (its max alpha).
 */
const names = textureNames();
const registry = inventory();

/**
 * The grounds a section can have and the colour a texture paints on each (the section's currentColor: text on paper
 * and alt, onInverse on inverse, onBand on band), with the text roles held at 4.5:1 on that ground (spec CONTRAST_RULES).
 */
const GROUNDS: { ground: keyof Colors; ink: keyof Colors; text: (keyof Colors)[] }[] = [
  { ground: "background", ink: "text", text: ["text", "muted"] },
  { ground: "surface", ink: "text", text: ["text", "muted"] },
  { ground: "inverse", ink: "onInverse", text: ["onInverse"] },
  { ground: "band", ink: "onBand", text: ["onBand"] },
];

/** Text roles under 4.5:1 on each ground with the texture at its max alpha (the ground mixed toward the ink). */
function misses(c: Colors, alpha: number): string[] {
  const out: string[] = [];
  for (const g of GROUNDS) {
    const ground = c[g.ground];
    const ink = c[g.ink];
    if (!ground || !ink) continue;
    const under = mix(ink, ground, alpha);
    for (const fg of g.text) {
      const ratio = contrast(c[fg]!, under);
      if (ratio < 4.5) out.push(`${fg} on ${g.ground} ${ratio.toFixed(2)}`);
    }
  }
  return out;
}

describe("textures: names, partials, assets", () => {
  it("every TEXTURES name beyond the starters has a partial, tags and a draft asset; nothing else is registered as a texture", () => {
    expect(names.length).toBe(TEXTURES.length - STARTER_NAMES.textures.length);
    for (const n of names) {
      expect(texturePartial(n), n).toBeDefined();
      expect(TEXTURE_TAGS[n], n).toBeDefined();
      expect(registry.byId(`texture/${n}`)?.status, n).toBe("draft");
    }
    expect(registry.byKind("texture").map((a) => a.id).sort()).toEqual(names.map((n) => `texture/${n}`).sort());
    expect(Object.keys(TEXTURE_TAGS).sort()).toEqual([...names].sort());
  });

  it("tags name real stances and trades", () => {
    const stances = new Set(STANCES.map((s) => s.id));
    const trades = new Set<string>([...BusinessType.options, ...Object.entries(SUBTYPES).flatMap(([t, subs]) => subs.map((s) => `${t}/${s}`))]);
    for (const n of names) {
      for (const s of TEXTURE_TAGS[n]!.stances) expect(stances.has(s), `${n}: stance ${s}`).toBe(true);
      for (const t of TEXTURE_TAGS[n]!.trades) expect(trades.has(t), `${n}: trade ${t}`).toBe(true);
    }
  });

  it.each(names)("%s: one rule on its own class, painted in currentColor through one SVG tile, no gradient, low alpha", (n) => {
    const p = texturePartial(n)!;
    const rules = p.css.replace(/\/\*[\s\S]*?\*\//g, "").match(/[^{}]+\{/g)!.map((s) => s.replace("{", "").trim());
    expect(rules).toEqual([`.cx-tex-${n}::before`]);
    const outsideTile = p.css.replace(p.tile, "");
    expect(outsideTile).toMatch(/background:\s*currentColor;/);
    expect(outsideTile).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|gradient|blur|filter:/i);
    expect(outsideTile.match(/url\(/g)).toHaveLength(1);
    expect(p.tile).not.toMatch(/gradient|feGaussianBlur|<image|href=/i);
    expect(p.maxAlpha).toBeGreaterThan(0);
    expect(p.maxAlpha).toBeLessThanOrEqual(0.12);
  });

  it.each(names)("%s: the tile checked is the tile shipped, and it passes the dot/grid detector", (n) => {
    const p = texturePartial(n)!;
    expect(PATTERN_TILES[`texture/${n}`]?.tile).toBe(p.tile);
    expect(detectPattern(p.tile)).toEqual({ ok: true });
  });

  it("the textures family sheet holds every partial", () => {
    const sheet = vocabFamilySheets().textures;
    expect(sheet.names).toEqual([...names].sort());
    for (const n of names) expect(sheet.css).toContain(`.cx-tex-${n}::before{`);
  });
});

describe("textures: text keeps its contrast at the texture's max alpha", () => {
  it.each(names)("%s: in the two sheet palettes, on paper, alt, inverse and band", (n) => {
    const alpha = texturePartial(n)!.maxAlpha;
    for (const id of SHEET_PALETTES) {
      const d = direction(id);
      expect(misses(shippedColors(d.palette.fallback, d), alpha), id).toEqual([]);
    }
  });

  const allMisses = (alpha: number): string[] =>
    registry.byKind("palette").flatMap((a) => {
      const p = paletteOf(a.id)!;
      // A curated palette (main's drafts) belongs to no direction: it renders as stored.
      return misses(p.direction ? shippedColors(p.colors, p.direction) : p.colors, alpha).map((m) => `${a.id}: ${m}`);
    });

  it.each(names)("%s: in every registered palette, as a site renders it (paper, alt and inverse; band: the known misses only)", (n) => {
    const failed = allMisses(texturePartial(n)!.maxAlpha);
    expect(failed.filter((m) => !BAND_MISSES.some((id) => m.startsWith(`${id}: onBand on band `)))).toEqual([]);
  });

  it("the band misses are real: every listed palette misses with at least one texture", () => {
    const failed = names.flatMap((n) => allMisses(texturePartial(n)!.maxAlpha));
    for (const id of BAND_MISSES) expect(failed.some((m) => m.startsWith(`${id}: onBand on band `)), id).toBe(true);
  });
});

/**
 * Palettes whose band text sits so close to 4.5:1 (about 4.6 to 4.8) that any visible texture on a band-toned section
 * takes it under: measured 11 Oct 2026, onBand on band 3.90 to 4.48 at alpha 0.10 to 0.12. A texture must not go on a
 * band section in these palettes; the composition guard has to drop it there (open item for the director). Remove an
 * entry when its palette or the guard changes; the test above fails on a stale one.
 */
const BAND_MISSES = ["palette/cevi-hot-cold", "palette/etiketa-terracotta", "palette/nasmeh-teal", "palette/tablica-blue"];
