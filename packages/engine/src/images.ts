import sharp from "sharp";
import { SHARE_IMAGE, variantFile, variantWidths } from "@sb/render";
import { getProcessPhotoCache, photoCacheKey, type CachedPhoto } from "./photo-cache.ts";

export interface ProcessedImage {
  width: number;
  height: number;
  variants: { file: string; data: Uint8Array }[];
}

/**
 * Largest decoded image accepted (pixels). A small file can declare a huge canvas and take gigabytes
 * to decode; 48–50 MP phone photos pass, 100+ MP modes and crafted files are refused.
 */
export const MAX_INPUT_PIXELS = 60_000_000;

const AVIF_EFFORT = 4;

/** Key processPhoto uses in an installed ProcessPhotoCache: input bytes, widths, qualities and the sharp/libvips build. */
export function processPhotoCacheKey(data: Uint8Array, widths: number[], quality: { avif: number; webp: number }): string {
  // encodePhoto's own source is part of the key, so editing the encode needs no manual bump of PHOTO_CACHE_FORMAT.
  return photoCacheKey(data, { widths, avif: quality.avif, webp: quality.webp, avifEffort: AVIF_EFFORT, maxPixels: MAX_INPUT_PIXELS, sharp: sharp.versions, encode: encodePhoto.toString() });
}

/**
 * Normalises orientation and writes AVIF + WebP variants at the configured widths. With a ProcessPhotoCache installed
 * (tests only, see photo-cache.ts) an input already encoded with the same settings is served from it; only successful
 * encodes are stored, so an input that fails (a decompression bomb) always goes through the checks below.
 */
export async function processPhoto(id: string, data: Uint8Array, widths: number[], quality: { avif: number; webp: number }): Promise<ProcessedImage> {
  const cache = getProcessPhotoCache();
  const key = cache ? processPhotoCacheKey(data, widths, quality) : "";
  let encoded = cache ? await cache.get(key) : null;
  // The variant list comes from variantWidths (@sb/render), which the key doesn't cover: an entry that no longer matches is a miss.
  if (encoded && !sameVariants(encoded, widths)) encoded = null;
  if (!encoded) {
    encoded = await encodePhoto(data, widths, quality);
    if (cache) await cache.put(key, encoded);
  }
  return { width: encoded.width, height: encoded.height, variants: encoded.variants.map((v) => ({ file: variantFile(id, v.width, v.format), data: v.data })) };
}

function sameVariants(c: CachedPhoto, widths: number[]): boolean {
  const want = variantWidths({ width: c.width }, widths).flatMap((w) => [`${w}.avif`, `${w}.webp`]);
  const got = c.variants.map((v) => `${v.width}.${v.format}`);
  return want.length === got.length && want.every((x, i) => x === got[i]);
}

async function encodePhoto(data: Uint8Array, widths: number[], quality: { avif: number; webp: number }): Promise<CachedPhoto> {
  const base = sharp(data, { failOn: "error", limitInputPixels: MAX_INPUT_PIXELS }).rotate();
  const meta = await base.metadata();
  // After rotate(), width/height of the output follow the EXIF orientation.
  const swap = (meta.orientation ?? 1) >= 5;
  const width = (swap ? meta.height : meta.width) ?? 0;
  const height = (swap ? meta.width : meta.height) ?? 0;
  if (!width || !height) throw new Error("Unreadable image");
  const variants: CachedPhoto["variants"] = [];
  for (const w of variantWidths({ width }, widths)) {
    const resized = base.clone().resize({ width: w, withoutEnlargement: true });
    variants.push({ width: w, format: "avif", data: await resized.clone().avif({ quality: quality.avif, effort: AVIF_EFFORT }).toBuffer() });
    variants.push({ width: w, format: "webp", data: await resized.clone().webp({ quality: quality.webp }).toBuffer() });
  }
  return { width, height, variants };
}

const SVG_ROOT = /<svg\b[^>]*>/i;
const attr = (tag: string, name: string): string | undefined => new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i").exec(tag)?.slice(2).find((x) => x !== undefined);
const setAttr = (tag: string, name: string, value: string): string => {
  const re = new RegExp(`\\s${name}\\s*=\\s*("[^"]*"|'[^']*')`, "i");
  return re.test(tag) ? tag.replace(re, ` ${name}="${value}"`) : tag.replace(/^<svg\b/i, `<svg ${name}="${value}"`);
};
/** A plain length in user units ("280", "280px"); anything else (%, cm, em) is not one. */
const userUnits = (v: string | undefined): number | undefined => (v && /^\s*[\d.]+\s*(px)?\s*$/.test(v) ? Number.parseFloat(v) : undefined);

/** Root <svg> tag with its viewBox (and width and height, in the same proportion) set to the box. */
function withViewBox(text: string, tag: string, box: { x: number; y: number; w: number; h: number }): Uint8Array {
  let t = setAttr(tag, "viewBox", `${box.x} ${box.y} ${box.w} ${box.h}`);
  t = setAttr(t, "width", String(box.w));
  t = setAttr(t, "height", String(box.h));
  return new TextEncoder().encode(text.replace(tag, t));
}

/**
 * A logo SVG whose drawing runs outside its own viewBox (pekarna-kvas: the tagline "PEKARNA · KAMNIK" set past the
 * right edge) is clipped when rasterised. Grows the viewBox to take in everything drawn: renders the logo on a canvas
 * three times its size, finds the drawn pixels (trim), and sets the viewBox to the union of the original box and
 * those, so a logo that fits keeps its own margins. A file it can't read (no root tag, sizes in units other than
 * px) is returned as it is.
 */
export async function fitSvgViewBox(data: Uint8Array): Promise<Uint8Array> {
  const text = new TextDecoder().decode(data);
  const tag = SVG_ROOT.exec(text)?.[0];
  if (!tag) return data;
  const vb = attr(tag, "viewBox")
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  const w = userUnits(attr(tag, "width"));
  const h = userUnits(attr(tag, "height"));
  const box = vb && vb.length === 4 && vb.every(Number.isFinite) && vb[2]! > 0 && vb[3]! > 0 ? { x: vb[0]!, y: vb[1]!, w: vb[2]!, h: vb[3]! } : w && h ? { x: 0, y: 0, w, h } : undefined;
  if (!box) return data;
  // The probe: the box with its own width and height around it on every side, at 2 px per unit (or less for a big box).
  const probe = { x: box.x - box.w, y: box.y - box.h, w: box.w * 3, h: box.h * 3 };
  const scale = Math.min(2, 4000 / Math.max(probe.w, probe.h));
  try {
    const out = await sharp(withViewBox(text, tag, probe), { density: 72 * scale, limitInputPixels: MAX_INPUT_PIXELS })
      .ensureAlpha()
      .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 1 })
      .toBuffer({ resolveWithObject: true });
    const info = out.info as typeof out.info & { trimOffsetLeft?: number; trimOffsetTop?: number };
    const px = probe.w / Math.round(probe.w * scale);
    const left = probe.x + Math.abs(info.trimOffsetLeft ?? 0) * px;
    const top = probe.y + Math.abs(info.trimOffsetTop ?? 0) * px;
    const right = left + info.width * px;
    const bottom = top + info.height * px;
    // One unit of room past the drawing (anti-aliased edges), only on the sides where it runs out of the box.
    const x0 = left < box.x ? Math.floor(left - 1) : box.x;
    const y0 = top < box.y ? Math.floor(top - 1) : box.y;
    const x1 = right > box.x + box.w ? Math.ceil(right + 1) : box.x + box.w;
    const y1 = bottom > box.y + box.h ? Math.ceil(bottom + 1) : box.y + box.h;
    if (x0 === box.x && y0 === box.y && x1 === box.x + box.w && y1 === box.y + box.h) return data;
    return withViewBox(text, tag, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
  } catch {
    // Nothing drawn (trim of an empty canvas) or a file librsvg refuses: rasterise it as it is.
    return data;
  }
}

/**
 * Logo for the header, always a 2x PNG. SVG uploads are rasterised too: an uploaded SVG served from
 * our origin could carry script, and a PNG is safe everywhere (preview, published site, export).
 */
export async function processLogo(data: Uint8Array, mime: string): Promise<{ file: string; data: Uint8Array; width: number; height: number }> {
  const svg = mime === "image/svg+xml" ? await fitSvgViewBox(data) : data;
  const input = mime === "image/svg+xml" ? sharp(svg, { density: 300, limitInputPixels: MAX_INPUT_PIXELS }) : sharp(data, { limitInputPixels: MAX_INPUT_PIXELS });
  const out = await input.resize({ height: 96, withoutEnlargement: mime !== "image/svg+xml" }).png().toBuffer({ resolveWithObject: true });
  return { file: "logo.png", data: out.data, width: Math.round(out.info.width / 2), height: Math.round(out.info.height / 2) };
}

/**
 * The picture shown when a link to the site is shared (og:image): SHARE_IMAGE.width × height JPEG, cropped around
 * the image's focal point (centre without one). From the largest variant, upscaled when that is smaller.
 */
export async function shareJpeg(data: Uint8Array, focal: { x: number; y: number } = { x: 0.5, y: 0.5 }): Promise<Uint8Array> {
  const { width: W, height: H } = SHARE_IMAGE;
  const m = await sharp(data, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  if (!m.width || !m.height) throw new Error("Unreadable image");
  const scale = Math.max(W / m.width, H / m.height);
  const w = Math.max(W, Math.ceil(m.width * scale));
  const h = Math.max(H, Math.ceil(m.height * scale));
  const left = Math.min(w - W, Math.max(0, Math.round(focal.x * w - W / 2)));
  const top = Math.min(h - H, Math.max(0, Math.round(focal.y * h - H / 2)));
  const out = await sharp(data, { limitInputPixels: MAX_INPUT_PIXELS }).resize(w, h, { fit: "fill" }).extract({ left, top, width: W, height: H }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
  return new Uint8Array(out);
}

/** Small JPEG for the vision model: enough for alt text and critique, cheap in tokens. */
export async function visionJpeg(data: Uint8Array, maxSide = 768): Promise<string> {
  const buf = await sharp(data, { limitInputPixels: MAX_INPUT_PIXELS }).rotate().resize(maxSide, maxSide, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 70 }).toBuffer();
  return buf.toString("base64");
}

export async function imageMeta(data: Uint8Array): Promise<{ width: number; height: number; format: string }> {
  const m = await sharp(data).metadata();
  if (!m.width || !m.height || !m.format) throw new Error("Unreadable image");
  if (m.width * m.height > MAX_INPUT_PIXELS) throw new Error("Image too large");
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
