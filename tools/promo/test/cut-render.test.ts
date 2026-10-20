// @module-tag slow
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cut, ffmpegPath, probeDuration } from "../cut.ts";

let dir: string;

function ff(args: string[]) {
  const r = spawnSync(ffmpegPath(), ["-y", "-hide_banner", ...args], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr);
}

async function solid(file: string, w: number, h: number, color: string) {
  await sharp({ create: { width: w, height: h, channels: 3, background: color } }).jpeg().toFile(file);
}

beforeAll(async () => {
  dir = mkdtempSync(path.join(os.tmpdir(), "promo-cut-test-"));
  for (const d of ["clips", "stills", "audio", "frames/reel"]) mkdirSync(path.join(dir, d), { recursive: true });
  await solid(path.join(dir, "stills/red.jpg"), 640, 360, "#c0392b");
  await solid(path.join(dir, "stills/blue.jpg"), 400, 700, "#2e6fd1");
  await sharp({ create: { width: 200, height: 200, channels: 3, background: "#27ae60" } }).png().toFile(path.join(dir, "frames/reel/a.png"));
  await sharp({ create: { width: 200, height: 200, channels: 3, background: "#f1c40f" } }).png().toFile(path.join(dir, "frames/reel/b.png"));
  ff(["-f", "lavfi", "-i", "testsrc2=size=320x240:rate=25:duration=2", "-pix_fmt", "yuv420p", "-c:v", "libx264", path.join(dir, "clips/test.mp4")]);
  ff(["-f", "lavfi", "-i", "sine=frequency=440:duration=1", path.join(dir, "audio/tone.wav")]);
  ff(["-f", "lavfi", "-i", "sine=frequency=220:duration=3", path.join(dir, "audio/music.wav")]);
  const edit = {
    shots: [
      { src: "clips/test.mp4", dur: 2 },
      { src: "stills/red.jpg", dur: 1.5, move: "push" },
      { src: "stills/blue.jpg", dur: 1 },
      { src: "frames/reel", dur: 1.5, fps: 3 },
      { card: { title: "postavi.si", line: "Spletna stran v minuti.", note: "Vizualije ustvarjene z AI." }, dur: 2 },
    ],
    captions: [{ at: 0.2, dur: 2.6, text: "Še vedno brez spletne strani?", pos: "top" }, { at: 4, dur: 1.5, text: "Čisto, šik, žilavo.", pos: "bottom" }],
    audio: [
      { src: "audio/tone.wav", at: 0.5, gain: 0.8, role: "vo" },
      { src: "audio/music.wav", at: 0, gain: 0.25, role: "music", duckTo: 0.45 },
    ],
    fadeOut: 0.5,
  };
  writeFileSync(path.join(dir, "edit.json"), JSON.stringify(edit));
}, 60_000);

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("promo:cut render", () => {
  it("renders the edit list to a 1080x1920 H.264/AAC mp4 of the right length, plus a review strip", async () => {
    const res = await cut(path.join(dir, "edit.json"));
    expect(res.out).toBe(path.join(dir, "edit.mp4"));
    expect(existsSync(res.out)).toBe(true);
    expect(Math.abs(probeDuration(res.out) - 8)).toBeLessThan(0.1);
    expect(Math.abs(res.duration - 8)).toBeLessThan(0.1);

    const info = spawnSync(ffmpegPath(), ["-hide_banner", "-i", res.out], { encoding: "utf8" }).stderr;
    expect(info).toMatch(/Video: h264 \(High\).*yuv420p.*1080x1920/);
    expect(info).toMatch(/Audio: aac.*48000 Hz, stereo/);
    expect(info).toMatch(/\b30 fps\b/);

    expect(res.strip).toBe(`${res.out}.strip.jpg`);
    expect(statSync(res.strip).size).toBeGreaterThan(5_000);
    const meta = await sharp(res.strip).metadata();
    expect(meta.width).toBe(6 * 270 + 7 * 8);

    const keep = process.env.PROMO_TEST_KEEP;
    if (keep) {
      mkdirSync(keep, { recursive: true });
      copyFileSync(res.strip, path.join(keep, "strip.jpg"));
      copyFileSync(res.out, path.join(keep, "out.mp4"));
    }
  }, 120_000);

  it("writes silent stereo audio when the edit has no audio, and names a missing file", async () => {
    writeFileSync(path.join(dir, "silent.json"), JSON.stringify({ shots: [{ src: "stills/red.jpg", dur: 1 }] }));
    const res = await cut(path.join(dir, "silent.json"));
    const info = spawnSync(ffmpegPath(), ["-hide_banner", "-i", res.out], { encoding: "utf8" }).stderr;
    expect(info).toMatch(/Audio: aac.*stereo/);

    writeFileSync(path.join(dir, "missing.json"), JSON.stringify({ shots: [{ src: "stills/nope.jpg", dur: 1 }] }));
    await expect(cut(path.join(dir, "missing.json"))).rejects.toThrow(/stills\/nope\.jpg/);
  }, 120_000);
});
