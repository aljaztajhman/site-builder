import { describe, expect, it, vi } from "vitest";
import { STANCES, validateSite } from "@sb/spec";
import type * as DecisionsModule from "../src/decisions.ts";

// The planner is tested on the draft set it was built for: the decisions before approval round 1 (pilot ratings and
// the starter set). Round 1's rows ("shown on …" / "flagged on …") turned most of those drafts into decisions, which
// leaves little to cover; what the next round would cover is its own question (it-studio-approval-round).
vi.mock("../src/decisions.ts", async (importOriginal) => {
  const orig = await importOriginal<typeof DecisionsModule>();
  const roundOne = /^(shown on|flagged on) p\d/;
  return {
    ...orig,
    shippedDecisions: () => Object.fromEntries(Object.entries(orig.shippedDecisions()).filter(([, d]) => !roundOne.test(d.reason ?? ""))),
  };
});

const { COMPOSER_FIXTURES, approvalPlan, composeHomepage, coverableAssets, fittingStances } = await import("../src/index.ts");

describe("approvalPlan", () => {
  const plan = approvalPlan();

  it("is 30 distinct pages: 9 named (3 fixtures × 3 stances of different families), the rest added for coverage", () => {
    expect(plan.pages).toHaveLength(30);
    const named = plan.pages.filter((p) => p.kind === "named");
    expect(named).toHaveLength(9);
    for (const f of COMPOSER_FIXTURES) {
      const mine = named.filter((p) => p.fixtureId === f);
      expect(mine).toHaveLength(3);
      const families = new Set(mine.map((p) => STANCES.find((s) => s.id === p.stance)!.family));
      expect(families.size).toBe(3);
      for (const p of mine) expect(fittingStances(f).map((s) => s.id)).toContain(p.stance);
    }
    expect(new Set(plan.pages.map((p) => `${p.fixtureId}|${p.stance}|${p.seed}`)).size).toBe(30);
    expect(new Set(plan.pages.map((p) => `${p.fixtureId}|${p.stance}`)).size).toBe(30);
  });

  it("is deterministic; every page validates, the named ones rebuild from their entry", () => {
    const again = approvalPlan({ count: 12 });
    expect(again.pages).toEqual(plan.pages.slice(0, 12));
    expect(JSON.stringify(again.results)).toBe(JSON.stringify(plan.results.slice(0, 12)));
    for (const [i, p] of plan.pages.entries()) {
      expect(validateSite(plan.results[i]!.spec).issues, `${p.fixtureId} ${p.stance}`).toEqual([]);
      if (p.kind === "named") expect(JSON.stringify(composeHomepage({ fixtureId: p.fixtureId, stance: p.stance, seed: p.seed, catalogue: "drafts" }))).toBe(JSON.stringify(plan.results[i]!.spec));
    }
  }, 60_000);

  it("shows most draft presets, many palettes and drawings (floors, so a regression is noticed)", () => {
    const c = plan.coverage;
    const all = coverableAssets();
    expect(c.compositions.total).toBe(all.compositions.length);
    expect(c.compositions.covered).toBeGreaterThanOrEqual(100);
    expect(c.palettes.covered).toBeGreaterThanOrEqual(24);
    // Rated pilot drawings (decisions.json) are no longer drafts; every remaining draft drawing is shown.
    expect(c.drawings.covered).toBe(all.drawings.length);
    expect(c.wordmarks.covered).toBeGreaterThanOrEqual(5);
    expect(c.stances.covered).toBe(30);
    // The 88 inventory pairs can't be set in a spec yet: the pages show none of them.
    expect(c.pairings.covered).toBe(0);
  });
}, 120_000);
