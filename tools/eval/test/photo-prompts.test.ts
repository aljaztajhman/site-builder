import { describe, expect, it } from "vitest";
import { loadConfig } from "@sb/config";
import { loadFixtures } from "../src/fixtures/load.ts";
import {
  estimateEur,
  fullPrompt,
  imageCostEur,
  isPortrait,
  loadPhotoPrompts,
  photoKey,
  requestBody,
} from "../src/fixtures/photo-prompts.ts";

const config = loadConfig();
const prompts = loadPhotoPrompts();
const keys = loadFixtures().flatMap((f) => f.photos.map((p) => photoKey(f.id, p.file)));

describe("photo prompts", () => {
  it("has exactly one prompt per fixture photo", () => {
    expect(Object.keys(prompts.photos).sort()).toEqual([...keys].sort());
  });

  it("compares only real fixture photos, each once", () => {
    for (const k of prompts.compare) expect(keys).toContain(k);
    expect(new Set(prompts.compare).size).toBe(prompts.compare.length);
  });

  it("appends the shared style and asks for no lettering", () => {
    const p = fullPrompt(prompts, "pekarna-kvas/01");
    expect(p.endsWith(prompts.style)).toBe(true);
    expect(prompts.style).toMatch(/no text/i);
  });

  it("keeps the stand-ins' orientation: 02, 05, 08 portrait", () => {
    expect(isPortrait("pekarna-kvas/02")).toBe(true);
    expect(isPortrait("gostilna-zlata-zlica/08")).toBe(true);
    expect(isPortrait("pekarna-kvas/01")).toBe(false);
  });
});

describe("image requests and cost", () => {
  const models = config.imageGen.models;

  it("sends an aspect ratio or an explicit size, per model", () => {
    for (const m of Object.values(models)) {
      const body = requestBody(config, m, "x", true);
      expect(body.prompt).toBe("x");
      expect(body.num_images).toBe(1);
      if (m.sizeParam === "aspect_ratio") expect(body.aspect_ratio).toBe("2:3");
      else expect(body.image_size).toEqual({ width: 1024, height: 1536 });
    }
  });

  it("prices per image or per delivered megapixel, in euros", () => {
    const perImage = { endpoint: "a", sizeParam: "aspect_ratio" as const, params: {}, usdPerImage: 0.1 };
    const perMp = { endpoint: "b", sizeParam: "image_size" as const, params: {}, usdPerMegapixel: 0.03 };
    expect(imageCostEur(config, perImage, 4000, 4000)).toBeCloseTo(0.1 * config.eurPerUsd);
    expect(imageCostEur(config, perMp, 1000, 2000)).toBeCloseTo(0.06 * config.eurPerUsd);
  });

  it("estimates the 30-image comparison under €3", () => {
    const total = Object.values(models).reduce(
      (sum, m) => sum + prompts.compare.reduce((s, k) => s + estimateEur(config, m, isPortrait(k)), 0),
      0,
    );
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThan(3);
  });
});
