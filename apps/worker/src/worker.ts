import { loadConfig, type AppConfig } from "@sb/config";
import { AnthropicTransport, ModelClient, ReplayTransport, applyChatEdit, generateSite, publishSite, type ModelTransport } from "@sb/engine";
import type { Platform } from "@sb/platform";

/** Model client wired to the database: spend cap from today's logged calls, every call logged per stage. */
export function modelClientFor(platform: Platform, config: AppConfig, ctx: { siteId: string | null; jobId: string | null }, transport?: ModelTransport): ModelClient {
  return new ModelClient({
    config,
    transport: transport ?? defaultTransport(),
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

/** MODEL_REPLAY_DIR replays recorded responses instead of calling the API (demo and offline dev). */
function defaultTransport(): ModelTransport {
  const dir = process.env.MODEL_REPLAY_DIR;
  return dir ? new ReplayTransport(dir) : new AnthropicTransport();
}

/** Registers the job handlers. Used by the worker service and, with PGlite, in-process by the web service. */
export async function startWorker(platform: Platform, config = loadConfig()): Promise<void> {
  const { repo, storage, queue } = platform;

  await queue.work("generate", async (job, jobId) => {
    const client = modelClientFor(platform, config, { siteId: job.siteId, jobId });
    try {
      await generateSite({ config, repo, storage, client }, job.siteId, jobId);
    } catch (e) {
      await repo.setStatus(job.siteId, "failed");
      await repo.addEvent({ siteId: job.siteId, jobId, stage: "error", level: "error", message: (e as Error).message });
      console.error("[generate]", e);
    }
  });

  await queue.work("edit", async (job, jobId) => {
    const client = modelClientFor(platform, config, { siteId: job.siteId, jobId });
    try {
      await applyChatEdit({ repo, client }, job.siteId, job.messageId);
    } catch (e) {
      await repo.addChat(job.siteId, "assistant", `Napaka: ${(e as Error).message}`, { error: true });
      await repo.setStatus(job.siteId, "ready");
      console.error("[edit]", e);
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
