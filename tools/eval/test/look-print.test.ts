import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { migrateSpec, type SiteSpec } from "@sb/spec";
import { compositionDistance, compositionSignature, hamming, lookDistance, lookPrintOf, paletteDistance, phash, type LookPrint } from "../src/look-print.ts";

/** The look distance and perceptual hash `pnpm variety` measures sets by (moved from the engine's studio, 2026-10-19). */
const golden = (id: string): SiteSpec => migrateSpec(JSON.parse(readFileSync(new URL(`../golden/${id}.json`, import.meta.url), "utf8")));

describe("composition signature", () => {
  it("lists the homepage's sections as intent:type/variant", () => {
    const sig = compositionSignature(golden("avtoservis-mrak"));
    expect(sig.split(" ").length).toBeGreaterThan(2);
    for (const t of sig.split(" ")) expect(t).toMatch(/^[a-z-]+:[a-z-]+\/[a-z0-9-]+$/);
  });

  it("measures edit distance, half for another layout of the same intent", () => {
    expect(compositionDistance("opener:a/x offer:b/y", "opener:a/x offer:b/y")).toBe(0);
    expect(compositionDistance("opener:a/x offer:b/y", "opener:a/z offer:b/y")).toBe(0.25);
    expect(compositionDistance("opener:a/x offer:b/y", "contact:c/x offer:b/y")).toBe(0.5);
    expect(compositionDistance("opener:a/x", "")).toBe(1);
    expect(compositionDistance("", "")).toBe(0);
  });
});

describe("lookDistance", () => {
  const a = lookPrintOf(golden("avtoservis-mrak"), { trade: "car-repair", town: "Celje" });
  const b = lookPrintOf(golden("pekarna-kvas"), { trade: "bakery", town: "Celje" });

  it("is 0 for the same look and symmetric", () => {
    expect(lookDistance(a, a).total).toBe(0);
    expect(lookDistance(a, b).total).toBeCloseTo(lookDistance(b, a).total, 10);
    expect(lookDistance(a, b).total).toBeGreaterThan(0.3);
  });

  it("leaves out the parts either side lacks, and uses the hashes and stances when both have them", () => {
    const d = lookDistance(a, b);
    expect(d.parts.phash).toBeNull();
    expect(d.parts.stance).toBeNull();
    expect(d.total).toBeCloseTo((d.parts.genome + d.parts.composition + d.parts.palette) / 3, 10);
    const withHash = lookDistance({ ...a, phash360: "0000000000000000", stance: "swiss-grid" }, { ...a, phash360: "ffffffffffffffff", stance: "swiss-grid" });
    expect(withHash.parts.phash).toBe(1);
    expect(withHash.parts.stance).toBe(0);
    expect(withHash.total).toBeCloseTo(1 / 4.5, 10);
  });

  it("palette distance: 0 for the same colours, 1 for opposite ones", () => {
    expect(paletteDistance(a.paletteLab, a.paletteLab)).toBe(0);
    const black: LookPrint["paletteLab"] = { background: [0, 0, 0], primary: [0, 0, 0], band: [0, 0, 0], accent: [0, 0, 0] };
    const white: LookPrint["paletteLab"] = { background: [100, 0, 0], primary: [100, 0, 0], band: [100, 0, 0], accent: [100, 0, 0] };
    expect(paletteDistance(black, white)).toBe(1);
  });
});

/** A 1280 × 800 "first screen": a block of `fill` at `x` on a `ground`. */
async function screen(o: { ground: string; fill: string; x: number }): Promise<Uint8Array> {
  const block = await sharp({ create: { width: 500, height: 500, channels: 3, background: o.fill } }).png().toBuffer();
  return new Uint8Array(
    await sharp({ create: { width: 1280, height: 800, channels: 3, background: o.ground } })
      .composite([{ input: block, left: o.x, top: 150 }])
      .png()
      .toBuffer(),
  );
}

describe("phash", () => {
  it("is 16 hex characters, stable for the same image, and close for the same layout in other colours", async () => {
    const left = await screen({ ground: "#ffffff", fill: "#1a1a1a", x: 80 });
    const h = await phash(left);
    expect(h).toMatch(/^[0-9a-f]{16}$/);
    expect(await phash(left)).toBe(h);
    expect(await phash(new Uint8Array(await sharp(left).jpeg({ quality: 70 }).toBuffer()))).toSatisfy((x: string) => hamming(x, h) <= 4);
    const recoloured = await phash(await screen({ ground: "#fff8e0", fill: "#7a2e3a", x: 80 }));
    expect(hamming(recoloured, h)).toBeLessThanOrEqual(6);
  });

  it("differs for a different layout", async () => {
    const left = await phash(await screen({ ground: "#ffffff", fill: "#1a1a1a", x: 80 }));
    const right = await phash(await screen({ ground: "#ffffff", fill: "#1a1a1a", x: 700 }));
    expect(hamming(left, right)).toBeGreaterThanOrEqual(10);
  });

  it("hamming counts differing bits", () => {
    expect(hamming("0000000000000000", "0000000000000000")).toBe(0);
    expect(hamming("0000000000000000", "ffffffffffffffff")).toBe(64);
    expect(hamming("0f00000000000000", "0000000000000001")).toBe(5);
    expect(() => hamming("00", "000")).toThrow();
  });
});
