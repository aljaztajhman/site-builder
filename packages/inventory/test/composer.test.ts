import { describe, expect, it } from "vitest";
import { FONT_PAIRS, STANCES, validateSite } from "@sb/spec";
import { COMPOSER_FIXTURES, ComposerError, approvalPlan, composeHomepage, composeHomepageDetailed, coverableAssets, fittingStances, inventory } from "../src/index.ts";

/**
 * The preset composer (studio-phase2-design.md P4a): a homepage per (fixture, stance, seed) from the inventory's presets,
 * palettes and pairings, no model call. Deterministic, 0 guard issues, the approval set covers the drafts. No facts check
 * here (that needs the engine): tools/eval/test/composer.test.ts does it, and the browser checks.
 */
const SEEDS = [1, 7, 42] as const;

describe("composeHomepage", () => {
  it.each(COMPOSER_FIXTURES.flatMap((f) => [0, 1, 2].map((i) => [f, fittingStances(f)[i * 7]!.id] as const)))("%s under %s: byte-identical for the same input, different for another seed", (fixtureId, stance) => {
    const a = JSON.stringify(composeHomepage({ fixtureId, stance, seed: 7, catalogue: "drafts" }));
    expect(JSON.stringify(composeHomepage({ fixtureId, stance, seed: 7, catalogue: "drafts" }))).toBe(a);
    const others = SEEDS.filter((s) => s !== 7).map((seed) => JSON.stringify(composeHomepage({ fixtureId, stance, seed, catalogue: "drafts" })));
    expect(others.some((o) => o !== a)).toBe(true);
  });

  it.each(COMPOSER_FIXTURES.flatMap((f) => SEEDS.map((seed) => [f, seed] as const)))("%s seed %i: every fitting stance validates with 0 issues, in spec v21, from presets only", (fixtureId, seed) => {
    for (const st of fittingStances(fixtureId)) {
      const { spec, used } = composeHomepageDetailed({ fixtureId, stance: st.id, seed, catalogue: "drafts" });
      const v = validateSite(spec);
      expect(v.issues, `${st.id}: ${v.issues.map((i) => `${i.path} ${i.message}`).join("; ")}`).toEqual([]);
      expect(spec.specVersion).toBe(21);
      const home = spec.pages.find((p) => p.kind === "home")!;
      expect(home.sections.length).toBeGreaterThanOrEqual(3);
      expect(home.sections.every((s) => s.type === "composed")).toBe(true);
      expect(used.presets).toHaveLength(home.sections.length);
      expect(spec.design.art).toBeUndefined();
      expect(spec.design.seed).toBe(seed.toString(36).padStart(6, "0"));
      expect(spec.assets.logo).toBeUndefined();
    }
  }, 60_000);

  it("takes its palette and pairing from the catalogue, favouring the stance's own", () => {
    const reg = inventory();
    const { used } = composeHomepageDetailed({ fixtureId: "avtoservis-mrak", stance: "workshop-docket", seed: 3, catalogue: "drafts" });
    expect(reg.byId(used.palette)?.kind).toBe("palette");
    expect(reg.byId(used.pairing)?.kind).toBe("pairing");
    const stance = STANCES.find((s) => s.id === "workshop-docket")!;
    expect(stance.axes.type).toContain(used.pairing.replace("pairing/", ""));
  });

  it("sets only pairings a spec can render (the starter pairs; inventory pairs have no type system yet)", () => {
    const starter = new Set(FONT_PAIRS.map((p) => p.id));
    for (const seed of [1, 2, 3, 4, 5]) {
      const { spec } = composeHomepageDetailed({ fixtureId: "pekarna-kvas", stance: fittingStances("pekarna-kvas")[seed]!.id, seed, catalogue: "drafts" });
      expect(starter.has(spec.design.fontPair)).toBe(true);
    }
  });

  it("refuses a stance that does not fit the trade, an unknown stance and a bad seed", () => {
    const never = STANCES.find((s) => s.trades.never.includes("bakery"))!;
    expect(() => composeHomepage({ fixtureId: "pekarna-kvas", stance: never.id, seed: 1, catalogue: "drafts" })).toThrow(ComposerError);
    expect(() => composeHomepage({ fixtureId: "pekarna-kvas", stance: "no-such-stance", seed: 1, catalogue: "drafts" })).toThrow(/unknown stance/);
    expect(() => composeHomepage({ fixtureId: "pekarna-kvas", stance: "seed-packet", seed: -1, catalogue: "drafts" })).toThrow(ComposerError);
    expect(() => composeHomepage({ fixtureId: "no-such-fixture", stance: "seed-packet", seed: 1, catalogue: "drafts" })).toThrow();
  });

  it("the approved catalogue uses approved assets only (today: no approved composition, so it refuses rather than falling back to drafts)", () => {
    const reg = inventory();
    const approvedPresets = reg.byKind("composition").filter((a) => a.status === "approved");
    if (approvedPresets.length === 0) {
      expect(() => composeHomepage({ fixtureId: "pekarna-kvas", stance: "seed-packet", seed: 1, catalogue: "approved" })).toThrow(/approved hero/);
      return;
    }
    const { used } = composeHomepageDetailed({ fixtureId: "pekarna-kvas", stance: "seed-packet", seed: 1, catalogue: "approved" });
    for (const id of [...used.presets, used.palette, used.pairing]) expect(reg.byId(id)?.status, id).toBe("approved");
  });

  it("prefer steers the picks without breaking the result", () => {
    const plain = composeHomepageDetailed({ fixtureId: "pekarna-kvas", stance: "seed-packet", seed: 5, catalogue: "drafts" });
    const target = plain.used.palette === "palette/linocut" ? "palette/seed-packet-bean" : "palette/linocut";
    const steered = composeHomepageDetailed({ fixtureId: "pekarna-kvas", stance: "seed-packet", seed: 5, catalogue: "drafts", prefer: [target] });
    expect(validateSite(steered.spec).ok).toBe(true);
    expect(steered.used.palette).not.toBe(plain.used.palette);
  });
});

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
