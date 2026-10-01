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

/** One photo in photo-manifest.json. Set `reject` (the reason) by hand to have `generate` replace the photo. */
export interface ManifestEntry {
  model: string;
  endpoint: string;
  prompt: string;
  width: number;
  height: number;
  eur: number;
  createdAt: string;
  reject?: string;
  rejected?: { reason: string; prompt: string; eur: number; createdAt: string }[];
}

/** The entry for a newly generated photo: a photo marked `reject` moves into `rejected` with its reason and cost. */
export function nextManifestEntry(prev: ManifestEntry | undefined, made: Omit<ManifestEntry, "reject" | "rejected">): ManifestEntry {
  const rejected = [...(prev?.rejected ?? []), ...(prev?.reject ? [{ reason: prev.reject, prompt: prev.prompt, eur: prev.eur, createdAt: prev.createdAt }] : [])];
  return { ...made, ...(rejected.length ? { rejected } : {}) };
}

// Request bodies, sizes and prices are shared with the pipeline's image generation.
import { imageCostEur, outputSize, type ImageGenModelConfig } from "@sb/engine";
export { imageCostEur, outputSize, requestBody, type ImageGenModelConfig } from "@sb/engine";

/** € estimate before a run, at the requested size. */
export function estimateEur(config: AppConfig, model: ImageGenModelConfig, portrait: boolean): number {
  const { width, height } = outputSize(config, portrait);
  return imageCostEur(config, model, width, height);
}
