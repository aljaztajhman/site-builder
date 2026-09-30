/**
 * Prompts, request bodies and cost estimates for AI-generated fixture photos (ai-photos.ts).
 * No network here, so tests can cover it.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { AppConfig } from "@sb/config";
import { FIXTURES_DIR } from "./load.ts";

export const PhotoPrompts = z.object({
  style: z.string().min(1),
  /** Photos used for the model comparison, as "<fixture id>/<NN>". */
  compare: z.array(z.string()),
  photos: z.record(z.string(), z.string().min(1)),
});
export type PhotoPrompts = z.infer<typeof PhotoPrompts>;

export const PROMPTS_FILE = path.join(FIXTURES_DIR, "photo-prompts.json");

export function loadPhotoPrompts(file = PROMPTS_FILE): PhotoPrompts {
  return PhotoPrompts.parse(JSON.parse(readFileSync(file, "utf8")));
}

/** "photos/02.jpg" of fixture "pekarna-kvas" → "pekarna-kvas/02". */
export function photoKey(fixtureId: string, file: string): string {
  return `${fixtureId}/${path.basename(file, path.extname(file))}`;
}

/** Same rule as the SVG stand-ins: 02, 05 and 08 are portrait, the rest landscape. */
export function isPortrait(key: string): boolean {
  return /\/0[258]$/.test(key);
}

export function fullPrompt(prompts: PhotoPrompts, key: string): string {
  const p = prompts.photos[key];
  if (!p) throw new Error(`photo-prompts.json has no prompt for ${key}`);
  return `${p} ${prompts.style}`;
}

export type ImageGenModelConfig = AppConfig["imageGen"]["models"][string];

/** Output size for a photo: the configured landscape size, or the same rotated for portrait. */
export function outputSize(config: AppConfig, portrait: boolean): { width: number; height: number } {
  const { width, height } = config.imageGen.landscape;
  return portrait ? { width: height, height: width } : { width, height };
}

/** Request body for fal's model endpoint. */
export function requestBody(
  config: AppConfig,
  model: ImageGenModelConfig,
  prompt: string,
  portrait: boolean,
): Record<string, unknown> {
  const size = outputSize(config, portrait);
  const shape =
    model.sizeParam === "aspect_ratio"
      ? { aspect_ratio: ratio(size.width, size.height) }
      : { image_size: size };
  return { ...model.params, ...shape, prompt, num_images: 1 };
}

function ratio(w: number, h: number): string {
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  const g = gcd(w, h);
  return `${w / g}:${h / g}`;
}

/** € cost of one image from config prices; per-megapixel models use the delivered size. */
export function imageCostEur(config: AppConfig, model: ImageGenModelConfig, width: number, height: number): number {
  const usd = model.usdPerImage ?? (model.usdPerMegapixel ?? 0) * ((width * height) / 1_000_000);
  return usd * config.eurPerUsd;
}

/** € estimate before a run, at the requested size. */
export function estimateEur(config: AppConfig, model: ImageGenModelConfig, portrait: boolean): number {
  const { width, height } = outputSize(config, portrait);
  return imageCostEur(config, model, width, height);
}
