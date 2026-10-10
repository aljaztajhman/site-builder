import { describe, expect, it } from "vitest";
import { BusinessType, CARDS, REFERENCES, STANCES, type Stance } from "@sb/spec";
import { ANGLES, GOALS } from "../src/concept.ts";
import { siteSeed } from "../src/variety.ts";
import { MAX_PER_FAMILY, conceptWeight, dealCards, dealReferences, dealStances, designSeed, seedNumber, stanceFits } from "../src/studio/index.ts";

/** design-studio.md §5.1–5.3: the seed and what it deals. */
describe("designSeed", () => {
  it("is the variety engine's site seed in base 36 for generation 0, and moves with each generation", () => {
    const s0 = designSeed("site_abc", 0);
    expect(s0).toMatch(/^[a-z0-9]{6,12}$/);
    expect(seedNumber(s0)).toBe(siteSeed("site_abc"));
    expect(designSeed("site_abc", 0)).toBe(s0);
    const gens = [0, 1, 2, 3, 4].map((g) => designSeed("site_abc", g));
    expect(new Set(gens).size).toBe(5);
    for (const g of gens) expect(g).toMatch(/^[a-z0-9]{6,12}$/);
    expect(designSeed("site_abd", 0)).not.toBe(s0);
    expect(() => designSeed("site_abc", -1)).toThrow();
  });
});

/** A synthetic deck: three print stances fit for bakeries, so the family cap shows. */
const base = STANCES.find((s) => s.id === "seed-packet")!;
const mk = (id: string, family: Stance["family"], extra: Partial<Stance> = {}): Stance => ({ ...base, id, family, trades: { fit: ["bakery", "shop"], never: [] }, cues: undefined, ...extra });
const DECK: Stance[] = [
  mk("p1", "print"),
  mk("p2", "print"),
  mk("p3", "print"),
  mk("p4", "print"),
  mk("s1", "signage"),
  mk("c1", "craft"),
  mk("m1", "modernist"),
  mk("never-bakery", "place", { trades: { fit: ["*"], never: ["bakery"] } }),
  mk("only-dental", "contemporary", { trades: { fit: ["dental"], never: [] } }),
];

describe("dealStances", () => {
  const input = { seed: "k3x9q2a", trade: "bakery" as const, neighbours: [], previous: [] };

  it("is deterministic: the same inputs deal the same stances in the same order", () => {
    const a = dealStances(input).map((s) => s.id);
    expect(dealStances(input).map((s) => s.id)).toEqual(a);
    expect(dealStances({ ...input, deck: DECK }).map((s) => s.id)).toEqual(dealStances({ ...input, deck: DECK }).map((s) => s.id));
  });

  it("different seeds deal different orders", () => {
    const deals = new Set(Array.from({ length: 20 }, (_, i) => dealStances({ ...input, seed: designSeed(`site_${i}`, 0), count: 3 }).map((s) => s.id).join(",")));
    expect(deals.size).toBeGreaterThan(3);
  });

  it("keeps to the trade: never-list out, only fitting stances in", () => {
    for (const trade of BusinessType.options) {
      for (let i = 0; i < 10; i++) {
        const dealt = dealStances({ ...input, trade, seed: designSeed(`site_${i}`, 0) });
        for (const s of dealt) {
          expect(s.trades.never, `${trade} ${s.id}`).not.toContain(trade);
          expect(stanceFits(s, trade)).toBe(true);
        }
      }
    }
    const dealt = dealStances({ ...input, deck: DECK, count: 10 }).map((s) => s.id);
    expect(dealt).not.toContain("never-bakery");
    expect(dealt).not.toContain("only-dental");
  });

  it("deals at most two stances of one family, even when that leaves the deal short", () => {
    for (let i = 0; i < 30; i++) {
      const dealt = dealStances({ ...input, deck: DECK, seed: designSeed(`site_${i}`, 0) });
      const counts = new Map<string, number>();
      for (const s of dealt) counts.set(s.family, (counts.get(s.family) ?? 0) + 1);
      for (const [f, n] of counts) expect(n, f).toBeLessThanOrEqual(MAX_PER_FAMILY);
      // print 2 + signage + craft + modernist = 5 of 6 asked.
      expect(dealt).toHaveLength(5);
    }
    for (let i = 0; i < 30; i++) {
      const dealt = dealStances({ ...input, trade: "shop", seed: designSeed(`site_${i}`, 0) });
      const counts = new Map<string, number>();
      for (const s of dealt) counts.set(s.family, (counts.get(s.family) ?? 0) + 1);
      for (const n of counts.values()) expect(n).toBeLessThanOrEqual(MAX_PER_FAMILY);
    }
  });

  it("deals the neighbours' stances less often", () => {
    const first = (neighbours: { stance: string }[]) => {
      let n = 0;
      for (let i = 0; i < 400; i++) if (dealStances({ ...input, deck: DECK, neighbours, seed: designSeed(`site_${i}`, 0), count: 1 })[0]!.id === "s1") n++;
      return n;
    };
    const free = first([]);
    const used = first([{ stance: "s1" }, { stance: "s1" }]);
    expect(free).toBeGreaterThan(40);
    expect(used).toBeLessThan(free / 3);
  });

  it("leaves out the previous generations' stances while others remain, and falls back to them when not", () => {
    for (let i = 0; i < 20; i++) {
      const seed = designSeed(`site_${i}`, 1);
      const dealt = dealStances({ ...input, deck: DECK, seed, previous: ["s1", "c1"], count: 3 }).map((s) => s.id);
      expect(dealt).not.toContain("s1");
      expect(dealt).not.toContain("c1");
    }
    // Five fit within the family cap; with three of them previous, the deal of five needs them back.
    const dealt = dealStances({ ...input, deck: DECK, previous: ["s1", "c1", "m1"], count: 5 }).map((s) => s.id);
    expect(dealt).toHaveLength(5);
    expect(dealt.slice(0, 2).every((id) => id.startsWith("p"))).toBe(true);
    expect(dealt.slice(2).sort()).toEqual(["c1", "m1", "s1"]);
  });

  it("weights stances by the concept: goal, angle, materials in their Slovene forms, a local anchor", () => {
    const karst = STANCES.find((s) => s.id === "karst-stone")!;
    expect(conceptWeight(karst, undefined)).toBe(1);
    const w = conceptWeight(karst, { goal: "visit", angle: "place", materials: ["kraški teran", "pršuta"], localAnchor: "Štanjel" });
    expect(w).toBeCloseTo(1 + 0.5 + 0.5 + 0.75 * 2 + 0.5);
    expect(conceptWeight(karst, { goal: "call", angle: "speed", materials: ["guma"], localAnchor: null })).toBe(1);
    // Over many seeds a fitting concept puts the stance first more often.
    const firsts = (concept: Parameters<typeof dealStances>[0]["concept"]) =>
      Array.from({ length: 300 }, (_, i) => dealStances({ seed: designSeed(`site_${i}`, 0), trade: "restaurant", concept, neighbours: [], previous: [], count: 1 })[0]!.id).filter((id) => id === "karst-stone").length;
    expect(firsts({ goal: "visit", angle: "place", materials: ["teran", "pršut"], localAnchor: "Štanjel" })).toBeGreaterThan(firsts(undefined) * 1.5);
  });

  it("the starter deck's cues use the concept's goals and angles", () => {
    for (const s of STANCES) {
      for (const g of s.cues?.goals ?? []) expect(GOALS as readonly string[], s.id).toContain(g);
      for (const a of s.cues?.angles ?? []) expect(ANGLES as readonly string[], s.id).toContain(a);
    }
  });
});

describe("dealCards", () => {
  it("deals n distinct cards by seed, deterministically, only those that apply", () => {
    const a = dealCards("k3x9q2a", 6);
    expect(a).toHaveLength(6);
    expect(new Set(a.map((c) => c.id)).size).toBe(6);
    expect(dealCards("k3x9q2a", 6)).toEqual(a);
    expect(dealCards("zz00aa1", 6).map((c) => c.id)).not.toEqual(a.map((c) => c.id));
    for (let i = 0; i < 20; i++) expect(dealCards(designSeed(`s${i}`, 0), CARDS.length, { trade: "accountant" }).map((c) => c.id)).not.toContain("price-at-headline-size");
    expect(dealCards("k3x9q2a", 0)).toEqual([]);
    // Cards that need composition language v2 are held back until it lands (f1b).
    expect(dealCards("k3x9q2a", 100).length).toBe(CARDS.filter((c) => c.needs !== "f1b").length);
  });
});

describe("dealReferences", () => {
  it("shows at most one reference of the trade, the rest from elsewhere, by seed", () => {
    for (const trade of BusinessType.options) {
      for (let i = 0; i < 5; i++) {
        const seed = designSeed(`site_${i}`, 0);
        const refs = dealReferences(seed, trade);
        expect(refs).toHaveLength(3);
        expect(refs.filter((r) => r.trades.includes(trade)).length).toBeLessThanOrEqual(1);
        expect(dealReferences(seed, trade)).toEqual(refs);
        for (const r of refs) expect(REFERENCES).toContain(r);
      }
    }
    expect(dealReferences("k3x9q2a", "bakery")[0]!.id).toBe("skorja");
  });
});

describe("dealing with the full deck (I8)", () => {
  it("never deals a card that needs composition language v2, unless asked to", () => {
    const all = dealCards("s1", 50);
    expect(all.some((c) => c.needs === "f1b")).toBe(false);
    expect(dealCards("s1", 50, { f1b: true }).some((c) => c.needs === "f1b")).toBe(true);
  });
  it("leaves out cards whose requirements the client's input lacks", () => {
    const noPhotos = dealCards("s2", 50, { has: ["phone", "address", "hours"] });
    expect(noPhotos.length).toBeGreaterThan(5);
    expect(noPhotos.every((c) => !c.appliesTo?.requires?.includes("photos"))).toBe(true);
  });
  it("deals six stances for every trade, and respects sub-trade limits", () => {
    for (const trade of ["car-repair", "accountant", "dental", "restaurant", "shop", "builder"] as const) {
      const dealt = dealStances({ seed: "s3", trade, neighbours: [], previous: [] });
      expect(dealt, trade).toHaveLength(6);
    }
    const electrical = dealStances({ seed: "s4", trade: "builder", subtype: "electrical", neighbours: [], previous: [] });
    expect(electrical.every((s) => !s.trades.subNever?.includes("electrical"))).toBe(true);
  });
});