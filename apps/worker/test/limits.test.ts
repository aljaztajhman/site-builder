import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadConfig } from "@sb/config";
import { Repo, createDb, createFsStorage, migrate, type JobData, type Platform, type Queue } from "@sb/platform";
import { JUNK_REPLY, modelClientFor, startWorker } from "../src/worker.ts";
import { cleanupExpired, spendMonitor } from "../src/housekeeping.ts";

/**
 * The worker's side of the limits: every model call carries its tier, account and job; a job's row is
 * finished (done, failed, refused) so its held estimate ends; junk stops before any Sonnet call; expired
 * anonymous previews are deleted with their files; the daily spend line and the 80 % pool warning.
 * The model is a replay transport with no recordings: any call that reaches it fails.
 */
const config = structuredClone(loadConfig());
// The junk check is off in production config (owner, 2026-10-01); the mechanism is still tested at these values.
config.tiers.junk = { minDescriptionChars: 40, minClassifierConfidence: 0.5 };
let platform: Platform;
let dir: string;
const handlers: { [Q in keyof JobData]?: (data: JobData[Q], jobId: string) => Promise<void> } = {};
const replayBefore = process.env.MODEL_REPLAY_DIR;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sb-worker-limits-"));
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
  await startWorker(platform, config);
}, 60_000);

afterAll(async () => {
  if (replayBefore === undefined) delete process.env.MODEL_REPLAY_DIR;
  else process.env.MODEL_REPLAY_DIR = replayBefore;
  await platform?.close();
  await rm(dir, { recursive: true, force: true });
});

const calls = async (siteId: string) => Number((await platform.db.query<{ n: string | number }>("select count(*) as n from model_calls where site_id = $1", [siteId])).rows[0]!.n);

describe("jobs and their ai_jobs rows", () => {
  it("logs every model call with its tier, account and job", async () => {
    const job = await platform.repo.usage.insertJob({ kind: "edit", tier: "free", accountId: "acct_x", estimateEur: 0.03 });
    const transport = {
      send: async () => ({ text: "{}", stopReason: "end_turn", model: "claude-haiku-4-5-20251001", usage: { input_tokens: 100, output_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } }),
    };
    const client = modelClientFor(platform, config, { siteId: "site_tagged", jobId: "q1", tier: "free", accountId: "acct_x", aiJobId: job }, transport);
    await client.call({ stage: "classify", system: ["x"], messages: [{ role: "user", content: "y" }] });
    const { rows } = await platform.db.query<{ tier: string; account_id: string; ai_job_id: string | number }>("select tier, account_id, ai_job_id from model_calls where site_id = 'site_tagged'");
    expect(rows).toEqual([{ tier: "free", account_id: "acct_x", ai_job_id: expect.anything() }]);
    expect(String(rows[0]!.ai_job_id)).toBe(job);
  });

  it("stops junk before any further model call and refuses the job, so it doesn't use up a free generation", async () => {
    const site = await platform.repo.createSite({
      name: "junk",
      slug: "junk",
      intake: { description: "asdf asdf asdf asdf asdf asdf asdf asdf", photoAssetIds: [], scope: "home", classification: { businessType: "shop", confidence: 0.1 } },
      deviceId: "dev-junk",
    });
    const job = await platform.repo.usage.insertJob({ kind: "generate", scope: "home", tier: "anonymous", deviceId: "dev-junk", siteId: site.id, estimateEur: 0.3 });
    await handlers.generate!({ siteId: site.id, scope: "home", aiJobId: job }, "q-junk");
    expect((await platform.repo.usage.getJob(job))!.status).toBe("refused");
    expect((await platform.repo.getSite(site.id))!.status).toBe("failed");
    expect((await platform.repo.listEvents(site.id)).some((e) => e.message === JUNK_REPLY)).toBe(true);
    expect(await calls(site.id)).toBe(0);
    expect(await platform.repo.usage.countJobs({ kind: "generate", tiers: ["anonymous"], deviceId: "dev-junk" })).toBe(0);
  });

  it("marks a generation that failed before saving anything as failed (not counted)", async () => {
    const site = await platform.repo.createSite({ name: "napaka", slug: "napaka", intake: { description: "Pekarna Kvas v Kamniku, kruh z drožmi in potica.", photoAssetIds: [], scope: "home" }, deviceId: "dev-fail" });
    const job = await platform.repo.usage.insertJob({ kind: "generate", scope: "home", tier: "anonymous", deviceId: "dev-fail", siteId: site.id, estimateEur: 0.3 });
    await handlers.generate!({ siteId: site.id, scope: "home", aiJobId: job }, "q-fail");
    expect((await platform.repo.usage.getJob(job))!.status).toBe("failed");
    expect((await platform.repo.usage.pool("anonymous")).held).toBe(0);
  });

  it("marks a failed chat edit as failed and answers in Slovene", async () => {
    const site = await platform.repo.createSite({ name: "u", slug: "urejanje-omejitve", intake: { description: "x", photoAssetIds: [], scope: "home" } });
    await platform.repo.saveSpec(site.id, { specVersion: 3 } as never, "generate");
    const job = await platform.repo.usage.insertJob({ kind: "edit", tier: "free", accountId: "acct_e", estimateEur: 0.03 });
    const msg = await platform.repo.addChat(site.id, "user", "Temnejša glava");
    await handlers.edit!({ siteId: site.id, messageId: Number(msg.id), aiJobId: job }, "q-edit");
    expect((await platform.repo.usage.getJob(job))!.status).toBe("failed");
    expect((await platform.repo.listChat(site.id)).at(-1)!.content).toMatch(/^Sprememba ni uspela/);
  });
});

describe("housekeeping", () => {
  it("deletes unclaimed anonymous previews after keepDays with their files, keeps claimed and admin sites, clears IP hashes and stale holds", async () => {
    const { repo, storage, db } = platform;
    const old = await repo.createSite({ name: "o", slug: "stara-anonimna", intake: { description: "x", photoAssetIds: [], scope: "home" }, deviceId: "dev-old" });
    const fresh = await repo.createSite({ name: "f", slug: "nova-anonimna", intake: { description: "x", photoAssetIds: [], scope: "home" }, deviceId: "dev-new" });
    const admins = await repo.createSite({ name: "a", slug: "skrbnikova-stara", intake: { description: "x", photoAssetIds: [], scope: "home" } });
    const account = await repo.accounts.signIn("lastnik@siol.net", "lastnik@siol.net");
    const claimed = await repo.createSite({ name: "c", slug: "prevzeta-stara", intake: { description: "x", photoAssetIds: [], scope: "home" }, deviceId: "dev-claim" });
    await repo.usage.claimDevice("dev-claim", account.id);
    for (const s of [old, fresh, admins, claimed]) await storage.put(`sites/${s.id}/uploads/a.jpg`, new Uint8Array([1, 2, 3]), "image/jpeg");
    await db.query("update sites set created_at = now() - make_interval(days => $2::integer) where id = any($1::text[])", [[old.id, admins.id, claimed.id], config.tiers.anonymous.keepDays + 1]);
    await repo.usage.insertJob({ kind: "generate", tier: "anonymous", deviceId: "dev-old", ipKey: "ip-old", estimateEur: 0.3 });
    await db.query("update ai_jobs set created_at = now() - interval '2 days' where ip_key = 'ip-old'");

    const r = await cleanupExpired(platform, config);
    expect(r.sites).toEqual([old.id]);
    expect(await repo.getSite(old.id)).toBeNull();
    expect(await storage.list(`sites/${old.id}/`)).toEqual([]);
    for (const s of [fresh, admins, claimed]) {
      expect(await repo.getSite(s.id), s.slug).not.toBeNull();
      expect(await storage.list(`sites/${s.id}/`), s.slug).toHaveLength(1);
    }
    expect(r.staleJobs).toBeGreaterThanOrEqual(1);
    const { rows } = await db.query<{ ip_key: string; status: string }>("select ip_key, status from ai_jobs where device_id = 'dev-old'");
    expect(rows).toEqual([{ ip_key: "", status: "failed" }]);
  });
});

describe("spend monitoring", () => {
  it("logs one line a day per pool and warns once when a pool passes warnAt", async () => {
    const out: { log: string[]; warn: string[] } = { log: [], warn: [] };
    const monitor = spendMonitor(platform.repo, config, { log: (l) => out.log.push(l), warn: (l) => out.warn.push(l) });
    const size = config.tiers.pools.free * config.limits.dailyModelSpendCapEur;
    // A hold (the admin pausing a pool) isn't spend: no warning.
    await platform.repo.usage.hold("free", size, 60);
    expect(await monitor.check()).toEqual([]);
    await platform.repo.usage.releaseHolds("free");
    await platform.repo.logModelCall({ siteId: null, jobId: null, stage: "content", model: "claude-sonnet-5-5", inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, costEur: size * (config.tiers.pools.warnAt + 0.05), durationMs: 0, ok: true, tier: "free" });
    const warnings = await monitor.check();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/^\[spend\] WARNING pool free at \d+% /);
    expect(await monitor.check()).toEqual([]);
    expect(out.warn).toHaveLength(1);

    const line = await monitor.daily(new Date());
    expect(line).toMatch(/^\[spend\] \d{4}-\d{2}-\d{2} total €\d+\.\d{2} of €\d+\.\d{2} · anonymous €\d+\.\d{2} of €\d+\.\d{2} \(\d+%\) · free €\d+\.\d{2} of €\d+\.\d{2} \(\d+%\) · paid .* \(so far\)$/);
    expect(await monitor.daily(new Date())).toBeNull();
    // The next day: yesterday's line.
    const tomorrow = new Date(Date.now() + 86400_000);
    expect(await monitor.daily(tomorrow)).toContain(`[spend] ${new Date().toISOString().slice(0, 10)} total`);
  });
});
