import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { costEur, loadConfig } from "@sb/config";
import { BatchTransport, ModelClient, type BatchApi, type CallRecord, type ModelRequest } from "../src/index.ts";

/** The eval judge through the Message Batches API (it-eval-cost-cuts): queued, sent as one batch, priced at half. */
const config = loadConfig();
const req = (text: string): ModelRequest & { schema: Record<string, unknown> } => ({ stage: "judge", system: ["Score it."], messages: [{ role: "user", content: text }], schema: { type: "object", properties: { score: { type: "number" } }, required: ["score"], additionalProperties: false } });
const usage = { input_tokens: 10_000, output_tokens: 1_000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };

/** A fake batches API: answers each request with `answer(params)`, "ended" after `polls` retrieves. */
function fakeApi(answer: (p: Anthropic.MessageCreateParamsNonStreaming) => string | null, polls = 1) {
  const created: Anthropic.Messages.BatchCreateParams[] = [];
  let left = polls;
  const api = {
    create: async (body: Anthropic.Messages.BatchCreateParams) => {
      created.push(body);
      return { id: `batch_${created.length}`, processing_status: "in_progress" };
    },
    retrieve: async (id: string) => ({ id, processing_status: --left <= 0 ? "ended" : "in_progress" }),
    results: async () =>
      (async function* () {
        // Results come back in any order.
        for (const r of [...created.at(-1)!.requests].reverse()) {
          const text = answer(r.params);
          yield text === null
            ? { custom_id: r.custom_id, result: { type: "errored", error: { type: "error", error: { type: "api_error", message: "boom" } } } }
            : { custom_id: r.custom_id, result: { type: "succeeded", message: { id: "m", type: "message", role: "assistant", model: r.params.model, content: [{ type: "text", text }], stop_reason: "end_turn", usage } } };
        }
      })(),
  };
  return { api: api as unknown as BatchApi, created };
}

describe("BatchTransport", () => {
  it("sends the queued requests as one batch with the Messages API body, and matches results by custom_id", async () => {
    const { api, created } = fakeApi((p) => JSON.stringify({ score: Number((p.messages[0]!.content as string).slice(4)) }));
    const t = new BatchTransport(api, 1);
    const calls: CallRecord[] = [];
    const client = new ModelClient({ config, transport: t, spentToday: async () => 0, onCall: async (r) => void calls.push(r) });
    const work = [1, 2, 3].map((n) => client.callJson(req(`page${n}`), (d) => d as { score: number }));
    await t.drain(work);
    expect((await Promise.all(work)).map((w) => w.data.score)).toEqual([1, 2, 3]);
    expect(created).toHaveLength(1);
    const params = created[0]!.requests[0]!.params;
    expect(params.model).toBe(config.models.judge.model);
    expect(params.max_tokens).toBe(config.models.judge.maxTokens);
    expect(params.output_config?.effort).toBe(config.models.judge.effort);
    expect(params.output_config?.format?.type).toBe("json_schema");
    // Half price (config batchPriceFactor).
    expect(calls[0]!.costEur).toBeCloseTo(costEur(config, config.models.judge.model, usage) * config.batchPriceFactor, 9);
    expect(config.batchPriceFactor).toBe(0.5);
  });

  it("an invalid answer is retried in a second batch; an errored request fails only its caller", async () => {
    let first = true;
    const { api, created } = fakeApi((p) => {
      const text = p.messages[0]!.content as string;
      if (text === "bad") return null;
      if (first) {
        first = false;
        return "not json";
      }
      return JSON.stringify({ score: 4 });
    });
    const t = new BatchTransport(api, 1);
    const client = new ModelClient({ config, transport: t, spentToday: async () => 0, onCall: async () => undefined });
    const ok = client.callJson(req("good"), (d) => d as { score: number });
    const bad = client.callJson(req("bad"), (d) => d as { score: number });
    await t.drain([ok, bad]);
    expect((await ok).data.score).toBe(4);
    await expect(bad).rejects.toThrow(/errored/);
    expect(created).toHaveLength(2);
    expect(created[1]!.requests).toHaveLength(1);
  });
});
