import { describe, expect, it } from "vitest";
import type { ImageGenModelConfig, ImageTransport, ModelRequest, ModelResponse, ModelTransport } from "@sb/engine";
import { CaptureImageTransport, CaptureTransport, messageText, responseOf } from "../src/studio-capture.ts";

const usage = { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
const answer = (text: string, extra: Partial<ModelResponse> = {}): ModelResponse => ({ text, stopReason: "end_turn", usage, model: "claude-opus-5-5", ...extra });
const stage = { model: "claude-opus-5-5" } as Parameters<ModelTransport["send"]>[1];
/** 3072 bytes of base64 data = 3 KB decoded. */
const b64 = "A".repeat(4096);

describe("CaptureTransport", () => {
  it("keeps stage, model, system and messages, with pictures as labels and never their data", async () => {
    const inner: ModelTransport = { send: async () => answer('{"idea":"night to morning"}') };
    const t = new CaptureTransport(inner);
    const req: ModelRequest = {
      stage: "artDirector",
      system: ["You are the art director.", "Second block."],
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64 } },
            { type: "image", source: { type: "url", url: `data:image/png;base64,${b64}` } },
            { type: "text", text: "Business: Pekarna Kvas" },
          ],
        },
        { role: "assistant", content: "Plain answer" },
      ],
      schema: { type: "object" },
    };
    const res = await t.send(req, stage);
    expect(res.text).toBe('{"idea":"night to morning"}');
    expect(t.calls).toHaveLength(1);
    const c = t.calls[0]!;
    expect(c).toMatchObject({ stage: "artDirector", model: "claude-opus-5-5", system: "You are the art director.\n\nSecond block." });
    expect(c.messages).toEqual([
      { role: "user", text: "[image: image/jpeg, 3 KB]\n\n[image: image/png, 3 KB]\n\nBusiness: Pekarna Kvas" },
      { role: "assistant", text: "Plain answer" },
    ]);
    expect(JSON.stringify(t.calls)).not.toContain(b64);
    expect(c.response).toEqual({ idea: "night to morning" });
  });

  it("keeps the calls in order and passes the inner transport's errors through", async () => {
    let n = 0;
    const inner: ModelTransport = {
      send: async () => {
        n++;
        if (n === 3) throw new Error("No recording left for stage rebuild");
        return answer(`answer ${n}`);
      },
    };
    const t = new CaptureTransport(inner);
    const req = (s: ModelRequest["stage"]): ModelRequest => ({ stage: s, system: ["s"], messages: [{ role: "user", content: "hi" }] });
    await t.send(req("artDirector"), stage);
    await t.send(req("rebuild"), stage);
    await expect(t.send(req("rebuild"), stage)).rejects.toThrow("No recording left");
    expect(t.calls.map((c) => [c.stage, c.response])).toEqual([
      ["artDirector", "answer 1"],
      ["rebuild", "answer 2"],
    ]);
  });
});

describe("messageText", () => {
  it("writes tool calls and results inline and drops thinking", () => {
    const text = messageText([
      { type: "thinking", thinking: "secret", signature: "x" },
      { type: "tool_use", id: "t1", name: "crop", input: { box: [1, 2, 3, 4] } },
      { type: "tool_result", tool_use_id: "t1", content: [{ type: "text", text: "cropped" }, { type: "image", source: { type: "base64", media_type: "image/webp", data: b64 } }] },
    ]);
    expect(text).toBe('[tool_use crop: {"box":[1,2,3,4]}]\n\n[tool_result]\ncropped\n[image: image/webp, 3 KB]');
  });

  it("labels a URL picture by its URL and a document by its type", () => {
    expect(messageText([{ type: "image", source: { type: "url", url: "https://example.test/a.jpg" } }])).toBe("[image: https://example.test/a.jpg]");
    expect(messageText([{ type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } }])).toBe("[document: application/pdf, 3 KB]");
  });
});

describe("responseOf", () => {
  it("parses JSON answers, also in a fence, keeps other text as it is, and keeps tool calls", () => {
    expect(responseOf(answer('{"a":1}'))).toEqual({ a: 1 });
    expect(responseOf(answer('```json\n{"tokens":{"x":2}}\n```'))).toEqual({ tokens: { x: 2 } });
    expect(responseOf(answer("Not JSON {at all}"))).toBe("Not JSON {at all}");
    expect(responseOf(answer("{broken"))).toBe("{broken");
    expect(responseOf(answer("", { toolUses: [{ id: "t", name: "finish", input: { ok: true } }] }))).toEqual({ text: "", toolUses: [{ name: "finish", input: { ok: true } }] });
  });
});

describe("CaptureImageTransport", () => {
  it("keeps the last prompt and how many reference images it carried", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const inner: ImageTransport = { generate: async () => bytes };
    const t = new CaptureImageTransport(inner);
    const model = { endpoint: "fal-ai/gpt-image" } as ImageGenModelConfig;
    expect(t.last).toBeNull();
    expect(await t.generate(model, { prompt: "One flat screenshot", image_urls: ["data:a", "data:b", "data:c"] })).toBe(bytes);
    expect(t.last).toEqual({ prompt: "One flat screenshot", references: 3 });
    await t.generate(model, { prompt: "No refs" });
    expect(t.last).toEqual({ prompt: "No refs", references: 0 });
  });
});
