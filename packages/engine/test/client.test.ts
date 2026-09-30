import { describe, expect, it } from "vitest";
import { loadConfig } from "@sb/config";
import { ModelClient, ModelOutputError, ReplayTransport, SpendCapError, extractJson, requestHash, type CallRecord, type ModelRequest, type ModelResponse, type ModelTransport } from "../src/index.ts";

const config = loadConfig();

function fakeTransport(responses: Partial<ModelResponse>[]): ModelTransport & { seen: ModelRequest[] } {
  const seen: ModelRequest[] = [];
  return {
    seen,
    async send(req, stage) {
      seen.push(req);
      const r = responses.shift() ?? {};
      return {
        text: r.text ?? "{}",
        stopReason: r.stopReason ?? "end_turn",
        model: r.model ?? stage.model,
        usage: r.usage ?? { input_tokens: 1_000_000, output_tokens: 100_000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      };
    },
  };
}

const req: ModelRequest = { stage: "brief", system: ["sys"], messages: [{ role: "user", content: "hi" }] };

describe("ModelClient", () => {
  it("logs tokens and € per stage using config prices", async () => {
    const calls: CallRecord[] = [];
    const client = new ModelClient({ config, transport: fakeTransport([{}]), spentToday: async () => 0, onCall: async (r) => void calls.push(r) });
    await client.call(req);
    expect(calls).toHaveLength(1);
    const p = config.pricesUsdPerMTok[config.models.brief.model]!;
    expect(calls[0]!.stage).toBe("brief");
    expect(calls[0]!.costEur).toBeCloseTo((p.input + p.output * 0.1) * config.eurPerUsd, 6);
  });

  it("refuses to call once the daily cap is reached", async () => {
    const t = fakeTransport([{}]);
    const client = new ModelClient({ config, transport: t, spentToday: async () => config.limits.dailyModelSpendCapEur, onCall: async () => undefined });
    await expect(client.call(req)).rejects.toBeInstanceOf(SpendCapError);
    expect(t.seen).toHaveLength(0);
  });

  it("logs and then rejects truncated or refused output", async () => {
    const calls: CallRecord[] = [];
    const client = new ModelClient({ config, transport: fakeTransport([{ stopReason: "max_tokens" }, { stopReason: "refusal" }]), spentToday: async () => 0, onCall: async (r) => void calls.push(r) });
    await expect(client.call(req)).rejects.toBeInstanceOf(ModelOutputError);
    await expect(client.call(req)).rejects.toBeInstanceOf(ModelOutputError);
    expect(calls.map((c) => c.ok)).toEqual([false, false]);
  });

  it("parses JSON, tolerating a fenced block", async () => {
    const client = new ModelClient({ config, transport: fakeTransport([{ text: '```json\n{"a":1}\n```' }]), spentToday: async () => 0, onCall: async () => undefined });
    const { data } = await client.callJson({ ...req, schema: { type: "object" } }, (d) => d);
    expect(data).toEqual({ a: 1 });
  });

  it("falls back to plain JSON when the API rejects the schema, and remembers it per stage", async () => {
    const seen: boolean[] = [];
    const transport: ModelTransport = {
      async send(r, stage) {
        seen.push(!!r.schema);
        if (r.schema) throw Object.assign(new Error("400 Schemas contains too many parameters with union types"), { status: 400 });
        return { text: '{"a":1}', stopReason: "end_turn", model: stage.model, usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } };
      },
    };
    const client = new ModelClient({ config, transport, spentToday: async () => 0, onCall: async () => undefined });
    await client.callJson({ ...req, schema: { type: "object" } }, (d) => d);
    await client.callJson({ ...req, schema: { type: "object" } }, (d) => d);
    expect(seen).toEqual([true, false, false]);
  });

  it("retries up to twice with the validation errors, then gives up", async () => {
    const client = new ModelClient({ config, transport: fakeTransport([{ text: '{"a":"x"}' }, { text: '{"a":"y"}' }, { text: '{"a":2}' }]), spentToday: async () => 0, onCall: async () => undefined });
    const parse = (d: unknown) => {
      if (typeof (d as { a: unknown }).a !== "number") throw new Error("a must be a number");
      return d as { a: number };
    };
    expect((await client.callJson({ ...req, schema: { type: "object" } }, parse)).data).toEqual({ a: 2 });
    const bad = new ModelClient({ config, transport: fakeTransport([{ text: "nope" }, { text: "nope" }, { text: "nope" }]), spentToday: async () => 0, onCall: async () => undefined });
    await expect(bad.callJson({ ...req, schema: { type: "object" } }, parse)).rejects.toBeInstanceOf(ModelOutputError);
  });
});

describe("ReplayTransport", () => {
  const response: ModelResponse = { text: "{}", stopReason: "end_turn", model: "claude-sonnet-5-5", usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } };
  const rec = (stage: ModelRequest["stage"], hash = "x") => ({ seq: 0, stage, model: "claude-sonnet-5-5", hash, origin: "synthetic" as const, response });

  it("replays each stage's recordings in order, whatever the order across stages", async () => {
    const texts = (t: string) => ({ ...response, text: t });
    const t = new ReplayTransport([rec("classify"), { ...rec("brief"), response: texts("b1") }, rec("altText"), { ...rec("brief"), response: texts("b2") }]);
    // altText runs beside brief and design, so it may come first.
    expect((await t.send({ ...req, stage: "altText" }, config.models.altText)).text).toBe("{}");
    expect((await t.send(req, config.models.brief)).text).toBe("b1");
    expect((await t.send(req, config.models.brief)).text).toBe("b2");
    await expect(t.send({ ...req, stage: "design" }, config.models.design)).rejects.toThrow(/No recording left for stage design/);
    expect(t.remaining).toBe(1);
  });

  it("strict mode rejects a changed prompt", async () => {
    const good = requestHash(req, config.models.brief.model);
    const t = new ReplayTransport([rec("brief", good), rec("brief", "stale")], true);
    await t.send(req, config.models.brief);
    await expect(t.send(req, config.models.brief)).rejects.toThrow(/re-record/);
  });
});

describe("extractJson", () => {
  it("takes the corrected answer when the model answers twice (live eval, pekarna-kvas critique)", async () => {
    const { readFileSync } = await import("node:fs");
    const text = readFileSync(new URL("./fixtures/critique-self-corrected.txt", import.meta.url), "utf8");
    expect(() => JSON.parse(text.slice(text.indexOf("{")))).toThrow();
    const out = JSON.parse(extractJson(text)) as { issues: string[]; patches: { path: string }[] };
    expect(text.lastIndexOf(extractJson(text))).toBeGreaterThan(text.indexOf("Corrected output"));
    expect(out.patches.some((p) => p.path.endsWith("/price"))).toBe(false);
  });

  it("handles braces and quotes inside strings, prose around the JSON, and fences", () => {
    expect(JSON.parse(extractJson('Here: {"reply":"a } and \\" {","patches":[]} done.'))).toEqual({ reply: 'a } and " {', patches: [] });
    expect(JSON.parse(extractJson('```json\n{"a":1}\n```'))).toEqual({ a: 1 });
    expect(JSON.parse(extractJson('{"reply":"long answer text here","patches":[{"op":"add"}]}\nI used {"x":1} as a fallback.'))).toEqual({ reply: "long answer text here", patches: [{ op: "add" }] });
  });

  it("returns the raw text from the first bracket when nothing parses, so the error says why", () => {
    expect(extractJson('Sure: {"a": 1,')).toBe('{"a": 1,');
  });
});
