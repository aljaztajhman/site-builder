import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { crc32 } from "node:zlib";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fitImageForModel, imageMeta, processPhoto, visionJpeg } from "../src/index.ts";

const png = (width: number, height: number) => sharp({ create: { width, height, channels: 3, background: "#888" } }).png().toBuffer().then((b) => new Uint8Array(b));

describe("fitImageForModel", () => {
  it("shrinks a full-page screenshot taller than the API's 8000 px limit (live eval: long homepage → 400)", async () => {
    const out = await fitImageForModel(await png(360, 9000));
    const m = await sharp(out).metadata();
    expect(m.height).toBeLessThanOrEqual(7900);
    expect(Math.abs(m.width! / m.height! - 360 / 9000)).toBeLessThan(0.01);
  });

  it("passes smaller images through byte for byte", async () => {
    const small = await png(360, 4000);
    expect(await fitImageForModel(small)).toBe(small);
  });
});

describe("sliceScreenshot", () => {
  it("cuts a long page into consecutive slices and says when it stops early", async () => {
    const { sliceScreenshot } = await import("../src/index.ts");
    const r = await sliceScreenshot(await png(360, 5000), 1560, 6);
    const heights = await Promise.all(r.tiles.map(async (t) => (await sharp(t).metadata()).height));
    expect(heights).toEqual([1560, 1560, 1560, 320]);
    expect(r.truncated).toBe(false);
    const capped = await sliceScreenshot(await png(1280, 5000), 900, 2);
    expect(capped.tiles.length).toBe(2);
    expect(capped.truncated).toBe(true);
  });

  it("leaves a short page as one untouched image", async () => {
    const { sliceScreenshot } = await import("../src/index.ts");
    const short = await png(360, 1200);
    expect((await sliceScreenshot(short, 1560, 6)).tiles).toEqual([short]);
  });
});

describe("decompression bombs", () => {
  // A 1×1 PNG whose header claims 12000×12000 px: tiny on disk, ~430 MB if decoded and under sharp's own default limit.
  const bomb = async () => {
    const b = Buffer.from(await png(1, 1));
    b.writeUInt32BE(12000, 16);
    b.writeUInt32BE(12000, 20);
    b.writeUInt32BE(crc32(b.subarray(12, 29)), 29);
    return new Uint8Array(b);
  };

  it("are refused before decoding", async () => {
    const data = await bomb();
    await expect(imageMeta(data)).rejects.toThrow(/too large/);
    await expect(processPhoto("img_01", data, [480], { avif: 50, webp: 75 })).rejects.toThrow();
    await expect(visionJpeg(data)).rejects.toThrow();
  });
});

describe("shareJpeg", () => {
  it("makes the 1200 × 630 JPEG a shared link shows, cropped around the focal point", async () => {
    const { shareJpeg } = await import("../src/index.ts");
    // Left half black, right half white: a focal point on the right keeps mostly white.
    const src = await sharp({ create: { width: 3200, height: 1000, channels: 3, background: "#000" } })
      .composite([{ input: await sharp({ create: { width: 1600, height: 1000, channels: 3, background: "#fff" } }).png().toBuffer(), left: 1600, top: 0 }])
      .webp()
      .toBuffer();
    const out = await shareJpeg(new Uint8Array(src), { x: 0.9, y: 0.5 });
    const m = await sharp(out).metadata();
    expect([m.format, m.width, m.height]).toEqual(["jpeg", 1200, 630]);
    const { channels } = await sharp(out).stats();
    expect(channels[0]!.mean).toBeGreaterThan(200);
    // Centred, the same picture is half black.
    expect((await sharp(await shareJpeg(new Uint8Array(src))).stats()).channels[0]!.mean).toBeLessThan(140);
    // A small photo is scaled up to the size, not left small.
    const small = await shareJpeg(await png(600, 400));
    expect((await sharp(small).metadata()).width).toBe(1200);
  });
});

describe("processLogo", () => {
  const svg = (s: string) => new TextEncoder().encode(s);
  /** Columns (fractions of the width) that hold a pixel of the given colour. */
  async function columnsWith(png: Uint8Array, rgb: [number, number, number]): Promise<number[]> {
    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const cols = new Set<number>();
    for (let y = 0; y < info.height; y++)
      for (let x = 0; x < info.width; x++) {
        const i = (y * info.width + x) * 4;
        if (data[i + 3]! > 200 && Math.abs(data[i]! - rgb[0]) < 8 && Math.abs(data[i + 1]! - rgb[1]) < 8 && Math.abs(data[i + 2]! - rgb[2]) < 8) cols.add(x / info.width);
      }
    return [...cols].sort((a, b) => a - b);
  }

  it("keeps a drawing that runs past the SVG's viewBox (a tag past the right edge)", async () => {
    const { processLogo } = await import("../src/index.ts");
    // The red mark fills the 100 × 40 box; the blue tag runs 40 units past its right edge.
    const logo = svg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40" width="100" height="40"><rect x="0" y="0" width="100" height="40" fill="#ff0000"/><rect x="100" y="10" width="40" height="20" fill="#0000ff"/></svg>`);
    const out = await processLogo(logo, "image/svg+xml");
    const blue = await columnsWith(out.data, [0, 0, 255]);
    expect(blue.length).toBeGreaterThan(0);
    // The blue tag reaches the right part of the picture: about 40 of its 141 units.
    expect(blue.at(-1)!).toBeGreaterThan(0.97);
    expect(out.width / out.height).toBeGreaterThan(140 / 42);
    expect(out.height).toBe(48);
  });

  it("leaves a logo that fits its box with its own margins", async () => {
    const { processLogo } = await import("../src/index.ts");
    const logo = svg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40"><rect x="20" y="10" width="60" height="20" fill="#ff0000"/></svg>`);
    const out = await processLogo(logo, "image/svg+xml");
    expect(out.width / out.height).toBeCloseTo(100 / 40, 1);
    const red = await columnsWith(out.data, [255, 0, 0]);
    expect(red[0]!).toBeGreaterThan(0.18);
    expect(red.at(-1)!).toBeLessThan(0.82);
  });

  it("pekarna-kvas: the tagline PEKARNA · KAMNIK is no longer cut at the logo's right edge", async () => {
    const { processLogo } = await import("../src/index.ts");
    const file = new Uint8Array(readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../tools/eval/fixtures/pekarna-kvas/logo.svg")));
    const out = await processLogo(file, "image/svg+xml");
    // The drawing is wider than the file's own 280 × 96 box.
    expect(out.width / out.height).toBeGreaterThan(280 / 96 + 0.05);
    // The tagline's colour (#9a5a1f) ends inside the picture, with room after it, not at the cut.
    const tag = await columnsWith(out.data, [0x9a, 0x5a, 0x1f]);
    expect(tag.at(-1)!).toBeLessThan(0.995);
  });
});
