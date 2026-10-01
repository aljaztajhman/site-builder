import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Repo, createDb, migrate, type Db, type Tier } from "../src/index.ts";

/** Spend per tier pool, held estimates, the quota lock, anonymous previews and housekeeping. */
let db: Db;
let repo: Repo;

beforeAll(async () => {
  db = await createDb("pglite://memory");
  await migrate(db);
  repo = new Repo(db);
});
afterAll(async () => {
  await db.close();
});
beforeEach(async () => {
  await db.query("delete from model_calls");
  await db.query("delete from ai_jobs");
});

const call = (costEur: number, tier: Tier | null, extra: { aiJobId?: string; accountId?: string } = {}) =>
  repo.logModelCall({ siteId: null, jobId: null, stage: "brief", model: "m", inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, costEur, durationMs: 0, ok: true, tier, ...extra });

describe("pools", () => {
  it("count today's logged € per tier pool (admin in the paid pool) and hold queued jobs' estimates until their calls are logged", async () => {
    await call(0.1, "anonymous");
    await call(0.2, "free");
    await call(0.3, "paid");
    await call(0.4, "admin");
    await call(5, null); // untagged (eval, older rows): the global cap only
    expect(await repo.usage.pool("anonymous")).toEqual({ spent: 0.1, held: 0 });
    expect((await repo.usage.pool("paid")).spent).toBeCloseTo(0.7, 6);
    expect(await repo.usage.spentToday()).toBeCloseTo(6, 6);

    const job = await repo.usage.insertJob({ kind: "generate", scope: "home", tier: "anonymous", estimateEur: 0.3 });
    expect((await repo.usage.pool("anonymous")).held).toBeCloseTo(0.3, 6);
    // The job's own calls replace its estimate as they are logged.
    await call(0.12, "anonymous", { aiJobId: job });
    const mid = await repo.usage.pool("anonymous");
    expect(mid.spent).toBeCloseTo(0.22, 6);
    expect(mid.held).toBeCloseTo(0.18, 6);
    // Over the estimate holds nothing more; done holds nothing at all.
    await call(0.5, "anonymous", { aiJobId: job });
    expect((await repo.usage.pool("anonymous")).held).toBe(0);
    await repo.usage.finishJob(job, "done");
    expect(await repo.usage.jobCost(job)).toBeCloseTo(0.62, 6);
    expect((await repo.usage.getJob(job))!.status).toBe("done");
    // A finished job doesn't change again.
    await repo.usage.finishJob(job, "failed");
    expect((await repo.usage.getJob(job))!.status).toBe("done");
  });

  it("holds a whole pool until released or expired", async () => {
    await repo.usage.hold("free", 2, 60);
    expect((await repo.usage.pool("free")).held).toBe(2);
    expect(await repo.usage.holds()).toHaveLength(1);
    expect(await repo.usage.releaseHolds("free")).toBe(1);
    expect((await repo.usage.pool("free")).held).toBe(0);
    await repo.usage.hold("anonymous", 3, 60);
    await db.query("update ai_jobs set expires_at = now() - interval '1 second' where kind = 'hold'");
    expect((await repo.usage.pool("anonymous")).held).toBe(0);
    expect(await repo.usage.endStaleJobs(30)).toBe(1);
  });

  it("splits a day's spend per pool for the daily log line", async () => {
    await call(0.1, "anonymous");
    await call(0.2, "admin");
    await call(0.3, null);
    const now = new Date();
    const by = await repo.usage.spendByPool(new Date(now.getTime() - 3600_000), new Date(now.getTime() + 3600_000));
    expect(by).toEqual({ anonymous: 0.1, free: 0, paid: 0.2, untagged: 0.3 });
  });
});

describe("the quota lock", () => {
  it("lets only one of many simultaneous requests take the last slot", async () => {
    const attempt = () =>
      repo.usage.withQuotaLock(async (u) => {
        if ((await u.countJobs({ kind: "generate", tiers: ["anonymous"], deviceId: "dev-1" })) >= 1) return false;
        await u.insertJob({ kind: "generate", scope: "home", tier: "anonymous", deviceId: "dev-1", estimateEur: 0.3 });
        return true;
      });
    const results = await Promise.all(Array.from({ length: 8 }, attempt));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await repo.usage.countJobs({ kind: "generate", tiers: ["anonymous"], deviceId: "dev-1" })).toBe(1);
  });

  it("rolls back when the work throws", async () => {
    await expect(
      repo.usage.withQuotaLock(async (u) => {
        await u.insertJob({ kind: "edit", tier: "free", accountId: "a", estimateEur: 0.03 });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(await repo.usage.countJobs({ kind: "edit", tiers: ["free"], accountId: "a" })).toBe(0);
  });
});

describe("counting jobs", () => {
  it("counts queued and done jobs against allowances; every attempt in the IP window", async () => {
    const ids = [];
    for (const status of ["done", "failed", "refused", "queued"] as const) {
      const id = await repo.usage.insertJob({ kind: "generate", tier: "free", accountId: "acct", ipKey: "ip-1", estimateEur: 0.3 });
      if (status !== "queued") await repo.usage.finishJob(id, status);
      ids.push(id);
    }
    expect(await repo.usage.countJobs({ kind: "generate", tiers: ["free"], accountId: "acct" })).toBe(2);
    expect(await repo.usage.countJobs({ kind: "generate", tiers: ["anonymous", "free"], ipKey: "ip-1", sinceHours: 24, allStatuses: true })).toBe(4);
    await db.query("update ai_jobs set created_at = now() - interval '25 hours'");
    expect(await repo.usage.countJobs({ kind: "generate", tiers: ["anonymous", "free"], ipKey: "ip-1", sinceHours: 24, allStatuses: true })).toBe(0);
    // IP hashes are gone after a day.
    await repo.usage.clearOldIpKeys();
    const { rows } = await db.query<{ n: string | number }>("select count(*) as n from ai_jobs where ip_key <> ''");
    expect(Number(rows[0]!.n)).toBe(0);
  });

  it("charges a paid account only for its own paid jobs since the period start", async () => {
    const job = await repo.usage.insertJob({ kind: "edit", tier: "paid", accountId: "p1", estimateEur: 0.03 });
    await call(0.01, "paid", { aiJobId: job, accountId: "p1" });
    await call(0.5, "paid", { accountId: "p1" }); // a photo description: not an AI job, not charged
    const before = await repo.usage.insertJob({ kind: "edit", tier: "free", accountId: "p1", estimateEur: 0.03 });
    await call(0.7, "free", { aiJobId: before, accountId: "p1" }); // from before paid rights
    const s = await repo.usage.accountSpend("p1", new Date(Date.now() - 3600_000));
    expect(s.spent).toBeCloseTo(0.01, 6);
    expect(s.held).toBeCloseTo(0.02, 6);
    expect((await repo.usage.accountSpend("p1", new Date(Date.now() + 3600_000))).spent).toBe(0);
  });
});

describe("anonymous previews", () => {
  it("are claimed by the account that signs in on their device, and expire unclaimed", async () => {
    const anon = await repo.createSite({ name: "a", slug: await repo.uniqueSlug("anonimna"), intake: { description: "x", photoAssetIds: [], scope: "home" }, deviceId: "dev-9" });
    const old = await repo.createSite({ name: "b", slug: await repo.uniqueSlug("stara"), intake: { description: "x", photoAssetIds: [], scope: "home" }, deviceId: "dev-8" });
    const admins = await repo.createSite({ name: "c", slug: await repo.uniqueSlug("skrbnik"), intake: { description: "x", photoAssetIds: [], scope: "home" } });
    await db.query("update sites set created_at = now() - interval '8 days' where id = any($1::text[])", [[old.id, admins.id]]);
    await repo.usage.insertJob({ kind: "generate", tier: "anonymous", deviceId: "dev-9", siteId: anon.id, estimateEur: 0.3 });
    expect((await repo.usage.deviceSites("dev-9")).map((s) => s.id)).toEqual([anon.id]);
    expect(await repo.usage.siteOwner(anon.id)).toEqual({ tier: "anonymous", accountId: null });
    expect(await repo.usage.siteOwner(admins.id)).toEqual({ tier: "admin", accountId: null });

    const account = await repo.accounts.signIn("ana@siol.net", "ana@siol.net");
    expect(await repo.usage.claimDevice("dev-9", account.id)).toEqual([anon.id]);
    const claimed = (await repo.getSite(anon.id))!;
    expect(claimed.account_id).toBe(account.id);
    expect(claimed.device_id).toBeNull();
    expect(await repo.usage.siteOwner(anon.id)).toEqual({ tier: "free", accountId: account.id });
    // Only the unclaimed old preview expires: not the claimed one, not the admin's.
    expect(await repo.usage.expiredAnonymousSites(7)).toEqual([old.id]);
    await repo.accounts.allow("ana@siol.net", "ana@siol.net", null);
    expect((await repo.usage.siteOwner(anon.id)).tier).toBe("paid");
  });
});
