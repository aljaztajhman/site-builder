import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildReport, collectAgents, defaultProjectDir, parseArgs, readTranscript, renderMarkdown, requestUsd, roleOf } from "../src/agent-costs.ts";

const config = {
  eurPerUsd: 0.5,
  pricesUsdPerMTok: {
    "claude-opus-5-5": { input: 4, output: 20, cacheWrite5m: 5, cacheRead: 0.2 },
    "claude-haiku-5-5": {
      input: 0.1,
      output: 0.5,
      cacheWrite5m: 0.125,
      cacheRead: 0.01,
      longPrompt: { above: 100_000, input: 0.5, output: 2.5, cacheWrite5m: 0.625, cacheRead: 0.05 },
    },
  },
};

interface U {
  input?: number;
  w5?: number;
  w1?: number;
  read?: number;
  out?: number;
}

function line(o: { req?: string; model?: string; at: string; u?: U; effort?: string; type?: string }): string {
  if (o.type && o.type !== "assistant") return JSON.stringify({ type: o.type, timestamp: o.at });
  const u = o.u ?? {};
  return JSON.stringify({
    type: "assistant",
    timestamp: o.at,
    requestId: o.req,
    effort: o.effort,
    message: {
      model: o.model ?? "claude-opus-5-5",
      usage: {
        input_tokens: u.input ?? 0,
        cache_creation_input_tokens: (u.w5 ?? 0) + (u.w1 ?? 0),
        cache_read_input_tokens: u.read ?? 0,
        cache_creation: { ephemeral_5m_input_tokens: u.w5 ?? 0, ephemeral_1h_input_tokens: u.w1 ?? 0 },
        output_tokens: u.out ?? 0,
      },
    },
  });
}

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-costs-"));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function write(rel: string, content: string): string {
  const p = path.join(dir, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
  return p;
}

describe("agent costs", () => {
  it("counts each requestId once, at its final (maximum) usage", () => {
    const f = write(
      "s1.jsonl",
      [
        line({ req: "r1", at: "2026-10-10T10:00:00Z", u: { input: 2, w5: 100, read: 1000, out: 5 } }),
        line({ req: "r1", at: "2026-10-10T10:00:01Z", u: { input: 2, w5: 100, read: 1000, out: 5 } }),
        line({ req: "r1", at: "2026-10-10T10:00:02Z", u: { input: 2, w5: 100, read: 1000, out: 387 } }),
        line({ req: "r2", at: "2026-10-10T10:01:00Z", u: { input: 1, out: 10 } }),
        "not json",
      ].join("\n"),
    );
    const t = readTranscript(f);
    expect(t.requests).toHaveLength(2);
    expect(t.requests.find((r) => r.requestId === "r1")).toMatchObject({ input: 2, cacheWrite5m: 100, cacheRead: 1000, output: 387 });
    expect(t.start).toBe("2026-10-10T10:00:00Z");
    expect(t.end).toBe("2026-10-10T10:01:00Z");
  });

  it("prices 5-minute writes, 1-hour writes at 2x input, and reads", () => {
    const base = { requestId: "r", model: "claude-opus-5-5", at: "", input: 0, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0, output: 0 };
    const p = config.pricesUsdPerMTok;
    expect(requestUsd(p, { ...base, cacheWrite5m: 1_000_000 })).toBeCloseTo(5);
    expect(requestUsd(p, { ...base, cacheWrite1h: 1_000_000 })).toBeCloseTo(8);
    expect(requestUsd(p, { ...base, cacheRead: 1_000_000 })).toBeCloseTo(0.2);
    expect(requestUsd(p, { ...base, input: 1_000_000, output: 1_000_000 })).toBeCloseTo(24);
  });

  it("splits cache writes into 5m and 1h from the breakdown", () => {
    const f = write("s1.jsonl", line({ req: "r", at: "2026-10-10T10:00:00Z", u: { w5: 30, w1: 70 } }));
    expect(readTranscript(f).requests[0]).toMatchObject({ cacheWrite5m: 30, cacheWrite1h: 70 });
  });

  it("bills a request on the long-prompt card when its whole prompt is over the threshold", () => {
    const base = { requestId: "r", model: "claude-haiku-5-5", at: "", input: 0, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0, output: 1_000_000 };
    // 100k prompt: base card. Over 100k counting cache reads: long card for every token, output included.
    expect(requestUsd(config.pricesUsdPerMTok, { ...base, input: 50_000, cacheRead: 50_000 })).toBeCloseTo(0.5 + 0.005 + 0.0005);
    expect(requestUsd(config.pricesUsdPerMTok, { ...base, input: 50_000, cacheRead: 50_001 })).toBeCloseTo(2.5 + 0.025 + 0.05 * 0.050001);
    expect(requestUsd(config.pricesUsdPerMTok, { ...base, cacheWrite1h: 100_001, output: 0 })).toBeCloseTo(0.100001);
  });

  it("warns about a model with no price and counts it at $0; dev prices cover Fable", () => {
    write(
      "s1.jsonl",
      [
        line({ req: "a", model: "claude-mystery-9", at: "2026-10-10T10:00:00Z", u: { input: 1_000_000 } }),
        line({ req: "b", model: "claude-fable-5-1", at: "2026-10-10T10:00:01Z", u: { input: 1_000_000, read: 1_000_000 } }),
        line({ req: "c", model: "<synthetic>", at: "2026-10-10T10:00:02Z" }),
      ].join("\n"),
    );
    const r = buildReport(collectAgents(dir), config);
    expect(r.warnings).toEqual(["No price for model claude-mystery-9 (1 requests): counted at $0."]);
    expect(r.totals.requests).toBe(2);
    expect(r.perModel.find((m) => m.model === "claude-fable-5-1")?.usd).toBeCloseTo(10.25);
    expect(r.perModel.find((m) => m.model === "claude-mystery-9")?.usd).toBe(0);
    expect(r.totals.eur).toBeCloseTo(10.25 * 0.5);
    expect(renderMarkdown(r)).toContain("Warning: No price for model claude-mystery-9");
  });

  it("groups the director and each subagent from meta.json, sorted by start", () => {
    write("s1.jsonl", [line({ req: "d1", at: "2026-10-10T09:00:00Z", effort: "high", u: { out: 1_000_000 } }), line({ req: "d2", at: "2026-10-10T12:00:00Z", effort: "high", u: { out: 0 } })].join("\n"));
    write("s1/custom-title.json", JSON.stringify({ customTitle: "Design studio" }));
    write("s1/subagents/agent-b.jsonl", line({ req: "b1", model: "claude-haiku-5-5", at: "2026-10-10T11:00:00Z", effort: "low", u: { out: 1_000_000 } }));
    write("s1/subagents/agent-b.meta.json", JSON.stringify({ agentType: "general-purpose", description: "Scout: map files", model: "haiku", effort: "low" }));
    write("s1/subagents/agent-a.jsonl", [line({ req: "a1", at: "2026-10-10T10:00:00Z", effort: "medium", u: { out: 1_000_000 } }), line({ type: "user", at: "2026-10-10T10:30:00Z" })].join("\n"));
    write("s1/subagents/agent-a.meta.json", JSON.stringify({ agentType: "builder", description: "Build the thing", model: "opus" }));
    const r = buildReport(collectAgents(dir), config);
    expect(r.agents.map((a) => [a.agentId, a.isDirector, a.role, a.modelAlias, a.effort])).toEqual([
      ["director", true, "director", null, "high"],
      ["a", false, "builder", "opus", "medium"],
      ["b", false, "scout", "haiku", "low"],
    ]);
    expect(r.agents[0]?.description).toBe("Director: Design studio");
    expect(r.agents[0]?.wallClockMs).toBe(3 * 3600_000);
    expect(r.agents[1]?.wallClockMs).toBe(30 * 60_000);
    expect(r.directors).toHaveLength(1);
    expect(r.perRole.map((g) => [g.role, g.agents, g.usd])).toEqual([
      ["director", 1, 20],
      ["builder", 1, 20],
      ["scout", 1, 0.5],
    ]);
    expect(r.perModel.find((m) => m.model === "claude-opus-5-5")).toMatchObject({ agents: 2, descriptions: ["Director: Design studio", "Build the thing"] });
    const md = renderMarkdown(r);
    expect(md).toContain("API-equivalent costs");
    expect(md).toContain("## 4. Director (main session)");
  });

  it("filters requests and sessions by --since/--until and --session", () => {
    write("s1.jsonl", [line({ req: "x", at: "2026-10-01T10:00:00Z", u: { out: 1 } }), line({ req: "y", at: "2026-10-10T10:00:00Z", u: { out: 2 } })].join("\n"));
    write("s2.jsonl", line({ req: "z", at: "2026-10-01T10:00:00Z", u: { out: 4 } }));
    const since = collectAgents(dir, { since: "2026-10-05" });
    expect(since).toHaveLength(1);
    expect(since[0]?.requests.map((q) => q.requestId)).toEqual(["y"]);
    expect(since[0]?.start).toBe("2026-10-10T10:00:00Z");
    expect(collectAgents(dir, { until: "2026-10-05" }).flatMap((a) => a.requests.map((q) => q.requestId)).sort()).toEqual(["x", "z"]);
    expect(collectAgents(dir, { sessions: ["s2"] }).map((a) => a.sessionId)).toEqual(["s2"]);
  });

  it("parses options and derives roles and the default directory", () => {
    expect(parseArgs(["--dir", "d", "--session", "a", "--session", "b", "--since", "2026-10-01", "--out", "o.md"])).toMatchObject({ dir: "d", sessions: ["a", "b"], since: "2026-10-01", out: "o.md" });
    expect(() => parseArgs(["--since", "soon"])).toThrow("Not a date");
    expect(() => parseArgs(["--bogus"])).toThrow("Unknown option");
    expect(roleOf("general-purpose", "Opus review of F2 PR")).toBe("reviewer");
    expect(roleOf("general-purpose", "F1 fix builder: sheet bugs")).toBe("builder");
    expect(roleOf("general-purpose", "Fable: Phase 1 design")).toBe("architect");
    expect(roleOf("claude-code-guide", "Research")).toBe("claude-code-guide");
    expect(defaultProjectDir("C:\\Users\\A\\site-builder\\.claude\\worktrees\\agent-x")).toBe(path.join(os.homedir(), ".claude", "projects", "C--Users-A-site-builder"));
  });
});
