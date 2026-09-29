import { PgBoss, fromPglite } from "pg-boss";
import type { PGlite } from "@electric-sql/pglite";
import type { Db } from "./db.ts";

export const QUEUES = ["generate", "edit", "publish"] as const;
export type QueueName = (typeof QUEUES)[number];

export interface GenerateJob {
  siteId: string;
  /** "home" renders the homepage preview only; "full" the whole site. */
  scope: "home" | "full";
}
export interface EditJob {
  siteId: string;
  messageId: number;
}
export interface PublishJob {
  siteId: string;
  version: number;
}
export interface JobData {
  generate: GenerateJob;
  edit: EditJob;
  publish: PublishJob;
}

export interface Queue {
  send<Q extends QueueName>(name: Q, data: JobData[Q]): Promise<string>;
  work<Q extends QueueName>(name: Q, handler: (data: JobData[Q], jobId: string) => Promise<void>, opts?: { concurrency?: number }): Promise<void>;
  ping(): Promise<void>;
  stop(): Promise<void>;
}

/**
 * pg-boss on the app database. Works on a Postgres server and on PGlite (pg-boss ships a PGlite adapter),
 * so tests and Docker-less dev use the same queue code as production.
 */
export async function createQueue(db: Db, databaseUrl: string): Promise<Queue> {
  const boss =
    db.kind === "pglite"
      ? new PgBoss({ db: fromPglite(db.raw as PGlite), schema: "pgboss" })
      : new PgBoss({ connectionString: databaseUrl, schema: "pgboss", max: 4 });
  boss.on("error", (e) => console.error("[queue]", e));
  await boss.start();
  for (const q of QUEUES) {
    // Model calls are billed: no automatic retries. A failed job is reported and can be re-run by the user.
    await boss.createQueue(q, { retryLimit: 0, expireInSeconds: 15 * 60 }).catch(() => undefined);
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
    async ping() {
      await boss.getQueue("generate");
    },
    async stop() {
      await boss.stop({ graceful: true, timeout: 10_000 });
    },
  };
}

