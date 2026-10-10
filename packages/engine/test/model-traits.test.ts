import { afterEach, describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { loadConfig, type AppConfig, type ModelStageConfig } from "@sb/config";
import {
  ModelClient,
  ModelOutputError,
  estimateCallEur,
  messageParams,
  toModelResponse,
  type CallRecord,
  type ModelRequest,
  type ModelResponse,
  type ModelTransport,
} from "../src/index.ts";

/** Haiku 5.5 safety in the model client (design studio M1), against scripted transports: no network. */
const base = loadConfig();
const HAIKU = "claude-haiku-5-5";
const traits = base.modelTraits![HAIKU]!;
const RETRY = traits.refusalRetryModel!;

/** The repo config with `brief` on `stage` (a copy: the cached config is shared by every test). */
const withBrief = (stage: ModelStageConfig): AppConfig => ({ ...base, models: { ...base.models, brief: stage } });
const usage = (input = 1000, output = 100) => ({ input_tokens: input, output_tokens: output, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 });

function scripted(answers: Partial<ModelResponse>[]): ModelTransport & { sent: { req: ModelRequest; stage: ModelStageConfig }[] } {
  const sent: { req: ModelRequest; stage: ModelStageConfig }[] = [];
  return {
    sent,
    async send(req, stage) {
      sent.push({ req, stage });
      const a = answers.shift() ?? {};
      return { text: a.text ?? "{}", stopReason: a.stopReason ?? "end_turn", model: a.model ?? stage.model, usage: a.usage ?? usage() };
    },
  };
}

const req: ModelRequest = { stage: "brief", system: ["sys"], messages: [{ role: "user", content: "hi" }] };

afterEach(() => vi.restoreAllMocks());

describe("a stage on Haiku 5.5", () => {
  it("is sent an explicit effort and at least the max_tokens floor, and no sampling, thinking or fallback params", async () => {
    const config = withBrief({ model: HAIKU, maxTokens: 1000 });
    const t = scripted([{}]);
    await new ModelClient({ config, transport: t, spentToday: async () => 0, onCall: async () => undefined }).call(req);
    const stage = t.sent[0]!.stage;
    expect(stage).toEqual({ model: HAIKU, maxTokens: traits.minMaxTokens, effort: traits.defaultEffort });
    const body = messageParams(req, stage) as unknown as Record<string, unknown>;
    expect(body.max_tokens).toBe(2048);
    expect(body.output_config).toEqual({ effort: "medium" });
    for (const k of ["temperature", "top_p", "top_k", "thinking", "fallbacks"]) expect(body, k).not.toHaveProperty(k);
  });

  it("keeps a stage's own effort and a max_tokens above the floor", async () => {
    const config = withBrief({ model: HAIKU, effort: "low", maxTokens: 8000 });
    const t = scripted([{}]);
    await new ModelClient({ config, transport: t, spentToday: async () => 0, onCall: async () => undefined }).call(req);
    expect(t.sent[0]!.stage).toEqual({ model: HAIKU, effort: "low", maxTokens: 8000 });
  });

  it("leaves a model without traits exactly as configured", async () => {
    const t = scripted([{}]);
    await new ModelClient({ config: base, transport: t, spentToday: async () => 0, onCall: async () => undefined }).call({ ...req, stage: "classify" });
    expect(t.sent[0]!.stage).toBe(base.models.classify);
    expect(base.models.classify.effort).toBeUndefined();
  });

  it("reserves at the floored max_tokens and the long-prompt card for a long request", () => {
    const config = withBrief({ model: HAIKU, maxTokens: 1000 });
    const stage = new ModelClient({ config, transport: scripted([]), spentToday: async () => 0, onCall: async () => undefined }).stageConfig("brief");
    const { charsPerToken } = config.limits.spendReservation;
    const short = { ...req, system: ["x".repeat(10_000 * charsPerToken - 2)] };
    const long = { ...req, system: ["x".repeat(200_000 * charsPerToken - 2)] };
    const eur = (input: number, p: { input: number; output: number }) => ((input * p.input + 2048 * p.output) / 1e6) * config.eurPerUsd;
    expect(estimateCallEur(config, stage, short)).toBeCloseTo(eur(10_000, { input: 0.1, output: 0.5 }), 9);
    expect(estimateCallEur(config, stage, long)).toBeCloseTo(eur(200_000, { input: 0.5, output: 2.5 }), 9);
  });

  it("on a refusal, sends the same request once more on the configured model; both calls are billed and logged", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const config = withBrief({ model: HAIKU, maxTokens: 1000 });
    const t = scripted([{ stopReason: "refusal", text: "", usage: usage(1000, 10) }, { text: '{"ok":true}', usage: usage(1000, 200) }]);
    const calls: CallRecord[] = [];
    const res = await new ModelClient({ config, transport: t, spentToday: async () => 0, onCall: async (r) => void calls.push(r) }).call(req);
    expect(res.text).toBe('{"ok":true}');
    expect(t.sent.map((s) => s.stage.model)).toEqual([HAIKU, RETRY]);
    expect(t.sent[1]!.req).toBe(t.sent[0]!.req);
    expect(t.sent[1]!.stage).toMatchObject({ effort: "medium", maxTokens: 2048 });
    expect(calls.map((c) => [c.model, c.ok])).toEqual([[HAIKU, false], [RETRY, true]]);
    const p = config.pricesUsdPerMTok;
    expect(calls[0]!.costEur).toBeCloseTo(((1000 * p[HAIKU]!.input + 10 * p[HAIKU]!.output) / 1e6) * config.eurPerUsd, 12);
    expect(calls[1]!.costEur).toBeCloseTo(((1000 * p[RETRY]!.input + 200 * p[RETRY]!.output) / 1e6) * config.eurPerUsd, 12);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(`sending it once more on ${RETRY}`));
  });

  it("retries only once: a second refusal throws with both calls' cost", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const config = withBrief({ model: HAIKU, maxTokens: 1000 });
    const t = scripted([{ stopReason: "refusal" }, { stopReason: "refusal" }, {}]);
    const calls: CallRecord[] = [];
    const err = await new ModelClient({ config, transport: t, spentToday: async () => 0, onCall: async (r) => void calls.push(r) }).call(req).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ModelOutputError);
    expect(t.sent).toHaveLength(2);
    expect(calls).toHaveLength(2);
    expect((err as ModelOutputError).costEur).toBeCloseTo(calls[0]!.costEur + calls[1]!.costEur, 12);
  });

  it("a tool loop counts both the refused call and its retry in its spend", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const config = withBrief({ model: HAIKU, maxTokens: 1000 });
    const t = scripted([{ stopReason: "refusal" }, { text: "done" }]);
    const calls: CallRecord[] = [];
    const tool: Anthropic.Tool = { name: "noop", description: "Does nothing", input_schema: { type: "object", properties: {} } };
    const out = await new ModelClient({ config, transport: t, spentToday: async () => 0, onCall: async (r) => void calls.push(r) }).runAgent({
      stage: "brief",
      system: ["sys"],
      messages: [{ role: "user", content: "go" }],
      tools: [tool],
      handlers: {},
      maxTurns: 3,
      maxEur: 1,
      log: () => undefined,
    });
    expect(out.stopped).toBe("end_turn");
    expect(out.costEur).toBeCloseTo(calls[0]!.costEur + calls[1]!.costEur, 12);
  });

  it("a model without a retry model still throws on a refusal, billed once", async () => {
    const t = scripted([{ stopReason: "refusal" }]);
    const calls: CallRecord[] = [];
    await expect(new ModelClient({ config: base, transport: t, spentToday: async () => 0, onCall: async (r) => void calls.push(r) }).call(req)).rejects.toBeInstanceOf(ModelOutputError);
    expect(t.sent).toHaveLength(1);
    expect(calls).toHaveLength(1);
  });

  it("never sends an assistant prefill", async () => {
    const t = scripted([{}]);
    const prefill: ModelRequest = { ...req, messages: [...req.messages, { role: "assistant", content: "{" }] };
    await expect(new ModelClient({ config: withBrief({ model: HAIKU, maxTokens: 1000 }), transport: t, spentToday: async () => 0, onCall: async () => undefined }).call(prefill)).rejects.toThrow(/prefill/);
    expect(t.sent).toHaveLength(0);
  });

  it("reads the answer's text by block type when it starts with thinking blocks", () => {
    const msg = {
      id: "msg_1",
      type: "message",
      role: "assistant",
      model: HAIKU,
      content: [
        { type: "thinking", thinking: "", signature: "sig" },
        { type: "redacted_thinking", data: "x" },
        { type: "text", text: '{"a":', citations: null },
        { type: "text", text: "1}", citations: null },
      ],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: null, cache_read_input_tokens: null },
    } as unknown as Anthropic.Message;
    const res = toModelResponse(msg, { model: HAIKU, maxTokens: 2048, effort: "medium" });
    expect(res.text).toBe('{"a":1}');
    expect(res.usage).toEqual({ input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 });
  });
});
