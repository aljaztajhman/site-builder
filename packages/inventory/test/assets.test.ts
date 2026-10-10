import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { BusinessType, DIRECTIONS, FAMILIES, FONTS, FONT_PAIRS, Imagery, MOTIFS, SECTION_DEFS, SUBMOTIFS, SUBTYPES, type Colors } from "@sb/spec";
import {
  CURATED_PALETTES,
  SLOVENE_GLYPHS,
  assetName,
  byteBudget,
  draftAssets,
  fontFile,
  fontLicenseFile,
  groundOf,
  inventory,
  inventoryFontAssets,
  inventoryPairingAssets,
  paletteContrast,
  paletteIssues,
  paletteOf,
  paletteTells,
  shippedColors,
  temperatureOf,
  todaysAssets,
} from "../src/index.ts";

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
    expect(registry.byKind("palette")).toHaveLength(DIRECTIONS.filter((d) => !(d.template && FAMILIES[d.id])).length + familyPalettes + CURATED_PALETTES.length);
  });

  it("existing assets start approved, new ones as drafts; system- and owner-only sections are not pickable", () => {
    expect(todaysAssets().every((a) => a.status === "approved")).toBe(true);
    expect(draftAssets().length).toBeGreaterThan(0);
    const drafts = assets.filter((a) => a.status !== "approved");
    expect(drafts.map((a) => a.id)).toEqual([...draftAssets(), ...inventoryFontAssets(), ...inventoryPairingAssets()].map((a) => a.id));
    expect(drafts.every((a) => a.status === "draft")).toBe(true);
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

  if (asset.kind === "palette") {
    const p = paletteOf(asset.id);
    const misses = (colors: Colors) => paletteContrast(colors, p!.direction).filter((c) => !c.ok).map((c) => `${c.fg} on ${c.bg} ${c.ratio} < ${c.min}`);

    if (p?.direction) {
      const dir = p.direction;
      it("holds contrast for its text roles as a site renders it", () => {
        expect(misses(shippedColors(p.colors, dir))).toEqual([]);
      });
    } else {
      // A curated palette belongs to no direction: it is held to everything as stored.
      it("passes every palette check as stored: contrast, bans, its ground, no give-away combination", () => {
        expect(p, "palette colours").toBeDefined();
        expect(paletteIssues(p!.colors, asset.tags.ground[0]!)).toEqual([]);
      });

      it("renders exactly as stored in every plain direction of its ground (no render-time repair)", () => {
        const dirs = DIRECTIONS.filter((d) => !d.template && d.palette.background === asset.tags.ground[0]);
        expect(dirs.length).toBeGreaterThan(0);
        for (const d of dirs) expect(shippedColors(p!.colors, d), d.id).toEqual(p!.colors);
      });
    }

    it("holds contrast for its text roles as stored", () => {
      expect(p, "palette colours").toBeDefined();
      expect(misses(p!.colors)).toEqual([]);
    });
  }
});

describe("curated palettes (palettes/curated.ts)", () => {
  const trades = new Set<string>([...BusinessType.options, ...Object.entries(SUBTYPES).flatMap(([t, subs]) => subs.map((s) => `${t}/${s}`))]);

  it("unique ids, a source line, stances, trades the spec knows, temperature and ground as read from the colours", () => {
    expect(new Set(CURATED_PALETTES.map((p) => p.id)).size).toBe(CURATED_PALETTES.length);
    for (const p of CURATED_PALETTES) {
      expect(p.source.length, p.id).toBeGreaterThan(10);
      expect(p.stances.length, p.id).toBeGreaterThan(0);
      expect(p.trades.length, p.id).toBeGreaterThan(0);
      expect(p.trades.filter((t) => !trades.has(t)), p.id).toEqual([]);
      expect(p.temperature, p.id).toBe(temperatureOf(p.colors));
      expect(p.ground, p.id).toBe(groundOf(p.colors));
      expect(p.mood, p.id).toContain(p.temperature);
      expect(p.colors.band === undefined ? true : p.mood.includes("band"), p.id).toBe(true);
    }
  });

  it("covers every ground and temperature", () => {
    for (const g of ["white", "tint", "dark"]) expect(CURATED_PALETTES.some((p) => p.ground === g), g).toBe(true);
    for (const t of ["warm", "cool"]) expect(CURATED_PALETTES.some((p) => p.temperature === t), t).toBe(true);
  });

  it("the give-away checks catch what they are for", () => {
    const base = CURATED_PALETTES[0]!.colors;
    expect(paletteTells({ ...base, background: "#ffffff", surface: "#f3e9d8", primary: "#b9562f" })).toEqual(["warm cream with terracotta"]);
    expect(paletteTells({ ...base, background: "#0e0f10", primary: "#b6f22c" })).toEqual(["near-black with acid green"]);
    expect(paletteTells({ ...base, primary: "#6d3fd1", accent: "#2f6fe0", band: undefined, onBand: undefined })).toEqual(["purple with blue"]);
    expect(paletteIssues({ ...base, background: "#f6f0e2" }, "tint")).toContain("background #f6f0e2 is cream, beige or off-white");
  });
});
