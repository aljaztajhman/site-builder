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

/**
 * The one paid plan (owner's decision `sb-pricing`, docs/GO-TO-MARKET.md §5). Prices in euros, VAT
 * included. No billing code exists yet: `billingEnabled` stays false until the legal entity is
 * registered, and the landing page shows these as planned prices.
 */
const PaidPlan = z
  .looseObject({
    billingEnabled: z.boolean(),
    /** Prices are shown and charged with VAT, whether or not we're VAT-registered. */
    vatIncluded: z.literal(true),
    monthlyEur: z.number().positive(),
    yearlyEur: z.number().positive(),
    /** The yearly plan includes the customer's domain. */
    yearlyIncludesDomain: z.boolean(),
    /** How the yearly plan is paid: an invoice settled by bank transfer. */
    yearlyPayment: z.enum(["invoice-bank-transfer"]),
    /** The first `customers` customers pay `firstYearEur` for their first year, then the yearly price. */
    foundingOffer: z.strictObject({ customers: z.number().int().positive(), firstYearEur: z.number().positive() }),
    /** Optional one-off "we set it up with you" service. */
    setupService: z.strictObject({ eur: z.number().positive() }),
  })
  .refine((p) => p.yearlyEur < 12 * p.monthlyEur, { message: "the yearly price must be below 12 monthly payments" })
  .refine((p) => p.foundingOffer.firstYearEur < p.yearlyEur, { message: "the founding first year must be below the yearly price" });

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
  /** Spec version retention: the nightly prune job (see config $comment). */
  versions: z.object({
    retention: z.object({
      /** Whole local days before today whose versions are all kept; older days keep their last version. */
      keepAllDays: z.number().int().min(1),
      /** IANA zone that decides where a day starts, for retention and for the cron schedule. */
      timeZone: z.string().min(1),
      /** When the prune job runs (pg-boss cron, in timeZone). */
      cron: z.string().min(1),
    }),
  }),
  /** fal.ai images: eval fixture photos, and generated mood images for client sites with too few photos (see config $comment). */
  imageGen: z.object({
    pipeline: z.object({
      enabled: z.boolean(),
      /** A key of `models`. */
      model: z.string(),
      /** Generate images until the site has this many photos (client photos count first), per generation scope. */
      fillUpTo: z.strictObject({ home: z.number().int().min(0).max(4), full: z.number().int().min(0).max(4) }),
      /** Appended to every generated image's prompt. */
      style: z.string().min(1),
    }),
    landscape: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }),
    models: z.record(z.string(), ImageGenModel),
  }),
  plans: z.looseObject({
    paid: PaidPlan,
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
