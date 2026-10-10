import { describe, expect, it } from "vitest";
import {
  AGREEMENT_GATE,
  calibrate,
  heldOutSplit,
  latestRatings,
  pairChoiceAgreement,
  pairwiseAgreement,
  parseJudgeScores,
  parseOwnerExport,
  pickAnchors,
  ranks,
  spearman,
  type Rating,
} from "../src/okus-calibrate.ts";
import type { OkusPair } from "../src/okus-round.ts";

/** The Okus calibration harness on synthetic ratings (never real owner answers). */
const rating = (itemId: string, score: number, extra: Partial<Rating> = {}): Rating => ({ itemId, score, showCustomer: score >= 4, note: "", at: "2026-10-10T10:00:00.000Z", round: 1, ...extra });
const map = (o: Record<string, number>) => new Map(Object.entries(o));

describe("pairwise agreement", () => {
  const owner = map({ a: 1, b: 2, c: 3, d: 4, e: 5 });

  it("is 100 % for the same order, 0 % for the reversed order", () => {
    expect(pairwiseAgreement(owner, map({ a: 1.1, b: 2.5, c: 2.9, d: 4, e: 4.8 })).agreement).toBe(1);
    const reversed = pairwiseAgreement(owner, map({ a: 5, b: 4, c: 3, d: 2, e: 1 }));
    expect(reversed.agreement).toBe(0);
    expect(reversed.pairs).toBe(10);
  });

  it("skips pairs the owner tied, counts judge ties half, ignores unjudged items", () => {
    const r = pairwiseAgreement(map({ a: 3, b: 3, c: 5 }), map({ a: 1, b: 2, c: 2 }));
    // Pairs: a<c (judge a<c, agree), b<c (judge tie, half); a=b skipped.
    expect(r).toEqual({ agreement: 0.75, pairs: 2, agreed: 1.5, judgeTies: 1 });
    expect(pairwiseAgreement(map({ a: 1, b: 2 }), map({ a: 1 })).agreement).toBeNull();
  });

  it("one swapped neighbour costs one pair", () => {
    // 10 pairs; swapping d and e in the judge's order flips exactly one.
    expect(pairwiseAgreement(owner, map({ a: 1, b: 2, c: 3, d: 5, e: 4 })).agreement).toBe(0.9);
  });
});

describe("Spearman ρ", () => {
  it("is 1 and −1 for the same and the reversed order", () => {
    expect(spearman([1, 2, 3, 4, 5], [10, 20, 30, 40, 50])).toBeCloseTo(1, 10);
    expect(spearman([1, 2, 3, 4, 5], [5, 4, 3, 2, 1])).toBeCloseTo(-1, 10);
  });

  it("matches known values (no ties: 1 − 6Σd²/(n(n²−1)))", () => {
    // d = [0,0,0,1,-1] → Σd² = 2 → ρ = 1 − 12/120 = 0.9
    expect(spearman([1, 2, 3, 4, 5], [1, 2, 3, 5, 4])).toBeCloseTo(0.9, 10);
    // d = [1,-1,1,-1] → Σd² = 4, n = 4 → ρ = 1 − 24/60 = 0.6
    expect(spearman([1, 2, 3, 4], [2, 1, 4, 3])).toBeCloseTo(0.6, 10);
  });

  it("uses average ranks for ties and is null when one side is constant", () => {
    expect(ranks([10, 20, 20, 30])).toEqual([1, 2.5, 2.5, 4]);
    // Pearson on ranks [1,2.5,2.5,4] vs [1,2,3,4] = 4.5 / sqrt(4.5 · 5)
    expect(spearman([1, 2, 2, 3], [1, 2, 3, 4])).toBeCloseTo(4.5 / Math.sqrt(4.5 * 5), 10);
    expect(spearman([3, 3, 3], [1, 2, 3])).toBeNull();
    expect(spearman([1], [1])).toBeNull();
  });
});

describe("the owner's pairwise answers vs the judge", () => {
  const pairs: OkusPair[] = [
    { id: "p01", kind: "reference-golden", a: "x", b: "y" },
    { id: "p02", kind: "cross-trade", a: "y", b: "z" },
    { id: "p03", kind: "cross-trade", a: "x", b: "z" },
  ];
  const judge = map({ x: 4, y: 2, z: 2 });

  it("counts agreement, judge ties half, owner ties and unknown answers apart, latest answer wins", () => {
    const r = pairChoiceAgreement(
      [
        { pairId: "p01", winner: "y", at: "2026-10-10T10:00:00Z" },
        { pairId: "p01", winner: "x", at: "2026-10-10T11:00:00Z" }, // changed mind: x (judge agrees)
        { pairId: "p02", winner: "z", at: "2026-10-10T10:00:00Z" }, // judge tie
        { pairId: "p03", winner: "tie", at: "2026-10-10T10:00:00Z" },
        { pairId: "p99", winner: "x", at: "2026-10-10T10:00:00Z" },
      ],
      pairs,
      judge,
    );
    expect(r).toEqual({ agreement: 0.75, answered: 2, agreed: 1.5, judgeTies: 1, ownerTies: 1, skipped: 1 });
  });
});

describe("held-out split", () => {
  const ids = Array.from({ length: 30 }, (_, i) => `item-${i}`);

  it("is deterministic, disjoint, complete, about 30 % held out", () => {
    const s = heldOutSplit(ids);
    expect(heldOutSplit([...ids].reverse())).toEqual(s);
    expect(new Set([...s.train, ...s.heldOut]).size).toBe(30);
    expect(s.train.filter((id) => s.heldOut.includes(id))).toEqual([]);
    expect(s.heldOut.length).toBeGreaterThan(0);
    const big = heldOutSplit(Array.from({ length: 2000 }, (_, i) => `x${i}`));
    expect(big.heldOut.length / 2000).toBeGreaterThan(0.26);
    expect(big.heldOut.length / 2000).toBeLessThan(0.34);
  });

  it("keeps every item on its side when other items join or leave", () => {
    const s = heldOutSplit(ids);
    const more = heldOutSplit([...ids, "item-30", "item-31", "item-32"]);
    const fewer = heldOutSplit(ids.slice(0, 12));
    expect(more.heldOut.filter((id) => ids.includes(id))).toEqual(s.heldOut);
    expect(fewer.heldOut).toEqual(s.heldOut.filter((id) => ids.slice(0, 12).includes(id)));
  });
});

describe("anchors", () => {
  it("spread across every score the owner used, 12 at most, levels within one of each other", () => {
    const rs = Array.from({ length: 30 }, (_, i) => rating(`i${i}`, (i % 5) + 1));
    const a = pickAnchors(rs);
    expect(a.length).toBe(12);
    const per = [1, 2, 3, 4, 5].map((s) => a.filter((x) => x.score === s).length);
    expect(Math.min(...per)).toBeGreaterThanOrEqual(2);
    expect(Math.max(...per) - Math.min(...per)).toBeLessThanOrEqual(1);
    expect(pickAnchors(rs)).toEqual(a);
  });

  it("include a rare level, prefer items with a note, show both answers to the customer question", () => {
    const rs = [
      rating("lone1", 1),
      ...Array.from({ length: 10 }, (_, i) => rating(`m${i}`, 3, { showCustomer: i % 2 === 0 })),
      ...Array.from({ length: 10 }, (_, i) => rating(`h${i}`, 5, i === 7 ? { note: "naslov je premajhen" } : {})),
    ];
    const a = pickAnchors(rs, { max: 9 });
    expect(a.length).toBe(9);
    expect(a.filter((x) => x.score === 1).map((x) => x.itemId)).toEqual(["lone1"]);
    expect(a.filter((x) => x.score === 5).map((x) => x.itemId)).toContain("h7");
    const mid = a.filter((x) => x.score === 3);
    expect(new Set(mid.map((x) => x.showCustomer)).size).toBe(2);
  });

  it("return every rated item when there are fewer than the target", () => {
    expect(pickAnchors([rating("a", 2), rating("b", 4)]).map((x) => x.itemId)).toEqual(["a", "b"]);
  });
});

describe("calibrate", () => {
  const rs = Array.from({ length: 30 }, (_, i) => rating(`i${String(i).padStart(2, "0")}`, (i % 5) + 1));

  it("passes the gate for a judge that orders like the owner, fails it for the reverse", () => {
    const same = new Map(rs.map((r) => [r.itemId, r.score * 0.8 + 0.3]));
    const good = calibrate({ ratings: rs, answers: [], judge: same });
    expect(good.heldOut.pairwise.agreement).toBe(1);
    expect(good.heldOut.spearman).toBeCloseTo(1, 10);
    expect(good.gate).toEqual({ threshold: AGREEMENT_GATE, on: "heldOut", value: 1, pass: true });
    // Anchors come only from the training split.
    expect(good.anchors.every((a) => good.split.train.includes(a.itemId))).toBe(true);
    expect(good.anchors.length).toBeGreaterThanOrEqual(8);

    const reversed = calibrate({ ratings: rs, answers: [], judge: new Map(rs.map((r) => [r.itemId, 6 - r.score])) });
    expect(reversed.all.pairwise.agreement).toBe(0);
    expect(reversed.gate.pass).toBe(false);
  });

  it("reports unjudged items and uses the owner's latest rating", () => {
    const later = [...rs, rating("i00", 5, { at: "2026-10-11T09:00:00.000Z" })];
    expect(latestRatings(later).get("i00")!.score).toBe(5);
    const r = calibrate({ ratings: later, answers: [], judge: new Map([["i01", 3]]) });
    expect(r.rated).toBe(30);
    expect(r.judged).toBe(1);
    expect(r.unjudged.length).toBe(29);
    expect(r.gate.pass).toBe(false);
  });
});

describe("inputs", () => {
  it("reads the owner's export with or without { id, data } wrappers", () => {
    const doc = { itemId: "a", round: 1, score: 4, showCustomer: true, note: "", at: "2026-10-10T10:00:00Z" };
    const fromDb = parseOwnerExport({ ratings: [{ id: "r1-a", data: doc }], pairs: [{ id: "r1-p01", data: { pairId: "p01", round: 1, winner: "a", at: "x" } }] });
    expect(fromDb.ratings[0]!.score).toBe(4);
    expect(fromDb.answers[0]!.winner).toBe("a");
    expect(parseOwnerExport([doc]).ratings.length).toBe(1);
    expect(() => parseOwnerExport([{ ...doc, score: 7 }])).toThrow();
  });

  it("reads judge scores as a map, { scores }, or a list", () => {
    expect([...parseJudgeScores({ a: 3.5 })]).toEqual([["a", 3.5]]);
    expect([...parseJudgeScores({ scores: { a: 2 } })]).toEqual([["a", 2]]);
    expect([...parseJudgeScores([{ itemId: "a", score: 1 }])]).toEqual([["a", 1]]);
  });
});
