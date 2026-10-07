import { afterAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "@sb/config";
import { ModelClient, RecordingTransport, ReplayTransport, type CallRecord, type ModelRequest, type ModelResponse, type ModelTransport } from "@sb/engine";
import { classifyCases, junkReport, loadCases, separate, type JunkCase, type JunkResult } from "../src/junk/calibrate.ts";

/**
 * The junk check's calibration set and command (it-junk-threshold), without the API: the answers here are scripted
 * stand-ins (a confidence per case id), not real classifier answers. The real run is `pnpm eval:junk --record`.
 */
const config = loadConfig();
const here = path.dirname(fileURLToPath(import.meta.url));
const dirs: string[] = [];
afterAll(async () => {
  for (const d of dirs) await rm(d, { recursive: true, force: true });
});

/** Answers each classify call with the scripted type and confidence of the case whose description it carries. */
function scripted(cases: JunkCase[], answer: (c: JunkCase) => { businessType: string; confidence: number }): ModelTransport & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async send(req: ModelRequest): Promise<ModelResponse> {
      const text = JSON.stringify(req.messages[0]?.content);
      const c = cases.find((x) => text.includes(JSON.stringify(x.description).slice(1, -1)));
      if (!c) throw new Error("unknown description");
      calls.push(c.id);
      return { text: JSON.stringify(answer(c)), stopReason: "end_turn", model: config.models.classify.model, usage: { input_tokens: 400, output_tokens: 20, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } };
    },
  };
}

const client = (transport: ModelTransport, calls: CallRecord[] = []) => new ModelClient({ config, transport, spentToday: async () => 0, onCall: async (r) => void calls.push(r) });

describe("the junk calibration set", () => {
  it("has at least 20 cases with unique ids, both verdicts, and real trades outside the ten fixtures", () => {
    const cases = loadCases();
    expect(cases.length).toBeGreaterThanOrEqual(20);
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
    expect(cases.filter((c) => c.expect === "junk").length).toBeGreaterThanOrEqual(8);
    expect(cases.filter((c) => c.expect === "real").length).toBeGreaterThanOrEqual(10);
    for (const trade of ["florist", "yoga", "locksmith"]) expect(cases.map((c) => c.id)).toContain(trade);
  });
});

describe("separate", () => {
  const r = (id: string, expect: "junk" | "real", confidence: number | null): JunkResult => ({ id, expect, description: id, businessType: confidence === null ? null : "shop", confidence });

  it("finds the gap between the most confident junk and the least confident real business", () => {
    const s = separate([r("a", "junk", 0.1), r("b", "junk", 0.32), r("c", "real", 0.71), r("d", "real", 0.95), r("e", "junk", null)]);
    expect(s).toMatchObject({ maxJunk: 0.32, minReal: 0.71, separable: true, suggested: 0.5 });
    expect(s.wrongAt(0.5)).toEqual({ passedJunk: [], refusedReal: [] });
    expect(s.wrongAt(0)).toEqual({ passedJunk: ["a", "b"], refusedReal: [] });
  });

  it("says so when no threshold works, and which cases a threshold gets wrong", () => {
    const s = separate([r("junk-high", "junk", 0.8), r("real-low", "real", 0.4), r("real-short", "real", null)]);
    expect(s.separable).toBe(false);
    expect(s.suggested).toBeNull();
    expect(s.wrongAt(0.5)).toEqual({ passedJunk: ["junk-high"], refusedReal: ["real-low", "real-short"] });
  });
});

describe("pnpm eval:junk on scripted answers", () => {
  const cases = loadCases();
  // Stand-in answers: junk is unsure, real businesses are placed, the ones outside the ten types less surely.
  const answer = (c: JunkCase) => (c.expect === "junk" ? { businessType: "shop", confidence: 0.15 } : { businessType: "shop", confidence: ["florist", "yoga", "locksmith"].includes(c.id) ? 0.55 : 0.9 });

  it("classifies every case long enough, skips the rest without a call, logs each call's cost, and reports", async () => {
    const t = scripted(cases, answer);
    const calls: CallRecord[] = [];
    const minChars = 40;
    const results = await classifyCases(client(t, calls), cases, minChars);
    const short = cases.filter((c) => c.description.trim().length < minChars).map((c) => c.id);
    expect(short.length).toBeGreaterThan(0);
    expect(t.calls).toEqual(cases.filter((c) => !short.includes(c.id)).map((c) => c.id));
    expect(results.filter((x) => x.confidence === null).map((x) => x.id)).toEqual(short);
    expect(calls).toHaveLength(t.calls.length);
    expect(calls.every((c) => c.stage === "classify" && c.costEur > 0)).toBe(true);
    const eur = calls.reduce((a, c) => a + c.costEur, 0);
    const md = junkReport(results, { threshold: 0, minChars, model: config.models.classify.model, eur, mode: "scripted" });
    expect(md).toContain("| florist | real | shop | 0.55 |");
    expect(md).toContain("refused by length");
    expect(md).toContain("separable; suggested tiers.junk.minClassifierConfidence 0.35.");
    expect(md).toMatch(/Today's threshold 0: junk let through [a-z-]+(, [a-z-]+)*; real refused none\./);
  });

  it("replays what --record wrote, call for call, and refuses a description changed since", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sb-junk-rec-"));
    dirs.push(dir);
    const recorded = await classifyCases(client(new RecordingTransport(scripted(cases, answer), dir)), cases, 20);
    const replayed = await classifyCases(client(new ReplayTransport(dir, true)), cases, 20);
    expect(replayed).toEqual(recorded);
    const changed = cases.map((c, i) => (i === 0 ? { ...c, description: `${c.description} (spremenjeno)` } : c));
    await expect(classifyCases(client(new ReplayTransport(dir, true)), changed, 20)).rejects.toThrow(/changed since recording/);
  });
});

describe("the recorded calibration run (2026-10-07, Haiku 4.5)", () => {
  it("with config's threshold refuses no real business and most junk", async () => {
    const recorded = await classifyCases(client(new ReplayTransport(path.join(here, "../recordings/junk"), true)), loadCases(), config.tiers.junk.minDescriptionChars);
    const min = config.tiers.junk.minClassifierConfidence;
    const refused = (r: JunkResult) => r.confidence === null || r.confidence < min;
    expect(recorded.filter((r) => r.expect === "real" && refused(r)).map((r) => r.id)).toEqual([]);
    expect(recorded.filter((r) => r.expect === "junk" && !refused(r)).map((r) => r.id)).toEqual(["injection", "curious"]);
    expect(recorded.filter((r) => r.expect === "junk" && refused(r))).toHaveLength(8);
  });
});
