import { loadConfig, type AppConfig } from "@sb/config";
import {
  AnthropicTransport,
  CHECKER_BROWSER_ARGS,
  FalImageTransport,
  ImageGenerator,
  JunkIntakeError,
  ModelClient,
  PictureLimitError,
  allowancePeriod,
  limitBreach,
  pictureBudget,
  picturesNotice,
  slDate,
  ReplayTransport,
  SpendCapError,
  StandInImageTransport,
  UrlRefusedError,
  applyChatEdit,
  checkUrl,
  classify,
  describePhotos,
  generateSite,
  launchCheckBrowser,
  loadRecordings,
  provisionDomain,
  pruneAllSites,
  pruneSite,
  republishStaleAddresses,
  type ModelTransport,
  type SpendLedger,
  type UrlCheckResult,
} from "@sb/engine";
import { INTERRUPTED_MESSAGE, domainProvidersFor, type DomainProviders, type Platform, type Tier } from "@sb/platform";
import type { SiteSpec } from "@sb/spec";
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

/**
 * The database's spend ledger for one job's paid calls: each reserves its estimate under the daily cap
 * before it is sent (atomic across processes, Usage.reserveCall), then its row is settled to the real
 * tokens and € (per stage, with the job's tier, account and ai_jobs row) or released when nothing was billed.
 */
export function spendLedgerFor(platform: Pick<Platform, "repo">, ctx: CallContext, pictureCap?: { since: Date; max: number }): SpendLedger {
  const usage = platform.repo.usage;
  return {
    async reserve({ stage, model, estimateEur, capEur }) {
      const r = await usage.reserveCall({ ...owner(ctx), siteId: ctx.siteId, jobId: ctx.jobId, stage, model, estimateEur, capEur, ...(stage === "imageGen" && pictureCap ? { pictureCap } : {}) });
      if ("pictures" in r) throw new PictureLimitError(r.pictures, pictureCap?.max ?? 0);
      if (!("id" in r)) throw new SpendCapError(r.spent, capEur);
      return {
        async settle(c) {
          const u = c.usage;
          await usage.settleCall(r.id, { model: c.model, inputTokens: u.input_tokens, outputTokens: u.output_tokens, cacheCreationTokens: u.cache_creation_input_tokens, cacheReadTokens: u.cache_read_input_tokens, costEur: c.costEur, durationMs: c.durationMs, ok: c.ok });
          if (c.stage === "imageGen") console.log(`[image] ${c.model} €${c.costEur.toFixed(4)} ${c.durationMs}ms${c.ok ? "" : " failed"}`);
          else console.log(`[model] ${c.stage} ${c.model} in=${u.input_tokens} out=${u.output_tokens} cacheR=${u.cache_read_input_tokens} cacheW=${u.cache_creation_input_tokens} €${c.costEur.toFixed(4)} ${c.durationMs}ms`);
        },
        release: () => usage.releaseCall(r.id),
      };
    },
  };
}

/** Model client wired to the database: every call reserved under the daily cap, then logged per stage. */
export function modelClientFor(platform: Platform, config: AppConfig, ctx: CallContext, transport: ModelTransport = defaultTransport("generate")): ModelClient {
  return new ModelClient({ config, transport, ledger: spendLedgerFor(platform, ctx) });
}

/**
 * Generated mood images for sites with too few photos: fal.ai when FAL_KEY is set, flat stand-ins when
 * replaying recordings (demos), none otherwise. Every image is reserved at its price under the cap and logged with its €.
 */
export function imageGeneratorFor(platform: Platform, config: AppConfig, ctx: CallContext, pictureCap?: { since: Date; max: number }): ImageGenerator | undefined {
  if (!config.imageGen.pipeline.enabled) return undefined;
  const transport = process.env.MODEL_REPLAY_DIR ? new StandInImageTransport() : process.env.FAL_KEY ? new FalImageTransport() : null;
  if (!transport) return undefined;
  return new ImageGenerator({ config, transport, ledger: spendLedgerFor(platform, ctx, pictureCap) });
}

/**
 * A generation's own picture count (it-plan-limits): a free preview fills up to `imageGen.pipeline.fillUpToFree`;
 * a paid plan makes at most what is left of its month's generated pictures, held again at each picture's
 * reservation (`pictureCap`), with a note for the owner naming the plan that has more; the admin fills as config says.
 */
export async function picturesForJob(
  platform: Pick<Platform, "repo">,
  config: AppConfig,
  ctx: CallContext,
  scope: "home" | "full",
  now = new Date(),
): Promise<{ pictures: { fillTo: number; max: number; note: string | null }; pictureCap?: { since: Date; max: number } }> {
  const tier = ctx.tier ?? "admin";
  const plan = tier === "paid" && ctx.accountId ? await platform.repo.accounts.planOf(ctx.accountId) : null;
  if (!plan || !ctx.accountId) return { pictures: { ...pictureBudget(config, tier === "paid" ? "admin" : tier, scope), note: null } };
  const period = allowancePeriod(new Date(plan.since), now);
  const used = await platform.repo.usage.generatedPictures(ctx.accountId, period.start);
  const budget = pictureBudget(config, "paid", scope, { plan: plan.plan, used });
  return {
    pictures: { ...budget, note: picturesNotice(config, plan.plan, budget.max, slDate(config, period.end)) },
    pictureCap: { since: period.start, max: config.plans[plan.plan].site.generatedPicturesPerMonth },
  };
}

/** The owner's plan limits on a chat edit's result (plan-limits.ts): a Slovene refusal, or null. */
async function chatEditGuard(platform: Pick<Platform, "repo">, config: AppConfig, ctx: CallContext): Promise<((before: SiteSpec, after: SiteSpec) => string | null) | undefined> {
  const tier = ctx.tier ?? "admin";
  if (tier === "admin") return undefined;
  const plan = tier === "paid" && ctx.accountId ? ((await platform.repo.accounts.planOf(ctx.accountId))?.plan ?? "standard") : null;
  return (before, after) => limitBreach(config, tier, plan, before, after)?.message ?? null;
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

/** A job this process is running now. */
export interface RunningJob {
  queue: "generate" | "edit" | "alt";
  jobId: string;
  siteId: string;
  aiJobId: string | null;
  /** The site's version when the job started (a generation that saved one left a usable site). */
  before: number | null;
}

export interface WorkerHandle {
  running(): RunningJob[];
  /**
   * Graceful stop (SIGTERM): takes no new jobs, lets running ones finish for up to `drainMs`, then marks
   * the ones still running interrupted (site and ai_jobs row), so the editor offers a retry instead of
   * an endless "generating". Returns what it marked.
   */
  shutdown(drainMs: number): Promise<{ interrupted: RunningJob[] }>;
  /** One recovery pass: sites and ai_jobs rows left busy by a process that died (see `recoverInterrupted`). */
  recover(): Promise<{ sites: string[]; jobs: string[] }>;
}

/** Test seams: the engine's job functions (default: the real ones). */
export interface WorkerJobs {
  generateSite: typeof generateSite;
  applyChatEdit: typeof applyChatEdit;
  describePhotos: typeof describePhotos;
  /** The public website checker: one live site, in its own Chromium. */
  checkUrl: (url: string, config: AppConfig) => Promise<UrlCheckResult>;
}

/** What the visitor reads when a check failed for a reason of ours, not of the address. */
export const CHECK_FAILED_MESSAGE = "Pregleda nismo mogli dokončati. Poskusite znova čez nekaj minut.";

async function checkUrlInBrowser(url: string, config: AppConfig): Promise<UrlCheckResult> {
  const browser = await launchCheckBrowser(CHECKER_BROWSER_ARGS);
  try {
    return await checkUrl(url, { browser, config });
  } finally {
    await browser.close();
  }
}

/** What the owner reads when a chat edit was cut off by a restart. */
export const EDIT_INTERRUPTED_REPLY = "Sprememba je bila prekinjena zaradi ponovnega zagona strežnika. Preverite stran in jo po potrebi pošljite znova.";

/**
 * How long a stopping worker lets running jobs finish: Railway's draining window (SIGTERM → SIGKILL, the
 * service variable RAILWAY_DEPLOYMENT_DRAINING_SECONDS) minus the reserve for marking and closing, or
 * config `worker.drainSeconds` when the variable isn't set. At least 1 s (pg-boss's minimum).
 */
export function drainMs(config: AppConfig, env: Record<string, string | undefined> = process.env): number {
  const railway = env.RAILWAY_DEPLOYMENT_DRAINING_SECONDS;
  const seconds = railway && Number.isFinite(Number(railway)) ? Number(railway) - config.worker.drainReserveSeconds : config.worker.drainSeconds;
  return Math.max(1, seconds) * 1000;
}

/**
 * Sites and ai_jobs rows a dead process left busy: jobs that started but have no waiting or running
 * pg-boss job (pg-boss fails a killed worker's job when its heartbeat stops) are marked interrupted, and
 * busy sites without one are marked failed with a Slovene event (the editor offers "Poskusi znova").
 * `graceMinutes` skips sites changed more recently (a request between setting the status and queueing).
 */
export async function recoverInterrupted(platform: Pick<Platform, "repo">, graceMinutes: number): Promise<{ sites: string[]; jobs: string[] }> {
  const jobs = await platform.repo.usage.interruptOrphans();
  const sites = await platform.repo.failInterrupted(graceMinutes);
  return { sites, jobs };
}

/** Where sites live and who provides their domains (default: PLATFORM_DOMAIN and config `domains.providers`). */
export interface WorkerOptions {
  platformDomain?: string | null;
  domainProviders?: DomainProviders;
}

/** Registers the job handlers. Used by the worker service and, with PGlite, in-process by the web service. */
export async function startWorker(platform: Platform, config = loadConfig(), jobs: Partial<WorkerJobs> = {}, opts: WorkerOptions = {}): Promise<WorkerHandle> {
  const { repo, storage, queue } = platform;
  const platformDomain = opts.platformDomain !== undefined ? opts.platformDomain : process.env.PLATFORM_DOMAIN || null;
  const domainDeps = { repo, storage, config, platformDomain, providers: opts.domainProviders ?? domainProvidersFor(config.domains.providers) };
  const run: WorkerJobs = { generateSite, applyChatEdit, describePhotos, checkUrl: checkUrlInBrowser, ...jobs };
  const timers: ReturnType<typeof setInterval>[] = [];

  // Left busy by a process that died (deploy, crash): at start, and every minute for jobs whose pg-boss
  // heartbeat stopped after this process started (a killed worker's job is failed after worker.heartbeatSeconds).
  const recover = () => recoverInterrupted(platform, 0);
  const logRecovery = (r: { sites: string[]; jobs: string[] }) => {
    if (r.sites.length || r.jobs.length) console.log(`[worker] recovered ${r.sites.length} interrupted site(s), ${r.jobs.length} interrupted job(s)`);
  };
  logRecovery(await recover());
  timers.push(setInterval(() => void recoverInterrupted(platform, 2).then(logRecovery).catch((e: unknown) => console.error("[worker]", e)), 60_000));

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
  timers.push(setInterval(() => void housekeeping().catch((e: unknown) => console.error("[worker] housekeeping", e)), 60 * 60_000));
  timers.push(setInterval(() => void spend().catch((e: unknown) => console.error("[worker] spend", e)), 10 * 60_000));
  for (const t of timers) t.unref();

  // Jobs running in this process, so a shutdown can mark the ones it cut off.
  const running = new Map<string, RunningJob>();
  const tracked = async (entry: Omit<RunningJob, "before">, work: () => Promise<void>) => {
    if (entry.aiJobId) await repo.usage.startJob(entry.aiJobId);
    const before = entry.queue === "generate" ? ((await repo.getSite(entry.siteId))?.current_version ?? null) : null;
    running.set(entry.jobId, { ...entry, before });
    try {
      await work();
    } finally {
      running.delete(entry.jobId);
    }
  };

  /** Whose job this is: its ai_jobs row (tier, account), or for jobs started without one, the site's owner. */
  const contextFor = async (siteId: string, jobId: string, aiJobId?: string): Promise<CallContext> => {
    const charge = aiJobId ? await repo.usage.getJob(aiJobId) : null;
    const o = charge ? { tier: charge.tier, accountId: charge.account_id } : await repo.usage.siteOwner(siteId);
    return { siteId, jobId, tier: o.tier, accountId: o.accountId, aiJobId: charge?.id ?? null };
  };
  /** The job is over: its logged calls replace its held estimate. */
  const finish = async (aiJobId: string | null | undefined, status: "done" | "failed" | "refused" | "interrupted") => {
    if (!aiJobId) return;
    await repo.usage.finishJob(aiJobId, status);
    await monitor.check().catch((e: unknown) => console.error("[worker] spend", e));
  };

  /**
   * A job the shutdown cut off. A generation that saved a version leaves a usable site ("ready", counted
   * like a generation whose later stage failed); one that saved nothing is "failed" with a retry, and
   * its row "interrupted" (not counted). An edit or photo descriptions put the site back to "ready".
   */
  const interrupt = async (r: RunningJob) => {
    if (r.queue === "generate") {
      const after = (await repo.getSite(r.siteId))?.current_version ?? null;
      if (after !== r.before) {
        if (await repo.setStatusIf(r.siteId, "generating", "ready")) {
          await repo.addEvent({ siteId: r.siteId, jobId: r.jobId, stage: "check", level: "warn", message: "Interrupted by a restart after the version was saved; kept it without the remaining checks" });
        }
        await finish(r.aiJobId, "done");
      } else {
        if (await repo.setStatusIf(r.siteId, "generating", "failed")) {
          await repo.addEvent({ siteId: r.siteId, jobId: r.jobId, stage: "error", level: "error", message: INTERRUPTED_MESSAGE });
        }
        await finish(r.aiJobId, "interrupted");
      }
      return;
    }
    await repo.setStatusIf(r.siteId, "editing", "ready");
    if (r.queue === "edit") await repo.addChat(r.siteId, "assistant", EDIT_INTERRUPTED_REPLY, { error: true });
    await repo.addEvent({ siteId: r.siteId, jobId: r.jobId, stage: r.queue === "edit" ? "edit" : "altText", level: "warn", message: `Interrupted by a restart (${r.queue})` });
    await finish(r.aiJobId, "interrupted");
  };

  // Generations run in parallel (one site each); each peaks at ~1.1 GB with its Chromium checks.
  await queue.work("generate", (job, jobId) => tracked({ queue: "generate", jobId, siteId: job.siteId, aiJobId: job.aiJobId ?? null }, async () => {
    const ctx = await contextFor(job.siteId, jobId, job.aiJobId);
    const client = modelClientFor(platform, config, ctx);
    const before = (await repo.getSite(job.siteId))?.current_version ?? null;
    try {
      const { pictures, pictureCap } = await picturesForJob(platform, config, ctx, job.scope === "full" ? "full" : "home");
      const images = imageGeneratorFor(platform, config, ctx, pictureCap);
      const r = await run.generateSite({ config, repo, storage, client, pictures, ...(images ? { images } : {}) }, job.siteId, jobId);
      if (r.critiqueSkipped) console.log(`[generate] ${job.siteId}: finished with the critique skipped (${r.critiqueSkipped})`);
      await finish(ctx.aiJobId, "done");
    } catch (e) {
      if (e instanceof JunkIntakeError) {
        // Refused, not failed: it doesn't use up the visitor's free generation.
        await repo.setStatus(job.siteId, "failed");
        await repo.addEvent({ siteId: job.siteId, jobId, stage: "error", level: "error", message: JUNK_REPLY, data: { confidence: e.confidence } });
        await finish(ctx.aiJobId, "refused");
        return;
      }
      console.error("[generate]", e);
      const after = (await repo.getSite(job.siteId))?.current_version ?? null;
      if (after !== before) {
        // The job saved a version before it failed: the owner has a usable site, so it stays "ready" (no
        // "Napaka"), the failure goes to the log, and the generation counts. A chat edit running on the
        // saved version keeps its own status.
        await repo.setStatusIf(job.siteId, "generating", "ready");
        await repo.addEvent({ siteId: job.siteId, jobId, stage: "check", level: "warn", message: `Stopped after the version was saved; kept it without the remaining steps: ${(e as Error).message.slice(0, 300)}` });
        await finish(ctx.aiJobId, "done");
        return;
      }
      await repo.setStatus(job.siteId, "failed");
      await repo.addEvent({ siteId: job.siteId, jobId, stage: "error", level: "error", message: (e as Error).message });
      await finish(ctx.aiJobId, "failed");
    }
  }), { concurrency: config.limits.jobConcurrency });

  // Edits and publishes stay sequential: two at once on the same site would conflict on the spec version.
  await queue.work("edit", (job, jobId) => tracked({ queue: "edit", jobId, siteId: job.siteId, aiJobId: job.aiJobId ?? null }, async () => {
    const ctx = await contextFor(job.siteId, jobId, job.aiJobId);
    const client = modelClientFor(platform, config, ctx, defaultTransport("edit"));
    try {
      await run.applyChatEdit({ repo, client }, job.siteId, job.messageId, await chatEditGuard(platform, config, ctx));
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
  }));

  // Alt text for photos the owner added in the editor. Without the model (no key, spend cap, no credit)
  // the alt stays empty: the editor asks the owner and publishing waits for it. The web app reserved its
  // ai_jobs row under the owner's tier pool (photos per account, apps/web/src/limits.ts); adding photos
  // itself is never limited. A job queued before that existed has no row and is logged to the site's owner.
  await queue.work("alt", (job, jobId) => tracked({ queue: "alt", jobId, siteId: job.siteId, aiJobId: job.aiJobId ?? null }, async () => {
    const ctx = await contextFor(job.siteId, jobId, job.aiJobId);
    const client = modelClientFor(platform, config, ctx, defaultTransport("generate"));
    try {
      await run.describePhotos({ repo, storage, client }, job.siteId, job.imageIds);
      await finish(ctx.aiJobId, "done");
    } catch (e) {
      await repo.addEvent({ siteId: job.siteId, jobId, stage: "altText", level: "warn", message: `Photo descriptions not written: ${(e as Error).message.slice(0, 200)}` });
      await finish(ctx.aiJobId, "failed");
      console.error("[alt]", e);
    } finally {
      await repo.setStatusIf(job.siteId, "editing", "ready");
    }
  }));

  // Version retention, nightly (config versions.retention). No model calls; each site logs what went.
  await queue.work("prune", async (job) => {
    const results = job.siteId ? [await pruneSite({ repo, storage, config }, job.siteId)] : await pruneAllSites({ repo, storage, config });
    const versions = results.reduce((n, r) => n + r.removed.length, 0);
    const mb = results.reduce((n, r) => n + r.bytes, 0) / 1e6;
    const failed = results.filter((r) => "error" in r && r.error).length;
    console.log(`[prune] ${results.length} site(s): ${versions} version(s) removed (${mb.toFixed(1)} MB), ${results.reduce((n, r) => n + r.files.length, 0)} file(s)${failed ? `, ${failed} failed` : ""}`);
  });
  await queue.schedule?.("prune", config.versions.retention.cron, {}, { tz: config.versions.retention.timeZone });

  // The public website checker (/pregled): no model calls, one at a time (each opens a Chromium and runs
  // Lighthouse). A refused address is the visitor's answer; anything else is logged and worded for them.
  await queue.work("check-url", async (job) => {
    const row = await repo.checks.get(job.checkId);
    if (!row || !(await repo.checks.start(job.checkId))) return;
    try {
      await repo.checks.finish(row.id, await run.checkUrl(row.url, config));
    } catch (e) {
      if (e instanceof UrlRefusedError) await repo.checks.fail(row.id, e.message);
      else {
        console.error(`[check-url] ${row.host}:`, (e as Error).message);
        await repo.checks.fail(row.id, CHECK_FAILED_MESSAGE);
      }
    }
  });

  // A site's own domain (no model calls): one run of its provisioning steps per job (engine provision.ts).
  // A run that has to wait or retry sets the domain's next time; the sweep below queues it again then.
  await queue.work("domain", async (job) => {
    const r = await provisionDomain(domainDeps, job.hostname, { force: job.force ?? false });
    if (r.status !== "skipped") console.log(`[domain] ${job.hostname}: ${r.status} at ${r.step}${r.failure ? ` (${r.failure})` : ""}`);
  });
  const sweepDomains = async () => {
    for (const hostname of await repo.domains.due()) await queue.send("domain", { hostname });
  };
  timers.push(setInterval(() => void sweepDomains().catch((e: unknown) => console.error("[worker] domain sweep", e)), config.domains.sweepSeconds * 1000));
  // Sites whose address changed since their release (PLATFORM_DOMAIN set, a domain went live or away) are
  // republished, so canonical URLs, the sitemap and the feed name where they are served: at start and hourly.
  const addresses = async () => {
    const r = await republishStaleAddresses(domainDeps);
    if (r.republished.length || r.busy.length || r.blocked.length) console.log(`[worker] address check: ${r.republished.length} republished, ${r.busy.length} busy, ${r.blocked.length} blocked by the checklist`);
  };
  // Not awaited: republishing many sites must not hold up the worker's start.
  void addresses().catch((e: unknown) => console.error("[worker] address check", e));
  timers.push(setInterval(() => void addresses().catch((e: unknown) => console.error("[worker] address check", e)), 60 * 60_000));
  for (const t of timers) t.unref();

  let stopping: Promise<{ interrupted: RunningJob[] }> | null = null;
  return {
    running: () => [...running.values()],
    recover,
    shutdown(drain) {
      stopping ??= (async () => {
        for (const t of timers) clearInterval(t);
        // pg-boss stops fetching, waits up to `drain` for running handlers, then fails the queue jobs left.
        await queue.stop(drain);
        const left = [...running.values()];
        for (const r of left) await interrupt(r).catch((e: unknown) => console.error(`[worker] marking ${r.queue} ${r.siteId} interrupted failed`, e));
        return { interrupted: left };
      })();
      return stopping;
    },
  };
}
