import { PgBoss, fromPglite } from "pg-boss";
import type { PGlite } from "@electric-sql/pglite";
import type { Db } from "./db.ts";

export const QUEUES = ["generate", "edit", "alt", "prune"] as const;
export type QueueName = (typeof QUEUES)[number];

export interface GenerateJob {
  siteId: string;
  /** "home" renders the homepage preview only; "full" the whole site. */
  scope: "home" | "full";
  /** The ai_jobs row that holds this job's estimate (tier, account); its calls are logged against it. */
  aiJobId?: string;
}
export interface EditJob {
  siteId: string;
  messageId: number;
  aiJobId?: string;
}
/** Alt text from the vision model for photos the owner added in the editor. */
export interface AltJob {
  siteId: string;
  imageIds: string[];
  /** The ai_jobs row that holds its estimate under the owner's tier pool; absent on jobs queued before it existed. */
  aiJobId?: string;
}
/** Version retention (nightly): every site with old versions, or one site. */
export interface PruneJob {
  siteId?: string;
}
export interface JobData {
  generate: GenerateJob;
  edit: EditJob;
  alt: AltJob;
  prune: PruneJob;
}

export interface Queue {
  send<Q extends QueueName>(name: Q, data: JobData[Q]): Promise<string>;
  work<Q extends QueueName>(name: Q, handler: (data: JobData[Q], jobId: string) => Promise<void>, opts?: { concurrency?: number }): Promise<void>;
  /**
   * Sends `data` to `name` on a cron schedule read in `tz` (stored in the database, so one schedule
   * for all instances; calling it again updates it). A run missed while nothing was up is sent once
   * when the next instance starts. Absent on test doubles.
   */
  schedule?<Q extends QueueName>(name: Q, cron: string, data: JobData[Q], opts: { tz: string }): Promise<void>;
  ping(): Promise<void>;
  /**
   * Stops taking new jobs, waits up to `drainMs` (default 10 s) for running handlers, then fails the
   * queue jobs still running (pg-boss: "shut down while active") and closes the queue's connections.
   * Handlers still running keep running in this process; the caller marks their work interrupted.
   */
  stop(drainMs?: number): Promise<void>;
}

export interface QueueOptions {
  /**
   * Running jobs refresh a heartbeat (every half of it); pg-boss fails a job whose heartbeat stops (its
   * worker was killed), so it no longer counts as live and its site is recovered. Integer >= 10.
   */
  heartbeatSeconds?: number;
}

/**
 * pg-boss on the app database. Works on a Postgres server and on PGlite (pg-boss ships a PGlite adapter),
 * so tests and Docker-less dev use the same queue code as production.
 */
export async function createQueue(db: Db, databaseUrl: string, opts: QueueOptions = {}): Promise<Queue> {
  const boss =
    db.kind === "pglite"
      ? new PgBoss({ db: fromPglite(db.raw as PGlite), schema: "pgboss" })
      : new PgBoss({ connectionString: databaseUrl, schema: "pgboss", max: 4 });
  boss.on("error", (e) => console.error("[queue]", e));
  await boss.start();
  for (const q of QUEUES) {
    // Model calls are billed: no automatic retries. A failed job is reported and can be re-run by the user.
    // Existing queues are updated too: createQueue leaves an existing queue's options as they were.
    const options = { retryLimit: 0, expireInSeconds: 15 * 60 };
    if (await boss.getQueue(q)) await boss.updateQueue(q, { ...options, heartbeatSeconds: opts.heartbeatSeconds ?? null });
    else await boss.createQueue(q, { ...options, ...(opts.heartbeatSeconds ? { heartbeatSeconds: opts.heartbeatSeconds } : {}) });
  }
  return {
    async send(name, data) {
      const id = await boss.send(name, data as object);
      if (!id) throw new Error(`Queue ${name} rejected the job`);
      return id;
    },
    async work(name, handler, opts) {
      await boss.work<JobData[typeof name]>(name, { pollingIntervalSeconds: 1, localConcurrency: opts?.concurrency ?? 1 }, async (jobs) => {
        for (const job of jobs) await handler(job.data, job.id);
      });
    },
    async schedule(name, cron, data, opts) {
      await boss.schedule(name, cron, data as object, { tz: opts.tz, missed: "once" });
    },
    async ping() {
      await boss.getQueue("generate");
    },
    async stop(drainMs = 10_000) {
      await boss.stop({ graceful: true, timeout: drainMs });
    },
  };
}

