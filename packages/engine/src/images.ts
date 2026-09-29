import sharp from "sharp";
import { variantFile, variantWidths } from "@sb/render";

export interface ProcessedImage {
  width: number;
  height: number;
  variants: { file: string; data: Uint8Array }[];
}

/** Normalises orientation and writes AVIF + WebP variants at the configured widths. */
export async function processPhoto(id: string, data: Uint8Array, widths: number[], quality: { avif: number; webp: number }): Promise<ProcessedImage> {
  const base = sharp(data, { failOn: "error" }).rotate();
  const meta = await base.metadata();
  // After rotate(), width/height of the output follow the EXIF orientation.
  const swap = (meta.orientation ?? 1) >= 5;
  const width = (swap ? meta.height : meta.width) ?? 0;
  const height = (swap ? meta.width : meta.height) ?? 0;
  if (!width || !height) throw new Error("Unreadable image");
  const variants: ProcessedImage["variants"] = [];
  for (const w of variantWidths({ width }, widths)) {
    const resized = base.clone().resize({ width: w, withoutEnlargement: true });
    variants.push({ file: variantFile(id, w, "avif"), data: await resized.clone().avif({ quality: quality.avif, effort: 4 }).toBuffer() });
    variants.push({ file: variantFile(id, w, "webp"), data: await resized.clone().webp({ quality: quality.webp }).toBuffer() });
  }
  return { width, height, variants };
}

/**
 * Logo for the header, always a 2x PNG. SVG uploads are rasterised too: an uploaded SVG served from
 * our origin could carry script, and a PNG is safe everywhere (preview, published site, export).
 */
export async function processLogo(data: Uint8Array, mime: string): Promise<{ file: string; data: Uint8Array; width: number; height: number }> {
  const input = mime === "image/svg+xml" ? sharp(data, { density: 300 }) : sharp(data);
  const out = await input.resize({ height: 96, withoutEnlargement: mime !== "image/svg+xml" }).png().toBuffer({ resolveWithObject: true });
  return { file: "logo.png", data: out.data, width: Math.round(out.info.width / 2), height: Math.round(out.info.height / 2) };
}

/** Small JPEG for the vision model: enough for alt text and critique, cheap in tokens. */
export async function visionJpeg(data: Uint8Array, maxSide = 768): Promise<string> {
  const buf = await sharp(data).rotate().resize(maxSide, maxSide, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 70 }).toBuffer();
  return buf.toString("base64");
}

export async function imageMeta(data: Uint8Array): Promise<{ width: number; height: number; format: string }> {
  const m = await sharp(data).metadata();
  if (!m.width || !m.height || !m.format) throw new Error("Unreadable image");
  return { width: m.width, height: m.height, format: m.format };
}

/** The API rejects images over 8000 px on any side (a long homepage's full-page screenshot). Smaller images pass through unchanged. */
export async function fitImageForModel(png: Uint8Array, maxSide = 7900): Promise<Uint8Array> {
  const { width = 0, height = 0 } = await sharp(png).metadata();
  if (width <= maxSide && height <= maxSide) return png;
  return new Uint8Array(await sharp(png).resize({ width: maxSide, height: maxSide, fit: "inside" }).png().toBuffer());
}

/**
 * Cuts a full-page screenshot into top-to-bottom slices the model can read. The API scales every
 * image to ≤ 1568 px on its long edge, so one 360×5000 screenshot arrives ~110 px wide; slices of
 * ≤ 1560 px keep the text legible. Returns at most `maxTiles` slices and whether the page went on.
 */
export async function sliceScreenshot(png: Uint8Array, tileHeight: number, maxTiles: number): Promise<{ tiles: Uint8Array[]; truncated: boolean }> {
  const { width = 0, height = 0 } = await sharp(png).metadata();
  if (height <= tileHeight) return { tiles: [png], truncated: false };
  const tiles: Uint8Array[] = [];
  for (let top = 0; top < height && tiles.length < maxTiles; top += tileHeight) {
    const h = Math.min(tileHeight, height - top);
    tiles.push(new Uint8Array(await sharp(png).extract({ left: 0, top, width, height: h }).png().toBuffer()));
  }
  return { tiles, truncated: tiles.length * tileHeight < height };
}
