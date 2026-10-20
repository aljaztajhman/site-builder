import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { estimateUsd, extension, MODELS, requestBody, waves, type Job, type JobsFile } from "../media.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const plumber = JSON.parse(readFileSync(path.join(HERE, "../cuts/plumber-30.media.json"), "utf8")) as JobsFile;

describe("promo media", () => {
  it("prices each kind from models.json", () => {
    expect(estimateUsd({ id: "a", kind: "edit" })).toBeCloseTo(MODELS.edit.usdPerImage!);
    expect(estimateUsd({ id: "b", kind: "i2v", duration: 5 })).toBeCloseTo(MODELS.i2v.usdPerSecond! * (5 + MODELS.i2v.extraSeconds!));
    expect(estimateUsd({ id: "c", kind: "tts", text: "x".repeat(500) })).toBeCloseTo(MODELS.tts.usdPer1000Chars! / 2);
    expect(estimateUsd({ id: "d", kind: "music" })).toBeCloseTo(MODELS.music.usdPerAudio!);
  });

  it("keeps the plumber rough cut under the plan's €5", () => {
    const usd = plumber.jobs.reduce((s, j) => s + estimateUsd(j), 0);
    expect(usd * 0.86).toBeLessThan(5);
  });

  it("runs edits before the clips that start from them", () => {
    const w = waves(plumber.jobs);
    const waveOf = (id: string) => w.findIndex((wave) => wave.some((j) => j.id === id));
    expect(waveOf("key-1a")).toBeLessThan(waveOf("clip-1a"));
    expect(waveOf("vo-1b")).toBe(0);
    expect(w.flat()).toHaveLength(plumber.jobs.length);
    expect(() => waves([{ id: "x", kind: "i2v", image: "y" }, { id: "y", kind: "edit", images: ["x"] }])).toThrow(/Circular/);
  });

  it("builds request bodies with the model's params", () => {
    const tts: Job = { id: "v", kind: "tts", text: "Pozdravljeni.", voice: "Brian" };
    expect(requestBody(tts, () => "")).toMatchObject({ text: "Pozdravljeni.", voice: "Brian", language_code: "sl" });
    expect(requestBody({ id: "m", kind: "music", prompt: "p", seconds: 32 }, () => "")).toMatchObject({ prompt: "p", seconds_total: 32 });
    expect(extension("i2v")).toBe("mp4");
    expect(extension("edit")).toBe("jpg");
  });

  it("references only jobs or files in the stills folder", () => {
    const ids = new Set(plumber.jobs.map((j) => j.id));
    for (const j of plumber.jobs) for (const r of [...(j.images ?? []), ...(j.image ? [j.image] : [])]) expect(ids.has(r) || r.startsWith("eval/runs/promo/")).toBe(true);
  });
});
