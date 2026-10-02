import { describe, expect, it } from "vitest";
import {
  BusinessType,
  DIRECTIONS,
  FONT_PAIRS,
  Imagery,
  checkDesign,
  fontPair,
  isCreamOrOffWhite,
  isWarmCream,
  type Design,
  type Direction,
} from "../src/index.ts";

/** A design built from the direction's fallback palette and the lower bound of every range. */
function lowerBoundDesign(d: Direction, fontPairId = d.fontPairs[0]!): Design {
  return {
    direction: d.id,
    fontPair: fontPairId,
    colors: d.palette.fallback,
    radius: d.ranges.radius[0],
    baseFontSize: d.ranges.baseFontSize[0],
    scale: d.ranges.scale[0],
    headingWeight: d.ranges.headingWeight[0],
    headingCase: d.ranges.headingCase[0]!,
    headingTracking: d.ranges.headingTracking[0],
    density: d.ranges.density[0]!,
    shadow: d.ranges.shadow[0]!,
    imagery: d.imagery,
  };
}

const SCHEMA_LIMITS = {
  radius: [0, 12],
  baseFontSize: [16, 19],
  scale: [1.125, 1.414],
  headingWeight: [400, 900],
  headingTracking: [-0.04, 0.08],
} as const;

describe("design directions", () => {
  it("has at least 8 directions with unique ids", () => {
    expect(DIRECTIONS.length).toBeGreaterThanOrEqual(8);
    expect(new Set(DIRECTIONS.map((d) => d.id)).size).toBe(DIRECTIONS.length);
    for (const d of DIRECTIONS) expect(d.id).toMatch(/^[a-z-]+$/);
  });

  it("references valid font pairs and uses every pair at least once", () => {
    for (const d of DIRECTIONS) {
      expect(d.fontPairs.length).toBeGreaterThanOrEqual(1);
      expect(d.fontPairs.length).toBeLessThanOrEqual(2);
      for (const p of d.fontPairs) expect(() => fontPair(p)).not.toThrow();
    }
    const used = new Set(DIRECTIONS.flatMap((d) => d.fontPairs));
    expect(FONT_PAIRS.map((p) => p.id).filter((id) => !used.has(id))).toEqual([]);
  });

  it("uses every imagery treatment at least once", () => {
    const used = new Set(DIRECTIONS.map((d) => d.imagery));
    expect(Imagery.options.filter((i) => !used.has(i))).toEqual([]);
  });

  it("covers every business type at least twice", () => {
    for (const t of BusinessType.options) {
      const n = DIRECTIONS.filter((d) => d.bestFor.includes(t)).length;
      expect(n, t).toBeGreaterThanOrEqual(2);
    }
  });

  it("has no two directions with the same font pair, background kind and imagery", () => {
    const seen = new Set<string>();
    for (const d of DIRECTIONS)
      for (const p of d.fontPairs) {
        const key = `${p}|${d.palette.background}|${d.imagery}`;
        expect(seen.has(key), key).toBe(false);
        seen.add(key);
      }
  });

  for (const d of DIRECTIONS) {
    describe(d.id, () => {
      it("has well-formed ranges inside the Design schema limits", () => {
        for (const key of Object.keys(SCHEMA_LIMITS) as (keyof typeof SCHEMA_LIMITS)[]) {
          const [lo, hi] = d.ranges[key];
          const [min, max] = SCHEMA_LIMITS[key];
          expect(lo, `${key} lo <= hi`).toBeLessThanOrEqual(hi);
          expect(lo, `${key} >= ${min}`).toBeGreaterThanOrEqual(min);
          expect(hi, `${key} <= ${max}`).toBeLessThanOrEqual(max);
        }
        expect(d.ranges.headingCase.length).toBeGreaterThan(0);
        expect(d.ranges.density.length).toBeGreaterThan(0);
        expect(d.ranges.shadow.length).toBeGreaterThan(0);
        expect(Number.isInteger(d.ranges.radius[0]) && Number.isInteger(d.ranges.radius[1])).toBe(true);
        expect(d.palette.primarySaturation[0]).toBeLessThanOrEqual(d.palette.primarySaturation[1]);
        if (d.palette.primaryHue) expect(d.palette.primaryHue[0]).toBeLessThanOrEqual(d.palette.primaryHue[1]);
      });

      it("keeps heading weights inside every heading font's weight axis", () => {
        for (const p of d.fontPairs) {
          const [wLo, wHi] = fontPair(p).heading.weights;
          expect(d.ranges.headingWeight[0], p).toBeGreaterThanOrEqual(wLo);
          expect(d.ranges.headingWeight[1], p).toBeLessThanOrEqual(wHi);
        }
      });

      it("has a fallback palette that passes every design check", () => {
        for (const p of d.fontPairs) expect(checkDesign(lowerBoundDesign(d, p), d)).toEqual([]);
        const hi: Design = {
          ...lowerBoundDesign(d),
          radius: d.ranges.radius[1],
          baseFontSize: d.ranges.baseFontSize[1],
          scale: d.ranges.scale[1],
          headingWeight: d.ranges.headingWeight[1],
          headingTracking: d.ranges.headingTracking[1],
        };
        expect(checkDesign(hi, d)).toEqual([]);
      });

      it("never uses a cream page or section background", () => {
        expect(isCreamOrOffWhite(d.palette.fallback.background)).toBe(false);
        expect(isWarmCream(d.palette.fallback.surface)).toBe(false);
      });

      it("has a summary for the model and valid layout references", () => {
        expect(d.summary.length).toBeGreaterThan(80);
        expect(d.summary.split(/[.!?](\s|$)/).filter((s) => s.trim().length > 0).length).toBeLessThanOrEqual(3);
        for (const v of [...d.layout.heroes, ...d.layout.prefer]) expect(v).toMatch(/^[a-z-]+:[a-z-]+$/);
        expect(d.layout.heroes.length).toBeGreaterThan(0);
      });
    });
  }
});
