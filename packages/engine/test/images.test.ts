import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { crc32 } from "node:zlib";
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
