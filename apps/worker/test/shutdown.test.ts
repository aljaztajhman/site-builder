import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "@sb/config";
import { INTERRUPTED_MESSAGE, Repo, createDb, createFsStorage, createQueue, migrate, type Db, type Platform, type Queue } from "@sb/platform";
import type { SiteSpec } from "@sb/spec";
import { EDIT_INTERRUPTED_REPLY, drainMs, startWorker, type WorkerJobs } from "../src/worker.ts";

/**
 * Graceful shutdown and recovery with the real queue (pg-boss on PGlite): on SIGTERM the worker takes no
 * new jobs and lets running ones finish within the drain window; what can't finish is marked interrupted
 * (site and ai_jobs row); a process that died without that is recovered on the next start. The engine's
 * job functions are stand-ins (no model, no browser) that finish or hang on cue.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const config = loadConfig();
let db: Db;
let repo: Repo;
let dir: string;
let golden: SiteSpec;
const replayBefore = process.env.MODEL_REPLAY_DIR;
/** Hanging stand-ins wait on these; released at the end so nothing is left running. */
const gates: (() => void)[] = [];
const hang = () => new Promise<void>((resolve) => gates.push(resolve));

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sb-shutdown-"));
  process.env.MODEL_REPLAY_DIR = dir; // empty: any real model call fails
  db = await createDb("pglite://memory");
  await migrate(db);
  repo = new Repo(db);
  golden = JSON.parse(await readFile(path.join(here, "../../../tools/eval/golden/pekarna-kvas.json"), "utf8")) as SiteSpec;
}, 60_000);

afterAll(async () => {
  for (const release of gates) release();
  if (replayBefore === undefined) delete process.env.MODEL_REPLAY_DIR;
  else process.env.MODEL_REPLAY_DIR = replayBefore;
  await db?.close();
  await rm(dir, { recursive: true, force: true });
});

async function worker(jobs: Partial<WorkerJobs>, queue?: Queue) {
  const q = queue ?? (await createQueue(db, "pglite://memory", { heartbeatSeconds: config.worker.heartbeatSeconds }));
  const platform: Platform = { db, repo, storage: createFsStorage(path.join(dir, "storage")), queue: q, close: async () => undefined };
  return { queue: q, handle: await startWorker(platform, config, jobs) };
}

async function busySite(slug: string, status: "generating" | "ready", withVersion = false) {
  const s = await repo.createSite({ name: slug, slug, intake: { description: "x", photoAssetIds: [], scope: "home" } });
  if (withVersion) await repo.saveSpec(s.id, { ...golden, slug }, "generate");
  await repo.setStatus(s.id, status);
  const aiJobId = await repo.usage.insertJob({ kind: "generate", scope: "home", tier: "free", accountId: `acct_${slug}`, siteId: s.id, estimateEur: 0.3 });
  return { siteId: s.id, aiJobId };
}

const until = async (what: () => Promise<boolean>, ms = 20_000) => {
  const end = Date.now() + ms;
  while (!(await what())) {
    if (Date.now() > end) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 100));
  }
};
const queueState = async (aiJobId: string) =>
  (await db.query<{ state: string }>("select state from pgboss.job where data->>'aiJobId' = $1", [aiJobId])).rows[0]?.state;

describe("the drain window", () => {
  it("is Railway's draining time minus the reserve, or config's when the variable isn't set", () => {
    expect(drainMs(config, { RAILWAY_DEPLOYMENT_DRAINING_SECONDS: "300" })).toBe((300 - config.worker.drainReserveSeconds) * 1000);
    expect(drainMs(config, {})).toBe(config.worker.drainSeconds * 1000);
    // Railway's default (0 s) or a window smaller than the reserve: the 1 s pg-boss needs.
    expect(drainMs(config, { RAILWAY_DEPLOYMENT_DRAINING_SECONDS: "0" })).toBe(1000);
  });

  it("sets the pg-boss heartbeat on every queue, so a killed worker's job stops counting as live", async () => {
    const q = await createQueue(db, "pglite://memory", { heartbeatSeconds: config.worker.heartbeatSeconds });
    const { rows } = await db.query<{ name: string; heartbeat_seconds: number | null }>("select name, heartbeat_seconds from pgboss.queue order by name");
    expect(rows.filter((r) => ["generate", "edit", "alt"].includes(r.name)).map((r) => r.heartbeat_seconds)).toEqual(Array(3).fill(config.worker.heartbeatSeconds));
    await q.stop();
  });
});

describe("SIGTERM", () => {
  it("takes no new jobs and lets a running generation finish within the window", async () => {
    const started: string[] = [];
    const { queue, handle } = await worker({
      generateSite: (async (_deps: unknown, id: string) => {
        started.push(id);
        await new Promise((r) => setTimeout(r, 1500));
        await repo.saveSpec(id, { ...golden, slug: "konca-v-oknu" }, "generate");
        await repo.setStatus(id, "ready");
      }) as unknown as WorkerJobs["generateSite"],
    });
    // Sites are made after the worker started: its start-up recovery takes a busy site with no queue job for a dead one.
    const { siteId, aiJobId } = await busySite("konca-v-oknu", "generating");
    await queue.send("generate", { siteId, scope: "home", aiJobId });
    await until(async () => handle.running().length === 1);
    expect((await repo.usage.getJob(aiJobId))!.started_at).not.toBeNull();

    const stopping = handle.shutdown(10_000);
    // Sent after SIGTERM: not taken by this worker; it waits for the next one.
    const later = await busySite("po-sigterm", "generating");
    await queue.send("generate", { siteId: later.siteId, scope: "home", aiJobId: later.aiJobId }).catch(() => undefined);
    const r = await stopping;
    expect(r.interrupted).toEqual([]);
    expect(started).toEqual([siteId]);
    expect((await repo.getSite(siteId))!.status).toBe("ready");
    expect((await repo.usage.getJob(aiJobId))!.status).toBe("done");
    expect(await queueState(aiJobId)).toBe("completed");
    expect((await repo.usage.getJob(later.aiJobId))!.status).toBe("queued");
    expect((await repo.usage.getJob(later.aiJobId))!.started_at).toBeNull();
    // (The next worker would take it; removed so the next tests' workers start with an empty queue.)
    await db.query("delete from pgboss.job where data->>'aiJobId' = $1", [later.aiJobId]);
    await repo.usage.finishJob(later.aiJobId, "failed");
  }, 60_000);

  it("marks a generation that can't finish in time interrupted: site failed with a retry, job not counted", async () => {
    const { queue, handle } = await worker({ generateSite: (async () => hang()) as unknown as WorkerJobs["generateSite"] });
    const { siteId, aiJobId } = await busySite("prekinjena", "generating");
    await queue.send("generate", { siteId, scope: "home", aiJobId });
    await until(async () => handle.running().length === 1);

    const r = await handle.shutdown(1000);
    expect(r.interrupted).toMatchObject([{ queue: "generate", siteId, aiJobId }]);
    expect((await repo.getSite(siteId))!.status).toBe("failed");
    expect((await repo.listEvents(siteId)).at(-1)).toMatchObject({ level: "error", message: INTERRUPTED_MESSAGE });
    expect((await repo.usage.getJob(aiJobId))!.status).toBe("interrupted");
    expect(await repo.usage.countJobs({ kind: "generate", tiers: ["free"], accountId: "acct_prekinjena" })).toBe(0);
    expect((await repo.usage.pool("free")).held).toBe(0);
    // pg-boss failed its job, so the next worker doesn't think it is still running.
    expect(await queueState(aiJobId)).toBe("failed");
  }, 60_000);

  it("keeps a site whose generation already saved a version (ready, counted) and puts a cut-off edit back to ready", async () => {
    const { queue, handle } = await worker({
      generateSite: (async (_deps: unknown, id: string) => {
        await repo.saveSpec(id, { ...golden, slug: "shranjena" }, "generate");
        await hang();
      }) as unknown as WorkerJobs["generateSite"],
      applyChatEdit: (async (_deps: unknown, id: string) => {
        await repo.setStatusIf(id, "ready", "editing");
        await hang();
      }) as unknown as WorkerJobs["applyChatEdit"],
    });
    const gen = await busySite("shranjena", "generating");
    const edited = await busySite("urejanje-prekinjeno", "ready", true);
    const editJob = await repo.usage.insertJob({ kind: "edit", tier: "free", accountId: "acct_edit", siteId: edited.siteId, estimateEur: 0.03 });
    const msg = await repo.addChat(edited.siteId, "user", "Temnejša glava");
    await queue.send("generate", { siteId: gen.siteId, scope: "home", aiJobId: gen.aiJobId });
    await queue.send("edit", { siteId: edited.siteId, messageId: Number(msg.id), aiJobId: editJob });
    await until(async () => handle.running().length === 2 && (await repo.getSite(edited.siteId))!.status === "editing" && (await repo.getSite(gen.siteId))!.current_version !== null);

    const r = await handle.shutdown(1000);
    expect(r.interrupted.map((j) => j.queue).sort()).toEqual(["edit", "generate"]);
    expect((await repo.getSite(gen.siteId))!.status).toBe("ready");
    expect((await repo.usage.getJob(gen.aiJobId))!.status).toBe("done");
    expect((await repo.getSite(edited.siteId))!.status).toBe("ready");
    expect((await repo.listChat(edited.siteId)).at(-1)).toMatchObject({ role: "assistant", content: EDIT_INTERRUPTED_REPLY });
    expect((await repo.usage.getJob(editJob))!.status).toBe("interrupted");
  }, 60_000);
});

describe("start after a process died", () => {
  it("recovers sites and jobs left running by a dead worker, and leaves jobs still waiting in the queue alone", async () => {
    // A worker killed mid-generation: its ai_jobs row started; pg-boss failed its job when the heartbeat stopped.
    const dead = await busySite("mrtev-delavec", "generating");
    await repo.usage.startJob(dead.aiJobId);
    // A job still waiting in the queue (a backlog, or the old worker on an overlapping deploy).
    const waiting = await busySite("caka-v-vrsti", "generating");
    const q = await createQueue(db, "pglite://memory");
    await q.send("generate", { siteId: dead.siteId, scope: "home", aiJobId: dead.aiJobId });
    await q.send("generate", { siteId: waiting.siteId, scope: "home", aiJobId: waiting.aiJobId });
    await q.stop();
    await db.query("update pgboss.job set state = 'failed' where data->>'aiJobId' = $1", [dead.aiJobId]);
    await db.query("update sites set updated_at = now() - interval '10 minutes'");

    // The next worker starts (handlers registered on a stand-in queue, so the waiting job stays waiting).
    const idle: Queue = { send: async () => "x", work: async () => undefined, ping: async () => undefined, stop: async () => undefined };
    const { handle } = await worker({}, idle);
    expect((await repo.getSite(dead.siteId))!.status).toBe("failed");
    expect((await repo.listEvents(dead.siteId)).at(-1)).toMatchObject({ message: INTERRUPTED_MESSAGE });
    expect((await repo.usage.getJob(dead.aiJobId))!.status).toBe("interrupted");
    expect((await repo.getSite(waiting.siteId))!.status).toBe("generating");
    expect((await repo.usage.getJob(waiting.aiJobId))!.status).toBe("queued");
    // A second pass (the minute timer) changes nothing more.
    expect(await handle.recover()).toEqual({ sites: [], jobs: [] });
    await handle.shutdown(1000);
  }, 60_000);
});
