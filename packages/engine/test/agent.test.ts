import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import { loadConfig } from "@sb/config";
import {
  ADVISOR_BETA,
  ModelClient,
  RecordingTransport,
  ReplayTransport,
  betaMessageParams,
  estimateCallEur,
  messageParams,
  requestHash,
  toModelResponse,
  type AdvisorToolSpec,
  type AgentLogEvent,
  type CallRecord,
  type ModelContentBlock,
  type ModelRequest,
  type ModelResponse,
  type ModelTransport,
} from "../src/index.ts";

/** Tool use and the agent loop (design-studio F2), against scripted transports: no network, no recordings of real calls. */
const config = loadConfig();
const STAGE = "critique" as const;
const stage = config.models[STAGE];
const usage = (input = 1000, output = 100) => ({ input_tokens: input, output_tokens: output, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 });

const lookup: Anthropic.Tool = { name: "lookup", description: "Looks a thing up", input_schema: { type: "object", properties: { q: { type: "string" } }, required: ["q"] } };
const shot: Anthropic.Tool = { name: "screenshot", description: "Takes a screenshot", input_schema: { type: "object", properties: {} } };
const png = (data: string): Anthropic.ImageBlockParam => ({ type: "image", source: { type: "base64", media_type: "image/png", data } });

let n = 0;
const toolUse = (name: string, input: unknown = {}): Anthropic.ToolUseBlock => ({ type: "tool_use", id: `toolu_${++n}`, name, input }) as Anthropic.ToolUseBlock;
/** An answer that calls tools. */
function calls(...uses: Anthropic.ToolUseBlock[]): ModelResponse {
  return { text: "", stopReason: "tool_use", model: stage.model, usage: usage(), content: uses, toolUses: uses.map(({ id, name, input }) => ({ id, name, input })) };
}
const says = (text: string): ModelResponse => ({ text, stopReason: "end_turn", model: stage.model, usage: usage(), content: [{ type: "text", text, citations: null }] });

/** Answers from a script, in order; keeps what it was sent. */
function scripted(script: ModelResponse[]): ModelTransport & { seen: ModelRequest[] } {
  const seen: ModelRequest[] = [];
  return {
    seen,
    async send(req) {
      seen.push(req);
      const r = script.shift();
      if (!r) throw new Error("script is empty");
      return r;
    },
  };
}

function clientOf(transport: ModelTransport, opts: { spentToday?: () => Promise<number> } = {}) {
  const records: CallRecord[] = [];
  const client = new ModelClient({ config, transport, spentToday: opts.spentToday ?? (async () => 0), onCall: async (r) => void records.push(r) });
  return { client, records };
}

const base = { stage: STAGE, system: ["sys"], messages: [{ role: "user" as const, content: "go" }], maxTurns: 10, maxEur: 100 };
const quiet = (events: AgentLogEvent[]) => (e: AgentLogEvent) => void events.push(e);

describe("runAgent", () => {
  it("runs a multi-turn loop: tool calls, results appended, until the model stops calling tools", async () => {
    const t = scripted([calls(toolUse("lookup", { q: "a" })), calls(toolUse("lookup", { q: "b" })), says("done")]);
    const { client, records } = clientOf(t);
    const seenInputs: unknown[] = [];
    const r = await client.runAgent({ ...base, tools: [lookup], handlers: { lookup: (input) => (seenInputs.push(input), `found ${(input as { q: string }).q}`) } });
    expect(r.stopped).toBe("end_turn");
    expect(r.turns).toBe(3);
    expect(r.text).toBe("done");
    expect(seenInputs).toEqual([{ q: "a" }, { q: "b" }]);
    // user, (assistant, results) x2, assistant
    expect(r.messages.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant", "user", "assistant"]);
    const first = r.messages[2]!.content as Anthropic.ToolResultBlockParam[];
    expect(first).toEqual([{ type: "tool_result", tool_use_id: (r.messages[1]!.content as Anthropic.ToolUseBlock[])[0]!.id, content: "found a" }]);
    // Each request carries the transcript so far (a copy, not the loop's growing array) and the tools.
    expect(t.seen.map((q) => q.messages.length)).toEqual([1, 3, 5]);
    expect(t.seen.every((q) => q.tools?.[0] === lookup)).toBe(true);
    expect(records).toHaveLength(3);
  });

  it("answers parallel tool calls with all results in one user message", async () => {
    const a = toolUse("lookup", { q: "a" });
    const b = toolUse("lookup", { q: "b" });
    const t = scripted([calls(a, b), says("ok")]);
    const { client } = clientOf(t);
    const r = await client.runAgent({ ...base, tools: [lookup], handlers: { lookup: (i) => `r:${(i as { q: string }).q}` } });
    expect(r.messages).toHaveLength(4);
    expect(r.messages[2]).toEqual({
      role: "user",
      content: [
        { type: "tool_result", tool_use_id: a.id, content: "r:a" },
        { type: "tool_result", tool_use_id: b.id, content: "r:b" },
      ],
    });
  });

  it("turns a handler error, an unknown tool and a thrown non-Error into is_error results, and carries on", async () => {
    const a = toolUse("lookup");
    const b = toolUse("nope");
    const t = scripted([calls(a, b), says("recovered")]);
    const { client } = clientOf(t);
    const r = await client.runAgent({
      ...base,
      tools: [lookup],
      handlers: {
        lookup: async () => {
          throw new Error("disk on fire");
        },
      },
    });
    expect(r.stopped).toBe("end_turn");
    const results = r.messages[2]!.content as Anthropic.ToolResultBlockParam[];
    expect(results[0]).toMatchObject({ tool_use_id: a.id, is_error: true });
    expect(results[0]!.content).toContain("disk on fire");
    expect(results[1]).toMatchObject({ tool_use_id: b.id, is_error: true, content: "Unknown tool: nope" });
    expect(results[0]).not.toHaveProperty("is_error", undefined);
  });

  it("allows images in tool results, and prices them as pictures, not as base64 text", async () => {
    const t = scripted([calls(toolUse("screenshot")), says("seen")]);
    const { client } = clientOf(t);
    const big = "A".repeat(2_000_000);
    const r = await client.runAgent({ ...base, tools: [shot], handlers: { screenshot: () => [png(big), { type: "text", text: "1280x800" }] } });
    const results = r.messages[2]!.content as Anthropic.ToolResultBlockParam[];
    expect(results[0]!.content).toEqual([png(big), { type: "text", text: "1280x800" }]);
    const withImage = estimateCallEur(config, stage, { ...base, messages: r.messages, tools: [shot] });
    const withoutImage = estimateCallEur(config, stage, { ...base, messages: r.messages.slice(0, 2), tools: [shot] });
    // 2 MB of base64 would be ~800k estimated tokens (> €2); as a picture it is tokensPerImage.
    expect(withImage - withoutImage).toBeLessThan(0.05);
  });

  it("stops at maxTurns, logs the cap, and leaves a valid transcript (results of the last turn appended)", async () => {
    const t = scripted([calls(toolUse("lookup")), calls(toolUse("lookup")), calls(toolUse("lookup"))]);
    const { client, records } = clientOf(t);
    const events: AgentLogEvent[] = [];
    const r = await client.runAgent({ ...base, maxTurns: 2, tools: [lookup], handlers: { lookup: () => "x" }, log: quiet(events) });
    expect(r.stopped).toBe("maxTurns");
    expect(r.turns).toBe(2);
    expect(records).toHaveLength(2);
    expect(t.seen).toHaveLength(2);
    expect(r.messages.at(-1)!.role).toBe("user");
    expect(events.at(-1)).toMatchObject({ type: "stop", stopped: "maxTurns", turns: 2 });
  });

  it("stops once the loop's own spend reaches maxEur, and logs the cap", async () => {
    const pricey = (): ModelResponse => ({ ...calls(toolUse("lookup")), usage: usage(1_000_000, 0) });
    const t = scripted([pricey(), pricey(), pricey()]);
    const { client, records } = clientOf(t);
    const events: AgentLogEvent[] = [];
    const turnEur = config.pricesUsdPerMTok[stage.model]!.input * config.eurPerUsd;
    const r = await client.runAgent({ ...base, maxEur: turnEur * 1.5, tools: [lookup], handlers: { lookup: () => "x" }, log: quiet(events) });
    // Turn 1 costs 1 turn's worth (under the cap), turn 2 takes it over: no third call.
    expect(r.stopped).toBe("maxEur");
    expect(r.turns).toBe(2);
    expect(r.costEur).toBeCloseTo(2 * turnEur, 6);
    expect(records.map((x) => x.costEur)).toHaveLength(2);
    expect(events.at(-1)).toMatchObject({ type: "stop", stopped: "maxEur" });
  });

  it("a SpendCapError mid-loop stops the loop and returns what it has", async () => {
    const t = scripted([calls(toolUse("lookup")), calls(toolUse("lookup")), says("never")]);
    let reads = 0;
    // Room for the first turn; by the second the day's spend is at the cap.
    const { client, records } = clientOf(t, { spentToday: async () => (reads++ === 0 ? 0 : config.limits.dailyModelSpendCapEur) });
    const events: AgentLogEvent[] = [];
    const r = await client.runAgent({ ...base, tools: [lookup], handlers: { lookup: () => "x" }, log: quiet(events) });
    expect(r.stopped).toBe("spendCap");
    expect(r.error?.name).toBe("SpendCapError");
    expect(r.turns).toBe(1);
    expect(records).toHaveLength(1);
    expect(t.seen).toHaveLength(1);
    expect(r.messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(events.at(-1)).toMatchObject({ type: "stop", stopped: "spendCap" });
  });

  it("logs every turn's tokens and € per stage through the ledger", async () => {
    const t = scripted([{ ...calls(toolUse("lookup")), usage: usage(2000, 200) }, { ...says("ok"), usage: usage(3000, 300) }]);
    const { client, records } = clientOf(t);
    const r = await client.runAgent({ ...base, tools: [lookup], handlers: { lookup: () => "x" } });
    const p = config.pricesUsdPerMTok[stage.model]!;
    expect(records.map((x) => [x.stage, x.usage.input_tokens, x.usage.output_tokens])).toEqual([
      [STAGE, 2000, 200],
      [STAGE, 3000, 300],
    ]);
    expect(records[0]!.costEur).toBeCloseTo(((2000 * p.input + 200 * p.output) / 1e6) * config.eurPerUsd, 9);
    expect(r.costEur).toBeCloseTo(records[0]!.costEur + records[1]!.costEur, 9);
  });

  it("stops (and reports) on a refusal or max_tokens answer, keeping its cost", async () => {
    const { client, records } = clientOf(scripted([{ ...says(""), stopReason: "refusal" }]));
    const r = await client.runAgent({ ...base, tools: [lookup], handlers: {}, log: () => undefined });
    expect(r.stopped).toBe("refusal");
    expect(r.error?.name).toBe("ModelOutputError");
    expect(records).toHaveLength(1);
    expect(r.costEur).toBeCloseTo(records[0]!.costEur, 9);
  });

  it("a handler can finish the loop; pause_turn continues without tool results", async () => {
    const pause: ModelResponse = { ...says("working"), stopReason: "pause_turn" };
    const t = scripted([pause, calls(toolUse("finish"))]);
    const { client } = clientOf(t);
    const r = await client.runAgent({ ...base, tools: [lookup], handlers: { finish: () => ({ content: "bye", done: true }) } });
    expect(r.stopped).toBe("handler");
    expect(r.turns).toBe(2);
    expect(r.messages.map((m) => m.role)).toEqual(["user", "assistant", "assistant", "user"]);
  });

  it("passes tool_choice and sends only transport errors up", async () => {
    const t = scripted([]);
    const { client } = clientOf(t);
    await expect(client.runAgent({ ...base, tools: [lookup], handlers: {}, toolChoice: { type: "auto" } })).rejects.toThrow("script is empty");
    expect(t.seen[0]!.toolChoice).toEqual({ type: "auto" });
  });
});

describe("requestHash with tools", () => {
  const r0: ModelRequest = { stage: STAGE, system: ["s"], messages: [{ role: "user", content: "hi" }] };

  it("is unchanged for a request without tools (and pictures stay inline there)", () => {
    const withPicture: ModelRequest = { ...r0, messages: [{ role: "user", content: [png("QUJD")] }] };
    // The formula before tool use existed.
    const legacy = (req: ModelRequest) => createHash("sha256").update(JSON.stringify({ model: "m", stage: req.stage, system: req.system, messages: req.messages, schema: req.schema ?? null })).digest("hex").slice(0, 16);
    for (const req of [r0, withPicture, { ...r0, schema: { type: "object" } }, { ...r0, tools: [] }]) expect(requestHash(req, "m")).toBe(legacy(req));
    expect(requestHash(withPicture, "m")).not.toBe(requestHash({ ...withPicture, tools: [lookup] }, "m"));
  });

  it("changes when the tools, the tool choice or a tool result change", () => {
    const h = (req: ModelRequest) => requestHash(req, "m");
    const withTools = { ...r0, tools: [lookup] };
    expect(h(withTools)).not.toBe(h(r0));
    expect(h({ ...withTools, tools: [lookup, shot] })).not.toBe(h(withTools));
    expect(h({ ...withTools, tools: [{ ...lookup, description: "Other" }] })).not.toBe(h(withTools));
    expect(h({ ...withTools, toolChoice: { type: "auto" } })).not.toBe(h(withTools));
    const turn = (result: string): ModelRequest => ({
      ...withTools,
      messages: [...r0.messages, { role: "assistant", content: [{ type: "tool_use", id: "toolu_1", name: "lookup", input: { q: "a" } }] }, { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_1", content: result }] }],
    });
    expect(h(turn("one"))).toBe(h(turn("one")));
    expect(h(turn("one"))).not.toBe(h(turn("two")));
  });

  it("hashes a tool result's picture by its content", () => {
    const turn = (data: string): ModelRequest => ({
      ...r0,
      tools: [shot],
      messages: [...r0.messages, { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_1", content: [png(data)] }] }],
    });
    expect(requestHash(turn("AAAA"), "m")).toBe(requestHash(turn("AAAA"), "m"));
    expect(requestHash(turn("AAAA"), "m")).not.toBe(requestHash(turn("AAAB"), "m"));
  });
});

describe("record and replay of a loop", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "sb-agent-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const run = (transport: ModelTransport) => {
    const { client, records } = clientOf(transport);
    const handled: unknown[] = [];
    const go = () =>
      client.runAgent({ ...base, tools: [lookup, shot], handlers: { lookup: (i) => (handled.push(i), "found"), screenshot: () => [png("QUJDRA==")] }, log: () => undefined });
    return { go, records, handled };
  };

  it("replays a recorded loop to the same transcript, by request hash", async () => {
    const live = scripted([calls(toolUse("lookup", { q: "a" }), toolUse("screenshot")), calls(toolUse("lookup", { q: "b" })), says("fertig")]);
    const first = await run(new RecordingTransport(live, dir)).go();
    expect(readdirSync(dir).filter((f) => f.endsWith(".json"))).toHaveLength(3);
    const replay = new ReplayTransport(dir, true);
    const second = await run(replay).go();
    expect(second.messages).toEqual(first.messages);
    expect(second.stopped).toBe("end_turn");
    expect(replay.remaining).toBe(0);
    expect(replay.hashMismatches).toEqual([]);
  });

  it("a tool turn is matched by hash even when not strict: a changed tool result finds no recording", async () => {
    await run(new RecordingTransport(scripted([calls(toolUse("lookup", { q: "a" })), says("ok")]), dir)).go();
    const changed = clientOf(new ReplayTransport(dir)).client;
    const r = changed.runAgent({ ...base, tools: [lookup, shot], handlers: { lookup: () => "something else" }, log: () => undefined });
    await expect(r).rejects.toThrow(/No recording matches this critique tool request/);
  });
});

describe("advisor tool", () => {
  const advisor: AdvisorToolSpec = { type: "advisor_20260301", name: "advisor", model: "claude-opus-5-5", max_uses: 2, max_tokens: 2000, caching: { type: "ephemeral" } };

  it("sends the beta header and the tool in the beta body; plain requests stay off the beta path", () => {
    const req: ModelRequest = { stage: STAGE, system: ["s"], messages: [{ role: "user", content: "hi" }], tools: [lookup, advisor] };
    const body = betaMessageParams(req, stage);
    expect(body.betas).toEqual([ADVISOR_BETA]);
    expect(ADVISOR_BETA).toBe("advisor-tool-2026-03-01");
    expect(body.tools).toEqual([lookup, advisor]);
    expect(() => messageParams(req, stage)).toThrow(/beta/);
    const plain = messageParams({ ...req, tools: [lookup] }, stage);
    expect(plain.tools).toEqual([lookup]);
    expect(plain).not.toHaveProperty("betas");
    expect(betaMessageParams({ ...req, betas: ["x-1", ADVISOR_BETA] }, stage).betas).toEqual(["x-1", ADVISOR_BETA]);
  });

  it("reserves the advisor's worst case at its own model's price", () => {
    const req: ModelRequest = { stage: STAGE, system: ["s"], messages: [{ role: "user", content: "hi" }] };
    const plain = estimateCallEur(config, stage, { ...req, tools: [lookup] });
    const withAdvisor = estimateCallEur(config, stage, { ...req, tools: [lookup, advisor] });
    const p = config.pricesUsdPerMTok[advisor.model]!;
    expect(withAdvisor - plain).toBeGreaterThan((2 * 2000 * p.output * config.eurPerUsd) / 1e6 - 1e-9);
    expect(() => estimateCallEur(config, stage, { ...req, tools: [{ ...advisor, model: "unpriced-model" }] })).toThrow(/No price configured for advisor model/);
  });

  // The three shapes of `advisor_tool_result.content`, as the API returns them.
  const readable = { type: "advisor_tool_result", tool_use_id: "srvtoolu_1", content: { type: "advisor_result", text: "Use a lighter hero.", stop_reason: "end_turn" } } as const;
  const redacted = { type: "advisor_tool_result", tool_use_id: "srvtoolu_2", content: { type: "advisor_redacted_result", encrypted_content: "ENC==", stop_reason: "end_turn" } } as const;
  const failed = { type: "advisor_tool_result", tool_use_id: "srvtoolu_3", content: { type: "advisor_tool_result_error", error_code: "overloaded" } } as const;

  /** The answer the API gives: thinking, three server-side advisor calls with results, then a client tool call. */
  function advisorAnswer(): ModelResponse {
    const use = toolUse("lookup", { q: "x" });
    const content: ModelContentBlock[] = [
      { type: "thinking", thinking: "hmm", signature: "SIG" },
      { type: "server_tool_use", id: "srvtoolu_1", name: "advisor", input: {} },
      readable,
      { type: "server_tool_use", id: "srvtoolu_2", name: "advisor", input: {} },
      redacted,
      { type: "server_tool_use", id: "srvtoolu_3", name: "advisor", input: {} },
      failed,
      use,
    ];
    return { text: "", stopReason: "tool_use", model: stage.model, usage: usage(), content, toolUses: [{ id: use.id, name: use.name, input: use.input }], advisorUsage: [{ model: "claude-opus-5-5", usage: usage(5000, 800) }] };
  }

  it("carries advisor, thinking and server_tool_use blocks back unchanged, with the tool still present", async () => {
    const answer = advisorAnswer();
    const t = scripted([answer, says("done")]);
    const { client } = clientOf(t);
    const r = await client.runAgent({ ...base, tools: [lookup, advisor], handlers: { lookup: () => "ok" } });
    expect(r.messages[1]).toEqual({ role: "assistant", content: answer.content });
    // The advisor tool is still sent on the next turn (removing it with advisor results in history is a 400).
    expect(t.seen[1]!.tools).toContain(advisor);
    expect(JSON.stringify(t.seen[1]!.messages[1])).toContain("ENC==");
    expect(JSON.stringify(t.seen[1]!.messages[1])).toContain("advisor_tool_result_error");
  });

  it("books the advisor's tokens at the advisor model's price, in the record and in the loop's cost", async () => {
    const t = scripted([advisorAnswer(), says("done")]);
    const { client, records } = clientOf(t);
    const r = await client.runAgent({ ...base, tools: [lookup, advisor], handlers: { lookup: () => "ok" } });
    const exec = config.pricesUsdPerMTok[stage.model]!;
    const adv = config.pricesUsdPerMTok["claude-opus-5-5"]!;
    const expected = ((1000 * exec.input + 100 * exec.output + 5000 * adv.input + 800 * adv.output) / 1e6) * config.eurPerUsd;
    expect(records[0]!.costEur).toBeCloseTo(expected, 9);
    expect(records[0]!.advisor).toEqual([{ model: "claude-opus-5-5", usage: usage(5000, 800) }]);
    expect(records[1]!.advisor).toBeUndefined();
    expect(r.costEur).toBeGreaterThan(records[0]!.costEur - 1e-12);
  });

  it("records and replays advisor_tool_result blocks (readable, redacted, error) unchanged", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "sb-agent-adv-"));
    try {
      const go = (transport: ModelTransport) => clientOf(transport).client.runAgent({ ...base, tools: [lookup, advisor], handlers: { lookup: () => "ok" }, log: () => undefined });
      const first = await go(new RecordingTransport(scripted([advisorAnswer(), says("done")]), dir));
      const second = await go(new ReplayTransport(dir, true));
      expect(second.messages).toEqual(first.messages);
      const blocks = (second.messages[1]!.content as { type: string }[]).map((b) => b.type);
      expect(blocks).toEqual(["thinking", "server_tool_use", "advisor_tool_result", "server_tool_use", "advisor_tool_result", "server_tool_use", "advisor_tool_result", "tool_use"]);
      expect(second.responses[0]!.advisorUsage).toEqual(first.responses[0]!.advisorUsage);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("toModelResponse reads blocks by type, the client tool_use blocks, and the advisor iterations", () => {
    const use = { type: "tool_use" as const, id: "toolu_9", name: "lookup", input: { q: "z" } };
    const msg = {
      id: "msg_1",
      type: "message",
      role: "assistant",
      model: stage.model,
      stop_reason: "tool_use",
      stop_sequence: null,
      content: [{ type: "thinking", thinking: "t", signature: "s" }, { type: "text", text: "Hello ", citations: null }, readable, use, { type: "text", text: "world", citations: null }],
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        iterations: [
          { type: "message", input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
          { type: "advisor_message", model: "claude-opus-5-5", input_tokens: 700, output_tokens: 90, cache_creation_input_tokens: 0, cache_read_input_tokens: 7 },
        ],
      },
    } as unknown as Anthropic.Beta.BetaMessage;
    const res = toModelResponse(msg, stage, { content: true });
    expect(res.text).toBe("Hello world");
    expect(res.stopReason).toBe("tool_use");
    expect(res.toolUses).toEqual([{ id: "toolu_9", name: "lookup", input: { q: "z" } }]);
    expect(res.content).toHaveLength(5);
    expect(res.advisorUsage).toEqual([{ model: "claude-opus-5-5", usage: { input_tokens: 700, output_tokens: 90, cache_creation_input_tokens: 0, cache_read_input_tokens: 7 } }]);
    // Without the tools option the answer keeps its old shape.
    expect(toModelResponse(msg, stage)).toEqual({ text: "Hello world", stopReason: "tool_use", model: stage.model, usage: { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } });
  });
});
