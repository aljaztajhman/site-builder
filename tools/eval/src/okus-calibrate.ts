/**
 * pnpm okus:calibrate --ratings <ratings.json> --judge <judge-scores.json> [--round 1] [--held-out 0.3] [--out report.json]
 * pnpm okus:calibrate anchors --ratings <ratings.json> [--round 1] [--count 12]
 *
 * How well a judge agrees with the owner's eye (docs/plans/design-studio.md §8). Inputs are the owner's Okus answers
 * as exported from the artifact's database and a judge's scores for the same items. Measured on a deterministic
 * held-out split (the anchors that go into the judge's prompt come only from the rest):
 * - pairwise agreement: for every two items the owner scored differently, does the judge order them the same way
 *   (a judge tie counts half);
 * - Spearman ρ between the owner's and the judge's scores;
 * - the owner's own "which is better" answers vs the judge's preference (higher score wins; a judge tie counts half).
 * Gate (plan §8): pairwise agreement on the held-out items ≥ 75 % before the critic gates anything. The threshold is
 * reported, never loosened. `anchors` picks 8–12 owner-rated first screens spread across the scale for a judge prompt.
 * Pure functions + CLI; no model call, € 0.
 */
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { ItemsFile, PairsFile, hash32, roundDir, type OkusItem, type OkusPair } from "./okus-round.ts";

/** Plan §8: the critic is trusted as a gate only at this pairwise agreement on held-out owner ratings. */
export const AGREEMENT_GATE = 0.75;
export const HELD_OUT_SHARE = 0.3;
export const SPLIT_SEED = "okus-split";

// ---------------------------------------------------------------------------------------------------------------
// Inputs

/** One rating as the page stores it (collection `ratings`, document `r<round>-<itemId>`). */
export const Rating = z.object({
  itemId: z.string(),
  score: z.number().int().min(1).max(5),
  showCustomer: z.boolean().nullable().optional(),
  note: z.string().optional().default(""),
  at: z.string(),
  round: z.number().int().optional(),
});
export type Rating = z.infer<typeof Rating>;

/** One pairwise answer (collection `pairs`, document `r<round>-<pairId>`); `winner` is an item id or "tie". */
export const PairAnswer = z.object({ pairId: z.string(), winner: z.string(), at: z.string(), round: z.number().int().optional() });
export type PairAnswer = z.infer<typeof PairAnswer>;

/** A database export may wrap each body as `{ id, data: {...} }`; take the body either way. */
const body = (x: unknown): unknown => (x && typeof x === "object" && "data" in x && typeof (x as { data: unknown }).data === "object" ? (x as { data: unknown }).data : x);

/** Reads the owner's export: `{ ratings: [...], pairs: [...] }`, or a bare array of ratings. */
export function parseOwnerExport(raw: unknown): { ratings: Rating[]; answers: PairAnswer[] } {
  const obj = Array.isArray(raw) ? { ratings: raw, pairs: [] } : (raw as { ratings?: unknown[]; pairs?: unknown[] });
  return {
    ratings: (obj.ratings ?? []).map((r) => Rating.parse(body(r))),
    answers: (obj.pairs ?? []).map((p) => PairAnswer.parse(body(p))),
  };
}

/** Reads judge scores: `{ "<itemId>": 3.5, ... }`, `{ scores: {...} }`, or `[{ itemId, score }]`. */
export function parseJudgeScores(raw: unknown): Map<string, number> {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) && "scores" in raw ? (raw as { scores: unknown }).scores : raw;
  const out = new Map<string, number>();
  if (Array.isArray(src)) {
    for (const e of src) {
      const { itemId, score } = z.object({ itemId: z.string(), score: z.number() }).parse(e);
      out.set(itemId, score);
    }
  } else {
    for (const [k, v] of Object.entries(z.record(z.string(), z.number()).parse(src))) out.set(k, v);
  }
  return out;
}

/** The owner's latest rating per item (a re-rating replaces the earlier one), optionally for one round. */
export function latestRatings(ratings: readonly Rating[], round?: number): Map<string, Rating> {
  const out = new Map<string, Rating>();
  for (const r of ratings) {
    if (round !== undefined && r.round !== undefined && r.round !== round) continue;
    const prev = out.get(r.itemId);
    if (!prev || prev.at <= r.at) out.set(r.itemId, r);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Metrics

export interface Agreement {
  /** 0–1, or null when there is no pair to compare. */
  agreement: number | null;
  /** Item pairs the owner scored differently and the judge scored both of. */
  pairs: number;
  agreed: number;
  judgeTies: number;
}

/** For every two items the owner scored differently: does the judge order them the same way? A judge tie counts half. */
export function pairwiseAgreement(owner: ReadonlyMap<string, number>, judge: ReadonlyMap<string, number>): Agreement {
  const ids = [...owner.keys()].filter((id) => judge.has(id)).sort();
  let pairs = 0;
  let agreed = 0;
  let judgeTies = 0;
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const o = owner.get(ids[i]!)! - owner.get(ids[j]!)!;
      if (o === 0) continue;
      const d = judge.get(ids[i]!)! - judge.get(ids[j]!)!;
      pairs++;
      if (d === 0) {
        judgeTies++;
        agreed += 0.5;
      } else if (Math.sign(d) === Math.sign(o)) agreed++;
    }
  }
  return { agreement: pairs ? agreed / pairs : null, pairs, agreed, judgeTies };
}

/** Ranks from 1, ties sharing their average rank. */
export function ranks(xs: readonly number[]): number[] {
  const order = xs.map((x, i) => ({ x, i })).sort((a, b) => a.x - b.x);
  const out = new Array<number>(xs.length);
  for (let k = 0; k < order.length; ) {
    let e = k;
    while (e + 1 < order.length && order[e + 1]!.x === order[k]!.x) e++;
    const avg = (k + e) / 2 + 1;
    for (let m = k; m <= e; m++) out[order[m]!.i] = avg;
    k = e + 1;
  }
  return out;
}

/** Spearman's ρ (Pearson on average ranks, so ties are handled); null under 2 items or when one side is constant. */
export function spearman(xs: readonly number[], ys: readonly number[]): number | null {
  if (xs.length !== ys.length) throw new Error("spearman: lengths differ");
  if (xs.length < 2) return null;
  const [rx, ry] = [ranks(xs), ranks(ys)];
  const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
  const [mx, my] = [mean(rx), mean(ry)];
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < rx.length; i++) {
    sxy += (rx[i]! - mx) * (ry[i]! - my);
    sxx += (rx[i]! - mx) ** 2;
    syy += (ry[i]! - my) ** 2;
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
}

export interface PairChoiceAgreement {
  agreement: number | null;
  /** Answered pairs with a winner that the judge scored both sides of. */
  answered: number;
  agreed: number;
  judgeTies: number;
  /** The owner said "equally good". */
  ownerTies: number;
  /** Answers whose pair or items aren't known or judged. */
  skipped: number;
}

/** The owner's "which is better" answers vs the judge's preference (the higher score). The latest answer per pair counts. */
export function pairChoiceAgreement(answers: readonly PairAnswer[], pairs: readonly OkusPair[], judge: ReadonlyMap<string, number>): PairChoiceAgreement {
  const latest = new Map<string, PairAnswer>();
  for (const a of answers) if (!latest.has(a.pairId) || latest.get(a.pairId)!.at <= a.at) latest.set(a.pairId, a);
  const byId = new Map(pairs.map((p) => [p.id, p]));
  const r: PairChoiceAgreement = { agreement: null, answered: 0, agreed: 0, judgeTies: 0, ownerTies: 0, skipped: 0 };
  for (const a of latest.values()) {
    const p = byId.get(a.pairId);
    if (a.winner === "tie") {
      r.ownerTies++;
      continue;
    }
    if (!p || (a.winner !== p.a && a.winner !== p.b) || !judge.has(p.a) || !judge.has(p.b)) {
      r.skipped++;
      continue;
    }
    const loser = a.winner === p.a ? p.b : p.a;
    const d = judge.get(a.winner)! - judge.get(loser)!;
    r.answered++;
    if (d === 0) {
      r.judgeTies++;
      r.agreed += 0.5;
    } else if (d > 0) r.agreed++;
  }
  r.agreement = r.answered ? r.agreed / r.answered : null;
  return r;
}

/**
 * A deterministic split: an item is held out when a seeded hash of its id falls under `share`. Each item's side
 * depends only on its id, so it stays put across rounds and subsets (a held-out item never turns into an anchor);
 * the held-out count is about `share` of the items, not exactly.
 */
export function heldOutSplit(ids: readonly string[], share = HELD_OUT_SHARE, seed = SPLIT_SEED): { train: string[]; heldOut: string[] } {
  const all = [...new Set(ids)].sort();
  // FNV-1a alone spreads near-identical ids unevenly in its high bits; murmur3's finaliser evens them out.
  const mix = (h: number) => {
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return (h ^ (h >>> 16)) >>> 0;
  };
  const out = (id: string) => mix(hash32(`${seed}:${id}`)) / 2 ** 32 < share;
  return { heldOut: all.filter(out), train: all.filter((id) => !out(id)) };
}

// ---------------------------------------------------------------------------------------------------------------
// Anchors

export interface Anchor {
  itemId: string;
  score: number;
  showCustomer: boolean | null;
  note: string;
  /** First screens, relative to the round's directory (when the round's items are known). */
  desk?: string;
  phone?: string;
}

/**
 * 8–12 owner-rated items for a judge prompt, spread across the scale: round-robin over the score levels the owner
 * used (lowest first), so every level is represented and levels differ by at most one when they have enough items.
 * Within a level: items with a note first (the judge learns from the reasons), then alternating "would show a
 * customer" yes/no, then a seeded order. `max` (default 12) at most; fewer rated items than that: all of them.
 */
export function pickAnchors(ratings: Iterable<Rating>, opts: { max?: number; seed?: string; items?: readonly OkusItem[] } = {}): Anchor[] {
  const { max = 12, seed = "okus-anchors" } = opts;
  const pool = [...ratings];
  const levels = [...new Set(pool.map((r) => r.score))].sort((a, b) => a - b);
  const queues = new Map(
    levels.map((lvl) => {
      const at = pool.filter((r) => r.score === lvl).sort((a, b) => hash32(`${seed}:${a.itemId}`) - hash32(`${seed}:${b.itemId}`) || a.itemId.localeCompare(b.itemId));
      const noted = at.filter((r) => r.note.trim());
      const plain = at.filter((r) => !r.note.trim());
      // Alternate showCustomer within each group so a level's anchors show both answers when they exist.
      const alternate = (rs: Rating[]) => {
        const yes = rs.filter((r) => r.showCustomer === true);
        const rest = rs.filter((r) => r.showCustomer !== true);
        const out: Rating[] = [];
        while (yes.length || rest.length) {
          if (rest.length) out.push(rest.shift()!);
          if (yes.length) out.push(yes.shift()!);
        }
        return out;
      };
      return [lvl, [...alternate(noted), ...alternate(plain)]] as [number, Rating[]];
    }),
  );
  const target = Math.min(max, pool.length);
  const picked: Rating[] = [];
  while (picked.length < target) {
    let took = false;
    for (const lvl of levels) {
      const next = queues.get(lvl)!.shift();
      if (next && picked.length < target) {
        picked.push(next);
        took = true;
      }
    }
    if (!took) break;
  }
  const byId = new Map((opts.items ?? []).map((i) => [i.id, i]));
  return picked
    .sort((a, b) => a.score - b.score || a.itemId.localeCompare(b.itemId))
    .map((r) => {
      const item = byId.get(r.itemId);
      return { itemId: r.itemId, score: r.score, showCustomer: r.showCustomer ?? null, note: r.note, ...(item ? { desk: item.images.desk, phone: item.images.phone } : {}) };
    });
}

// ---------------------------------------------------------------------------------------------------------------
// Report

export interface SetMetrics {
  items: number;
  pairwise: Agreement;
  spearman: number | null;
}

export interface CalibrationReport {
  round: number | null;
  rated: number;
  judged: number;
  split: { seed: string; heldOutShare: number; train: string[]; heldOut: string[] };
  all: SetMetrics;
  heldOut: SetMetrics;
  ownerPairs: PairChoiceAgreement;
  anchors: Anchor[];
  gate: { threshold: number; on: "heldOut"; value: number | null; pass: boolean };
  /** Rated items the judge has no score for. */
  unjudged: string[];
}

function setMetrics(ids: readonly string[], owner: ReadonlyMap<string, Rating>, judge: ReadonlyMap<string, number>): SetMetrics {
  const both = ids.filter((id) => owner.has(id) && judge.has(id));
  const o = new Map(both.map((id) => [id, owner.get(id)!.score]));
  return {
    items: both.length,
    pairwise: pairwiseAgreement(o, judge),
    spearman: spearman(
      both.map((id) => o.get(id)!),
      both.map((id) => judge.get(id)!),
    ),
  };
}

export function calibrate(input: {
  ratings: readonly Rating[];
  answers: readonly PairAnswer[];
  judge: ReadonlyMap<string, number>;
  pairs?: readonly OkusPair[];
  items?: readonly OkusItem[];
  round?: number;
  heldOutShare?: number;
}): CalibrationReport {
  const owner = latestRatings(input.ratings, input.round);
  const ids = [...owner.keys()].sort();
  const share = input.heldOutShare ?? HELD_OUT_SHARE;
  const split = heldOutSplit(ids, share);
  const heldOut = setMetrics(split.heldOut, owner, input.judge);
  const value = heldOut.pairwise.agreement;
  return {
    round: input.round ?? null,
    rated: ids.length,
    judged: ids.filter((id) => input.judge.has(id)).length,
    split: { seed: SPLIT_SEED, heldOutShare: share, ...split },
    all: setMetrics(ids, owner, input.judge),
    heldOut,
    ownerPairs: pairChoiceAgreement(input.answers, input.pairs ?? [], input.judge),
    anchors: pickAnchors(
      split.train.map((id) => owner.get(id)!),
      input.items ? { items: input.items } : {},
    ),
    gate: { threshold: AGREEMENT_GATE, on: "heldOut", value, pass: value !== null && value >= AGREEMENT_GATE },
    unjudged: ids.filter((id) => !input.judge.has(id)),
  };
}

const pct = (x: number | null) => (x === null ? "n/a" : `${(x * 100).toFixed(1)} %`);
const rho = (x: number | null) => (x === null ? "n/a" : x.toFixed(3));

export function formatReport(r: CalibrationReport): string {
  const line = (name: string, m: SetMetrics) =>
    `  ${name.padEnd(9)} items ${String(m.items).padStart(3)}  pairwise ${pct(m.pairwise.agreement).padStart(8)} (${m.pairwise.pairs} pairs, ${m.pairwise.judgeTies} judge ties)  Spearman ρ ${rho(m.spearman)}`;
  const p = r.ownerPairs;
  return [
    `Okus calibration${r.round ? `, round ${r.round}` : ""}: ${r.rated} rated, ${r.judged} judged`,
    line("all", r.all),
    line("held-out", r.heldOut),
    `  owner's pairwise answers vs judge: ${pct(p.agreement)} (${p.answered} answered, ${p.ownerTies} "enako", ${p.judgeTies} judge ties, ${p.skipped} skipped)`,
    `  gate: held-out pairwise ≥ ${pct(r.gate.threshold)}: ${r.gate.pass ? "PASS" : "FAIL"} (${pct(r.gate.value)})`,
    r.unjudged.length ? `  not judged: ${r.unjudged.join(", ")}` : "",
    `  anchors (${r.anchors.length}, from the training split): ${r.anchors.map((a) => `${a.itemId}=${a.score}`).join(", ")}`,
  ]
    .filter(Boolean)
    .join("\n");
}

// ---------------------------------------------------------------------------------------------------------------
// CLI

function readJsonFile(file: string): unknown {
  return JSON.parse(readFileSync(path.resolve(file), "utf8")) as unknown;
}

function roundFiles(round: number): { items?: OkusItem[]; pairs?: OkusPair[] } {
  const dir = roundDir(round);
  const tryRead = <T>(f: string, parse: (x: unknown) => T): T | undefined => {
    try {
      return parse(readJsonFile(path.join(dir, f)));
    } catch {
      return undefined;
    }
  };
  const items = tryRead("items.json", (x) => ItemsFile.parse(x).items);
  const pairs = tryRead("pairs.json", (x) => PairsFile.parse(x).pairs);
  return { ...(items ? { items } : {}), ...(pairs ? { pairs } : {}) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const val = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const ratingsFile = val("--ratings");
  if (!ratingsFile) {
    console.error("Usage: pnpm okus:calibrate --ratings <ratings.json> --judge <judge-scores.json> [--round 1] [--held-out 0.3] [--out report.json]\n       pnpm okus:calibrate anchors --ratings <ratings.json> [--round 1] [--count 12]");
    process.exit(2);
  }
  const round = Number(val("--round") ?? "1");
  const { ratings, answers } = parseOwnerExport(readJsonFile(ratingsFile));
  const files = roundFiles(round);
  if (args[0] === "anchors") {
    const count = Number(val("--count") ?? "12");
    const anchors = pickAnchors(latestRatings(ratings, round).values(), { max: count, ...(files.items ? { items: files.items } : {}) });
    console.log(JSON.stringify(anchors, null, 2));
  } else {
    const judgeFile = val("--judge");
    if (!judgeFile) {
      console.error("--judge <judge-scores.json> is required");
      process.exit(2);
    }
    const report = calibrate({
      ratings,
      answers,
      judge: parseJudgeScores(readJsonFile(judgeFile)),
      round,
      heldOutShare: Number(val("--held-out") ?? HELD_OUT_SHARE),
      ...files,
    });
    console.log(formatReport(report));
    const out = val("--out");
    if (out) await writeFile(path.resolve(out), `${JSON.stringify(report, null, 2)}\n`);
  }
}
