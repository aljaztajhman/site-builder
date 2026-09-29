import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { fitImageForModel } from "../src/index.ts";

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
