import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { DIRECTIONS, FAMILIES, FONTS, FONT_PAIRS, Imagery, MOTIFS, SECTION_DEFS, SUBMOTIFS, type Colors } from "@sb/spec";
import { SLOVENE_GLYPHS, assetName, byteBudget, fontFile, fontLicenseFile, inventory, needsPatternCheck, paletteContrast, paletteOf, patternCheck, shippedColors, todaysAssets } from "../src/index.ts";

/**
 * Per-asset checks (design-studio.md §4.2): every registered asset has a licence, stays within its kind's byte budget;
 * every font draws the Slovene letters; every palette holds contrast for its text roles. One test per asset, so a
 * failure names the asset.
 */
interface FkFont {
  hasGlyphForCodePoint(cp: number): boolean;
  glyphForCodePoint(cp: number): { id: number; path: { commands: unknown[] } };
}
// fontkit (already in the repo for packages/render's font build) reads the woff2 cmap; no parser of our own.
const fontkit = createRequire(import.meta.url)("fontkit") as { create(buf: Buffer): FkFont };

const registry = inventory();
const assets = registry.all();

describe("today's assets are registered", () => {
  it("every font, pair, motif, sub-motif, imagery treatment and section variant", () => {
    const ids = new Set(assets.map((a) => a.id));
    for (const f of Object.values(FONTS)) expect(ids.has(`font/${f.file}`), f.file).toBe(true);
    for (const p of FONT_PAIRS) expect(ids.has(`pairing/${p.id}`), p.id).toBe(true);
    for (const m of MOTIFS) expect(ids.has(`motif/${m}`), m).toBe(true);
    for (const s of SUBMOTIFS) expect(ids.has(`submotif/${s}`), s).toBe(true);
    for (const t of Imagery.options) expect(ids.has(`treatment/${t}`), t).toBe(true);
    for (const d of SECTION_DEFS) for (const v of d.variants) expect(ids.has(`section/${d.type}:${v}`), `${d.type}:${v}`).toBe(true);
  });

  it("every direction fallback palette, once: a template's is its family's first palette", () => {
    for (const d of DIRECTIONS) {
      const family = FAMILIES[d.id];
      if (d.template && family) expect(family.palettes[0]!.colors).toEqual(d.palette.fallback);
      else expect(registry.byId(`palette/${d.id}`), d.id).toBeDefined();
    }
    const familyPalettes = Object.values(FAMILIES).reduce((n, f) => n + f.palettes.length, 0);
    expect(registry.byKind("palette")).toHaveLength(DIRECTIONS.filter((d) => !(d.template && FAMILIES[d.id])).length + familyPalettes);
  });

  it("existing assets start approved; system- and owner-only sections are not pickable", () => {
    // The registered default; the owner's decisions (decisions.json, decisions.test.ts) may change it.
    expect(todaysAssets().every((a) => a.status === "approved")).toBe(true);
    const unpickable = assets.filter((a) => a.pickable === false).map((a) => a.id);
    expect(unpickable.sort()).toEqual(["section/collection:cards", "section/collection:list", "section/legal:default", "section/not-found:default"]);
  });

  it("trade-bound assets carry the trades of the existing data", () => {
    expect(registry.byId("motif/pipes")!.tags.trades).toEqual(["builder", "builder/plumbing"]);
    expect(registry.byId("submotif/wire")!.tags.trades).toEqual(["builder/electrical"]);
    expect(registry.byId("submotif/stem")!.tags.trades).toEqual(["shop/florist"]);
    expect(registry.byId("motif/plate")!.tags.trades).toContain("car-repair/tyres");
    expect(registry.byId("palette/dark-elegant")!.tags.ground).toEqual(["dark"]);
    expect(registry.byId("section/menu:classic")!.tags.intents).toEqual(["menu"]);
  });
});

describe.each(assets.map((a) => [a.id, a] as const))("%s", (_id, asset) => {
  it("has a licence", () => {
    expect(asset.license).toBeTruthy();
    if (asset.kind === "font") {
      const file = fontLicenseFile(assetName(asset.id));
      expect(existsSync(file), file).toBe(true);
      expect(asset.license).toBe("OFL-1.1");
      expect(readFileSync(file, "utf8")).toMatch(/SIL Open Font License,\s+Version 1\.1/);
    }
  });

  const budget = byteBudget(asset);
  it(`stays within its byte budget (${budget ?? "none"})`, () => {
    expect(budget, `no byte budget for kind ${asset.kind}`).toBeDefined();
    expect(asset.bytes).toBeLessThanOrEqual(budget!);
  });

  if (asset.kind === "font") {
    it("draws every Slovene letter (woff2 cmap, non-empty glyph)", () => {
      const font = fontkit.create(readFileSync(fontFile(assetName(asset.id))));
      const missing = [...SLOVENE_GLYPHS].filter((ch) => {
        const cp = ch.codePointAt(0)!;
        if (!font.hasGlyphForCodePoint(cp)) return true;
        const g = font.glyphForCodePoint(cp);
        return g.id === 0 || g.path.commands.length === 0;
      });
      expect(missing.join("")).toBe("");
    });
  }

  if (needsPatternCheck(asset)) {
    it("is not a dot grid, a lattice of crosses or grid paper (G19 detector)", () => {
      expect(patternCheck(asset)).toEqual({ ok: true });
    });
  }

  if (asset.kind === "palette") {
    const p = paletteOf(asset.id);
    const misses = (colors: Colors) => paletteContrast(colors, p!.direction).filter((c) => !c.ok).map((c) => `${c.fg} on ${c.bg} ${c.ratio} < ${c.min}`);

    it("holds contrast for its text roles as a site renders it", () => {
      expect(p, "palette colours").toBeDefined();
      expect(misses(shippedColors(p!.colors, p!.direction))).toEqual([]);
    });

    it("holds contrast for its text roles as stored (or is a known miss)", () => {
      expect(misses(p!.colors)).toEqual(STORED_CONTRAST_MISSES[asset.id] ?? []);
    });
  }
});

/**
 * Stored family palettes whose accent misses 3:1 on the inverse ground; enforceDesign repairs the accent when a site
 * uses them (the test above), but the director sees the stored values. Measured 10 Oct 2026; fix them in
 * packages/spec/src/families.ts and empty this list (the test fails when a listed miss is fixed or a new one appears).
 */
const STORED_CONTRAST_MISSES: Record<string, string[]> = {
  "palette/cevi-green": ["accent on inverse 2.88 < 3"],
  "palette/skorja-poppy": ["accent on inverse 2.73 < 3"],
  "palette/racun-plum": ["accent on inverse 2.99 < 3"],
};
