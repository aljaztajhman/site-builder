import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { z } from "zod";

const Effort = z.enum(["low", "medium", "high", "xhigh", "max"]);
const ModelStage = z.object({
  model: z.string(),
  effort: Effort.optional(),
  maxTokens: z.number().int().positive(),
});
const Price = z.object({ input: z.number(), output: z.number(), cacheWrite5m: z.number(), cacheRead: z.number() });
/** An image model on fal.ai. Priced per image or per output megapixel, as fal bills it. */
const ImageGenModel = z
  .object({
    endpoint: z.string(),
    /** How the model takes the output shape: an aspect ratio string ("3:2") or explicit { width, height }. */
    sizeParam: z.enum(["aspect_ratio", "image_size"]),
    params: z.record(z.string(), z.unknown()),
    usdPerImage: z.number().nonnegative().optional(),
    usdPerMegapixel: z.number().nonnegative().optional(),
  })
  .refine((m) => (m.usdPerImage === undefined) !== (m.usdPerMegapixel === undefined), {
    message: "set exactly one of usdPerImage or usdPerMegapixel",
  });

const CompositionTarget = z.object({
  minImageShareWithPhotos: z.number().min(0).max(1),
  maxButtons: z.number().int().min(0),
  maxHeadlineLines: z.number().int().min(1),
  maxGapPx: z.number().int().min(0),
});

export const AppConfigSchema = z.object({
  models: z.object({
    classify: ModelStage,
    brief: ModelStage,
    design: ModelStage,
    altText: ModelStage,
    content: ModelStage,
    critique: ModelStage,
    edit: ModelStage,
    fullBuild: ModelStage,
    /** Eval only: scores generated homepages from screenshots (tools/eval/src/judge.ts). */
    judge: ModelStage,
  }),
  useFullBuildModel: z.boolean(),
  structuredOutputForContent: z.boolean(),
  pricesUsdPerMTok: z.record(z.string(), Price),
  eurPerUsd: z.number().positive(),
  limits: z.object({
    dailyModelSpendCapEur: z.number().nonnegative(),
    contentRetries: z.number().int().min(0),
    critiqueIterations: z.number().int().min(0),
    maxPhotos: z.number().int().positive(),
    maxUploadBytes: z.number().int().positive(),
    /** Generate jobs one worker runs at once; each peaks at ~1.1 GB (Chromium checks). */
    jobConcurrency: z.number().int().min(1).max(8),
    /** Contact form rate limits: per visitor (hashed IP) and per site. */
    formMessagesPerSenderPer10Min: z.number().int().positive(),
    formMessagesPerSitePerDay: z.number().int().positive(),
  }),
  targets: z.object({
    homepagePreviewEur: z.number(),
    homepagePreviewSeconds: z.number(),
    fullSiteEur: z.number(),
    fullSiteSeconds: z.number(),
  }),
  checks: z.object({
    lighthouse: z.object({ performance: z.number(), accessibility: z.number(), bestPractices: z.number(), seo: z.number() }),
    viewports: z.object({
      mobile: z.object({ width: z.number(), height: z.number() }),
      desktop: z.object({ width: z.number(), height: z.number() }),
    }),
    tapTarget: z.object({ primaryMin: z.number(), primaryGap: z.number(), absoluteMin: z.number() }),
    /** Report-only first-screen targets for the eval (see config $comment). */
    composition: z.object({ mobile: CompositionTarget, desktop: CompositionTarget }),
  }),
  images: z.object({ widths: z.array(z.number().int().positive()), avifQuality: z.number(), webpQuality: z.number() }),
  /** Development only (fixture photos); client sites use client photos only (PRODUCT.md). */
  imageGen: z.object({
    landscape: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }),
    models: z.record(z.string(), ImageGenModel),
  }),
  /** No billing yet; the landing page quotes the paid plan's monthly range from here. */
  plans: z.looseObject({
    paid: z.looseObject({ monthlyEurRange: z.tuple([z.number().positive(), z.number().positive()]) }),
  }),
});
export type AppConfig = z.infer<typeof AppConfigSchema>;
export type ModelStageName = keyof AppConfig["models"];
export type ModelStageConfig = AppConfig["models"][ModelStageName];

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

let cached: AppConfig | undefined;

/** Loads config/app.config.json. DAILY_SPEND_CAP_EUR overrides the spend cap for deployments. */
export function loadConfig(file = process.env.APP_CONFIG_PATH || path.join(repoRoot, "config/app.config.json")): AppConfig {
  if (cached && !process.env.APP_CONFIG_PATH) return cached;
  const raw = JSON.parse(readFileSync(file, "utf8")) as unknown;
  const config = AppConfigSchema.parse(raw);
  // Every model a stage can use must have a price, or its spend couldn't be counted against the cap.
  for (const [stage, m] of Object.entries(config.models)) {
    if (!config.pricesUsdPerMTok[m.model]) throw new Error(`config: no price for ${m.model} (stage ${stage})`);
  }
  const cap = process.env.DAILY_SPEND_CAP_EUR;
  if (cap !== undefined && cap !== "") {
    const n = Number(cap);
    if (!Number.isFinite(n) || n < 0) throw new Error("DAILY_SPEND_CAP_EUR must be a non-negative number of euros, e.g. 10");
    config.limits.dailyModelSpendCapEur = n;
  }
  cached = config;
  return config;
}

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

/** € cost of one model call, from config prices. Throws for a model with no configured price. */
export function costEur(config: AppConfig, model: string, usage: Usage): number {
  const p = config.pricesUsdPerMTok[model];
  if (!p) throw new Error(`No price configured for model ${model}`);
  const usd =
    (usage.input_tokens * p.input +
      usage.output_tokens * p.output +
      (usage.cache_creation_input_tokens ?? 0) * p.cacheWrite5m +
      (usage.cache_read_input_tokens ?? 0) * p.cacheRead) /
    1_000_000;
  return usd * config.eurPerUsd;
}
