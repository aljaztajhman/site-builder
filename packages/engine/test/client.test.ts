import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { loadConfig } from "@sb/config";
import { migrateSpec } from "@sb/spec";
import {
  ModelClient,
  ModelOutputError,
  ReplayTransport,
  SpendCapError,
  altTexts,
  chooseDesign,
  critique,
  critiqueView,
  editSpec,
  estimateCallEur,
  extractJson,
  makeBrief,
  messageParams,
  requestHash,
  type CallRecord,
  type ModelRequest,
  type ModelResponse,
  type ModelTransport,
  type SpendLedger,
} from "../src/index.ts";

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

  it("reserves the call's estimate first: two parallel calls near the cap, only one is sent", async () => {
    const estimate = estimateCallEur(config, config.models.brief, req);
    const cap = config.limits.dailyModelSpendCapEur;
    // Room for one estimate, not two.
    const t = fakeTransport([{}, {}]);
    const calls: CallRecord[] = [];
    const client = new ModelClient({ config, transport: t, spentToday: async () => cap - 1.5 * estimate, onCall: async (r) => void calls.push(r) });
    const results = await Promise.allSettled([client.call(req), client.call(req)]);
    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect((results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason).toBeInstanceOf(SpendCapError);
    expect(t.seen).toHaveLength(1);
    expect(calls).toHaveLength(1);
    // Settled: the estimate is free again, so the next call fits.
    await client.call(req);
    expect(t.seen).toHaveLength(2);
  });

  it("frees the reservation when the request fails, and logs nothing", async () => {
    const calls: CallRecord[] = [];
    const ledgerLog: string[] = [];
    let failing = true;
    const transport: ModelTransport = { send: async (r, s) => (failing ? Promise.reject(new Error("connection reset")) : fakeTransport([{}]).send(r, s)) };
    const ledger: SpendLedger = {
      async reserve(c) {
        ledgerLog.push(`reserve ${c.stage} ${c.estimateEur > 0}`);
        return { settle: async (r) => void (ledgerLog.push("settle"), calls.push(r)), release: async () => void ledgerLog.push("release") };
      },
    };
    const client = new ModelClient({ config, transport, ledger });
    await expect(client.call(req)).rejects.toThrow(/connection reset/);
    failing = false;
    await client.call(req);
    expect(ledgerLog).toEqual(["reserve brief true", "release", "reserve brief true", "settle"]);
    expect(calls).toHaveLength(1);
  });

  it("estimates input from the request's text and images, output at the stage's maxTokens", () => {
    const p = config.pricesUsdPerMTok[config.models.critique.model]!;
    const { charsPerToken, tokensPerImage } = config.limits.spendReservation;
    const image = { type: "image" as const, source: { type: "base64" as const, media_type: "image/png" as const, data: "A".repeat(500_000) } };
    const critiqueReq: ModelRequest = { stage: "critique", system: ["x".repeat(1000)], messages: [{ role: "user", content: [image, image, { type: "text", text: "y".repeat(1500) }] }] };
    const input = Math.ceil(2500 / charsPerToken) + 2 * tokensPerImage;
    expect(estimateCallEur(config, config.models.critique, critiqueReq)).toBeCloseTo(((input * p.input + config.models.critique.maxTokens * p.output) / 1e6) * config.eurPerUsd, 9);
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

describe("request shape", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const spec = migrateSpec(JSON.parse(readFileSync(path.join(here, "../../../tools/eval/golden/gostilna-zlata-zlica.json"), "utf8")));
  const STOP = new Error("captured");
  /** Runs one stage against a transport that keeps its request and answers nothing. */
  async function captured(run: (client: ModelClient) => Promise<unknown>): Promise<ModelRequest> {
    const seen: ModelRequest[] = [];
    const transport: ModelTransport = {
      async send(r) {
        seen.push(r);
        throw STOP;
      },
    };
    await expect(run(new ModelClient({ config, transport, spentToday: async () => 0, onCall: async () => undefined }))).rejects.toBe(STOP);
    return seen[0]!;
  }
  const breakpoints = (r: ModelRequest) => (messageParams(r, config.models[r.stage]).system as { cache_control?: unknown }[]).filter((b) => b.cache_control).length;
  const png = async () => new Uint8Array(await sharp({ create: { width: 360, height: 900, channels: 3, background: "#ffffff" } }).png().toBuffer());
  const critiqueRequest = () => captured(async (c) => critique(c, { spec, mobilePng: await png(), desktopPng: await png(), failures: [], corpus: "" }));

  it("brief, design and alt text send no cache breakpoints (no job reads them back); the hash ignores it", async () => {
    const brief = await captured((c) => makeBrief(c, { description: "Gostilna", businessType: "restaurant", photoCount: 0, generatedSlots: 0, hasLogo: false, scope: "home" }));
    const design = await captured((c) => chooseDesign(c, { brief: { name: "Gostilna", businessType: "restaurant", tone: "warm", summary: "" } as never, swatches: [], photoCount: 0, generatedCount: 0 }));
    const alt = await captured((c) => altTexts(c, [{ jpegBase64: "AAAA" }]));
    for (const r of [brief, design, alt]) {
      expect(r.cache, r.stage).toBe(false);
      expect(breakpoints(r), r.stage).toBe(0);
      expect((messageParams(r, config.models[r.stage]).system as unknown[]).length, r.stage).toBe(r.system.length);
    }
    expect(design.system).toHaveLength(2);
    expect(requestHash(brief, "m")).toBe(requestHash({ ...brief, cache: true }, "m"));
  });

  it("critique and edit keep a breakpoint after every system block (they share the cached section catalogue)", async () => {
    const edit = await captured((c) => editSpec(c, { spec, message: "Temnejša glava.", corpus: "" }));
    const crit = await critiqueRequest();
    for (const r of [edit, crit]) {
      expect(r.cache, r.stage).toBeUndefined();
      expect(breakpoints(r), r.stage).toBe(2);
    }
    expect(crit.system[0]).toBe(edit.system[0]);
  });

  it("the critique reads only the homepage, the chrome and the business; every page keeps its index", async () => {
    const crit = await critiqueRequest();
    const text = (crit.messages[0]!.content as { type: string; text?: string }[])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    const view = critiqueView(spec);
    expect(text).toContain(JSON.stringify(view));
    expect(view.pages.map((p) => p.id)).toEqual(spec.pages.map((p) => p.id));
    expect(spec.pages[0]!.kind).toBe("home");
    expect(view.pages[0]).toEqual(spec.pages[0]);
    // Other pages' sections, the design and the assets stay out.
    expect(view.pages.slice(1).every((p) => !("sections" in p))).toBe(true);
    expect(text).not.toContain(JSON.stringify(spec.pages[1]!.sections[0]));
    expect(text).not.toContain(spec.assets.images[0]!.alt);
    expect(text).not.toContain(`"direction":"${spec.design.direction}"`);
    expect(JSON.stringify(view).length).toBeLessThan(JSON.stringify(spec).length * 0.6);
  });
});
