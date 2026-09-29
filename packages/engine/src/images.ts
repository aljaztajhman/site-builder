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

/** Logo for the header: SVG kept as is (rendered via <img>, so scripts never run); rasters become a 2x PNG. */
export async function processLogo(data: Uint8Array, mime: string): Promise<{ file: string; data: Uint8Array; width: number; height: number }> {
  if (mime === "image/svg+xml") {
    const meta = await sharp(data).metadata();
    return { file: "logo.svg", data, width: meta.width ?? 160, height: meta.height ?? 48 };
  }
  const out = await sharp(data).resize({ height: 96, withoutEnlargement: true }).png().toBuffer({ resolveWithObject: true });
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
