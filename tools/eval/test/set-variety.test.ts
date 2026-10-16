import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "@sb/config";
import { loadVarietyEntries, loadPrint, main, markdownLine, varietyOf } from "../src/set-variety.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const GOLDEN = ["pekarna-kvas", "avtoservis-mrak", "instalacije-rebernik"] as const;
const weights = loadConfig().studio.uniqueness.weights;

let dir: string;
beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "set-variety-"));
  mkdirSync(path.join(dir, "specs"), { recursive: true });
  for (const id of GOLDEN) copyFileSync(path.join(here, "../golden", `${id}.json`), path.join(dir, "specs", `${id}.spec.json`));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("variety of a set of specs", () => {
  it("finds the specs by directory, glob and manifest, ids from the file names", () => {
    const byDir = loadVarietyEntries(path.join(dir, "specs"));
    expect(byDir.map((e) => e.id)).toEqual(["avtoservis-mrak", "instalacije-rebernik", "pekarna-kvas"]);
    expect(loadVarietyEntries("specs/*.spec.json", dir).map((e) => e.id)).toEqual(byDir.map((e) => e.id));
    const manifest = path.join(dir, "manifest.json");
    writeFileSync(manifest, JSON.stringify([{ id: "bakery", spec: "specs/pekarna-kvas.spec.json", trade: "bakery" }, "specs/avtoservis-mrak.spec.json"]));
    expect(loadVarietyEntries(manifest).map((e) => e.id)).toEqual(["avtoservis-mrak", "bakery"]);
    expect(() => loadVarietyEntries(`${path.join(dir, "specs")},${path.join(dir, "specs")}`)).toThrow(/given twice/);
    expect(() => loadVarietyEntries(path.join(dir, "nope"))).toThrow(/not found/);
  });

  it("counts distinct directions, font pairs, heroes and primaries, and the pairwise look distance from the engine's look functions", async () => {
    const pages = await Promise.all(loadVarietyEntries(path.join(dir, "specs")).map(loadPrint));
    const r = varietyOf(pages, weights);
    expect(r.pages).toBe(3);
    expect(r.directions.distinct).toBeGreaterThanOrEqual(1);
    expect(r.directions.distinct).toBeLessThanOrEqual(3);
    expect(Object.values(r.directions.counts).reduce((a, b) => a + b, 0)).toBe(3);
    expect(Object.values(r.fontPairs.counts).reduce((a, b) => a + b, 0)).toBe(3);
    expect(r.heroes.distinct).toBeGreaterThanOrEqual(1);
    expect(r.primaryColours.distinct).toBe(3);
    expect(r.distance.pairs).toBe(3);
    expect(r.distance.min!).toBeLessThanOrEqual(r.distance.mean!);
    expect(r.distance.mean!).toBeGreaterThan(0);
    expect(r.distance.mean!).toBeLessThanOrEqual(1);
    expect(r.distance.withPictures).toBe(0);
    expect(r.distance.pairsWithPhash).toBe(0);
    expect(r.distance.closest!.distance).toBe(r.distance.min);
    const line = markdownLine("goldens", r);
    expect(line).toContain("**goldens** (3 pages)");
    expect(line).toContain("no first-screen pictures: spec parts only");
  });

  it("a set of one page, or two identical specs, has no spread to report", async () => {
    const [first] = loadVarietyEntries(path.join(dir, "specs")).slice(0, 1);
    const one = varietyOf([await loadPrint(first!)], weights);
    expect(one.distance).toMatchObject({ pairs: 0, mean: null, min: null, closest: null });
    expect(markdownLine("one", one)).toContain("mean n/a");
    const a = await loadPrint(first!);
    const twin = varietyOf([a, { ...a, id: "twin" }], weights);
    expect(twin.distance.mean).toBe(0);
    expect(twin.primaryColours.distinct).toBe(1);
  });

  it("uses first-screen pictures beside the specs for the perceptual hash, and says so", async () => {
    const shots = path.join(dir, "shots");
    mkdirSync(shots, { recursive: true });
    for (const id of GOLDEN) {
      copyFileSync(path.join(dir, "specs", `${id}.spec.json`), path.join(shots, `${id}.spec.json`));
      const stripes = GOLDEN.indexOf(id) + 2;
      const svg = (w: number, h: number) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="white"/>${Array.from({ length: stripes }, (_, i) => `<rect x="${(i * w) / stripes}" y="0" width="${w / (stripes * 2)}" height="${h}" fill="black"/>`).join("")}</svg>`;
      writeFileSync(path.join(shots, `${id}-desk.png`), await sharp(Buffer.from(svg(1280, 800))).png().toBuffer());
      writeFileSync(path.join(shots, `${id}-phone.png`), await sharp(Buffer.from(svg(360, 800))).png().toBuffer());
    }
    const pages = await Promise.all(loadVarietyEntries(shots).map(loadPrint));
    const r = varietyOf(pages, weights);
    expect(r.distance.withPictures).toBe(3);
    expect(r.distance.pairsWithPhash).toBe(3);
    expect(markdownLine("shots", r)).toContain("first-screen hashes on 3 of 3 pages (3 of 3 pairs)");
  });

  it("the CLI prints a markdown line and the JSON for named sets, and writes --json", async () => {
    const lines: string[] = [];
    const code = await main([`gold=${path.join(dir, "specs")}`, "--json", path.join(dir, "out.json")], (l) => lines.push(l));
    expect(code).toBe(0);
    expect(lines[0]).toMatch(/^\*\*gold\*\* \(3 pages\)/);
    expect(Object.keys(JSON.parse(readFileSync(path.join(dir, "out.json"), "utf8")))).toEqual(["gold"]);
    expect(await main([], (l) => lines.push(l))).toBe(2);
    expect(await main([`x=${path.join(dir, "nope")}`], (l) => lines.push(l))).toBe(1);
  });
});
