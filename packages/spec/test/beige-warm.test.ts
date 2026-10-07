import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DIRECTIONS, WARM_SURFACE_DIRECTIONS, checkDesign, direction, enforceDesign, isBeige, isCreamOrOffWhite, isWarmCream, isWarmTint, toWarmTint, type SiteSpec } from "../src/index.ts";

/** Config promptFixes.beige and promptFixes.warmSurface: the colour rules behind them. */
const goldenDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../tools/eval/golden");
const GOLDENS = ["avtoservis-mrak", "fizioterapija-pregib", "frizerstvo-lana", "gostilna-zlata-zlica", "instalacije-rebernik", "kmetija-grabnar", "pekarna-kvas", "racunovodstvo-seliskar", "trgovina-oljka-in-sol", "zobozdravstvo-lebar"];
const golden = (id: string) => JSON.parse(readFileSync(path.join(goldenDir, `${id}.json`), "utf8")) as SiteSpec;

describe("beige (promptFixes.beige)", () => {
  it("#ece3d0-like beige and sand pass the cream check without the switch and fail it with", () => {
    for (const c of ["#ece3d0", "#e8d5b7", "#eadfc8", "#e6dccb"]) {
      expect(isCreamOrOffWhite(c), c).toBe(false);
      expect(isCreamOrOffWhite(c, { beige: true }), c).toBe(true);
      expect(isBeige(c), c).toBe(true);
    }
  });
  it("cream stays cream, and white, cool tints, greys, darks and real colours stay allowed", () => {
    for (const c of ["#fdf8f0", "#faf7f2", "#f5f5f0", "#fafafa"]) expect(isCreamOrOffWhite(c, { beige: true }), c).toBe(true);
    for (const c of ["#ffffff", "#eef4fb", "#121212", "#eef5ef", "#f1f6fb", "#e6ebf0", "#d5dbe3", "#c65a2e", "#2b211c", "#b4441f"]) {
      expect(isCreamOrOffWhite(c, { beige: true }), c).toBe(false);
    }
  });
  it("repair replaces a beige page on a tinted direction only with the switch, and lands a valid palette", () => {
    const dir = direction("clinical-calm");
    const d = { ...golden("zobozdravstvo-lebar").design, direction: dir.id, fontPair: dir.fontPairs[0]!, colors: { ...dir.palette.fallback, background: "#ece3d0" } };
    expect(enforceDesign(d, dir).colors.background).toBe("#ece3d0");
    const fixed = enforceDesign(d, dir, { beige: true });
    expect(fixed.colors.background).toBe(dir.palette.fallback.background);
    expect(checkDesign(fixed, dir)).toEqual([]);
  });
  it("design repair with both switches still lands a valid palette for every golden, unchanged where nothing is beige or cream", () => {
    for (const id of GOLDENS) {
      const spec = golden(id);
      const dir = direction(spec.design.direction);
      const off = enforceDesign(spec.design, dir);
      const on = enforceDesign(spec.design, dir, { beige: true, warmSurface: true });
      expect(checkDesign(on, dir), id).toEqual([]);
      expect(on, id).toEqual(off);
    }
  });
  it("every direction's fallback palette passes repair with both switches unchanged", () => {
    for (const dir of DIRECTIONS) {
      const d = { ...golden("pekarna-kvas").design, direction: dir.id, fontPair: dir.fontPairs[0]!, colors: { ...dir.palette.fallback }, imagery: dir.imagery };
      expect(enforceDesign(d, dir, { beige: true, warmSurface: true }).colors, dir.id).toEqual(enforceDesign(d, dir).colors);
    }
  });
});

describe("warm surfaces (promptFixes.warmSurface)", () => {
  it("warm tints are not cream; cream and beige are not warm tints", () => {
    for (const c of ["#f3ddce", "#f6dccb", "#f2d5c4"]) expect(isWarmTint(c), c).toBe(true);
    for (const c of ["#fdf8f0", "#ece3d0", "#f5e6d3", "#e8d5b7", "#edf2ef", "#ffffff", "#c65a2e"]) expect(isWarmTint(c), c).toBe(false);
  });
  it("toWarmTint always lands in the warm-tint range and is idempotent", () => {
    for (const c of ["#fdf8f0", "#f5e6d3", "#efe6dc", "#faf0e0", "#f8e8d8", "#f3ddce"]) {
      const t = toWarmTint(c);
      expect(isWarmTint(t), `${c} → ${t}`).toBe(true);
      expect(toWarmTint(t)).toBe(t);
    }
  });
  it("only warm directions take a warm tint surface: checkDesign accepts it there and nowhere else", () => {
    for (const dir of DIRECTIONS.filter((d) => d.palette.background !== "dark")) {
      const d = enforceDesign({ ...golden("pekarna-kvas").design, direction: dir.id, fontPair: dir.fontPairs[0]!, colors: { ...dir.palette.fallback }, imagery: dir.imagery }, dir);
      const warm = { ...d, colors: { ...d.colors, surface: "#f3ddce" } };
      const surfaceIssue = checkDesign(warm, dir).some((i) => i.path === "/design/colors/surface");
      expect(surfaceIssue, dir.id).toBe(!WARM_SURFACE_DIRECTIONS.includes(dir.id));
    }
  });
  it("repair: a warm direction's cream surface becomes a warm tint with the switch, the cool fallback without; other directions unchanged", () => {
    for (const dir of DIRECTIONS.filter((d) => d.palette.background !== "dark")) {
      const d = { ...golden("pekarna-kvas").design, direction: dir.id, fontPair: dir.fontPairs[0]!, colors: { ...dir.palette.fallback, surface: "#f5e6d3" }, imagery: dir.imagery };
      expect(isWarmCream("#f5e6d3")).toBe(true);
      const off = enforceDesign(d, dir);
      const on = enforceDesign(d, dir, { warmSurface: true });
      expect(off.colors.surface, dir.id).toBe(dir.palette.fallback.surface);
      if (WARM_SURFACE_DIRECTIONS.includes(dir.id)) {
        expect(isWarmTint(on.colors.surface), dir.id).toBe(true);
        expect(checkDesign(on, dir), dir.id).toEqual([]);
        expect(enforceDesign(on, dir, { warmSurface: true }), dir.id).toEqual(on);
      } else expect(on, dir.id).toEqual(off);
    }
  });
});
