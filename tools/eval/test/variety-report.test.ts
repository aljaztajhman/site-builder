import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { migrateSpec, type SiteSpec } from "@sb/spec";
import { lookFeatures } from "../src/look-distance.ts";
import type { JudgeOutput, JudgeScores } from "../src/judge.ts";
import type { FixtureResult } from "../src/runner.ts";
import { renderVariety, templateTrade, varietyData, varietyTargets } from "../src/variety-report.ts";
import { renderCompare } from "../src/variety-compare.ts";

/** The variety targets of an eval run and the before/after report of two runs (docs/plans/variety-engine.md, Step 0). */
const here = path.dirname(fileURLToPath(import.meta.url));
const golden = (id: string) => migrateSpec(JSON.parse(readFileSync(path.join(here, "../golden", `${id}.json`), "utf8"))) as SiteSpec;

const scores = (n: number, distinct = n): JudgeScores => ({ impression: n, hierarchy: n, imagery: n, spacing: n, clutter: n, distinctiveness: distinct });
const judged = (n: number, distinct = n): JudgeOutput => ({ phone: scores(n, distinct), desktop: scores(n, distinct), phoneNote: "", desktopNote: "", fixes: [] });

function result(id: string, type: string, spec: SiteSpec, judge: JudgeOutput | null, extra: Partial<FixtureResult> = {}): FixtureResult {
  return {
    id,
    type,
    look: { site: { id, trade: type, features: lookFeatures(spec) }, brand: { kind: "no-logo" }, motif: "no-motif" },
    judge,
    judgeEur: 0,
    generationEur: 0.09,
    checkpoints: [{ failures: [] }],
    ...extra,
  } as unknown as FixtureResult;
}

describe("variety targets", () => {
  const mrak = golden("avtoservis-mrak");
  const twin = structuredClone(mrak);
  const blue = structuredClone(mrak);
  blue.design.colors.primary = "#1f4e9c";
  blue.design.colors.band = "#1f4e9c";
  const kvas = golden("pekarna-kvas");

  it("knows the template trades", () => {
    expect(templateTrade("car-repair")).toBe(true);
    expect(templateTrade("not-a-trade")).toBe(false);
  });

  it("flags a same-trade collision, a site under distinctiveness 3 and medians under today's", () => {
    const d = varietyData(
      [result("mrak", "car-repair", mrak, judged(3)), result("twin", "car-repair", twin, judged(3, 2)), result("blue", "car-repair", blue, judged(3)), result("kvas", "bakery", kvas, judged(4))],
      { mode: "record-missing", scope: "home", startedAt: new Date("2026-10-08T07:00:00Z"), switches: [] },
    );
    expect(d.summary.collisionsWithinTrade).toEqual(["mrak / twin"]);
    expect(d.judge.belowDistinctiveness).toEqual(["twin"]);
    expect(d.judge.minDistinctiveness).toBe(2);
    // Phone and desktop means of 3 and of (5×3 + 2)/6 for the twin: the median of 3, 2.83, 3, 4 is 3.
    expect(d.judge.median).toBeCloseTo(3, 9);
    expect(d.judge.medianTemplate).toBeCloseTo(3, 9);
    const met = Object.fromEntries(d.targets.map((t) => [t.name, t.met]));
    expect(met).toEqual({
      "Look distance within a trade ≥ across trades": d.summary.withinTradeAll! >= 0.47,
      "No two sites of one trade share palette, font pair and hero": false,
      "Judge distinctiveness ≥ 3 on every site (lower of phone and desktop)": false,
      "Judge median (mean of phone and desktop)": false,
      "Judge median on the template trades": false,
    });
  });

  it("measures the look distance against the baseline's across-trade number when it has one", () => {
    const d = varietyData([result("mrak", "car-repair", mrak, judged(4)), result("blue", "car-repair", blue, judged(4)), result("kvas", "bakery", kvas, judged(4))], {
      mode: "record-missing",
      scope: "home",
      startedAt: new Date(),
      switches: ["families"],
    });
    const within = d.summary.withinTradeAll!;
    expect(varietyTargets(d, within - 0.01)[0]!.met).toBe(true);
    expect(varietyTargets(d, within + 0.01)[0]!.met).toBe(false);
    expect(varietyTargets(d, within + 0.01)[0]!.target).toContain("the baseline's");
    expect(d.targets.slice(1).every((t) => t.met)).toBe(true);
  });

  it("reports Druga podoba and Ustvari znova, and the same look coming back", () => {
    const features = lookFeatures(mrak);
    const rs = [
      result("mrak", "car-repair", mrak, null, { anotherLook: { ok: true, look: "p2, a, b", distance: 0.3, failures: [], valid: true }, regenerated: { distance: 0.02, eur: 0.08, failures: [], features } }),
      result("kvas", "bakery", kvas, null, { anotherLook: { ok: false, reason: "no_family" } }),
    ];
    const d = varietyData(rs, { mode: "record-missing", scope: "home", startedAt: new Date(), switches: ["families"] });
    expect(d.anotherLook).toMatchObject({ measured: 2, ok: 1, meanDistance: 0.3, failing: [], none: ["kvas (no_family)"] });
    expect(d.regenerated).toMatchObject({ measured: 1, meanDistance: 0.02, sameLook: ["mrak"], eur: 0.08 });
    const md = renderVariety(rs, { mode: "record-missing", scope: "home", startedAt: new Date(), switches: ["families"], label: "on" });
    expect(md).toContain("Variety switches on: **families** (run on).");
    expect(md).toContain("Druga podoba (no model call): 1 of 2 sites got another look, mean distance from the generated look **0.30**");
    expect(md).toContain("the same look again: mrak");
  });

  it("compares two runs site by site", () => {
    const before = varietyData([result("mrak", "car-repair", mrak, judged(3)), result("twin", "car-repair", twin, judged(3)), result("kvas", "bakery", kvas, judged(3))], {
      mode: "record-missing",
      scope: "home",
      startedAt: new Date("2026-10-08T07:00:00Z"),
      switches: [],
      label: "off",
    });
    const after = varietyData([result("mrak", "car-repair", mrak, judged(4)), result("twin", "car-repair", blue, judged(4))], {
      mode: "record-missing",
      scope: "home",
      startedAt: new Date("2026-10-08T09:00:00Z"),
      switches: ["families", "skeleton"],
      label: "on",
    });
    const md = renderCompare(before, after);
    expect(md).toContain("After: **families, skeleton**");
    expect(md).toContain(`≥ ${before.summary.acrossTrades!.toFixed(2)} (the baseline's across-trade distance)`);
    expect(md).toMatch(/\| twin \| car-repair \| .* \| 3\.00 → 4\.00 \|/);
    expect(md).not.toMatch(/\| kvas \| bakery \|/);
  });
});
