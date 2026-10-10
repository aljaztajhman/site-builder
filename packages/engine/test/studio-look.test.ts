import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { loadConfig } from "@sb/config";
import { migrateSpec, type SiteSpec } from "@sb/spec";
import { compositionDistance, compositionSignature, hamming, lookDistance, lookPrintOf, paletteDistance, phash, requiredDistance, uniqueEnough, type LookPrint, type UniquenessConfig } from "../src/studio/index.ts";

/** design-studio.md §5.4: the look distance, the gate and the perceptual hash. */
const golden = (id: string): SiteSpec => migrateSpec(JSON.parse(readFileSync(new URL(`../../../tools/eval/golden/${id}.json`, import.meta.url), "utf8")));

const CONFIG: UniquenessConfig = { sameTradeMin: 0.3, sameTownMin: 0.4, weights: { genome: 1, composition: 1, palette: 1, phash: 1, stance: 0.5 } };

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
    expect(lookDistance(a, a, CONFIG.weights).total).toBe(0);
    expect(lookDistance(a, b, CONFIG.weights).total).toBeCloseTo(lookDistance(b, a, CONFIG.weights).total, 10);
    expect(lookDistance(a, b, CONFIG.weights).total).toBeGreaterThan(0.3);
  });

  it("leaves out the parts either side lacks, and uses the hashes and stances when both have them", () => {
    const d = lookDistance(a, b, CONFIG.weights);
    expect(d.parts.phash).toBeNull();
    expect(d.parts.stance).toBeNull();
    const total3 = (d.parts.genome + d.parts.composition + d.parts.palette) / 3;
    expect(d.total).toBeCloseTo(total3, 10);
    const withHash = lookDistance({ ...a, phash360: "0000000000000000", stance: "swiss-grid" }, { ...a, phash360: "ffffffffffffffff", stance: "swiss-grid" }, CONFIG.weights);
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

describe("uniqueEnough", () => {
  const look = lookPrintOf(golden("avtoservis-mrak"), { trade: "car-repair", town: "Celje" });
  const twin = { ...look, town: "Maribor", id: "twin" };
  const otherTrade = { ...lookPrintOf(golden("pekarna-kvas"), { trade: "bakery", town: "Koper" }), id: "bakery" };

  it("fails a look too close to a site of the same trade, and names it", () => {
    const r = uniqueEnough(look, [otherTrade, twin], CONFIG);
    expect(r.ok).toBe(false);
    expect(r.closest?.id).toBe("twin");
    expect(r.distance).toBe(0);
    expect(r.tooClose.map((t) => [t.neighbour.id, t.required])).toEqual([["twin", 0.3]]);
  });

  it("ignores sites of other trades and towns, and passes with no neighbours", () => {
    expect(uniqueEnough(look, [{ ...look, trade: "bakery", town: "Koper", id: "x" }], CONFIG)).toMatchObject({ ok: true, closest: null, distance: null });
    expect(uniqueEnough(look, [], CONFIG).ok).toBe(true);
  });

  it("holds a site in the same town to sameTownMin, the stricter of both when the trade is also the same", () => {
    expect(requiredDistance(look, { trade: "bakery", town: " celje " }, CONFIG)).toBe(0.4);
    expect(requiredDistance(look, { trade: "car-repair", town: "Celje" }, CONFIG)).toBe(0.4);
    expect(requiredDistance(look, { trade: "car-repair", town: null }, CONFIG)).toBe(0.3);
    expect(requiredDistance({ trade: "car-repair", town: null }, { trade: "bakery", town: null }, CONFIG)).toBeNull();
    const sameTownBakery = { ...lookPrintOf(golden("pekarna-kvas"), { trade: "bakery", town: "Celje" }), id: "b" };
    const d = lookDistance(look, sameTownBakery, CONFIG.weights).total;
    expect(uniqueEnough(look, [sameTownBakery], { ...CONFIG, sameTownMin: d + 0.01 }).ok).toBe(false);
    expect(uniqueEnough(look, [sameTownBakery], { ...CONFIG, sameTownMin: d - 0.01 }).ok).toBe(true);
  });

  it("reads the weights and thresholds from config", () => {
    const c = loadConfig().studio.uniqueness;
    expect(c.sameTradeMin).toBeGreaterThan(0);
    expect(c.sameTownMin).toBeGreaterThan(0);
    expect(uniqueEnough(look, [twin], c).ok).toBe(false);
  });
});

/**
 * The calibration (config studio.uniqueness): the goldens and twins replayed free from the homepage recordings with the
 * variety switches off and on. Off, twins on one template and palette are the known look-alikes
 * (eval/variety-2026-10-08.md): the gate must stop them and let the other same-trade pairs through.
 */
describe("calibration on the twins", () => {
  type Print = LookPrint & { id: string; direction: string };
  const prints = JSON.parse(readFileSync(new URL("./fixtures/studio-look-prints.json", import.meta.url), "utf8")) as { off: Print[]; on: Print[] };
  const c = loadConfig().studio.uniqueness;
  const pairs = (ps: Print[]) => {
    const out: { a: Print; b: Print; d: number }[] = [];
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) out.push({ a: ps[i]!, b: ps[j]!, d: lookDistance(ps[i]!, ps[j]!, c.weights).total });
    return out;
  };
  const name = (p: { a: Print; b: Print }) => `${p.a.id} / ${p.b.id}`;
  /** One template, one palette, the same trade: a visitor sees one site twice. */
  const lookAlike = (p: { a: Print; b: Print }) => p.a.trade === p.b.trade && p.a.direction === p.b.direction && paletteDistance(p.a.paletteLab, p.b.paletteLab) < 0.1;

  it("switches off: every look-alike twin fails the same-trade gate, every other same-trade pair passes", () => {
    const same = pairs(prints.off).filter((p) => p.a.trade === p.b.trade);
    const alike = same.filter(lookAlike);
    expect(alike.map(name).sort()).toEqual(
      [
        "avto-kovac / karoserija-hribar",
        "avto-kovac / vulkanizer-zorman",
        "frizerstvo-lana / frizerski-salon-mia",
        "gostilna-pri-mostu / gostisce-na-gricu",
        "gostilna-zlata-zlica / gostilna-pri-mostu",
        "gostilna-zlata-zlica / gostisce-na-gricu",
        "karoserija-hribar / vulkanizer-zorman",
      ].sort(),
    );
    for (const p of alike) expect(p.d, name(p)).toBeLessThan(c.sameTradeMin);
    for (const p of same.filter((x) => !lookAlike(x))) expect(p.d, name(p)).toBeGreaterThanOrEqual(c.sameTradeMin);
  });

  it("switches on: what still fails is one template with a near-equal palette", () => {
    const failing = pairs(prints.on).filter((p) => p.a.trade === p.b.trade && p.d < c.sameTradeMin);
    for (const p of failing) {
      expect(p.a.direction, name(p)).toBe(p.b.direction);
      expect(paletteDistance(p.a.paletteLab, p.b.paletteLab), name(p)).toBeLessThan(0.1);
    }
  });

  it("other trades in one town pass, unless they are one template and palette", () => {
    for (const run of [prints.off, prints.on]) {
      for (const p of pairs(run).filter((x) => x.a.trade !== x.b.trade && x.d < c.sameTownMin)) {
        expect(p.a.direction, name(p)).toBe(p.b.direction);
        expect(paletteDistance(p.a.paletteLab, p.b.paletteLab), name(p)).toBeLessThan(0.2);
      }
    }
  });
});

/** A 1280 × 800 "first screen": a block of `fill` at `x` on a `ground`. */
async function screen(o: { ground: string; fill: string; x: number; w?: number }): Promise<Uint8Array> {
  const block = await sharp({ create: { width: o.w ?? 500, height: 500, channels: 3, background: o.fill } }).png().toBuffer();
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
