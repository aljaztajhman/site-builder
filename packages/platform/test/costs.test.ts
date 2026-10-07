import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Repo, createDb, migrate, type AiJobKind, type Db, type Tier } from "../src/index.ts";

/** The admin's cost history (/admin/costs): per-day sums, € per run and per stage (median, p90), top lists, pending apart. */
let db: Db;
let repo: Repo;
const NOW = new Date("2026-10-07T12:00:00Z");

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
  await db.query("delete from sites");
  await db.query("delete from accounts");
});

interface Call {
  stage: string;
  eur: number;
  at: string;
  tier?: Tier | null;
  account?: string | null;
  site?: string | null;
  job?: string | null;
  queueJob?: string | null;
  pending?: boolean;
}
const call = (c: Call) =>
  db.query(
    `insert into model_calls (site_id, job_id, stage, model, input_tokens, output_tokens, cost_eur, duration_ms, ok, pending, tier, account_id, ai_job_id, created_at)
     values ($1, $2, $3, 'm', 0, 0, $4, 0, $5, $6, $7, $8, $9, $10)`,
    [c.site ?? null, c.queueJob ?? null, c.stage, c.eur, !c.pending, c.pending ?? false, c.tier ?? null, c.account ?? null, c.job ?? null, c.at],
  );
async function job(kind: AiJobKind, tier: Tier, at: string, o: { scope?: "home" | "full"; account?: string; site?: string } = {}): Promise<string> {
  const id = await repo.usage.insertJob({ kind, scope: o.scope ?? null, tier, accountId: o.account ?? null, siteId: o.site ?? null, estimateEur: 0.5 });
  await db.query("update ai_jobs set created_at = $2, status = 'done' where id = $1", [id, at]);
  return id;
}

async function seed() {
  await db.query("insert into accounts (id, email, email_key) values ('acct_a', 'ana@siol.net', 'ana@siol.net'), ('acct_b', 'bor@siol.net', 'bor@siol.net')");
  await repo.createSite({ id: "site_1", name: "Pekarna Kvas", slug: "pekarna-kvas", intake: { description: "x", photoAssetIds: [], scope: "home" }, accountId: "acct_a" });
  await repo.createSite({ id: "site_2", name: "Frizerka Maja", slug: "frizerka-maja", intake: { description: "x", photoAssetIds: [], scope: "home" }, deviceId: "dev_1" });

  // 7 Oct: a free homepage (four calls, one of them still pending), a paid whole site, two paid edits.
  const g1 = await job("generate", "free", "2026-10-07T08:00:00Z", { scope: "home", account: "acct_a", site: "site_1" });
  const own1 = { tier: "free" as const, account: "acct_a", site: "site_1", job: g1 };
  await call({ ...own1, stage: "brief", eur: 0.02, at: "2026-10-07T08:00:10Z" });
  await call({ ...own1, stage: "content", eur: 0.1, at: "2026-10-07T08:00:20Z" });
  await call({ ...own1, stage: "content", eur: 0.05, at: "2026-10-07T08:00:30Z" });
  await call({ ...own1, stage: "critique", eur: 0.03, at: "2026-10-07T08:00:40Z" });
  await call({ ...own1, stage: "content", eur: 0.5, at: "2026-10-07T08:00:50Z", pending: true });
  const g3 = await job("generate", "paid", "2026-10-07T09:00:00Z", { scope: "full", account: "acct_a", site: "site_1" });
  await call({ tier: "paid", account: "acct_a", site: "site_1", job: g3, stage: "content", eur: 1, at: "2026-10-07T09:01:00Z" });
  await call({ tier: "paid", account: "acct_a", site: "site_1", job: g3, stage: "imageGen", eur: 0.068, at: "2026-10-07T09:02:00Z" });
  for (const [eur, at] of [
    [0.01, "2026-10-07T10:00:00Z"],
    [0.02, "2026-10-07T11:00:00Z"],
    [0.03, "2026-10-05T10:00:00Z"],
    [0.1, "2026-10-05T11:00:00Z"],
  ] as const) {
    const e = await job("edit", "paid", at, { account: "acct_a", site: "site_1" });
    await call({ tier: "paid", account: "acct_a", site: "site_1", job: e, stage: "edit", eur, at });
  }

  // 6 Oct: an anonymous homepage, a free edit by another account, an untagged call (eval).
  const g2 = await job("generate", "anonymous", "2026-10-06T08:00:00Z", { scope: "home", site: "site_2" });
  await call({ tier: "anonymous", site: "site_2", job: g2, stage: "brief", eur: 0.04, at: "2026-10-06T08:00:10Z" });
  await call({ tier: "anonymous", site: "site_2", job: g2, stage: "content", eur: 0.3, at: "2026-10-06T08:00:20Z" });
  const e5 = await job("edit", "free", "2026-10-06T09:00:00Z", { account: "acct_b", site: "site_2" });
  await call({ tier: "free", account: "acct_b", site: "site_2", job: e5, stage: "edit", eur: 0.05, at: "2026-10-06T09:00:00Z" });
  await call({ tier: null, stage: "content", eur: 2, at: "2026-10-06T20:00:00Z" });

  // 5 Oct: an admin call without a job (the paid pool).
  await call({ tier: "admin", stage: "classify", eur: 0.07, at: "2026-10-05T00:00:00Z" });

  // Outside the window: the day before, and the next day.
  const old = await job("edit", "paid", "2026-10-04T23:00:00Z", { account: "acct_b", site: "site_2" });
  await call({ tier: "paid", account: "acct_b", site: "site_2", job: old, stage: "edit", eur: 5, at: "2026-10-04T23:59:59Z" });
  await call({ tier: "paid", account: "acct_b", site: "site_2", stage: "content", eur: 9, at: "2026-10-08T00:00:00Z" });
  // A stale reservation from earlier (a crash): still reported as pending.
  await call({ tier: "free", account: "acct_b", stage: "content", eur: 0.3, at: "2026-10-01T06:00:00Z", pending: true });
}

describe("cost history", () => {
  it("sums settled calls per UTC day and pool over the window, every day listed, newest first", async () => {
    await seed();
    const r = await repo.costs.report({ days: 3, now: NOW });
    expect(r.from).toBe("2026-10-05T00:00:00.000Z");
    expect(r.to).toBe("2026-10-08T00:00:00.000Z");
    expect(r.perDay.map((d) => d.day)).toEqual(["2026-10-07", "2026-10-06", "2026-10-05"]);
    const [d7, d6, d5] = r.perDay;
    expect(d7!.eur).toBeCloseTo(1.298, 6);
    expect(d7!.calls).toBe(8);
    expect(d7!.pools.free).toBeCloseTo(0.2, 6);
    expect(d7!.pools.paid).toBeCloseTo(1.098, 6);
    expect(d6!.eur).toBeCloseTo(2.39, 6);
    expect(d6!.pools).toEqual({ anonymous: expect.closeTo(0.34, 6), free: expect.closeTo(0.05, 6), paid: 0, untagged: expect.closeTo(2, 6) });
    expect(d5!.pools.paid).toBeCloseTo(0.2, 6); // two paid edits and the admin's call
    expect(d5!.calls).toBe(3);
    expect(r.eur).toBeCloseTo(3.888, 6);
    expect(r.calls).toBe(15);

    // Runs per day, by the day they started.
    expect(d7!.runs["generate:home"]).toEqual({ runs: 1, eur: expect.closeTo(0.2, 6) });
    expect(d7!.runs["generate:full"]).toEqual({ runs: 1, eur: expect.closeTo(1.068, 6) });
    expect(d7!.runs.edit).toEqual({ runs: 2, eur: expect.closeTo(0.03, 6) });
    expect(d6!.runs["generate:home"].runs).toBe(1);
    expect(d5!.runs.edit).toEqual({ runs: 2, eur: expect.closeTo(0.13, 6) });
    expect(d5!.runs["generate:home"]).toEqual({ runs: 0, eur: 0 });

    // A longer window lists the empty days too.
    const month = await repo.costs.report({ days: 30, now: NOW });
    expect(month.perDay).toHaveLength(30);
    expect(month.perDay.at(-1)!.day).toBe("2026-09-08");
    expect(month.perDay.find((d) => d.day === "2026-10-04")!.eur).toBeCloseTo(5, 6);
  });

  it("gives € per run (median, p90) per kind of run: generations by scope and chat edits", async () => {
    await seed();
    const { runs } = await repo.costs.report({ days: 3, now: NOW });
    expect(runs.map((x) => x.kind)).toEqual(["generate:home", "generate:full", "edit"]);
    const by = Object.fromEntries(runs.map((x) => [x.kind, x]));
    // Homepages 0.20 (the pending 0.50 isn't counted) and 0.34.
    expect(by["generate:home"]).toMatchObject({ runs: 2, eur: expect.closeTo(0.54, 6), median: expect.closeTo(0.27, 6), p90: expect.closeTo(0.326, 6) });
    expect(by["generate:full"]).toMatchObject({ runs: 1, median: expect.closeTo(1.068, 6), p90: expect.closeTo(1.068, 6) });
    // Edits 0.01, 0.02, 0.03, 0.05, 0.10: the one from 4 Oct is outside.
    expect(by.edit).toMatchObject({ runs: 5, eur: expect.closeTo(0.21, 6), median: expect.closeTo(0.03, 6), p90: expect.closeTo(0.08, 6) });
  });

  it("gives € per stage per run, the biggest stage first", async () => {
    await seed();
    const { stages } = await repo.costs.report({ days: 3, now: NOW });
    expect(stages.map((s) => s.stage)).toEqual(["content", "edit", "classify", "imageGen", "brief", "critique"]);
    const content = stages[0]!;
    // Runs: the free homepage's two content calls (0.15 together), 0.30, 1.00, and the untagged call 2.00 alone.
    expect(content).toMatchObject({ calls: 5, runs: 4, eur: expect.closeTo(3.45, 6), median: expect.closeTo(0.65, 6), p90: expect.closeTo(1.7, 6) });
    expect(stages.find((s) => s.stage === "brief")).toMatchObject({ calls: 2, runs: 2, median: expect.closeTo(0.03, 6), p90: expect.closeTo(0.038, 6) });
    expect(stages.find((s) => s.stage === "edit")).toMatchObject({ calls: 5, runs: 5, median: expect.closeTo(0.03, 6), p90: expect.closeTo(0.08, 6) });
  });

  it("lists the top accounts and sites in the window and keeps pending reservations apart", async () => {
    await seed();
    const r = await repo.costs.report({ days: 3, now: NOW });
    expect(r.topAccounts).toEqual([
      { accountId: "acct_a", email: "ana@siol.net", calls: 10, sites: 1, eur: expect.closeTo(1.428, 6) },
      { accountId: "acct_b", email: "bor@siol.net", calls: 1, sites: 1, eur: expect.closeTo(0.05, 6) },
    ]);
    expect(r.topSites).toEqual([
      { siteId: "site_1", name: "Pekarna Kvas", slug: "pekarna-kvas", accountId: "acct_a", ownerEmail: "ana@siol.net", calls: 10, eur: expect.closeTo(1.428, 6) },
      { siteId: "site_2", name: "Frizerka Maja", slug: "frizerka-maja", accountId: null, ownerEmail: null, calls: 3, eur: expect.closeTo(0.39, 6) },
    ]);
    const one = await repo.costs.report({ days: 3, now: NOW, top: 1 });
    expect(one.topAccounts.map((a) => a.accountId)).toEqual(["acct_a"]);
    expect(one.topSites.map((s) => s.siteId)).toEqual(["site_1"]);
    // Every reservation in flight, whatever its day, at its estimate.
    expect(r.pending).toEqual({ calls: 2, eur: expect.closeTo(0.8, 6), oldest: "2026-10-01T06:00:00.000Z" });
  });

  it("groups a stage's calls without an ai_jobs row by site and queue job, and reads an empty database", async () => {
    const empty = await repo.costs.report({ days: 7, now: NOW });
    expect(empty).toMatchObject({ eur: 0, calls: 0, runs: [], stages: [], topAccounts: [], topSites: [], pending: { calls: 0, eur: 0, oldest: null } });
    expect(empty.perDay).toHaveLength(7);

    await call({ tier: "paid", site: "site_x", queueJob: "q1", stage: "altText", eur: 0.004, at: "2026-10-07T10:00:00Z" });
    await call({ tier: "paid", site: "site_x", queueJob: "q1", stage: "altText", eur: 0.006, at: "2026-10-07T10:00:01Z" });
    await call({ tier: "paid", site: "site_x", queueJob: "q2", stage: "altText", eur: 0.02, at: "2026-10-07T10:00:02Z" });
    await call({ tier: "paid", stage: "altText", eur: 0.03, at: "2026-10-07T10:00:03Z" });
    const r = await repo.costs.report({ days: 7, now: NOW });
    expect(r.stages).toEqual([{ stage: "altText", calls: 4, runs: 3, eur: expect.closeTo(0.06, 6), median: expect.closeTo(0.02, 6), p90: expect.closeTo(0.028, 6) }]);
    // A site that no longer exists is still listed, by its id.
    expect(r.topSites).toEqual([{ siteId: "site_x", name: null, slug: null, accountId: null, ownerEmail: null, calls: 3, eur: expect.closeTo(0.03, 6) }]);
    expect(r.runs).toEqual([]);
  });
});
