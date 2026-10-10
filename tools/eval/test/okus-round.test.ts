import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { buildRound, type BuildResult } from "../src/okus-items.ts";
import { ItemsFile, PairsFile, RoundsIndex, buildPairs, itemsJson, pairsJson, roundDir, roundSources, toItem } from "../src/okus-round.ts";

/**
 * Okus round 1 (docs/plans/design-studio.md §8): which items, in which order, which pairwise questions; all of it
 * deterministic, and the committed tools/okus/rounds/1/{items,pairs}.json in step with the code. Rendering is checked
 * on a small subset (2 references + 1 golden) in Chromium. No model call.
 */
describe("round 1 items", () => {
  const items = roundSources(1).map(toItem);

  it("holds the 19 references, 10 goldens and 3 composed specs, ids unique", () => {
    const count = (k: string) => items.filter((i) => i.kind === k).length;
    expect([count("reference"), count("golden"), count("composed"), count("sketch")]).toEqual([19, 10, 3, 0]);
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
    for (const i of items) expect(existsSync(path.join(roundDir(1), "../../../..", i.source))).toBe(true);
    expect(() => ItemsFile.parse({ round: 1, items })).not.toThrow();
  });

  it("is in a deterministic, mixed order", () => {
    expect(roundSources(1).map((s) => s.id)).toEqual(items.map((i) => i.id));
    // Not grouped by kind: the first ten hold at least two kinds.
    expect(new Set(items.slice(0, 10).map((i) => i.kind)).size).toBeGreaterThanOrEqual(2);
  });

  it("matches the committed items.json and pairs.json", () => {
    const pairs = buildPairs(items, "okus-round-1");
    expect(readFileSync(path.join(roundDir(1), "items.json"), "utf8")).toBe(itemsJson(1, items));
    expect(readFileSync(path.join(roundDir(1), "pairs.json"), "utf8")).toBe(pairsJson(1, pairs));
  });
});

describe("pairwise questions", () => {
  const items = roundSources(1).map(toItem);
  const pairs = buildPairs(items, "okus-round-1");

  it("are about 30, deterministic, valid, each unordered pair once", () => {
    expect(pairs.length).toBe(30);
    expect(buildPairs(items, "okus-round-1")).toEqual(pairs);
    expect(() => PairsFile.parse({ round: 1, pairs })).not.toThrow();
    const ids = new Set(items.map((i) => i.id));
    const keys = new Set<string>();
    for (const p of pairs) {
      expect(ids.has(p.a) && ids.has(p.b)).toBe(true);
      expect(p.a).not.toBe(p.b);
      keys.add([p.a, p.b].sort().join("|"));
    }
    expect(keys.size).toBe(pairs.length);
    expect(pairs.map((p) => p.id)).toEqual(pairs.map((_, i) => `p${String(i + 1).padStart(2, "0")}`));
  });

  it("mix reference vs golden, golden vs composed, within-trade and cross-trade", () => {
    const n = (k: string) => pairs.filter((p) => p.kind === k).length;
    expect(n("reference-golden")).toBe(10);
    expect(n("golden-composed")).toBe(3);
    expect(n("reference-composed")).toBe(3);
    expect(n("within-trade")).toBe(5);
    expect(n("cross-trade")).toBe(9);
    const byId = new Map(items.map((i) => [i.id, i]));
    for (const p of pairs) {
      const [a, b] = [byId.get(p.a)!, byId.get(p.b)!];
      if (p.kind === "within-trade") expect(a.trade).toBe(b.trade);
      if (p.kind === "cross-trade") expect(a.trade).not.toBe(b.trade);
      if (p.kind === "reference-golden" || p.kind === "golden-composed" || p.kind === "reference-composed") expect(a.fixture).toBe(b.fixture);
    }
    // Sides are mixed: references are not always on the left.
    const refLeft = pairs.filter((p) => p.kind === "reference-golden" && p.a.startsWith("ref-")).length;
    expect(refLeft).toBeGreaterThan(0);
    expect(refLeft).toBeLessThan(10);
  });

  it("change with the seed and work on a subset", () => {
    expect(buildPairs(items, "other-seed")).not.toEqual(pairs);
    const sub = items.filter((i) => ["ref-j", "ref-a", "golden-pekarna-kvas"].includes(i.id));
    const p = buildPairs(sub, "okus-round-1");
    expect(p.map((x) => [x.a, x.b].sort().join("|")).sort()).toEqual(["golden-pekarna-kvas|ref-a", "golden-pekarna-kvas|ref-j"]);
  });
});

describe("okus:items on a subset (2 references + 1 golden)", () => {
  let dir: string;
  let result: BuildResult;
  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "sb-okus-test-"));
    result = await buildRound({ round: 1, only: ["ref-j", "ref-a", "golden-pekarna-kvas"], okusDir: dir, localFonts: true });
  }, 240_000);
  afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("writes items.json, pairs.json and the rounds index", async () => {
    const items = ItemsFile.parse(JSON.parse(await readFile(path.join(dir, "rounds/1/items.json"), "utf8")));
    expect(items.items.map((i) => i.id).sort()).toEqual(["golden-pekarna-kvas", "ref-a", "ref-j"]);
    const pairs = PairsFile.parse(JSON.parse(await readFile(path.join(dir, "rounds/1/pairs.json"), "utf8")));
    expect(pairs.pairs.length).toBe(2);
    expect(RoundsIndex.parse(JSON.parse(await readFile(path.join(dir, "rounds/index.json"), "utf8"))).rounds).toEqual([1]);
    expect(result.bytes).toBeLessThan(15 * 1024 * 1024);
  });

  it("renders four JPEGs per item: first screens at 1280×800 and 360×800 (2×), whole pages at most 1600 px wide", async () => {
    for (const item of result.items) {
      const meta = async (rel: string) => sharp(await readFile(path.join(result.dir, rel))).metadata();
      const [desk, deskFull, phone, phoneFull] = await Promise.all([meta(item.images.desk), meta(item.images.deskFull), meta(item.images.phone), meta(item.images.phoneFull)]);
      for (const m of [desk, deskFull, phone, phoneFull]) {
        expect(m.format).toBe("jpeg");
        expect(m.width).toBeLessThanOrEqual(1600);
      }
      expect([desk.width, desk.height]).toEqual([1280, 800]);
      expect([phone.width, phone.height]).toEqual([720, 1600]);
      // A whole page is taller than its first screen (in its own proportions).
      expect(deskFull.height! / deskFull.width!).toBeGreaterThan(800 / 1280);
      expect(phoneFull.height! / phoneFull.width!).toBeGreaterThan(800 / 360);
    }
  });
});
