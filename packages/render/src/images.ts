import type { ImageAsset } from "@sb/spec";

export const DEFAULT_IMAGE_WIDTHS = [360, 720, 1080, 1600];

/** Widths rendered for one image: configured widths up to the original, plus the original if smaller. */
export function variantWidths(asset: Pick<ImageAsset, "width">, widths: number[] = DEFAULT_IMAGE_WIDTHS): number[] {
  const out = widths.filter((w) => w <= asset.width);
  if (out.length === 0 || (out[out.length - 1]! < asset.width && asset.width < widths[widths.length - 1]!)) out.push(asset.width);
  return [...new Set(out)].sort((a, b) => a - b);
}

export type ImageFormat = "avif" | "webp";

/** File name of one variant under the site's media/ directory. */
export function variantFile(id: string, width: number, format: ImageFormat): string {
  return `${id}-${width}.${format}`;
}

export function variantHeight(asset: Pick<ImageAsset, "width" | "height">, width: number): number {
  return Math.round((asset.height * width) / asset.width);
}
