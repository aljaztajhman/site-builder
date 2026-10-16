// The pure layout part of pnpm details-sheet (tools/eval/src/details-sheet.ts).
import { describe, expect, it } from "vitest";
import { MAX_PIXELS, pairRows, planPairSheet, type RunRow } from "../src/details-sheet.ts";

const row = (id: string): RunRow => ({ id, desk: `${id}-d.png`, phone: `${id}-p.png` });

describe("pairRows", () => {
  it("pairs the pages both runs have, in the after run's order, and names the rest", () => {
    const r = pairRows([row("a"), row("b"), row("c")], [row("c"), row("a"), row("d")]);
    expect(r.pairs.map((p) => p.id)).toEqual(["c", "a"]);
    expect(r.missing.sort()).toEqual(["b", "d"]);
  });
});

describe("planPairSheet", () => {
  it("puts every pair on exactly one sheet, none above the pixel limit", () => {
    for (const kind of ["desk", "phone"] as const) {
      for (const n of [1, 3, 10, 50]) {
        const plan = planPairSheet(n, kind);
        expect(plan.sheets.flat()).toEqual(Array.from({ length: n }, (_, i) => i));
        for (const h of plan.heights) expect(plan.width * h).toBeLessThanOrEqual(MAX_PIXELS);
      }
    }
  });

  it("splits 50 pages over several sheets and keeps a small set on one", () => {
    expect(planPairSheet(50, "desk").sheets.length).toBeGreaterThan(1);
    expect(planPairSheet(50, "phone").sheets.length).toBeGreaterThan(1);
    expect(planPairSheet(4, "desk").sheets.length).toBe(1);
  });
});
