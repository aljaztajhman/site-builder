import { loadConfig, type AppConfig } from "@sb/config";
import {
  AnthropicTransport,
  FalImageTransport,
  ImageGenerator,
  JunkIntakeError,
  ModelClient,
  ReplayTransport,
  SpendCapError,
  StandInImageTransport,
  applyChatEdit,
  classify,
  describePhotos,
  generateSite,
  loadRecordings,
  pruneAllSites,
  pruneSite,
  publishSite,
  type ModelTransport,
} from "@sb/engine";
import type { Platform, Tier } from "@sb/platform";
import { cleanupExpired, spendMonitor } from "./housekeeping.ts";

/** Replies to the owner when a chat edit fails outright (the details go to the event log). */
const EDIT_ERROR_REPLY = "Sprememba ni uspela, stran je ostala nespremenjena. Poskusite znova čez nekaj minut ali jo uredite neposredno.";
const EDIT_SPEND_CAP_REPLY = "Današnja omejitev porabe pomočnika je dosežena, zato sprememba ni bila narejena. Jutri spet deluje; do takrat stran urejate neposredno.";
/** A description the classifier couldn't place (shown on the generation screen). */
export const JUNK_REPLY = "Iz opisa ne znamo razbrati, kakšno podjetje imate. Napišite, kaj ponujate, kje ste in kako vas dosežejo, in poskusite znova.";

/** Whose model calls these are: the site and queue job, and for the limits the tier, account and ai_jobs row. */
export interface CallContext {
  siteId: string | null;
  jobId: string | null;
  tier?: Tier | null;
  accountId?: string | null;
  aiJobId?: string | null;
}

const owner = (ctx: CallContext) => ({ tier: ctx.tier ?? null, accountId: ctx.accountId ?? null, aiJobId: ctx.aiJobId ?? null });

/** Model client wired to the database: spend cap from today's logged calls, every call logged per stage. */
export function modelClientFor(platform: Platform, config: AppConfig, ctx: CallContext, transport: ModelTransport = defaultTransport("generate")): ModelClient {
  return new ModelClient({
    config,
    transport,
    spentToday: () => platform.repo.spendToday(),
    onCall: async (r) => {
      await platform.repo.logModelCall({
        ...owner(ctx),
        siteId: ctx.siteId,
        jobId: ctx.jobId,
        stage: r.stage,
        model: r.model,
        inputTokens: r.usage.input_tokens,
        outputTokens: r.usage.output_tokens,
        cacheCreationTokens: r.usage.cache_creation_input_tokens,
        cacheReadTokens: r.usage.cache_read_input_tokens,
        costEur: r.costEur,
        durationMs: r.durationMs,
        ok: r.ok,
      });
      console.log(`[model] ${r.stage} ${r.model} in=${r.usage.input_tokens} out=${r.usage.output_tokens} cacheR=${r.usage.cache_read_input_tokens} cacheW=${r.usage.cache_creation_input_tokens} €${r.costEur.toFixed(4)} ${r.durationMs}ms`);
    },
  });
}

/**
 * Generated mood images for sites with too few photos: fal.ai when FAL_KEY is set, flat stand-ins when
 * replaying recordings (demos), none otherwise. Every image is logged with its € and counts against the cap.
 */
export function imageGeneratorFor(platform: Platform, config: AppConfig, ctx: CallContext): ImageGenerator | undefined {
  if (!config.imageGen.pipeline.enabled) return undefined;
  const transport = process.env.MODEL_REPLAY_DIR ? new StandInImageTransport() : process.env.FAL_KEY ? new FalImageTransport() : null;
  if (!transport) return undefined;
  return new ImageGenerator({
    config,
    transport,
    spentToday: () => platform.repo.spendToday(),
    onCall: async (r) => {
      await platform.repo.logModelCall({ ...owner(ctx), siteId: ctx.siteId, jobId: ctx.jobId, stage: r.stage, model: r.model, inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, costEur: r.costEur, durationMs: r.durationMs, ok: r.ok });
      console.log(`[image] ${r.model} €${r.costEur.toFixed(4)} ${r.durationMs}ms${r.ok ? "" : " failed"}`);
    },
  });
}

/**
 * The intake's junk check (web process): the classifier (Haiku), logged against the job that holds the
 * generation's estimate, before the job is queued. Needs ANTHROPIC_API_KEY on the web service too.
 */
export function intakeClassifier(platform: Platform, config: AppConfig) {
  return (description: string, ctx: { siteId: string; tier: Tier; accountId: string | null; aiJobId: string }) =>
    classify(modelClientFor(platform, config, { siteId: ctx.siteId, jobId: null, tier: ctx.tier, accountId: ctx.accountId, aiJobId: ctx.aiJobId }), description);
}

/**
 * MODEL_REPLAY_DIR replays recorded responses instead of calling the API (demo and offline dev).
 * Every job gets a fresh transport, so a generate job replays the generation calls and an edit job the edit calls.
 */
function defaultTransport(job: "generate" | "edit"): ModelTransport {
  const dir = process.env.MODEL_REPLAY_DIR;
  if (!dir) return new AnthropicTransport();
  return new ReplayTransport(loadRecordings(dir).filter((r) => (r.stage === "edit") === (job === "edit")));
}

/** Registers the job handlers. Used by the worker service and, with PGlite, in-process by the web service. */
export async function startWorker(platform: Platform, config = loadConfig()): Promise<void> {
  const { repo, storage, queue } = platform;

  // A job can't outlive the queue's 15-minute expiry; anything older still marked busy was interrupted.
  await repo.failInterrupted(0);
  setInterval(() => void repo.failInterrupted(20).catch((e: unknown) => console.error("[worker]", e)), 5 * 60_000).unref();

  if (config.imageGen.pipeline.enabled && !process.env.FAL_KEY && !process.env.MODEL_REPLAY_DIR) {
    console.warn("[worker] FAL_KEY not set: sites with too few photos get no generated pictures");
  }

  // Housekeeping (hourly): expired anonymous previews and their files, IP hashes, stale held estimates.
  // Spend (every 10 minutes): the daily line per pool and the 80 % warning.
  const monitor = spendMonitor(repo, config);
  const housekeeping = async () => {
    const r = await cleanupExpired(platform, config);
    if (r.sites.length || r.staleJobs) console.log(`[worker] housekeeping: ${r.sites.length} expired anonymous preview(s) deleted, ${r.staleJobs} stale job(s) ended`);
  };
  const spend = async () => {
    await monitor.daily();
    await monitor.check();
  };
  await housekeeping().catch((e: unknown) => console.error("[worker] housekeeping", e));
  await spend().catch((e: unknown) => console.error("[worker] spend", e));
  setInterval(() => void housekeeping().catch((e: unknown) => console.error("[worker] housekeeping", e)), 60 * 60_000).unref();
  setInterval(() => void spend().catch((e: unknown) => console.error("[worker] spend", e)), 10 * 60_000).unref();

  /** Whose job this is: its ai_jobs row (tier, account), or for jobs started without one, the site's owner. */
  const contextFor = async (siteId: string, jobId: string, aiJobId?: string): Promise<CallContext> => {
    const charge = aiJobId ? await repo.usage.getJob(aiJobId) : null;
    const o = charge ? { tier: charge.tier, accountId: charge.account_id } : await repo.usage.siteOwner(siteId);
    return { siteId, jobId, tier: o.tier, accountId: o.accountId, aiJobId: charge?.id ?? null };
  };
  /** The job is over: its logged calls replace its held estimate. */
  const finish = async (aiJobId: string | null | undefined, status: "done" | "failed" | "refused") => {
    if (!aiJobId) return;
    await repo.usage.finishJob(aiJobId, status);
    await monitor.check().catch((e: unknown) => console.error("[worker] spend", e));
  };

  // Generations run in parallel (one site each); each peaks at ~1.1 GB with its Chromium checks.
  await queue.work("generate", async (job, jobId) => {
    const ctx = await contextFor(job.siteId, jobId, job.aiJobId);
    const client = modelClientFor(platform, config, ctx);
    const before = (await repo.getSite(job.siteId))?.current_version ?? null;
    try {
      const images = imageGeneratorFor(platform, config, ctx);
      await generateSite({ config, repo, storage, client, ...(images ? { images } : {}) }, job.siteId, jobId);
      await finish(ctx.aiJobId, "done");
    } catch (e) {
      await repo.setStatus(job.siteId, "failed");
      if (e instanceof JunkIntakeError) {
        // Refused, not failed: it doesn't use up the visitor's free generation.
        await repo.addEvent({ siteId: job.siteId, jobId, stage: "error", level: "error", message: JUNK_REPLY, data: { confidence: e.confidence } });
        await finish(ctx.aiJobId, "refused");
        return;
      }
      await repo.addEvent({ siteId: job.siteId, jobId, stage: "error", level: "error", message: (e as Error).message });
      // A generation that saved a version (the owner has a preview) counts even if a later stage failed.
      const after = (await repo.getSite(job.siteId))?.current_version ?? null;
      await finish(ctx.aiJobId, after !== before ? "done" : "failed");
      console.error("[generate]", e);
    }
  }, { concurrency: config.limits.jobConcurrency });

  // Edits and publishes stay sequential: two at once on the same site would conflict on the spec version.
  await queue.work("edit", async (job, jobId) => {
    const ctx = await contextFor(job.siteId, jobId, job.aiJobId);
    const client = modelClientFor(platform, config, ctx, defaultTransport("edit"));
    try {
      await applyChatEdit({ repo, client }, job.siteId, job.messageId);
      await finish(ctx.aiJobId, "done");
    } catch (e) {
      // The owner reads this reply; the technical error goes to the log. applyChatEdit already put back
      // the status it set, and a generation running meanwhile keeps its own. A failed edit isn't counted.
      const reply = e instanceof SpendCapError ? EDIT_SPEND_CAP_REPLY : EDIT_ERROR_REPLY;
      await repo.addChat(job.siteId, "assistant", reply, { error: true });
      await repo.addEvent({ siteId: job.siteId, jobId, stage: "edit", level: "error", message: `Edit failed: ${(e as Error).message.slice(0, 300)}` });
      await finish(ctx.aiJobId, "failed");
      console.error("[edit]", e);
    }
  });

  // Alt text for photos the owner added in the editor. Without the model (no key, spend cap, no credit)
  // the alt stays empty: the editor asks the owner and publishing waits for it. Direct editing is never
  // limited, so this job holds no estimate; its calls still count in the owner's tier pool.
  await queue.work("alt", async (job, jobId) => {
    const client = modelClientFor(platform, config, await contextFor(job.siteId, jobId), defaultTransport("generate"));
    try {
      await describePhotos({ repo, storage, client }, job.siteId, job.imageIds);
    } catch (e) {
      await repo.addEvent({ siteId: job.siteId, jobId, stage: "altText", level: "warn", message: `Photo descriptions not written: ${(e as Error).message.slice(0, 200)}` });
      console.error("[alt]", e);
    } finally {
      await repo.setStatusIf(job.siteId, "editing", "ready");
    }
  });

  await queue.work("publish", async (job, jobId) => {
    try {
      await publishSite({ repo, storage, config }, job.siteId, job.version);
    } catch (e) {
      await repo.addEvent({ siteId: job.siteId, jobId, stage: "publish", level: "error", message: (e as Error).message });
    }
  });

  // Version retention, nightly (config versions.retention). No model calls; each site logs what went.
  await queue.work("prune", async (job) => {
    const results = job.siteId ? [await pruneSite({ repo, storage, config }, job.siteId)] : await pruneAllSites({ repo, storage, config });
    const versions = results.reduce((n, r) => n + r.removed.length, 0);
    const mb = results.reduce((n, r) => n + r.bytes, 0) / 1e6;
    const failed = results.filter((r) => "error" in r && r.error).length;
    console.log(`[prune] ${results.length} site(s): ${versions} version(s) removed (${mb.toFixed(1)} MB), ${results.reduce((n, r) => n + r.files.length, 0)} file(s)${failed ? `, ${failed} failed` : ""}`);
  });
  await queue.schedule?.("prune", config.versions.retention.cron, {}, { tz: config.versions.retention.timeZone });
}
