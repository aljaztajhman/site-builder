import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "@sb/config";
import { FalImageTransport, ImageBilledError, ImageGenerator, SpendCapError, estimateCallEur, imageCostEur, type ModelRequest, type ModelTransport } from "@sb/engine";
import { Repo, createDb, createFsStorage, migrate, type JobData, type Platform, type Queue } from "@sb/platform";
import type { SiteSpec } from "@sb/spec";
import { modelClientFor, spendLedgerFor, startWorker, type WorkerJobs } from "../src/worker.ts";

/**
 * The daily cap against the real (in-memory) database: paid calls reserve their estimate before they are
 * sent, so parallel calls near the cap can't both pass; a picture fal made but we couldn't download is
 * booked; a generation that fails after saving a version leaves the site ready.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const config = loadConfig();
let platform: Platform;
let dir: string;
const handlers: { [Q in keyof JobData]?: (data: JobData[Q], jobId: string) => Promise<void> } = {};
const replayBefore = process.env.MODEL_REPLAY_DIR;
/** What the fake generation does: set per test. */
let generate: WorkerJobs["generateSite"] = async () => {
  throw new Error("not set");
};

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sb-worker-cap-"));
  process.env.MODEL_REPLAY_DIR = dir; // empty: no recordings
  const db = await createDb("pglite://memory");
  await migrate(db);
  const queue: Queue = {
    send: async () => "job",
    work: async (name, handler) => {
      (handlers as Record<string, unknown>)[name] = handler;
    },
    ping: async () => undefined,
    stop: async () => undefined,
  };
  platform = { db, repo: new Repo(db), storage: createFsStorage(path.join(dir, "storage")), queue, close: () => db.close() };
  await startWorker(platform, config, { generateSite: (...a) => generate(...a) });
}, 60_000);

afterAll(async () => {
  if (replayBefore === undefined) delete process.env.MODEL_REPLAY_DIR;
  else process.env.MODEL_REPLAY_DIR = replayBefore;
  await platform?.close();
  await rm(dir, { recursive: true, force: true });
});

beforeEach(async () => {
  await platform.db.query("delete from model_calls");
});

const spent = async (eur: number) =>
  platform.repo.logModelCall({ siteId: null, jobId: null, stage: "content", model: "claude-sonnet-5-5", inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, costEur: eur, durationMs: 0, ok: true });

const req: ModelRequest = { stage: "brief", system: ["Navodila"], messages: [{ role: "user", content: "Pekarna v Kamniku" }] };

describe("daily spend cap", () => {
  it("lets only one of two parallel calls near the cap through; the other is never sent", async () => {
    const estimate = estimateCallEur(config, config.models.brief, req);
    await spent(config.limits.dailyModelSpendCapEur - 1.5 * estimate);
    const sent: string[] = [];
    const transport: ModelTransport = {
      async send(r, stage) {
        sent.push(r.stage);
        await new Promise((ok) => setTimeout(ok, 20));
        return { text: "{}", stopReason: "end_turn", model: stage.model, usage: { input_tokens: 400, output_tokens: 300, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } };
      },
    };
    // Two jobs, two clients: the reservation is in the database, not in either client.
    const a = modelClientFor(platform, config, { siteId: null, jobId: "a", tier: "free" }, transport);
    const b = modelClientFor(platform, config, { siteId: null, jobId: "b", tier: "free" }, transport);
    const results = await Promise.allSettled([a.call(req), b.call(req)]);
    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect((results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason).toBeInstanceOf(SpendCapError);
    expect(sent).toEqual(["brief"]);
    // The call that went through is settled to its real tokens and cost, tagged with its job and tier.
    const { rows } = await platform.db.query<{ job_id: string; tier: string; input_tokens: number; output_tokens: number; pending: boolean; cost_eur: string }>(
      "select job_id, tier, input_tokens, output_tokens, pending, cost_eur from model_calls where stage = 'brief'",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ tier: "free", input_tokens: 400, output_tokens: 300, pending: false });
    expect(Number(rows[0]!.cost_eur)).toBeLessThan(estimate);
  });

  it("frees the reservation of a call that failed before it was answered", async () => {
    const failing: ModelTransport = { send: () => Promise.reject(new Error("connection reset")) };
    await expect(modelClientFor(platform, config, { siteId: null, jobId: "c" }, failing).call(req)).rejects.toThrow(/connection reset/);
    expect((await platform.db.query("select 1 from model_calls")).rows).toEqual([]);
  });

  it("books a picture fal made but we couldn't download, at its price", async () => {
    vi.stubGlobal("fetch", async (url: string) =>
      url.startsWith("https://fal.run/") ? new Response(JSON.stringify({ images: [{ url: "https://fal.media/x.jpg" }] }), { status: 200 }) : Promise.reject(new Error("socket hang up")),
    );
    try {
      const images = new ImageGenerator({ config, transport: new FalImageTransport("test-key"), ledger: spendLedgerFor(platform, { siteId: null, jobId: "d", tier: "paid" }) });
      await expect(images.generate("Kruh")).rejects.toBeInstanceOf(ImageBilledError);
    } finally {
      vi.unstubAllGlobals();
    }
    const model = config.imageGen.models[config.imageGen.pipeline.model]!;
    const { rows } = await platform.db.query<{ stage: string; ok: boolean; pending: boolean; cost_eur: string }>("select stage, ok, pending, cost_eur from model_calls");
    expect(rows).toMatchObject([{ stage: "imageGen", ok: false, pending: false }]);
    expect(Number(rows[0]!.cost_eur)).toBeCloseTo(imageCostEur(config, model, config.imageGen.landscape.width, config.imageGen.landscape.height), 6);
  });
});

describe("a generation that fails", () => {
  async function site(slug: string): Promise<string> {
    const s = await platform.repo.createSite({ name: slug, slug, intake: { description: "Pekarna v Kamniku", photoAssetIds: [], scope: "home" } });
    return s.id;
  }
  const spec = async () => JSON.parse(await readFile(path.join(here, "../../../tools/eval/golden/pekarna-kvas.json"), "utf8")) as SiteSpec;
  const events = async (siteId: string) => (await platform.db.query<{ stage: string; level: string; message: string }>("select stage, level, message from site_events where site_id = $1 order by id", [siteId])).rows;

  it("after it saved a version leaves the site ready, with the failure in the log, and counts", async () => {
    const id = await site("napaka-po-shranjevanju");
    const aiJobId = await platform.repo.usage.insertJob({ kind: "generate", scope: "home", tier: "free", estimateEur: 0.3, siteId: id });
    generate = async (deps, siteId) => {
      await deps.repo.setStatus(siteId, "generating");
      await deps.repo.saveSpec(siteId, await spec(), "generate");
      throw new Error("Critique note longer than 300 characters");
    };
    await handlers.generate!({ siteId: id, scope: "home", aiJobId }, "job-1");
    expect((await platform.repo.getSite(id))?.status).toBe("ready");
    const log = await events(id);
    expect(log.some((e) => e.level === "error")).toBe(false);
    expect(log.at(-1)).toMatchObject({ stage: "check", level: "warn", message: expect.stringContaining("Critique note longer than 300 characters") });
    expect((await platform.repo.usage.getJob(aiJobId))?.status).toBe("done");
  });

  it("before it saved a version is still failed, with the error and a retry", async () => {
    const id = await site("napaka-pred-shranjevanjem");
    const aiJobId = await platform.repo.usage.insertJob({ kind: "generate", scope: "home", tier: "free", estimateEur: 0.3, siteId: id });
    generate = async (deps, siteId) => {
      await deps.repo.setStatus(siteId, "generating");
      throw new SpendCapError(10, 10);
    };
    await handlers.generate!({ siteId: id, scope: "home", aiJobId }, "job-2");
    expect((await platform.repo.getSite(id))?.status).toBe("failed");
    expect((await events(id)).at(-1)).toMatchObject({ stage: "error", level: "error", message: expect.stringContaining("spend cap") });
    expect((await platform.repo.usage.getJob(aiJobId))?.status).toBe("failed");
  });
});
