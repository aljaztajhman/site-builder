import { describe, expect, it } from "vitest";
import { loadConfig } from "@sb/config";
import { ImageGenerator, SpendCapError, generatedImageCount, heroRule, photoLine, StandInImageTransport, imageCostEur, requestBody, type CallRecord, type ImageTransport } from "../src/index.ts";

const config = loadConfig();
const model = config.imageGen.models[config.imageGen.pipeline.model]!;

describe("image generation", () => {
  it("asks fal for a landscape image with the pipeline style appended, priced from config", async () => {
    const seen: Record<string, unknown>[] = [];
    const transport: ImageTransport = { generate: async (m, body) => (seen.push(body), new StandInImageTransport().generate(m, body)) };
    const calls: CallRecord[] = [];
    const gen = new ImageGenerator({ config, transport, spentToday: async () => 0, onCall: async (r) => void calls.push(r) });
    const img = await gen.generate("Copper pipes on a workbench");
    expect(seen[0]!.prompt).toBe(`Copper pipes on a workbench ${config.imageGen.pipeline.style}`);
    expect(seen[0]).toMatchObject(requestBody(config, model, `Copper pipes on a workbench ${config.imageGen.pipeline.style}`, false));
    expect([img.width, img.height]).toEqual([config.imageGen.landscape.width, config.imageGen.landscape.height]);
    expect(img.costEur).toBeCloseTo(imageCostEur(config, model, img.width, img.height));
    expect(calls).toEqual([expect.objectContaining({ stage: "imageGen", model: config.imageGen.pipeline.model, ok: true, costEur: img.costEur })]);
  });

  it("stops at the daily spend cap before calling fal", async () => {
    const stand = new StandInImageTransport();
    const gen = new ImageGenerator({ config, transport: stand, spentToday: async () => config.limits.dailyModelSpendCapEur, onCall: async () => undefined });
    await expect(gen.generate("x")).rejects.toBeInstanceOf(SpendCapError);
    expect(stand.calls).toBe(0);
  });

  it("logs a failed request at no cost (fal bills only delivered images)", async () => {
    const calls: CallRecord[] = [];
    const transport: ImageTransport = { generate: async () => Promise.reject(new Error("fal-ai: HTTP 500")) };
    const gen = new ImageGenerator({ config, transport, spentToday: async () => 0, onCall: async (r) => void calls.push(r) });
    await expect(gen.generate("x")).rejects.toThrow(/HTTP 500/);
    expect(calls).toEqual([expect.objectContaining({ stage: "imageGen", ok: false, costEur: 0 })]);
  });
});

describe("generated image count", () => {
  const fill = config.imageGen.pipeline.fillUpTo.full;
  it("fills up to the configured count when a generator exists", () => {
    expect(generatedImageCount(config, 0, true, "full")).toEqual({ wanted: fill, skipped: null });
    expect(generatedImageCount(config, fill, true, "full")).toEqual({ wanted: 0, skipped: null });
  });
  it("uses fewer pictures for a homepage preview than for a full site", () => {
    expect(config.imageGen.pipeline.fillUpTo.home).toBeLessThan(fill);
    expect(generatedImageCount(config, 0, true, "home").wanted).toBe(config.imageGen.pipeline.fillUpTo.home);
  });
  it("says why when pictures are wanted but no image service is configured", () => {
    const r = generatedImageCount(config, 0, false, "full");
    expect(r.wanted).toBe(0);
    expect(r.skipped).toContain("FAL_KEY");
    expect(generatedImageCount(config, fill, false, "full")).toEqual({ wanted: 0, skipped: null });
  });
});

describe("pictures in the prompts", () => {
  it("counts generated pictures when the design step chooses a direction", () => {
    expect(photoLine(0, 0)).toContain("typography-led");
    expect(photoLine(0, 3)).toContain("3 generated mood picture(s)");
    expect(photoLine(0, 3)).toContain("show pictures");
    expect(photoLine(4, 0)).not.toContain("generated");
  });
  it("asks for a picture hero only when a hero-suitable picture exists", () => {
    expect(heroRule([])).toBe("");
    expect(heroRule(["gen_01"])).toContain("gen_01");
    expect(heroRule(["gen_01"])).toContain("not hero-type");
  });
});
