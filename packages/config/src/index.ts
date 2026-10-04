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
 * A paid plan (owner's decisions `sb-pricing` and `sb-tiers`, docs/plans/pricing-tiers.md). Prices in
 * euros, VAT included. No billing code exists yet: `plans.billingEnabled` stays false until the legal
 * entity is registered, and the landing page shows these as planned prices.
 */
const PaidPlan = z
  .strictObject({
    /** Shown to owners ("Osnovni", "Plus"). */
    name: z.string().min(1),
    monthlyEur: z.number().positive(),
    yearlyEur: z.number().positive(),
    /** The yearly plan includes the customer's domain. */
    yearlyIncludesDomain: z.boolean(),
    /** How the yearly plan is paid: an invoice settled by bank transfer. */
    yearlyPayment: z.enum(["invoice-bank-transfer"]),
    /** The first `customers` customers pay `firstYearEur` for their first year, then the yearly price. */
    foundingOffer: z.strictObject({ customers: z.number().int().positive(), firstYearEur: z.number().positive() }).optional(),
    /** The one-off "we set it up with you" service, and whether the yearly plan includes it. */
    setupService: z.strictObject({ eur: z.number().positive(), includedYearly: z.boolean() }),
    /** A hard monthly € limit on AI work, counted from real costs; direct editing is never limited. */
    ai: z.strictObject({ allowanceEurPerMonth: z.number().min(0), firstMonthExtraEur: z.number().min(0) }),
    /** What a site on this plan may have (enforced as each feature is built). */
    site: z.strictObject({ maxPages: z.number().int().positive(), locales: z.number().int().min(1), generatedPicturesPerMonth: z.number().int().min(0) }),
  })
  .refine((p) => p.yearlyEur < 12 * p.monthlyEur, { message: "the yearly price must be below 12 monthly payments" })
  .refine((p) => !p.foundingOffer || p.foundingOffer.firstYearEur < p.yearlyEur, { message: "the founding first year must be below the yearly price" });
export type PaidPlanConfig = z.infer<typeof PaidPlan>;
export type PlanKey = "standard" | "premium";
export const PLAN_KEYS: readonly PlanKey[] = ["standard", "premium"];

const PlanCosts = z.object({
  domainEurPerYear: z.number().min(0),
  hostingEurPerSitePerYear: z.number().min(0),
  vatRate: z.number().min(0).max(1),
  cardFeePercent: z.number().min(0),
  cardFeeFixedEur: z.number().min(0),
});
type PlanCostsConfig = z.infer<typeof PlanCosts>;

/**
 * What a plan earns in the worst case: its price without VAT and card fees, minus the most it can cost
 * us (the whole AI allowance, the first month's extra, the domain when included, hosting). Yearly is
 * paid by bank transfer (no card fee); monthly by card.
 */
export function planMargins(p: PaidPlanConfig, c: PlanCostsConfig): { monthly: number; yearly: number; foundingYear: number | null } {
  const net = (gross: number, card: boolean) => gross / (1 + c.vatRate) - (card ? (gross * c.cardFeePercent) / 100 + c.cardFeeFixedEur : 0);
  const hostingMonth = c.hostingEurPerSitePerYear / 12;
  const aiYear = 12 * p.ai.allowanceEurPerMonth + p.ai.firstMonthExtraEur;
  const yearCost = aiYear + c.hostingEurPerSitePerYear + (p.yearlyIncludesDomain ? c.domainEurPerYear : 0);
  return {
    // The first month is the dearest: the allowance plus its one-off extra.
    monthly: net(p.monthlyEur, true) - (p.ai.allowanceEurPerMonth + p.ai.firstMonthExtraEur + hostingMonth),
    yearly: net(p.yearlyEur, false) - yearCost,
    foundingYear: p.foundingOffer ? net(p.foundingOffer.firstYearEur, false) - yearCost : null,
  };
}

/**
 * Own domains (docs/plans/custom-domains.md). Prices are what the owner is shown per year, VAT included;
 * `maxCostEur` is the most we pay the registrar for a name, so a premium or repriced name is never offered.
 * Only the in-memory fakes are wired: the Openprovider and Cloudflare adapters exist but no config selects them.
 */
const Domains = z.object({
  /** Shows the domain step when publishing. Off on a deployed app until real providers are wired. */
  enabled: z.boolean(),
  providers: z.object({
    registrar: z.enum(["fake"]),
    edge: z.enum(["fake"]),
    /** "system" asks real DNS (free, no account); "fake" answers as if the owner's records were in place (dev). */
    dns: z.enum(["fake", "system"]),
  }),
  /** In the order to offer them. */
  tlds: z
    .array(z.strictObject({ tld: z.string().regex(/^[a-z]{2,24}$/), priceEurPerYear: z.number().positive(), maxCostEur: z.number().positive() }))
    .min(1),
  suggestions: z.object({
    /** Names asked about at the registrar per request. */
    check: z.number().int().min(1).max(20),
    /** Available names shown (the first is preselected). */
    show: z.number().int().min(1).max(5),
  }),
  registrationYears: z.number().int().min(1).max(10),
  /** A step that fails is retried after baseSeconds · 2^n (at most maxSeconds), maxAttempts times in all. */
  retry: z.object({ baseSeconds: z.number().int().min(1), maxSeconds: z.number().int().min(1), maxAttempts: z.number().int().min(1).max(30) }),
  /** How long a step may keep waiting (registry, the owner's DNS record, the certificate) before it is a failure. */
  waitHours: z.object({ registration: z.number().positive(), dns: z.number().positive(), certificate: z.number().positive() }),
  /** How often the worker looks for due provisioning steps, and how long one run holds a domain. */
  sweepSeconds: z.number().int().min(5),
  leaseSeconds: z.number().int().min(30),
  /** The owner's "your domain is live" email, sent by the web process. */
  notify: z.object({ everyMinutes: z.number().int().min(1), maxAttempts: z.number().int().min(1).max(10) }),
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
    /**
     * How a model call's cost is estimated before it is sent, to reserve it under the daily cap: input from
     * the request's text at `charsPerToken` plus `tokensPerImage` per image, output at the stage's maxTokens.
     */
    spendReservation: z.object({ charsPerToken: z.number().positive(), tokensPerImage: z.number().int().positive() }),
    contentRetries: z.number().int().min(0),
    /** Paid retries after an answer fails its schema (classify, brief, design, critique, alt text). PRODUCT.md: max 2. */
    jsonRetries: z.number().int().min(0).max(2),
    /** Paid retries of a chat edit whose patches fail validation. */
    editRetries: z.number().int().min(0).max(2),
    critiqueIterations: z.number().int().min(0),
    maxPhotos: z.number().int().positive(),
    maxUploadBytes: z.number().int().positive(),
    /** Generate jobs one worker runs at once; each peaks at ~1.1 GB (Chromium checks). */
    jobConcurrency: z.number().int().min(1).max(8),
    /** Contact form rate limits: per visitor (hashed IP) and per site. */
    formMessagesPerSenderPer10Min: z.number().int().positive(),
    formMessagesPerSitePerDay: z.number().int().positive(),
    /** Per visitor (hashed IP) across every site, so one sender can't flood many owners' inboxes. */
    formMessagesPerSenderPerDay: z.number().int().positive(),
  }),
  /** The owner's email about each contact-form message (see config $comment). */
  checker: z.object({
    perIpPerDay: z.number().int().min(1),
    perDay: z.number().int().min(1),
    keepDays: z.number().int().min(1),
    pageTimeoutMs: z.number().int().positive(),
    /** Wait after load before reading cookies and measuring: scripts that set cookies late get the chance. */
    settleMs: z.number().int().min(0),
    maxRedirects: z.number().int().min(0).max(10),
    /** Lighthouse mobile performance in the report (off in tests: it needs a debugging port and takes ~20 s). */
    lighthouse: z.boolean(),
  }),
  stats: z.object({
    visitDedupeMinutes: z.number().int().min(0),
    tapsPerVisitorPerDay: z.number().int().min(1),
    timeZone: z.string().min(1),
    reportFromHour: z.number().int().min(0).max(23),
    reportWithinDays: z.number().int().min(1).max(28),
    retryEveryMinutes: z.number().int().positive(),
    maxAttempts: z.number().int().min(1).max(10),
  }),
  seo: z.object({
    /**
     * Published sites on their own hostname (a domain or <slug>.<PLATFORM_DOMAIN>) are sent without the noindex
     * header. Off until the platform domain exists (it-platform-domain); the app's own /s/ paths are never indexed.
     */
    indexSiteHosts: z.boolean(),
  }),
  /** Own domains for published sites: the domain step, provisioning and its providers (see config $comment). */
  domains: Domains,
  formEmail: z.object({
    waitMs: z.number().int().positive(),
    retryEveryMinutes: z.number().int().positive(),
    maxAttempts: z.number().int().min(1).max(10),
    /** Below Resend's 24 h idempotency window, so a retry never sends twice. */
    retryWithinHours: z.number().int().min(1).max(23),
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
  /** The job worker's shutdown and recovery (see config $comment). */
  worker: z.object({
    /** Seconds a stopping worker lets running jobs finish when RAILWAY_DEPLOYMENT_DRAINING_SECONDS is not set. */
    drainSeconds: z.number().min(1),
    /** Seconds of Railway's draining window kept for marking unfinished jobs interrupted and closing. */
    drainReserveSeconds: z.number().min(0),
    /** pg-boss heartbeat of running jobs: a killed worker's job stops counting as live after about this long. */
    heartbeatSeconds: z.number().int().min(10),
  }),
  /** Owner accounts: magic-link sign-in, sessions, the device cookie (see config $comment). */
  accounts: z.object({
    sessionDays: z.number().positive(),
    deviceCookieDays: z.number().positive(),
    magicLink: z.object({
      ttlMinutes: z.number().positive().max(60),
      perEmailPerHour: z.number().int().positive(),
      perIpPerHour: z.number().int().positive(),
    }),
  }),
  /** Free generation limits, allowances, spending pools and job cost estimates (see config $comment). */
  tiers: z.object({
    anonymous: z.object({
      homepages: z.number().int().min(0),
      keepDays: z.number().positive(),
      uploads: z.object({
        ticketMinutes: z.number().positive().max(60),
        maxTotalBytes: z.number().int().positive(),
        maxPhotos: z.number().int().min(0),
        maxFileBytes: z.number().int().positive(),
      }),
    }),
    free: z.object({
      homepages: z.number().int().min(0),
      chatEdits: z.number().int().min(0),
      /** The most a free account may ever cost (its claimed anonymous preview included): micro losses only. */
      lifetimeEur: z.number().min(0).max(1),
    }),
    perIpGenerationsPerDay: z.number().int().positive(),
    /** Photo descriptions (the vision model) per account in 24 h; the admin has no count, only the paid pool. */
    altText: z.object({ photosPerDay: z.object({ free: z.number().int().min(0), paid: z.number().int().min(0) }) }),
    pools: z
      .object({ anonymous: z.number().min(0).max(1), free: z.number().min(0).max(1), paid: z.number().min(0).max(1), warnAt: z.number().gt(0).max(1) })
      .refine((p) => p.anonymous + p.free + p.paid <= 1 + 1e-9, { message: "the pools are shares of the daily cap and must add up to at most 1" }),
    estimatesEur: z.object({ homepage: z.number().positive(), fullSite: z.number().positive(), chatEdit: z.number().positive(), altTextPerPhoto: z.number().positive() }),
    junk: z.object({ minDescriptionChars: z.number().int().min(1), minClassifierConfidence: z.number().min(0).max(1) }),
  }),
  plans: z.looseObject({
    freePreview: z.looseObject({
      /**
       * `sb-preview-watermark`: "app-badge" shows a small badge in the app around the preview frame of a
       * free, unpublished preview; never inside the rendered site (preview = published output). "off": none.
       */
      watermark: z.enum(["app-badge", "off"]),
    }),
    billingEnabled: z.boolean(),
    /** Prices are shown and charged with VAT, whether or not we're VAT-registered. */
    vatIncluded: z.literal(true),
    costs: PlanCosts,
    standard: PaidPlan,
    premium: PaidPlan,
    /** "AI paket": more allowance for this month, sold when a plan's is used up. */
    aiTopUp: z.object({ eur: z.number().positive(), allowanceEur: z.number().positive(), maxPerMonth: z.number().int().min(0) }),
  })
    .refine((p) => PLAN_KEYS.every((k) => { const m = planMargins(p[k], p.costs); return m.monthly > 0 && m.yearly > 0 && (m.foundingYear ?? 1) > 0; }), {
      message: "a paid plan could lose money: its price without VAT and fees must cover the whole AI allowance, the domain and hosting (planMargins)",
    })
    .refine((p) => p.aiTopUp.eur / (1 + p.costs.vatRate) - (p.aiTopUp.eur * p.costs.cardFeePercent) / 100 - p.costs.cardFeeFixedEur > p.aiTopUp.allowanceEur, {
      message: "the AI top-up must earn more than the allowance it adds",
    })
    .refine((p) => p.premium.monthlyEur > p.standard.monthlyEur && planMargins(p.premium, p.costs).yearly > planMargins(p.standard, p.costs).yearly, {
      message: "Plus must cost more than Osnovni and earn more per year",
    }),
}).refine((c) => c.domains.tlds.every((t) => t.maxCostEur <= c.plans.costs.domainEurPerYear), {
  // The yearly plans include the domain: the margin check counts plans.costs.domainEurPerYear for it.
  message: "a domain's maxCostEur may not exceed plans.costs.domainEurPerYear (the margin check counts that)",
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
