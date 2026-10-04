import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "@sb/config";
import { PictureLimitError, type PipelineDeps } from "@sb/engine";
import { Repo, createDb, createFsStorage, migrate, type JobData, type Platform, type Queue } from "@sb/platform";
import type { SiteSpec } from "@sb/spec";
import { picturesForJob, spendLedgerFor, startWorker, type WorkerJobs } from "../src/worker.ts";

/**
 * Plan limits in the worker (it-plan-limits): a free preview's generation fills fewer generated pictures, a paid plan's
 * stops at what is left of its month (counted again at each picture's reservation, so two jobs can't both take the
 * last one), and a chat edit is checked against the owner's plan. Pictures are flat stand-ins (MODEL_REPLAY_DIR):
 * no fal or model call.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const config = loadConfig();
let platform: Platform;
let dir: string;
let golden: SiteSpec;
const handlers: { [Q in keyof JobData]?: (data: JobData[Q], jobId: string) => Promise<void> } = {};
const replayBefore = process.env.MODEL_REPLAY_DIR;
let seen: { deps: PipelineDeps; guard?: (before: SiteSpec, after: SiteSpec) => string | null } | null = null;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sb-worker-plan-"));
  process.env.MODEL_REPLAY_DIR = dir; // empty: no recordings, stand-in pictures
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
  golden = JSON.parse(await readFile(path.join(here, "../../../tools/eval/golden/pekarna-kvas.json"), "utf8")) as SiteSpec;
  const jobs: Partial<WorkerJobs> = {
    generateSite: (async (deps: PipelineDeps) => {
      seen = { deps };
      return { version: 1, check: null, critiqueRounds: 0, timings: {}, firstVersionMs: 0 };
    }) as unknown as WorkerJobs["generateSite"],
    applyChatEdit: (async (_deps: unknown, _site: string, _msg: number, guard?: (b: SiteSpec, a: SiteSpec) => string | null) => {
      seen = { deps: {} as PipelineDeps, ...(guard ? { guard } : {}) };
      return { version: null, reply: "", issues: [] };
    }) as unknown as WorkerJobs["applyChatEdit"],
  };
  await startWorker(platform, config, jobs);
}, 60_000);

afterAll(async () => {
  if (replayBefore === undefined) delete process.env.MODEL_REPLAY_DIR;
  else process.env.MODEL_REPLAY_DIR = replayBefore;
  await platform?.close();
  await rm(dir, { recursive: true, force: true });
});

beforeEach(async () => {
  await platform.db.query("delete from model_calls");
  seen = null;
});

let n = 0;
async function account(plan: "standard" | "premium" | null) {
  const email = `lastnik${++n}@siol.net`;
  const a = await platform.repo.accounts.signIn(email, email);
  if (plan) await platform.repo.accounts.allow(email, email, null, plan);
  const site = await platform.repo.createSite({ name: `s${n}`, slug: `plan-${n}`, intake: { description: "Pekarna Kvas", photoAssetIds: [], scope: "full" }, accountId: a.id });
  await platform.repo.saveSpec(site.id, { ...golden, slug: site.slug }, "generate");
  return { accountId: a.id, siteId: site.id };
}

/** Generated pictures this account's paid jobs already made this month. */
async function madePictures(accountId: string, k: number) {
  for (let i = 0; i < k; i++) {
    await platform.repo.logModelCall({ siteId: null, jobId: null, stage: "imageGen", model: "gpt-image-2.5", inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, costEur: 0.068, durationMs: 1, ok: true, tier: "paid", accountId });
  }
}

describe("generated pictures per job", () => {
  it("a free preview (no account or a free account) fills up to the per-tier count", async () => {
    for (const tier of ["anonymous", "free"] as const) {
      const r = await picturesForJob(platform, config, { siteId: null, jobId: null, tier, accountId: null }, "home");
      expect(r.pictures.fillTo).toBe(config.imageGen.pipeline.fillUpToFree);
      expect(r.pictureCap).toBeUndefined();
    }
    const admin = await picturesForJob(platform, config, { siteId: null, jobId: null, tier: "admin" }, "full");
    expect(admin.pictures.fillTo).toBe(config.imageGen.pipeline.fillUpTo.full);
    expect(admin.pictures.max).toBe(Infinity);
  });

  it("Osnovni: what is left of the month, then none, with a note naming Plus; Plus has more", async () => {
    const osnovni = await account("standard");
    const ctx = { siteId: osnovni.siteId, jobId: null, tier: "paid" as const, accountId: osnovni.accountId };
    expect((await picturesForJob(platform, config, ctx, "full")).pictures.max).toBe(3);
    await madePictures(osnovni.accountId, 2);
    expect((await picturesForJob(platform, config, ctx, "full")).pictures.max).toBe(1);
    await madePictures(osnovni.accountId, 1);
    const used = await picturesForJob(platform, config, ctx, "full");
    expect(used.pictures.max).toBe(0);
    expect(used.pictures.note).toMatch(/^Ta mesec ste porabili vse ustvarjene slike paketa Osnovni \(3\), zato jih nova različica strani ne dobi\. Nove so na voljo \d+\. \d+\. \d{4}\. Paket Plus \(29 € na mesec\) vključuje 10 ustvarjenih slik na mesec\.$/);
    expect(used.pictureCap?.max).toBe(3);
    const plus = await account("premium");
    await madePictures(plus.accountId, 3);
    expect((await picturesForJob(platform, config, { ...ctx, accountId: plus.accountId }, "full")).pictures.max).toBe(7);
  });

  it("holds the count at each picture's reservation: the last picture goes to one job only", async () => {
    const { accountId, siteId } = await account("standard");
    await madePictures(accountId, 2);
    const since = new Date(Date.now() - 86400_000);
    const ledger = spendLedgerFor(platform, { siteId, jobId: null, tier: "paid", accountId }, { since, max: 3 });
    const first = await ledger.reserve({ stage: "imageGen", model: "gpt-image-2.5", estimateEur: 0.07, capEur: 100 });
    // The first reservation is pending (in flight): it counts, so a second job can't take the same picture.
    await expect(ledger.reserve({ stage: "imageGen", model: "gpt-image-2.5", estimateEur: 0.07, capEur: 100 })).rejects.toBeInstanceOf(PictureLimitError);
    // A model call isn't a picture: the cap doesn't touch it.
    const text = await ledger.reserve({ stage: "content", model: "claude-sonnet-5-5", estimateEur: 0.1, capEur: 100 });
    await text.release();
    // A picture that failed without a bill frees its place.
    await first.settle({ stage: "imageGen", model: "gpt-image-2.5", usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }, costEur: 0, durationMs: 1, ok: false });
    const again = await ledger.reserve({ stage: "imageGen", model: "gpt-image-2.5", estimateEur: 0.07, capEur: 100 });
    await again.release();
  });

  it("the generate job hands the pipeline its count and a generator held to the plan's month", async () => {
    const { accountId, siteId } = await account("standard");
    await madePictures(accountId, 3);
    const aiJobId = await platform.repo.usage.insertJob({ kind: "generate", scope: "full", tier: "paid", accountId, siteId, estimateEur: 0.5 });
    await handlers.generate!({ siteId, scope: "full", aiJobId }, "job-1");
    expect(seen?.deps.pictures?.max).toBe(0);
    expect(seen?.deps.pictures?.note).toContain("Paket Plus (29 € na mesec)");
    // The stand-in generator refuses past the month's pictures at its reservation.
    await expect(seen!.deps.images!.generate("bread on a board")).rejects.toBeInstanceOf(PictureLimitError);
  });
});

describe("chat edits", () => {
  it("the edit job checks the result against the owner's plan: a second language is refused on Osnovni, not on Plus", async () => {
    const english = (s: SiteSpec): SiteSpec => ({ ...s, locales: { default: "sl", enabled: ["sl", "en"] } });
    for (const [plan, refused] of [["standard", true], ["premium", false]] as const) {
      const { accountId, siteId } = await account(plan);
      const msg = await platform.repo.addChat(siteId, "user", "Dodaj angleščino");
      const aiJobId = await platform.repo.usage.insertJob({ kind: "edit", tier: "paid", accountId, siteId, estimateEur: 0.03 });
      await handlers.edit!({ siteId, messageId: Number(msg.id), aiJobId }, "job-2");
      const verdict = seen?.guard?.(golden, english(golden)) ?? null;
      if (refused) expect(verdict).toMatch(/^Paket Osnovni ima stran v enem jeziku\. Paket Plus/);
      else expect(verdict).toBeNull();
    }
  });
});
