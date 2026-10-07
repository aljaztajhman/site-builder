import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { costEur, loadConfig } from "@sb/config";
import { ImageGenerator, imageCostEur, requestBody, type ImageTransport, type ModelTransport } from "@sb/engine";
import { CachedImageTransport, meteredImages, meteredModel, pictureKey, type Meter } from "../src/eval-transports.ts";

/** fal pictures cached by request in eval runs, and what a run really paid (it-eval-cost-cuts). */
const config = loadConfig();
const model = config.imageGen.models[config.imageGen.pipeline.model]!;
let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "sb-image-cache-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** fal: a small JPEG per call, a different colour each time, counted. */
function fal(): ImageTransport & { calls: number } {
  const t = {
    calls: 0,
    async generate() {
      t.calls++;
      return new Uint8Array(await sharp({ create: { width: 48, height: 32, channels: 3, background: { r: 40 * t.calls, g: 90, b: 60 } } }).jpeg().toBuffer());
    },
  };
  return t;
}

describe("CachedImageTransport", () => {
  it("pays for a picture once: the same request comes from the cache, a changed prompt is a new picture", async () => {
    const inner = fal();
    const meter: Meter = { eur: 0 };
    const cache = new CachedImageTransport(meteredImages(inner, config, meter), dir);
    const body = requestBody(config, model, "A loaf of bread on a wooden table.", false);
    const first = await cache.generate(model, body);
    const again = await cache.generate(model, body);
    expect(again).toEqual(first);
    expect(inner.calls).toBe(1);
    await cache.generate(model, requestBody(config, model, "Rolls in a basket.", false));
    expect(inner.calls).toBe(2);
    expect(cache.stats).toEqual({ cached: 1, made: 2 });
    expect(readdirSync(dir).sort()).toEqual([`${pictureKey(model, body)}.jpg`, `${pictureKey(model, requestBody(config, model, "Rolls in a basket.", false))}.jpg`].sort());
    const { width, height } = config.imageGen.landscape;
    expect(meter.eur).toBeCloseTo(2 * imageCostEur(config, model, width, height), 9);
    // A new run (a new transport on the same folder) pays nothing for either.
    const next = fal();
    const reused = new CachedImageTransport(next, dir);
    await reused.generate(model, body);
    expect(next.calls).toBe(0);
  });

  it("the key covers the whole request: quality and size change it", () => {
    const body = requestBody(config, model, "Bread.", false);
    expect(pictureKey(model, body)).not.toBe(pictureKey(model, { ...body, quality: "medium" }));
    expect(pictureKey(model, body)).not.toBe(pictureKey(model, requestBody(config, model, "Bread.", true)));
    expect(pictureKey(model, body)).toBe(pictureKey(model, requestBody(config, model, "Bread.", false)));
  });

  it("the pipeline still logs a cached picture at its price (the report prices like production); only the meter says it was free", async () => {
    const meter: Meter = { eur: 0 };
    const cache = new CachedImageTransport(meteredImages(fal(), config, meter), dir);
    const logged: number[] = [];
    const gen = new ImageGenerator({ config, transport: cache, spentToday: async () => 0, onCall: async (r) => void logged.push(r.costEur) });
    // An earlier run made this picture (the pipeline appends the configured style to the prompt).
    await cache.generate(model, requestBody(config, model, `Bread. ${config.imageGen.pipeline.style}`, false));
    const paid = meter.eur;
    const picture = await gen.generate("Bread.");
    expect(picture.width).toBe(48);
    expect(cache.stats).toEqual({ cached: 1, made: 1 });
    expect(meter.eur).toBe(paid);
    expect(logged).toHaveLength(1);
    expect(logged[0]).toBeGreaterThan(0);
  });
});

describe("meteredModel", () => {
  it("adds each answered call at its config price, half for a batch answer", async () => {
    const usage = { input_tokens: 1000, output_tokens: 100, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
    let batch = false;
    const inner: ModelTransport = { send: async (_r, stage) => ({ text: "{}", stopReason: "end_turn", model: stage.model, usage, ...(batch ? { batch } : {}) }) };
    const meter: Meter = { eur: 0 };
    const t = meteredModel(inner, config, meter);
    const req = { stage: "brief" as const, system: ["s"], messages: [{ role: "user" as const, content: "x" }] };
    await t.send(req, config.models.brief);
    const full = costEur(config, config.models.brief.model, usage);
    expect(meter.eur).toBeCloseTo(full, 12);
    batch = true;
    await t.send(req, config.models.brief);
    expect(meter.eur).toBeCloseTo(full * 1.5, 12);
  });
});
