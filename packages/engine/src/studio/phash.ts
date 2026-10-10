/**
 * A perceptual hash of a first screen (design-studio.md §5.4), computed locally with sharp: free, no model call.
 * dHash: the screenshot in grey at 9 × 8, one bit per pair of horizontal neighbours (is the left one brighter), 64 bits as
 * 16 hex characters. It keeps the layout's large light and dark blocks and ignores colour, so two pages of one template
 * in different palettes hash close, and two different layouts hash far apart.
 */
import sharp from "sharp";

export const PHASH_BITS = 64;

export async function phash(png: Uint8Array): Promise<string> {
  const px = await sharp(png).flatten({ background: "#ffffff" }).greyscale().resize(9, 8, { fit: "fill", kernel: "lanczos3" }).raw().toBuffer();
  let hex = "";
  for (let y = 0; y < 8; y++) {
    let byte = 0;
    for (let x = 0; x < 8; x++) byte = (byte << 1) | (px[y * 9 + x]! > px[y * 9 + x + 1]! ? 1 : 0);
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

/** The number of bits two hashes differ in (0 to 64). */
export function hamming(a: string, b: string): number {
  if (a.length !== b.length) throw new Error(`hashes of different lengths: ${a.length} and ${b.length}`);
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let x = Number.parseInt(a[i]!, 16) ^ Number.parseInt(b[i]!, 16);
    for (; x; x &= x - 1) d++;
  }
  return d;
}
