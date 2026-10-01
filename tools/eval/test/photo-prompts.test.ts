import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { loadConfig } from "@sb/config";
import { FIXTURES_DIR, loadFixtures } from "../src/fixtures/load.ts";
import {
  estimateEur,
  fullPrompt,
  imageCostEur,
  isPortrait,
  loadPhotoPrompts,
  nextManifestEntry,
  photoKey,
  requestBody,
  type ManifestEntry,
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

describe("photo manifest entries", () => {
  const made = { model: "m", endpoint: "e", prompt: "new", width: 1536, height: 1024, eur: 0.07, createdAt: "2026-10-02" };
  const old = { ...made, prompt: "old", createdAt: "2026-10-01" };

  it("moves a photo marked reject into rejected, with its reason, prompt and cost", () => {
    const next = nextManifestEntry({ ...old, reject: "lettering on a sign" }, made);
    expect(next).toEqual({ ...made, rejected: [{ reason: "lettering on a sign", prompt: "old", eur: 0.07, createdAt: "2026-10-01" }] });
    const again = nextManifestEntry({ ...next, reject: "wrong subject" }, { ...made, createdAt: "2026-10-03" });
    expect(again.rejected?.map((r) => r.reason)).toEqual(["lettering on a sign", "wrong subject"]);
    expect(again.reject).toBeUndefined();
  });

  it("replaces an unmarked entry (--force) without recording a rejection", () => {
    expect(nextManifestEntry(old, made)).toEqual(made);
    expect(nextManifestEntry(undefined, made)).toEqual(made);
  });
});

describe("committed fixture photos", () => {
  const manifest = JSON.parse(readFileSync(path.join(FIXTURES_DIR, "photo-manifest.json"), "utf8")) as Record<string, ManifestEntry>;
  const files = new Map(loadFixtures().flatMap((f) => f.photos.map((p) => [photoKey(f.id, p.file), p.path] as const)));

  it("records model, the current prompt and € for every photo (rejected attempts with a reason, none pending)", () => {
    expect(Object.keys(manifest).sort()).toEqual([...keys].sort());
    for (const k of keys) {
      const e = manifest[k]!;
      expect(Object.keys(config.imageGen.models), k).toContain(e.model);
      expect(e.prompt, k).toBe(fullPrompt(prompts, k));
      expect(e.eur, k).toBeGreaterThan(0);
      expect(e.reject, `${k} is marked reject but was not regenerated`).toBeUndefined();
      for (const r of e.rejected ?? []) {
        expect(r.reason.length, k).toBeGreaterThan(0);
        expect(r.eur, k).toBeGreaterThan(0);
      }
    }
  });

  it("are JPEGs at most 1600 px on the long edge, in the prompt's orientation", async () => {
    for (const k of keys) {
      const meta = await sharp(files.get(k)!).metadata();
      expect(meta.format, k).toBe("jpeg");
      expect(Math.max(meta.width ?? 0, meta.height ?? 0), k).toBeLessThanOrEqual(1600);
      expect((meta.height ?? 0) > (meta.width ?? 0), k).toBe(isPortrait(k));
    }
  });
});
