import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "@sb/config";
import { direction as directionById } from "@sb/spec";
import { FalImageTransport, ImageBilledError, ImageGenerator, SpendCapError, generatedImageCount, heroRule, photoLine, StandInImageTransport, imageCostEur, requestBody, type CallRecord, type ImageTransport } from "../src/index.ts";

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

  it("books an image fal made but we couldn't download at its price (we were billed)", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      urls.push(url);
      if (url.startsWith("https://fal.run/")) return new Response(JSON.stringify({ images: [{ url: "https://fal.media/files/x.jpg" }] }), { status: 200 });
      return new Response("gone", { status: 503 });
    });
    try {
      const calls: CallRecord[] = [];
      const gen = new ImageGenerator({ config, transport: new FalImageTransport("test-key"), spentToday: async () => 0, onCall: async (r) => void calls.push(r) });
      const err = await gen.generate("x").catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ImageBilledError);
      expect((err as Error).message).toMatch(/download failed \(HTTP 503\)/);
      // One request, the download tried twice; nothing sent again to fal.
      expect(urls).toEqual([`https://fal.run/${model.endpoint}`, "https://fal.media/files/x.jpg", "https://fal.media/files/x.jpg"]);
      const { width, height } = config.imageGen.landscape;
      expect(calls).toEqual([expect.objectContaining({ stage: "imageGen", ok: false, costEur: imageCostEur(config, model, width, height) })]);
      expect(calls[0]!.costEur).toBeGreaterThan(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("starts no picture once the job has stopped, and frees a reservation the stop overtook", async () => {
    const stand = new StandInImageTransport();
    const calls: CallRecord[] = [];
    const gen = new ImageGenerator({ config, transport: stand, spentToday: async () => 0, onCall: async (r) => void calls.push(r) });
    const stopped = new AbortController();
    stopped.abort(new Error("job failed"));
    await expect(gen.generate("x", { signal: stopped.signal })).rejects.toThrow(/job failed/);

    // Stopped while the reservation was being made: released, nothing sent, nothing booked.
    const late = new AbortController();
    const log: string[] = [];
    const racing = new ImageGenerator({
      config,
      transport: stand,
      ledger: {
        async reserve() {
          late.abort(new Error("job failed meanwhile"));
          return { settle: async () => void log.push("settle"), release: async () => void log.push("release") };
        },
      },
    });
    await expect(racing.generate("x", { signal: late.signal })).rejects.toThrow(/meanwhile/);
    expect(log).toEqual(["release"]);
    expect(stand.calls).toBe(0);
    expect(calls).toEqual([]);
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
  it("asks for the direction's picture hero only when a hero-suitable picture exists", () => {
    const softStudio = directionById("soft-studio").layout.heroes;
    expect(heroRule([], softStudio)).toBe("");
    const rule = heroRule(["img_g1"], softStudio);
    expect(rule).toContain("img_g1");
    expect(rule).toContain("not hero-type");
    for (const h of softStudio) expect(rule).toContain(h);
  });
  it("leaves a typographic direction its type hero", () => {
    expect(directionById("editorial").layout.heroes.some((h) => h.startsWith("hero-split") || h.startsWith("hero-image"))).toBe(false);
    expect(heroRule(["img_g1"], directionById("editorial").layout.heroes)).toBe("");
  });
});
