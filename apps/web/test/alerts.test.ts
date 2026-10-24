import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadConfig, type AppConfig } from "@sb/config";
import { MIGRATIONS, OpsState, Repo, SPEND_CAP_REFUSAL, WORKER_HEARTBEAT, WORKER_STORAGE_HEARTBEAT, createDb, createFsStorage, memoryMailer, migrate, type Db, type MailMessage, type Mailer, type Queue, type Storage } from "@sb/platform";
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
/** Switches the database, storage and queue between working, failing and (storage) hanging. */
const down = { db: false, storage: false, queue: false, hang: false };
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
      if (down.hang) return new Promise<void>(() => undefined);
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
  Object.assign(down, { db: false, storage: false, queue: false, hang: false });
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
/** A running worker: its heartbeat and its own bucket check (it writes both on every beat). */
const beat = async (at: Date, storageOk = true) => {
  await new OpsState(real).beat(WORKER_HEARTBEAT, at);
  if (storageOk) await new OpsState(real).beat(WORKER_STORAGE_HEARTBEAT, at);
};

async function failedJob(finishedAt: Date, started = true, status: "failed" | "refused" = "failed"): Promise<void> {
  await real.query(
    "insert into ai_jobs (kind, tier, pool, estimate_eur, status, started_at, finished_at) values ('generate', 'free', 'free', 0.3, $3, $1, $2)",
    [started ? new Date(finishedAt.getTime() - MIN).toISOString() : null, finishedAt.toISOString(), status],
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
    // Stopped by the spend cap (the worker marks those refused): the spend-cap alert's business, not this one's.
    await failedJob(new Date(c.now().getTime() - 5 * MIN), true, "refused");
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

  it("failed jobs: the email names the last errors the sites logged", async () => {
    const c = clock();
    await beat(c.now());
    const mail = memoryMailer();
    const { w } = watchdog(c, mail);
    const repo = new Repo(real);
    const site = await repo.createSite({ name: "Gostilna", slug: `gostilna-${Date.now()}`, intake: { description: "x", photoAssetIds: [], scope: "home" } });
    await repo.addEvent({ siteId: site.id, stage: "error", level: "error", message: "Slik za stran ni bilo mogoče pripraviti, zato strani nismo ustvarili." });
    await repo.addEvent({ siteId: site.id, stage: "imageGen", level: "warn", message: "Image 1 not generated; building without it" });
    for (let i = 0; i < config.alerts.failedJobs.threshold; i++) await failedJob(new Date(c.now().getTime() - MIN));
    expect(await w.check()).toEqual(["failed-jobs"]);
    expect(mail.sent[0]!.text).toContain("The last errors the sites logged:\n- Slik za stran ni bilo mogoče pripraviti");
    expect(mail.sent[0]!.text).not.toContain("Image 1 not generated");
  });

  it("worker storage: fires when the worker's own bucket check never passed or is stale, resolves when it passes; a silent worker is only worker-silent", async () => {
    const c = clock();
    const mail = memoryMailer();
    const { w } = watchdog(c, mail);
    // The worker runs, but its bucket check never passed (a stale S3 key on the worker only).
    await beat(c.now(), false);
    expect(await w.check()).toEqual(["worker-storage"]);
    expect(mail.sent[0]!.subject).toBe("Postavi alert: the worker can't reach its bucket");
    expect(mail.sent[0]!.text).toContain("has not passed since it started (never)");
    expect(mail.sent[0]!.text).toContain("Compare the worker's S3_* variables on Railway");

    c.advance(1);
    await beat(c.now());
    expect(await w.check()).toEqual(["worker-storage:resolved"]);

    // Passed once, then stale for workerSilentMinutes while the worker keeps beating.
    const passedAt = c.now();
    c.advance(config.alerts.workerSilentMinutes);
    await beat(c.now(), false);
    expect(await w.check()).toEqual(["worker-storage"]);
    expect(mail.sent.at(-1)!.text).toContain(`has not passed since ${passedAt.toISOString()}`);

    // The worker itself stops: one alert for it, not a second for its bucket.
    c.advance(config.alerts.workerSilentMinutes + config.alerts.cooldownMinutes.workerStorage);
    expect(await w.check()).toEqual(["worker-silent"]);
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
    // Silent again, within the cooldown of the first email: after its "resolved" email it is a new alert at once.
    c.advance(5);
    expect(await w.check()).toEqual(["worker-silent"]);
    c.advance(5);
    expect(await w.check()).toEqual([]);
    c.advance(config.alerts.cooldownMinutes.workerSilent);
    expect(await w.check()).toEqual(["worker-silent"]);
    expect(subjects(mail)).toEqual([
      "Postavi alert: the worker is not running",
      "Postavi alert: worker-silent resolved",
      "Postavi alert: the worker is not running",
      "Postavi alert: the worker is not running",
    ]);
  });

  it("after a 'resolved' email the first new failure alerts at once, also for a restarted service", async () => {
    const c = clock();
    await beat(c.now());
    const mail = memoryMailer();
    down.queue = true;
    expect(await watchdog(c, mail).w.check()).toEqual(["health"]);
    down.queue = false;
    c.advance(5);
    await beat(c.now());
    expect(await watchdog(c, mail).w.check()).toEqual(["health:resolved"]);
    down.storage = true;
    c.advance(5);
    await beat(c.now());
    expect(await watchdog(c, mail).w.check()).toEqual(["health"]);
    expect(subjects(mail)).toEqual(["Postavi alert: queue failing", "Postavi alert: health resolved", "Postavi alert: storage failing"]);
  });

  it("a hung check counts as failing after checkTimeoutMs, and a round still running skips the next", async () => {
    const c = clock();
    await beat(c.now());
    const mail = memoryMailer();
    const quick: AppConfig = { ...config, alerts: { ...config.alerts, checkTimeoutMs: 200 } };
    const { w, lines } = watchdog(c, mail, quick);
    down.hang = true;
    const first = w.check();
    expect(await w.check()).toEqual([]);
    expect(lines).toContain("[alerts] previous check still running; skipped");
    expect(await first).toEqual(["health"]);
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]!.subject).toBe("Postavi alert: storage failing");
    expect(mail.sent[0]!.text).toContain("storage: no answer within 0.2 s");
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

  it("spend just under the cap counts as the cap reached when the cap refused a call today (not yesterday)", async () => {
    const c = clock();
    await beat(c.now());
    const mail = memoryMailer();
    await spend(9.95);
    await new OpsState(real).beat(SPEND_CAP_REFUSAL, new Date(c.now().getTime() - 24 * 60 * MIN));
    expect(await watchdog(c, mail).w.check()).toEqual(["spend-warning"]);
    await new OpsState(real).beat(SPEND_CAP_REFUSAL, c.now());
    c.advance(5);
    await beat(c.now());
    expect(await watchdog(c, mail).w.check()).toEqual(["spend-cap"]);
    expect(mail.sent[1]!.subject).toBe("Postavi alert: daily spend cap reached (€9.95 of €10.00)");
    expect(mail.sent[1]!.text).toContain("The cap refused a model call at");
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
