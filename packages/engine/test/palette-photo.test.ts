import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { hexToHsl, luminance } from "@sb/spec";
import { paletteFromSwatches, photoPaletteIssues, photoSwatches, type PhotoGround } from "../src/palette.ts";

const fixtures = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../tools/eval/fixtures");
const photoSets = readdirSync(fixtures)
  .filter((f) => existsSync(path.join(fixtures, f, "photos")))
  .sort()
  .map((f) => {
    const dir = path.join(fixtures, f, "photos");
    return [f, readdirSync(dir).sort().map((p) => readFileSync(path.join(dir, p)))] as const;
  });

/** A solid image of the given colours in equal vertical stripes. */
async function stripes(colours: [number, number, number][], width = 60, height = 40): Promise<Buffer> {
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const c = colours[Math.floor((x * colours.length) / width)]!;
      raw.set(c, (y * width + x) * 3);
    }
  return sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

const hueGap = (a: string, b: string): number => {
  const d = Math.abs(hexToHsl(a).h - hexToHsl(b).h);
  return Math.min(d, 360 - d);
};

describe("photoSwatches", () => {
  it("reads the roles from the pixels: vivid the saturated stripe, dark and light the extremes", async () => {
    const img = await stripes([
      [200, 40, 30],
      [120, 125, 118],
      [25, 30, 45],
      [228, 236, 244],
    ]);
    const s = await photoSwatches([img]);
    expect(hexToHsl(s.vivid).s).toBeGreaterThan(0.6);
    expect(hueGap(s.vivid, "#c8281e")).toBeLessThan(10);
    expect(hexToHsl(s.muted).s).toBeLessThan(0.15);
    expect(luminance(s.dark)).toBeLessThan(0.05);
    expect(luminance(s.light)).toBeGreaterThan(0.75);
    expect(s.derived).toEqual([]);
    // Four stripes: four heavy clusters (resizing blends a few pixels at the seams into small ones).
    expect(s.swatches.slice(0, 4).reduce((n, x) => n + x.weight, 0)).toBeGreaterThan(0.9);
    expect(s.swatches.reduce((n, x) => n + x.weight, 0)).toBeLessThanOrEqual(1 + 1e-9);
  });

  it("weighs every photo the same and derives the roles a photo set has no colour for", async () => {
    const big = await stripes([[40, 90, 160]], 200, 200);
    const small = await stripes([[40, 90, 160]], 20, 20);
    const s = await photoSwatches([big, small]);
    expect(s.swatches).toHaveLength(1);
    expect(s.derived.sort()).toEqual(["dark", "light", "muted"]);
    expect(luminance(s.dark)).toBeLessThan(luminance(s.light));
    await expect(photoSwatches([])).rejects.toThrow();
  });

  it.each(photoSets)("%s: five roles and the heaviest clusters, deterministic", async (_name, photos) => {
    const s = await photoSwatches(photos, 5);
    for (const hex of [s.dominant, s.vivid, s.muted, s.dark, s.light]) expect(hex).toMatch(/^#[0-9a-f]{6}$/);
    expect(s.swatches).toHaveLength(5);
    expect(luminance(s.dark)).toBeLessThan(luminance(s.light));
    expect(hexToHsl(s.vivid).s).toBeGreaterThanOrEqual(hexToHsl(s.muted).s);
    expect(await photoSwatches(photos, 5)).toEqual(s);
  });
});

describe("paletteFromSwatches", () => {
  const grounds: PhotoGround[] = ["white", "tint", "dark"];
  const cases = photoSets.flatMap(([name, photos]) => grounds.map((g) => [name, g, photos] as const));

  it.each(cases)("%s on a %s page: every role passes as stored, the button keeps the photos' vivid hue", async (_name, ground, photos) => {
    const s = await photoSwatches(photos);
    const { colors, ground: got } = paletteFromSwatches(s, ground);
    expect(Object.values(colors).every((c) => /^#[0-9a-f]{6}$/.test(c!))).toBe(true);
    expect(photoPaletteIssues(colors)).toEqual([]);
    if (got === "white") expect(colors.background).toBe("#ffffff");
    if (got === "tint") expect(luminance(colors.background)).toBeGreaterThan(0.6);
    if (got === "dark") expect(luminance(colors.background)).toBeLessThanOrEqual(0.05);
    expect(got === ground || (ground === "tint" && got === "white")).toBe(true);
    if (hexToHsl(s.vivid).s >= 0.3) expect(hueGap(colors.primary, s.vivid)).toBeLessThan(12);
    expect(paletteFromSwatches(s, ground)).toEqual({ colors, ground: got });
  });

  it("a set of only warm colours gets a white page, not a cream tint", async () => {
    const s = await photoSwatches([await stripes([[214, 170, 110], [150, 100, 60], [60, 40, 25], [238, 222, 196]])]);
    const p = paletteFromSwatches(s, "tint");
    expect(p.ground).toBe("white");
    expect(photoPaletteIssues(p.colors)).toEqual([]);
  });

  it("a grass-green photo on a dark page doesn't give an acid-green button", async () => {
    const s = await photoSwatches([await stripes([[90, 200, 40], [20, 60, 20], [180, 230, 150]])]);
    const { colors } = paletteFromSwatches(s, "dark");
    expect(photoPaletteIssues(colors)).toEqual([]);
    expect(hexToHsl(colors.primary).s).toBeLessThanOrEqual(0.46);
  });

  it("extreme sets still give a passing palette: all white, all black, one saturated colour", async () => {
    for (const set of [[[255, 255, 255]], [[0, 0, 0]], [[255, 214, 0]], [[0, 0, 255]]] as [number, number, number][][]) {
      const s = await photoSwatches([await stripes(set)]);
      for (const g of grounds) expect(photoPaletteIssues(paletteFromSwatches(s, g).colors), `${set} ${g}`).toEqual([]);
    }
  });
});
