import { describe, expect, it } from "vitest";
import { loadFixtures, loadFresh, loadHard, loadTwins } from "../src/fixtures/load.ts";
import { fixtureBusinessType } from "../src/outside-review.ts";

/**
 * Fresh businesses (tools/eval/fresh): never generated before, for a first look at new input (`pnpm eval --fresh`). They
 * stay out of the fixture counts and CI's offline run; their ids and trades must be new.
 */
describe("fresh businesses", () => {
  const fresh = loadFresh();
  const earlier = [...loadFixtures(), ...loadTwins(), ...loadHard()];

  it("load and validate, ten of them, no photos given, each fact in the owner's own words", () => {
    expect(fresh).toHaveLength(10);
    for (const f of fresh) {
      expect(f.photos, f.id).toEqual([]);
      const d = f.brief.description;
      for (const s of [...(f.brief.facts.other ?? []), ...(f.brief.facts.prices ?? []).map((p) => p.item), f.brief.facts.address?.street ?? ""]) {
        if (s) expect(d, `${f.id}: ${s}`).toContain(s);
      }
    }
  });

  it("are new: no id or trade used by the fixtures, twins or hard ones", () => {
    const ids = new Set(earlier.map((f) => f.id));
    const trades = new Set(earlier.map((f) => f.brief.trade).filter(Boolean));
    for (const f of fresh) {
      expect(ids.has(f.id), f.id).toBe(false);
      expect(trades.has(f.brief.trade), `${f.id}: ${f.brief.trade}`).toBe(false);
    }
    expect(new Set(fresh.map((f) => f.brief.trade)).size).toBe(10);
  });

  it("tell the outside reviewers their trade", () => {
    expect(fixtureBusinessType("urarstvo-tic")).toBe("shop, urar");
  });
});
