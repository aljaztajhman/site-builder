import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadConfig, type AppConfig } from "@sb/config";
import { MIGRATIONS, OpsState, WORKER_HEARTBEAT, createDb, createFsStorage, memoryMailer, migrate, type Db, type MailMessage, type Mailer, type Queue, type Storage } from "@sb/platform";
import { alertWatchdog, startAlerts } from "../src/alerts.ts";

/**
 * The admin alerts' watchdog against a real (in-memory) database, with a fake clock and the memory mailer:
 * each kind emails once, waits out its cooldown (the spend ones a UTC day), survives a restart, and sends one
 * "resolved" email when it clears.
 */
const base = loadConfig();
const config: AppConfig = { ...base, limits: { ...base.limits, dailyModelSpendCapEur: 10 } };
const MIN = 60_000;
let real: Db;
let dir: string;
let storage: Storage;
/** Switches the database, storage and queue between working and failing. */
const down = { db: false, storage: false, queue: false };
let db: Db;
const queue: Queue = {
  send: async () => "job",
  work: async () => undefined,
  ping: async () => {
    if (down.queue) throw new Error("pg-boss: connection terminated");
  },
  stop: async () => undefined,
};

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sb-alerts-"));
  real = await createDb("pglite://memory");
  await migrate(real);
  const fs = createFsStorage(path.join(dir, "storage"));
  storage = {
    ...fs,
    ping: async () => {
      if (down.storage) throw new Error("S3: 403 Forbidden");
      return fs.ping();
    },
  };
  db = {
    ...real,
    query: ((sql: string, params?: unknown[]) => (down.db ? Promise.reject(new Error("connect ECONNREFUSED 10.0.0.5:5432")) : real.query(sql, params))) as Db["query"],
  };
}, 60_000);

afterAll(async () => {
  await real?.close();
  await rm(dir, { recursive: true, force: true });
});

beforeEach(async () => {
  Object.assign(down, { db: false, storage: false, queue: false });
  for (const t of ["ops_alerts", "ops_heartbeats", "ai_jobs", "model_calls"]) await real.query(`delete from ${t}`);
});

/** A clock that starts now (today's spend is measured by the database's own clock) and moves on request. */
function clock() {
  let t = Date.now();
  return { now: () => new Date(t), advance: (minutes: number) => (t += minutes * MIN) };
}

function watchdog(c: ReturnType<typeof clock>, mailer: Mailer = memoryMailer(), cfg: AppConfig = config) {
  const lines: string[] = [];
  return { w: alertWatchdog({ platform: { db, storage, queue }, config: cfg, mailer, to: "owner@postavi.si", now: c.now, log: (l) => lines.push(l) }), lines };
}

const subjects = (m: { sent: MailMessage[] }) => m.sent.map((x) => x.subject);
const beat = (at: Date) => new OpsState(real).beat(WORKER_HEARTBEAT, at);

async function failedJob(finishedAt: Date, started = true): Promise<void> {
  await real.query(
    "insert into ai_jobs (kind, tier, pool, estimate_eur, status, started_at, finished_at) values ('generate', 'free', 'free', 0.3, 'failed', $1, $2)",
    [started ? new Date(finishedAt.getTime() - MIN).toISOString() : null, finishedAt.toISOString()],
  );
}

async function spend(eur: number): Promise<void> {
  await real.query("insert into model_calls (stage, model, input_tokens, output_tokens, cost_eur, duration_ms) values ('content', 'm', 1, 1, $1, 1)", [eur]);
}

describe("migration ops_alerts", () => {
  it("creates both tables, and running migrations again changes nothing", async () => {
    expect(MIGRATIONS.find((m) => m.name === "ops_alerts")).toBeDefined();
    const { rows } = await real.query<{ table_name: string }>("select table_name from information_schema.tables where table_name in ('ops_alerts', 'ops_heartbeats') order by table_name");
    expect(rows.map((r) => r.table_name)).toEqual(["ops_alerts", "ops_heartbeats"]);
    expect(await migrate(real)).toEqual([]);
  });
});

describe("alert watchdog", () => {
  it("is off without ALERT_EMAIL", () => {
    expect(startAlerts({ platform: { db, storage, queue }, config, mailer: memoryMailer(), to: undefined })).toBeNull();
    expect(startAlerts({ platform: { db, storage, queue }, config, mailer: memoryMailer(), to: "  " })).toBeNull();
  });

  it("sends nothing while everything is fine", async () => {
    const c = clock();
    await beat(c.now());
    const mail = memoryMailer();
    const { w } = watchdog(c, mail);
    expect(await w.check()).toEqual([]);
    expect(mail.sent).toEqual([]);
  });

  it("health: one email per cooldown while it fails, one 'resolved' when it passes, plain text to ALERT_EMAIL", async () => {
    const c = clock();
    await beat(c.now());
    const mail = memoryMailer();
    const { w } = watchdog(c, mail);
    down.queue = true;
    expect(await w.check()).toEqual(["health"]);
    expect(mail.sent[0]!.to).toBe("owner@postavi.si");
    expect(mail.sent[0]!.subject).toBe("Postavi alert: queue failing");
    expect(mail.sent[0]!.text).toContain("pg-boss: connection terminated");
    expect(mail.sent[0]!.html).toBeUndefined();

    c.advance(5);
    await beat(c.now());
    expect(await w.check()).toEqual([]);
    c.advance(config.alerts.cooldownMinutes.health - 5);
    await beat(c.now());
    expect(await w.check()).toEqual(["health"]);

    down.queue = false;
    c.advance(5);
    await beat(c.now());
    expect(await w.check()).toEqual(["health:resolved"]);
    expect(mail.sent.at(-1)!.subject).toBe("Postavi alert: health resolved");
    c.advance(5);
    await beat(c.now());
    expect(await w.check()).toEqual([]);
    expect(mail.sent).toHaveLength(3);
  });

  it("a restarted web service doesn't resend within the cooldown (the state is stored)", async () => {
    const c = clock();
    await beat(c.now());
    down.storage = true;
    const first = memoryMailer();
    expect(await watchdog(c, first).w.check()).toEqual(["health"]);
    c.advance(10);
    await beat(c.now());
    const second = memoryMailer();
    expect(await watchdog(c, second).w.check()).toEqual([]);
    expect(second.sent).toEqual([]);
  });

  it("the database down: alerts from this process's memory, without the checks that need it", async () => {
    const c = clock();
    await beat(c.now());
    const mail = memoryMailer();
    const { w, lines } = watchdog(c, mail);
    down.db = true;
    expect(await w.check()).toEqual(["health"]);
    expect(subjects(mail)).toEqual(["Postavi alert: database failing"]);
    expect(mail.sent[0]!.text).toContain("ECONNREFUSED");
    expect(lines.some((l) => l.includes("storing health"))).toBe(true);
    c.advance(5);
    expect(await w.check()).toEqual([]);
    down.db = false;
    await beat(c.now());
    expect(await w.check()).toEqual(["health:resolved"]);
  });

  it("failed jobs: from the threshold within the window; unused tickets and old failures don't count", async () => {
    const c = clock();
    await beat(c.now());
    const mail = memoryMailer();
    const { w } = watchdog(c, mail);
    const { threshold, windowMinutes } = config.alerts.failedJobs;
    for (let i = 0; i < threshold - 1; i++) await failedJob(new Date(c.now().getTime() - 5 * MIN));
    await failedJob(new Date(c.now().getTime() - 5 * MIN), false);
    await failedJob(new Date(c.now().getTime() - (windowMinutes + 5) * MIN));
    expect(await w.check()).toEqual([]);

    await failedJob(new Date(c.now().getTime() - MIN));
    expect(await w.check()).toEqual(["failed-jobs"]);
    expect(mail.sent[0]!.subject).toBe(`Postavi alert: ${threshold} jobs failed in the last ${windowMinutes} minutes`);
    c.advance(5);
    await beat(c.now());
    expect(await w.check()).toEqual([]);

    // An hour later the failures are out of the window: resolved.
    c.advance(windowMinutes);
    await beat(c.now());
    expect(await w.check()).toEqual(["failed-jobs:resolved"]);
  });

  it("worker silent: no heartbeat at all, or none for workerSilentMinutes; resolved when it beats again", async () => {
    const c = clock();
    const mail = memoryMailer();
    const { w } = watchdog(c, mail);
    expect(await w.check()).toEqual(["worker-silent"]);
    expect(mail.sent[0]!.text).toContain("last heartbeat was never");

    await beat(c.now());
    c.advance(1);
    expect(await w.check()).toEqual(["worker-silent:resolved"]);

    c.advance(config.alerts.workerSilentMinutes - 2);
    expect(await w.check()).toEqual([]);
    // Silent again, but within the cooldown of the first email.
    c.advance(5);
    expect(await w.check()).toEqual([]);
    c.advance(config.alerts.cooldownMinutes.workerSilent);
    expect(await w.check()).toEqual(["worker-silent"]);
    expect(subjects(mail)).toEqual(["Postavi alert: the worker is not running", "Postavi alert: worker-silent resolved", "Postavi alert: the worker is not running"]);
  });

  it("spend: the warning at 80 % once a day, the cap once a day (and no warning after it)", async () => {
    const c = clock();
    await beat(c.now());
    const mail = memoryMailer();
    const { w } = watchdog(c, mail);
    await spend(7.9);
    expect(await w.check()).toEqual([]);
    await spend(0.2);
    expect(await w.check()).toEqual(["spend-warning"]);
    expect(mail.sent[0]!.subject).toBe("Postavi alert: 81% of the daily spend cap used");
    c.advance(5);
    await beat(c.now());
    expect(await w.check()).toEqual([]);

    await spend(2);
    expect(await w.check()).toEqual(["spend-cap"]);
    expect(mail.sent[1]!.subject).toBe("Postavi alert: daily spend cap reached (€10.10 of €10.00)");
    c.advance(5);
    await beat(c.now());
    expect(await w.check()).toEqual([]);

    // Next UTC day (the fake clock; the database still counts the same calls as today's): the cap once more.
    c.advance(24 * 60);
    await beat(c.now());
    expect(await w.check()).toEqual(["spend-cap"]);
    expect(mail.sent).toHaveLength(3);
  });

  it("the cap reached at the first check sends only the cap alert", async () => {
    const c = clock();
    await beat(c.now());
    const mail = memoryMailer();
    await spend(12);
    expect(await watchdog(c, mail).w.check()).toEqual(["spend-cap"]);
    c.advance(5);
    await beat(c.now());
    expect(await watchdog(c, mail).w.check()).toEqual([]);
  });

  it("an email that fails isn't recorded, so the next check tries again", async () => {
    const c = clock();
    await beat(c.now());
    const inner = memoryMailer();
    let fail = true;
    const mailer: Mailer = { kind: "memory", send: async (m) => (fail ? Promise.reject(new Error("Resend refused the message: HTTP 503")) : inner.send(m)) };
    const { w, lines } = watchdog(c, mailer);
    down.queue = true;
    expect(await w.check()).toEqual([]);
    expect(lines.some((l) => l.includes("email for health not sent"))).toBe(true);
    fail = false;
    c.advance(5);
    await beat(c.now());
    expect(await w.check()).toEqual(["health"]);
    expect(inner.sent).toHaveLength(1);
  });
});
