import { loadConfig, type AppConfig } from "@sb/config";
import {
  AnthropicTransport,
  FalImageTransport,
  ImageGenerator,
  ModelClient,
  ReplayTransport,
  StandInImageTransport,
  applyChatEdit,
  describePhotos,
  generateSite,
  loadRecordings,
  publishSite,
  type ModelTransport,
} from "@sb/engine";
import type { Platform } from "@sb/platform";

/** Model client wired to the database: spend cap from today's logged calls, every call logged per stage. */
export function modelClientFor(
  platform: Platform,
  config: AppConfig,
  ctx: { siteId: string | null; jobId: string | null },
  transport: ModelTransport = defaultTransport("generate"),
): ModelClient {
  return new ModelClient({
    config,
    transport,
    spentToday: () => platform.repo.spendToday(),
    onCall: async (r) => {
      await platform.repo.logModelCall({
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
export function imageGeneratorFor(platform: Platform, config: AppConfig, ctx: { siteId: string | null; jobId: string | null }): ImageGenerator | undefined {
  if (!config.imageGen.pipeline.enabled) return undefined;
  const transport = process.env.MODEL_REPLAY_DIR ? new StandInImageTransport() : process.env.FAL_KEY ? new FalImageTransport() : null;
  if (!transport) return undefined;
  return new ImageGenerator({
    config,
    transport,
    spentToday: () => platform.repo.spendToday(),
    onCall: async (r) => {
      await platform.repo.logModelCall({ siteId: ctx.siteId, jobId: ctx.jobId, stage: r.stage, model: r.model, inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, costEur: r.costEur, durationMs: r.durationMs, ok: r.ok });
      console.log(`[image] ${r.model} €${r.costEur.toFixed(4)} ${r.durationMs}ms${r.ok ? "" : " failed"}`);
    },
  });
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

  // Generations run in parallel (one site each); each peaks at ~1.1 GB with its Chromium checks.
  await queue.work("generate", async (job, jobId) => {
    const client = modelClientFor(platform, config, { siteId: job.siteId, jobId });
    try {
      const images = imageGeneratorFor(platform, config, { siteId: job.siteId, jobId });
      await generateSite({ config, repo, storage, client, ...(images ? { images } : {}) }, job.siteId, jobId);
    } catch (e) {
      await repo.setStatus(job.siteId, "failed");
      await repo.addEvent({ siteId: job.siteId, jobId, stage: "error", level: "error", message: (e as Error).message });
      console.error("[generate]", e);
    }
  }, { concurrency: config.limits.jobConcurrency });

  // Edits and publishes stay sequential: two at once on the same site would conflict on the spec version.
  await queue.work("edit", async (job, jobId) => {
    const client = modelClientFor(platform, config, { siteId: job.siteId, jobId }, defaultTransport("edit"));
    try {
      await applyChatEdit({ repo, client }, job.siteId, job.messageId);
    } catch (e) {
      await repo.addChat(job.siteId, "assistant", `Napaka: ${(e as Error).message}`, { error: true });
      await repo.setStatus(job.siteId, "ready");
      console.error("[edit]", e);
    }
  });

  // Alt text for photos the owner added in the editor. Without the model (no key, spend cap, no credit)
  // the alt stays empty: the editor asks the owner and publishing waits for it.
  await queue.work("alt", async (job, jobId) => {
    const client = modelClientFor(platform, config, { siteId: job.siteId, jobId }, defaultTransport("generate"));
    try {
      await describePhotos({ repo, storage, client }, job.siteId, job.imageIds);
    } catch (e) {
      await repo.addEvent({ siteId: job.siteId, jobId, stage: "altText", level: "warn", message: `Photo descriptions not written: ${(e as Error).message.slice(0, 200)}` });
      console.error("[alt]", e);
    } finally {
      if ((await repo.getSite(job.siteId))?.status === "editing") await repo.setStatus(job.siteId, "ready");
    }
  });

  await queue.work("publish", async (job, jobId) => {
    try {
      await publishSite({ repo, storage, config }, job.siteId, job.version);
    } catch (e) {
      await repo.addEvent({ siteId: job.siteId, jobId, stage: "publish", level: "error", message: (e as Error).message });
    }
  });
}
