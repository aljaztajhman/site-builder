import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, type AppConfig } from "@sb/config";
import { JunkIntakeError, SpendCapError, type GenerateResult } from "@sb/engine";
import { Repo, createDb, createFsStorage, migrate, type GenerationProps, type JobData, type Platform, type Queue, type Tier } from "@sb/platform";
import type { SiteSpec } from "@sb/spec";
import { cleanupExpired } from "../src/housekeeping.ts";
import { checkNames, recordGeneration } from "../src/telemetry.ts";
import { startWorker, type WorkerJobs } from "../src/worker.ts";

/**
 * Engine telemetry (docs/plans/analytics.md Step 3) with config analytics.events on: every generation job writes one
 * `generation` event from what it logged (stage times and €, pictures, critique rounds, the last check's failures by
 * name), and the owner's funnel step `preview_ready` or `site_generated` when it left a saved version. The worker's
 * housekeeping rolls old events into daily counts.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const loaded = loadConfig();
const config: AppConfig = { ...loaded, analytics: { ...loaded.analytics, events: true } };
let platform: Platform;
let dir: string;
let golden: SiteSpec;
const handlers: { [Q in keyof JobData]?: (data: JobData[Q], jobId: string) => Promise<void> } = {};
const replayBefore = process.env.MODEL_REPLAY_DIR;
/** What the fake generation does: set per test. */
let generate: WorkerJobs["generateSite"] = async () => {
  throw new Error("not set");
};

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sb-worker-telemetry-"));
  process.env.MODEL_REPLAY_DIR = dir; // empty: no recordings, no API
  golden = JSON.parse(await readFile(path.join(here, "../../../tools/eval/golden/pekarna-kvas.json"), "utf8")) as SiteSpec;
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
  await platform.db.query("delete from product_events");
});

let n = 0;
async function siteWithJob(tier: Tier, scope: "home" | "full" = "home") {
  const site = await platform.repo.createSite({ name: "Pekarna", slug: `pekarna-${++n}`, intake: { description: "Pekarna Kvas v Kamniku.", photoAssetIds: [], scope }, deviceId: tier === "anonymous" ? "dev" : null });
  const aiJobId = await platform.repo.usage.insertJob({ kind: "generate", scope, tier, siteId: site.id, estimateEur: 0.3 });
  return { siteId: site.id, aiJobId };
}

/** One stage as the pipeline logs it: start, its model call(s) with € and the job id, done with its ms. */
async function stage(siteId: string, jobId: string, name: string, ms: number, calls: { eur: number; ok?: boolean }[] = [], finish = true) {
  await platform.repo.addEvent({ siteId, jobId, stage: name, message: "start" });
  for (const c of calls) {
    await platform.repo.logModelCall({ siteId, jobId, stage: name, model: "claude-sonnet-5-5", inputTokens: 10, outputTokens: 10, cacheCreationTokens: 0, cacheReadTokens: 0, costEur: c.eur, durationMs: ms, ok: c.ok ?? true });
  }
  if (finish) await platform.repo.addEvent({ siteId, jobId, stage: name, message: "done", data: { ms } });
}

const generationOf = async (siteId: string) => {
  const rows = await platform.repo.events.list({ kind: "generation" });
  const row = rows.find((r) => r.site_id === siteId);
  return row ? { ...row, p: row.props as unknown as GenerationProps } : undefined;
};

describe("a generation job's events", () => {
  it("done: stage seconds and €, pictures, retries, critique, the checks that failed by name, direction; and preview_ready", async () => {
    const { siteId, aiJobId } = await siteWithJob("anonymous");
    generate = async (deps, id, jobId) => {
      await stage(id, jobId!, "classify", 400, [{ eur: 0.001 }]);
      await stage(id, jobId!, "brief", 6000, [{ eur: 0.03 }]);
      await stage(id, jobId!, "design", 3000, [{ eur: 0.02 }]);
      await platform.repo.addEvent({ siteId: id, jobId, stage: "design", message: "Direction chosen", data: { direction: golden.design.direction } });
      await stage(id, jobId!, "imageGen", 9000, [{ eur: 0.03 }, { eur: 0.03 }, { eur: 0, ok: false }]);
      await stage(id, jobId!, "content", 20000, [{ eur: 0.1 }, { eur: 0.08 }]);
      await deps.repo.saveSpec(id, { ...golden, slug: (await deps.repo.getSite(id))!.slug }, "generate");
      await platform.repo.addEvent({ siteId: id, jobId, stage: "preview", message: "First version saved", data: { ms: 31000, version: 1 } });
      await stage(id, jobId!, "check", 8000);
      await stage(id, jobId!, "critique", 7000, [{ eur: 0.04 }]);
      await platform.repo.addEvent({ siteId: id, jobId, stage: "critique", message: "Round 1: 3 issues, 2 patches", data: ["a", "b", "c"] });
      await deps.repo.setStatus(id, "ready");
      return {
        version: 1,
        critiqueRounds: 1,
        timings: {},
        firstVersionMs: 31000,
        check: {
          failures: [
            "index.html: axe color-contrast(2), link-name(1)",
            "index.html: horizontal scroll at 360 px (402)",
            "facts not in brief: phone 041 555 906",
            "lighthouse performance 81 < 90",
          ],
          lighthouse: { performance: 81, accessibility: 100, bestPractices: 100, seo: 100 },
        } as unknown as GenerateResult["check"],
      };
    };
    await handlers.generate!({ siteId, scope: "home", aiJobId }, "job-done");
    const g = (await generationOf(siteId))!;
    expect(g).toMatchObject({ tier: "anonymous", account_id: null, device_key: null });
    expect(g.p).toMatchObject({
      scope: "home",
      outcome: "done",
      firstVersionSeconds: 31,
      failedStage: null,
      error: null,
      checksFailed: ["axe:color-contrast", "axe:link-name", "facts", "lighthouse-performance", "scroll-360"],
      lighthouse: { performance: 81, accessibility: 100, bestPractices: 100, seo: 100 },
      critique: { rounds: 1, issues: [3] },
      pictures: 2,
      retries: 1,
      caps: { spend: false, pictures: false },
      direction: golden.design.direction,
    });
    expect(g.p.stages.content).toEqual({ seconds: 20, eur: 0.18 });
    expect(g.p.stages.brief).toEqual({ seconds: 6, eur: 0.03 });
    expect(g.p.stages.check).toEqual({ seconds: 8, eur: 0 });
    expect(g.p.eur).toBeCloseTo(0.331, 6);
    expect(g.p.hero).toMatch(/^hero-/);
    // Nothing of the site's text: the fact check's phone number is only "facts".
    expect(JSON.stringify(g)).not.toContain("555");
    expect(await platform.repo.events.list({ kind: "preview_ready" })).toMatchObject([{ site_id: siteId, tier: "anonymous", props: { seconds: 31, eur: g.p.eur } }]);
    expect(await platform.repo.events.list({ kind: "site_generated" })).toEqual([]);
  });

  it("a whole site for a paid owner is site_generated, with the account", async () => {
    const account = await platform.repo.accounts.signIn("lastnik@primer.si", "lastnik@primer.si");
    const { siteId, aiJobId } = await siteWithJob("paid", "full");
    await platform.db.query("update ai_jobs set account_id = $2 where id = $1", [aiJobId, account.id]);
    generate = async (deps, id, jobId) => {
      await stage(id, jobId!, "content", 1000, [{ eur: 0.2 }]);
      await deps.repo.saveSpec(id, { ...golden, slug: (await deps.repo.getSite(id))!.slug }, "generate");
      await deps.repo.setStatus(id, "ready");
      return { version: 1, critiqueRounds: 0, timings: {}, firstVersionMs: 2000, check: null };
    };
    await handlers.generate!({ siteId, scope: "full", aiJobId }, "job-full");
    expect((await generationOf(siteId))!.p).toMatchObject({ scope: "full", outcome: "done", firstVersionSeconds: 2, checksFailed: [], lighthouse: null });
    expect(await platform.repo.events.list({ kind: "site_generated" })).toMatchObject([{ site_id: siteId, account_id: account.id, tier: "paid", props: { seconds: 2, eur: 0.2 } }]);
    expect(await platform.repo.events.list({ kind: "preview_ready" })).toEqual([]);
  });

  it("failed before a version: the stage it stopped in, the error's name, the spend cap; no funnel step", async () => {
    const { siteId, aiJobId } = await siteWithJob("free");
    generate = async (_deps, id, jobId) => {
      await stage(id, jobId!, "brief", 5000, [{ eur: 0.03 }]);
      await stage(id, jobId!, "content", 0, [], false);
      throw new SpendCapError(10, 10);
    };
    await handlers.generate!({ siteId, scope: "home", aiJobId }, "job-cap");
    expect((await generationOf(siteId))!.p).toMatchObject({ outcome: "failed", failedStage: "content", error: "SpendCapError", caps: { spend: true, pictures: false }, firstVersionSeconds: null, direction: null, hero: null });
    expect(await platform.repo.events.list({ kind: "preview_ready" })).toEqual([]);
  });

  it("failed after the version was saved: still the owner's preview_ready", async () => {
    const { siteId, aiJobId } = await siteWithJob("anonymous");
    generate = async (deps, id, jobId) => {
      await stage(id, jobId!, "content", 1000, [{ eur: 0.1 }]);
      await deps.repo.saveSpec(id, { ...golden, slug: (await deps.repo.getSite(id))!.slug }, "generate");
      await platform.repo.addEvent({ siteId: id, jobId, stage: "preview", message: "First version saved", data: { ms: 12000, version: 1 } });
      await stage(id, jobId!, "check", 0, [], false);
      throw new Error("browser crashed");
    };
    await handlers.generate!({ siteId, scope: "home", aiJobId }, "job-late");
    expect((await generationOf(siteId))!.p).toMatchObject({ outcome: "failed", failedStage: "check", error: "Error", firstVersionSeconds: 12 });
    expect(await platform.repo.events.list({ kind: "preview_ready" })).toMatchObject([{ site_id: siteId, props: { seconds: 12 } }]);
  });

  it("junk is refused; the admin's jobs count for the engine, not the funnel", async () => {
    const junk = await siteWithJob("anonymous");
    generate = async () => {
      throw new JunkIntakeError(0.05);
    };
    await handlers.generate!({ siteId: junk.siteId, scope: "home", aiJobId: junk.aiJobId }, "job-junk");
    expect((await generationOf(junk.siteId))!.p).toMatchObject({ outcome: "refused", error: "JunkIntakeError" });

    const admin = await siteWithJob("admin");
    generate = async (deps, id) => {
      await deps.repo.saveSpec(id, { ...golden, slug: (await deps.repo.getSite(id))!.slug }, "generate");
      return { version: 1, critiqueRounds: 0, timings: {}, firstVersionMs: 1000, check: null };
    };
    await handlers.generate!({ siteId: admin.siteId, scope: "home", aiJobId: admin.aiJobId }, "job-admin");
    expect((await generationOf(admin.siteId))!.tier).toBe("admin");
    expect(await platform.repo.events.list({ kind: "preview_ready" })).toEqual([]);
  });

  it("writes nothing with analytics.events off", async () => {
    const { siteId } = await siteWithJob("anonymous");
    await recordGeneration(platform, loaded, { siteId, jobId: "x", scope: "home", tier: "anonymous", accountId: null, startedAt: Date.now(), outcome: "done", saved: true });
    expect(loaded.analytics.events).toBe(false);
    expect(await platform.repo.events.list()).toEqual([]);
  });
});

describe("check names", () => {
  it("names every failure line without its details", () => {
    expect(
      checkNames([
        "spec invalid: /pages/0 bad",
        "facts not in brief: phone 041 555 906, email a@b.si",
        "kontakt.html: targets < 24px: a; b",
        "index.html: primary targets < 44px: Pokliči",
        "index.html: primary targets < 8px apart: x",
        "index.html: body text < 16px: p",
        "index.html: lang is en",
        "index.html: click-to-call not reachable in one tap at 360 px",
        "index.html: directions not reachable in one tap at 360 px",
        "index.html: banned patterns: stock photo",
        "index.html: desktop line length over 75 chars (80)",
        "index.html: horizontal scroll at 1280 px",
        "novice/x.html: lighthouse best practices 80 < 90",
        "something new",
      ]),
    ).toEqual(["banned", "call-reach", "directions-reach", "facts", "lang", "lighthouse-best-practices", "line-length", "other", "scroll-1280", "spec-invalid", "targets-24", "targets-44", "targets-apart", "text-16"]);
  });
});

describe("housekeeping", () => {
  it("rolls events past analytics.keepDays into daily counts", async () => {
    await platform.repo.events.add({ kind: "landing_view", deviceKey: "k" });
    await platform.repo.events.add({ kind: "landing_view", deviceKey: "k2" });
    await platform.db.query("update product_events set at = now() - make_interval(days => $1)", [config.analytics.keepDays + 1]);
    await platform.repo.events.add({ kind: "landing_view", deviceKey: "k3" });
    const r = await cleanupExpired(platform, config);
    expect(r.events).toBe(2);
    expect((await platform.repo.events.list()).map((e) => e.device_key)).toEqual(["k3"]);
    const { rows } = await platform.db.query<{ n: number }>("select n from product_events_daily where kind = 'landing_view'");
    expect(rows).toEqual([{ n: 2 }]);
  });
});
