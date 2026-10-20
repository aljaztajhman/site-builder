import { describe, expect, it } from "vitest";
import { easeInOut, reelProgress, reelScrollFraction, sectionVars } from "../capture.ts";

describe("promo capture", () => {
  it("maps sections to the reel's strip variables the way the homepage's bakery strip does", () => {
    // Two of the bakery strip's sections (infra/coming-soon/site/index.html): tm 3.59/hm 15.25 → ym 4.236, tm 83.29/hm 16.71 → ym 100.
    const [a, b] = sectionVars([
      { top: 71.8, height: 305 },
      { top: 1665.8, height: 334.2 },
    ]);
    expect(a!.tm).toBeCloseTo(3.59, 2);
    expect(a!.hm).toBeCloseTo(15.25, 2);
    expect(a!.ym).toBeCloseTo(4.236, 2);
    expect(b!.ym).toBeCloseTo(100, 2);
  });

  it("clips sections to the strip and drops those below it", () => {
    const v = sectionVars([
      { top: 1800, height: 600 },
      { top: 2100, height: 300 },
    ]);
    expect(v).toHaveLength(1);
    expect(v[0]!.hm).toBeCloseTo(10, 5);
  });

  it("inverts the reel's scroll mapping", () => {
    // The page maps scroll q0 to progress p: q0 < .405 → p = q0/.405 × .29, else .29 + (q0 − .405)/.595 × .71.
    const forward = (q0: number) => (q0 < 0.405 ? (q0 / 0.405) * 0.29 : 0.29 + ((q0 - 0.405) / 0.595) * 0.71);
    for (const p of [0, 0.1, 0.29, 0.4, 0.555, 1]) expect(forward(reelScrollFraction(p))).toBeCloseTo(p, 6);
  });

  it("moves the reel forward only, from typing to live", () => {
    const ps = Array.from({ length: 301 }, (_, i) => reelProgress((i / 300) * 10, 10));
    expect(ps[0]).toBeCloseTo(0.11, 5);
    expect(ps.at(-1)).toBeCloseTo(0.555, 5);
    for (let i = 1; i < ps.length; i++) expect(ps[i]!).toBeGreaterThanOrEqual(ps[i - 1]! - 1e-9);
  });

  it("eases the site scroll in and out", () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(0.5)).toBeCloseTo(0.5);
    expect(easeInOut(1)).toBe(1);
  });
});
