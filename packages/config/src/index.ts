import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { z } from "zod";

const Effort = z.enum(["low", "medium", "high", "xhigh", "max"]);
/** The effort levels a stage may set (output_config.effort). */
export const EFFORT_LEVELS = Effort.options;
const ModelStage = z.object({
  model: z.string(),
  effort: Effort.optional(),
  maxTokens: z.number().int().positive(),
});
const Rates = { input: z.number(), output: z.number(), cacheWrite5m: z.number(), cacheRead: z.number() };
/**
 * USD per million tokens. `longPrompt`: the dearer card a model bills a whole call at when its prompt (input, cache
 * writes and cache reads together) is over `above` tokens (Haiku 5.5: above 100K). Without it, one card for any length.
 */
const Price = z.object({ ...Rates, longPrompt: z.strictObject({ above: z.number().int().positive(), ...Rates }).optional() });
export type PriceCard = Pick<z.infer<typeof Price>, "input" | "output" | "cacheWrite5m" | "cacheRead">;
/**
 * What a model needs from the client beyond its stage's settings (config modelTraits, keyed by model id; a model
 * without an entry is sent its stage's settings as they are). Model ids live here, never in code.
 */
const ModelTraits = z.strictObject({
  /** Adaptive thinking is on by default and counts toward max_tokens: a stage on this model gets at least `minMaxTokens`. */
  thinkingDefaultOn: z.boolean(),
  /** The smallest max_tokens a call on this model is sent (room for thinking before the answer). */
  minMaxTokens: z.number().int().positive().optional(),
  /** Effort sent when the stage sets none, so the effort is always explicit. */
  defaultEffort: Effort.optional(),
  /**
   * The model has no server-side refusal fallback: on stop_reason "refusal" the client sends the same request once
   * more on this model (it needs a price). Both calls are billed and logged.
   */
  refusalRetryModel: z.string().optional(),
}).refine((t) => !t.thinkingDefaultOn || t.minMaxTokens !== undefined, { message: "a model that thinks by default needs minMaxTokens (thinking counts toward max_tokens)" });
export type ModelTraitsConfig = z.infer<typeof ModelTraits>;
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
    /**
     * What a site on this plan may have (it-plan-limits), enforced by the API and the worker: pages (home and
     * standard pages, collection list pages included), languages, generated pictures per allowance month, and
     * which collections the owner may switch on.
     */
    site: z.strictObject({
      maxPages: z.number().int().positive(),
      locales: z.number().int().min(1),
      generatedPicturesPerMonth: z.number().int().min(0),
      collections: z.array(z.enum(["blog", "events", "services", "team"])),
    }),
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

const addMonthsUtc = (d: Date, n: number): Date => {
  const m = d.getUTCMonth() + n;
  const last = new Date(Date.UTC(d.getUTCFullYear(), m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(d.getUTCFullYear(), m, Math.min(d.getUTCDate(), last), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()));
};
const cents = (n: number) => Math.round(n * 100) / 100;

export interface UpgradeQuote {
  /** Whole months of the current period still ahead. */
  unusedMonths: number;
  /** What comes off the new plan's price: the part of `paidEur` for those months. */
  creditEur: number;
  /** The new plan's price for a new period of the same length, starting now. */
  priceEurNew: number;
  /** What the owner pays now (never below 0). */
  dueEur: number;
}

/**
 * Moving up to a dearer plan (config `plans.upgrade`, docs/plans/pricing-tiers.md: "at renewal, Plus with the
 * unused months credited"; up at once, the difference credited): the whole months left of the period the owner
 * paid `paidEur` for are credited pro rata against the new plan's price for a new period of the same length
 * starting `now`. A part month is not credited. Billing doesn't exist yet; nothing charges this.
 */
export function upgradeQuote(
  plans: Pick<AppConfig["plans"], "standard" | "premium" | "upgrade">,
  q: { from: PlanKey; to: PlanKey; period: "monthly" | "yearly"; paidEur: number; periodStart: Date; periodEnd: Date; now: Date },
): UpgradeQuote {
  const from = plans[q.from];
  const to = plans[q.to];
  if (to.monthlyEur <= from.monthlyEur) throw new Error(`upgradeQuote: ${to.name} is not dearer than ${from.name}`);
  if (!(q.periodEnd > q.periodStart) || q.paidEur < 0) throw new Error("upgradeQuote: an empty period or a negative payment");
  const months = q.period === "yearly" ? 12 : 1;
  let unused = 0;
  if (q.now < q.periodEnd) {
    while (unused < months && addMonthsUtc(q.now, unused + 1) <= q.periodEnd) unused++;
  }
  const creditEur = cents((q.paidEur * unused) / months);
  const priceEurNew = q.period === "yearly" ? to.yearlyEur : to.monthlyEur;
  return { unusedMonths: unused, creditEur, priceEurNew, dueEur: Math.max(0, cents(priceEurNew - creditEur)) };
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
    /** How long the registrar's answer for a site is reused (the worker asks while the site generates). */
    cacheMinutes: z.number().int().min(0).max(1440),
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
  /**
   * The variety engine (docs/plans/variety-engine.md, Steps 1–2). families: a trade template is offered beside two
   * fitting directions instead of forced, with its family of palettes, font pairs and heroes; logo colours go into its
   * colour roles; a seed from the site id picks among equal options; no two sites of one trade (same town first) share
   * direction, palette family, font pair and hero; "Ustvari znova" asks for a different look. Off: today's behaviour.
   * neighbours: how many sites of the same trade the neighbour check compares. skeleton (Step 4): the generator gives
   * each site its own frame (design.skeleton: header family, where the call lives on phones, footer family and tone,
   * section width, cards, buttons, dividers, photo ratio, at most one centred section per page), never the street address as the hero's eyebrow, and holds the
   * direction's section rhythm and primary hue in code. Off: today's shared frame.
   * concept (Step 3, engine concept.ts): the brief adds subtype, goal, angle, signature fact, materials and local
   * anchor; the homepage follows a blueprint by goal; a signature device by fact; the subtype picks the motif. Off:
   * every request is today's.
   * genome (Step 5, engine genome.ts): after the content step, code picks the site's design genome (type, palette and
   * ground, hero, header, footer, rhythm, imagery, shape, density; the motif follows the preset) from the site seed, away
   * from the neighbours' genomes and inside the compatibility rules (spec genome-rules.ts), and dresses the written
   * content in it with no content call; "Druga podoba" moves along the axes for every style, not only template families.
   * Off: no genome is picked and every request is today's.
   */
  variety: z.object({ families: z.boolean(), skeleton: z.boolean(), neighbours: z.number().int().min(0).max(500), concept: z.boolean(), genome: z.boolean() }),
  /**
   * The audit's prompt fixes (docs/plans/audit-2026-10-01.md, "Prompts"), one switch each so a paid eval can measure
   * them one at a time. All off: every prompt, request and repair is byte-identical to before (see config $comment).
   */
  promptFixes: z.strictObject({
    $comment: z.string().optional(),
    /** Brief imageIdeas tied to the client's trade, hero composition, no landscapes or body parts; imageGen.pipeline.unstagedStyle. */
    pictures: z.boolean(),
    /** Critique priorities, Slovene only for clear errors, no deletions for component failures, JSON only, hero-suitable ids. */
    critique: z.boolean(),
    /** Alt text with the business's context and heroSuitable criteria. */
    altText: z.boolean(),
    /** Eval judge: required placeholders and the phone bar are intended; notes before scores. */
    judge: z.boolean(),
    /** Brief without the full site RULES (only its own), the address rule. */
    brief: z.boolean(),
    /** Classifier: what confidence means (non-business text, no fitting type). */
    classifier: z.boolean(),
    /** Chat edit: the editor's Slovene section names, replies in the client's language. */
    edit: z.boolean(),
    /** Directions: no black-and-white/duotone promises, imagery in words, editorial's photo hero, no "Avoid" list. */
    directions: z.boolean(),
    /** Warm directions may take a warm non-cream surface (peach, apricot); repair turns a cream surface into one. */
    warmSurface: z.boolean(),
    /** Exactly one main heading (hero, page header) per page, first on the page: validated in generation and edits. */
    oneHero: z.boolean(),
    /** The cream check also catches beige page backgrounds (#ece3d0) when repairing generated and edited designs. */
    beige: z.boolean(),
    /** Catalogue and RULES wording: eyebrow, contact strip, cta, responsive (not mobile first), call-button count. */
    catalogue: z.boolean(),
    /** Slovene style block in the content, edit and critique prompts: formal vi, Slovene typography, no English words, natural word order. */
    sloveneStyle: z.boolean(),
  }),
  /**
   * Generation cost cuts (docs/plans/cost-cuts.md, see config $comment). secondCritiqueOnlyOnFailures: a second critique
   * round only when the re-check after the first still reports failures. contentRetryAsPatch: a content answer that fails
   * validation is fixed with an RFC 6902 patch from the model instead of the whole JSON again. Off: today's behaviour.
   */
  costCuts: z.object({ secondCritiqueOnlyOnFailures: z.boolean(), contentRetryAsPatch: z.boolean() }),
  /**
   * How the static prompt blocks are written (see config $comment). compactCatalogue (HQ it-compact-catalogue): the
   * section catalogue (the first cached system block of content, critique and edit) and the edit's business schema in a
   * TypeScript-like notation with the limits inline and the shared shapes named once, instead of JSON Schema; generated
   * from the same schemas, about half the tokens. Off: every prompt is byte-identical to before.
   */
  prompts: z.object({ compactCatalogue: z.boolean() }),
  /**
   * Generation pipeline (see config $comment). homepageFirst (HQ it-homepage-first): a full-site content step writes the
   * homepage in one call, then every other page in its own call, side by side, each with the cached catalogue and the
   * homepage for its facts and voice; the parts are merged into one spec with the same repairs, validation, fact check and
   * retries (per part). Off: one content call for the whole site.
   */
  pipeline: z.object({ homepageFirst: z.boolean() }),
  structuredOutputForContent: z.boolean(),
  pricesUsdPerMTok: z.record(z.string(), Price),
  /** Per-model needs of the client (ModelTraits). Optional: no entry, no change to what a stage is sent. */
  modelTraits: z.record(z.string(), ModelTraits).optional(),
  eurPerUsd: z.number().positive(),
  /** Message Batches API: every token at this share of `pricesUsdPerMTok` (0.5). Eval only (the judge's batch). */
  batchPriceFactor: z.number().positive().max(1),
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
  /** Stranko's own funnel and engine events (product_events; see config $comment). */
  analytics: z.object({
    events: z.boolean(),
    keepDays: z.number().int().min(1).max(400),
    landingDedupeMinutes: z.number().int().min(0),
    onceMinutes: z.number().int().min(0),
    /**
     * Cloudflare Web Analytics on the landing, login and privacy pages (beacon.tsx): the site's public token (null:
     * no beacon) and the hostnames it is shown on.
     */
    cloudflare: z.object({ token: z.string().regex(/^[0-9a-f]{32}$/).nullable(), hosts: z.array(z.string().min(1)) }),
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
  /** Switches for the owner's editor (see config $comment). */
  editor: z.object({
    /**
     * it-price-on-request (owner's decision sb-price-on-request): "Cena po dogovoru" per price item and for a whole
     * price list or menu, in the price editor and on "Še to potrebujemo". The owner's own choice (price
     * `{ onRequest: true }`), so it fills the price and unblocks publishing; the site shows "po dogovoru" and gives no
     * price in JSON-LD. Off: the editor offers nothing new and the server refuses a new one (an existing one still renders).
     */
    priceOnRequest: z.boolean(),
  }),
  /** Legal name and address from a tax number via EU VIES, in the editor (see config $comment). */
  companyLookup: z.object({
    enabled: z.boolean(),
    url: z.string().regex(/^https:\/\/[^\s]+$/),
    timeoutMs: z.number().int().min(500).max(15000),
    perViewer: z.number().int().min(1),
    total: z.number().int().min(1),
    windowMinutes: z.number().int().min(1),
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
  /** Database backups (docs/dev/workflow.md §4): `pnpm db:backup`, run by the nightly workflow (see config $comment). */
  backups: z.object({
    /** Storage key prefix; each backup is <prefix><YYYY-MM-DD>.sql.gz (UTC day; a second run that day replaces it). */
    prefix: z.string().regex(/^[a-z0-9-]+\/$/),
    /** Backups older than this many days are deleted after a new one is written. */
    keepDays: z.number().int().min(1),
    /** The check fails when the newest backup is older than this. */
    maxAgeHours: z.number().positive(),
    /** The check fails when the newest backup is smaller than this (compressed bytes)... */
    minBytes: z.number().int().min(0),
    /** ...or smaller than this share of the backup before it (a truncated dump). */
    minShareOfPrevious: z.number().min(0).max(1),
  }),
  /** fal.ai images: eval fixture photos, and generated mood images for client sites with too few photos (see config $comment). */
  imageGen: z.object({
    pipeline: z.object({
      enabled: z.boolean(),
      /** A key of `models`. */
      model: z.string(),
      /** Generate images until the site has this many photos (client photos count first), per generation scope. */
      fillUpTo: z.strictObject({ home: z.number().int().min(0).max(4), full: z.number().int().min(0).max(4) }),
      /** The most generated pictures in a free preview (no account or a free account): a per-tier count (it-plan-limits). */
      fillUpToFree: z.number().int().min(0).max(4),
      /** Appended to every generated image's prompt. */
      style: z.string().min(1),
      /** Appended instead of `style` when promptFixes.pictures is on: an unstaged phone photo of the trade at work. */
      unstagedStyle: z.string().min(1),
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
      /** One email, if the visitor asked for it, `daysBefore` days before the unclaimed preview is deleted (it-upsells). */
      reminder: z.object({ daysBefore: z.number().positive(), everyMinutes: z.number().int().min(1), maxAttempts: z.number().int().min(1).max(10) }),
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
  /**
   * The provider's own facts (it-landing-claims): who runs the product, shown in the landing footer, the privacy
   * policy and the terms. null until the legal entity exists (sb-legal-entity); every null stays a marked placeholder
   * on those pages and on the launch check (apps/web/src/legal.tsx). Never invented.
   */
  legal: z.object({
    provider: z.strictObject({
      /** Full registered name, e.g. "Ime Priimek s.p." or "Podjetje d.o.o.". */
      companyName: z.string().min(2).max(120).nullable(),
      /** Registered address as one line: street and number, postal code and town. */
      address: z.string().min(5).max(160).nullable(),
      /** Matična številka (7 or 10 digits). */
      registrationNumber: z.string().regex(/^\d{7}(\d{3})?$/).nullable(),
      /** Davčna številka (8 digits, "SI" in front when VAT-registered). */
      taxNumber: z.string().regex(/^(SI)?\d{8}$/).nullable(),
      /** Where owners and visitors write to us (privacy requests, accessibility problems, terms). */
      email: z.email().nullable(),
    }),
    /**
     * The terms' points nobody has decided yet (/pogoji), in Slovene as they should read, written with the lawyer:
     * cancellation and refunds, the provider's liability, how changes to the terms are announced, governing law and
     * court. null shows a marked placeholder and keeps the launch check failing.
     */
    terms: z.strictObject({
      cancellation: z.string().min(10).max(1000).nullable(),
      liability: z.string().min(10).max(1000).nullable(),
      changes: z.string().min(10).max(1000).nullable(),
      law: z.string().min(10).max(1000).nullable(),
    }),
    /** A lawyer has read the page: its "Osnutek" note goes, and the launch check stops listing it. */
    lawyerReviewed: z.strictObject({ privacy: z.boolean(), terms: z.boolean() }),
  }),
  plans: z.looseObject({
    freePreview: z.looseObject({
      /**
       * `sb-preview-watermark`: "app-badge" shows a small badge in the app around the preview frame of a
       * free, unpublished preview; never inside the rendered site (preview = published output). "off": none.
       */
      watermark: z.enum(["app-badge", "off"]),
      /** The pages a free preview has (the homepage); more need a paid plan. */
      pages: z.array(z.string()).min(1),
      /** Languages of a free preview. */
      locales: z.number().int().min(1),
    }),
    billingEnabled: z.boolean(),
    /** Prices are shown and charged with VAT, whether or not we're VAT-registered. */
    vatIncluded: z.literal(true),
    costs: PlanCosts,
    standard: PaidPlan,
    premium: PaidPlan,
    /** Moving up to a dearer plan: how the period already paid is credited (upgradeQuote). */
    upgrade: z.object({ credit: z.enum(["unused-whole-months"]) }),
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
    })
    .refine(
      (p) =>
        p.premium.site.maxPages >= p.standard.site.maxPages &&
        p.premium.site.locales >= p.standard.site.locales &&
        p.premium.site.generatedPicturesPerMonth >= p.standard.site.generatedPicturesPerMonth &&
        p.standard.site.collections.every((k) => p.premium.site.collections.includes(k)) &&
        p.standard.site.maxPages >= p.freePreview.pages.length &&
        p.standard.site.locales >= p.freePreview.locales,
      { message: "each plan must allow at least what the one below it does (free preview < Osnovni < Plus), or the upsell would name a plan that adds nothing" },
    ),
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
  for (const [model, t] of Object.entries(config.modelTraits ?? {})) {
    if (t.refusalRetryModel && !config.pricesUsdPerMTok[t.refusalRetryModel]) throw new Error(`config: no price for ${t.refusalRetryModel} (refusal retry of ${model})`);
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

/**
 * The rate card a call is billed at: the model's long-prompt card when its prompt (`promptTokens`: input, cache writes
 * and cache reads) is over that card's threshold, else its base card. Throws for a model with no configured price.
 */
export function priceCard(config: Pick<AppConfig, "pricesUsdPerMTok">, model: string, promptTokens: number): PriceCard {
  const p = config.pricesUsdPerMTok[model];
  if (!p) throw new Error(`No price configured for model ${model}`);
  return p.longPrompt && promptTokens > p.longPrompt.above ? p.longPrompt : p;
}

/** € cost of one model call, from config prices (`batch`: at `batchPriceFactor`). Throws for a model with no configured price. */
export function costEur(config: AppConfig, model: string, usage: Usage, batch = false): number {
  const p = priceCard(config, model, usage.input_tokens + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0));
  const usd =
    (usage.input_tokens * p.input +
      usage.output_tokens * p.output +
      (usage.cache_creation_input_tokens ?? 0) * p.cacheWrite5m +
      (usage.cache_read_input_tokens ?? 0) * p.cacheRead) /
    1_000_000;
  return usd * config.eurPerUsd * (batch ? config.batchPriceFactor : 1);
}
