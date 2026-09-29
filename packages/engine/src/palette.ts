import sharp from "sharp";
import { hexToHsl, rgbToHex, type Rgb } from "@sb/spec";

export interface Swatch {
  hex: string;
  /** Share of sampled pixels, 0..1. */
  weight: number;
  source: "logo" | "photo";
}

/**
 * Dominant colours of an image by coarse quantisation of a 64×64 sample. For logos, near-white,
 * near-black and grey pixels are skipped (backgrounds and outlines), so the brand colour wins.
 */
export async function extractSwatches(data: Uint8Array, source: Swatch["source"], max = 4): Promise<Swatch[]> {
  const { data: px, info } = await sharp(data, { density: 72 })
    .flatten({ background: "#ffffff" })
    .resize(64, 64, { fit: "inside" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const buckets = new Map<string, { sum: Rgb; n: number }>();
  let total = 0;
  for (let i = 0; i < px.length; i += info.channels) {
    const rgb: Rgb = [px[i]!, px[i + 1]!, px[i + 2]!];
    const { s, l } = hexToHsl(rgbToHex(rgb));
    total++;
    if (source === "logo" && (l > 0.92 || l < 0.08 || s < 0.15)) continue;
    const key = rgb.map((c) => c >> 5).join(",");
    const b = buckets.get(key) ?? { sum: [0, 0, 0], n: 0 };
    b.sum = [b.sum[0] + rgb[0], b.sum[1] + rgb[1], b.sum[2] + rgb[2]];
    b.n++;
    buckets.set(key, b);
  }
  return [...buckets.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, max)
    .map((b) => ({ hex: rgbToHex([b.sum[0] / b.n, b.sum[1] / b.n, b.sum[2] / b.n]), weight: b.n / Math.max(1, total), source }));
}
