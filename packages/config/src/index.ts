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
  }),
  images: z.object({ widths: z.array(z.number().int().positive()), avifQuality: z.number(), webpQuality: z.number() }),
  plans: z.record(z.string(), z.unknown()),
});
export type AppConfig = z.infer<typeof AppConfigSchema>;
export type ModelStageName = keyof AppConfig["models"];
export type ModelStageConfig = AppConfig["models"][ModelStageName];

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

let cached: AppConfig | undefined;

/** Loads config/app.config.json. DAILY_SPEND_CAP_EUR overrides the spend cap for deployments. */
export function loadConfig(file = process.env.APP_CONFIG_PATH ?? path.join(repoRoot, "config/app.config.json")): AppConfig {
  if (cached && !process.env.APP_CONFIG_PATH) return cached;
  const raw = JSON.parse(readFileSync(file, "utf8")) as unknown;
  const config = AppConfigSchema.parse(raw);
  const cap = process.env.DAILY_SPEND_CAP_EUR;
  if (cap !== undefined && cap !== "") config.limits.dailyModelSpendCapEur = Number(cap);
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
