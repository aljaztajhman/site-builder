import type { AppConfig } from "@sb/config";
import { OpsState, SPEND_CAP_REFUSAL, Usage, WORKER_HEARTBEAT, WORKER_STORAGE_HEARTBEAT, type Mailer, type Platform } from "@sb/platform";

/**
 * Admin alerts: the owner hears about trouble by email within one check interval, without another account.
 * The web service (it holds the mail settings) runs `checkAlerts` every `alerts.everyMinutes`; the recipient is
 * ALERT_EMAIL, and without it nothing runs. Plain English, subject "Postavi alert: …".
 *
 * Kinds: health (the /health checks: database, storage, queue), failed-jobs (generation and chat-edit jobs failed in
 * the last window, with the last failures' messages; jobs the spend cap stopped are "refused", not failed), worker-silent
 * (no worker heartbeat), worker-storage (the worker's own bucket check hasn't passed: its key can differ from the web's),
 * spend-warning (today's model spend at a share of the daily cap) and spend-cap (the cap reached, or a call refused
 * by it today: the cap refuses a call whose estimate doesn't fit, so spend can stay just under it). A kind that keeps
 * failing emails again only after its cooldown; the spend kinds once per UTC day. A kind that was emailed and clears
 * sends one "resolved" email, and its next failure is a new alert at once. What was sent is stored (ops_alerts), so a
 * restart doesn't resend; when the database itself is down, this process remembers instead. Every check and query
 * has a time limit (a hung database or bucket counts as failing), and a round still running skips the next one.
 */

export type AlertKind = "health" | "failed-jobs" | "worker-silent" | "worker-storage" | "spend-warning" | "spend-cap";

type HealthDeps = Pick<Platform, "db" | "storage" | "queue">;

/** `p`, or a rejection after `ms` (the work itself can't be cancelled; its late answer is ignored). */
export function within<T>(ms: number, what: string, p: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what}: no answer within ${ms / 1000} s`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

/**
 * The checks /health runs, together, each within `timeoutMs`: name → null when fine, or the error message (for the
 * log and the owner's alert only).
 */
export async function healthChecks({ db, storage, queue }: HealthDeps, timeoutMs: number): Promise<Record<string, string | null>> {
  const run = async (name: string, fn: () => Promise<unknown>): Promise<[string, string | null]> => {
    try {
      await within(timeoutMs, name, Promise.resolve().then(fn));
      return [name, null];
    } catch (e) {
      return [name, (e as Error).message || String(e)];
    }
  };
  return Object.fromEntries(await Promise.all([run("database", () => db.query("select 1")), run("storage", () => storage.ping()), run("queue", () => queue.ping())]));
}

export interface AlertDeps {
  platform: HealthDeps;
  config: AppConfig;
  mailer: Mailer;
  /** ALERT_EMAIL. */
  to: string;
  /** The clock (tests: a fake one). */
  now?: () => Date;
  log?: (line: string) => void;
}

interface Finding {
  kind: AlertKind;
  /** One line for the subject. */
  title: string;
  /** The email's body. */
  detail: string;
}

const eur = (n: number) => `€${n.toFixed(2)}`;
const utcDay = (d: Date) => d.toISOString().slice(0, 10);
const SPEND_KINDS = new Set<AlertKind>(["spend-warning", "spend-cap"]);

/**
 * A watchdog with its own memory (used when the database can't be read). `check()` runs one round and returns the
 * kinds it emailed about ("resolved" emails included, as `<kind>:resolved`).
 */
export function alertWatchdog(deps: AlertDeps) {
  const { config, mailer, to } = deps;
  const a = config.alerts;
  const now = deps.now ?? (() => new Date());
  const log = deps.log ?? ((l: string) => console.warn(l));
  const ops = new OpsState(deps.platform.db);
  const usage = new Usage(deps.platform.db);
  const limit = <T>(what: string, p: Promise<T>) => within(a.checkTimeoutMs, what, p);
  let running = false;
  // Fallback state when the database is unreachable (it is the likeliest reason for a health alert).
  const memory = new Map<string, { sentAt: Date; firing: boolean }>();

  const cooldownMinutes: Record<Exclude<AlertKind, "spend-warning" | "spend-cap">, number> = {
    health: a.cooldownMinutes.health,
    "failed-jobs": a.cooldownMinutes.failedJobs,
    "worker-silent": a.cooldownMinutes.workerSilent,
    "worker-storage": a.cooldownMinutes.workerStorage,
  };
  const cooldownMs = (kind: AlertKind) => 60_000 * (SPEND_KINDS.has(kind) ? 0 : cooldownMinutes[kind as keyof typeof cooldownMinutes]);

  async function stateOf(kind: AlertKind): Promise<{ sentAt: Date; firing: boolean } | null> {
    try {
      const s = await limit("alert state", ops.alert(kind));
      const m = memory.get(kind);
      // Whichever is newer (this process's own on a tie): an email or recovery the database missed is only in memory.
      if (m && (!s || m.sentAt >= s.sentAt)) return m;
      return s;
    } catch {
      return memory.get(kind) ?? null;
    }
  }

  async function findings(at: Date): Promise<{ firing: Finding[]; checked: Set<AlertKind> }> {
    const firing: Finding[] = [];
    // Kinds whose condition could be evaluated this round (only those can recover).
    const checked = new Set<AlertKind>();

    const health = await healthChecks(deps.platform, a.checkTimeoutMs);
    checked.add("health");
    const failed = Object.entries(health).filter(([, e]) => e !== null);
    if (failed.length) {
      firing.push({
        kind: "health",
        title: `${failed.map(([n]) => n).join(", ")} failing`,
        detail: [`The health checks failed at ${at.toISOString()}:`, ...failed.map(([n, e]) => `- ${n}: ${String(e).slice(0, 300)}`), "", "/health answers 503 until they pass."].join("\n"),
      });
    }
    if (health.database !== null) return { firing, checked };

    try {
      const since = new Date(at.getTime() - a.failedJobs.windowMinutes * 60_000);
      const n = await limit("failed jobs", ops.failedJobsSince(since));
      checked.add("failed-jobs");
      if (n >= a.failedJobs.threshold) {
        // Why, in the email itself: the last errors the sites logged (a lost bucket key reads the same on every one).
        const why = await limit("recent failures", ops.recentFailures(since, 3)).catch((e: unknown) => {
          log(`[alerts] recent failures: ${(e as Error).message}`);
          return [] as string[];
        });
        firing.push({
          kind: "failed-jobs",
          title: `${n} jobs failed in the last ${a.failedJobs.windowMinutes} minutes`,
          detail: [
            `${n} generation or chat-edit jobs failed between ${since.toISOString()} and ${at.toISOString()} (alert from ${a.failedJobs.threshold}).`,
            ...(why.length ? ["The last errors the sites logged:", ...why.map((m) => `- ${m.slice(0, 200)}`)] : []),
            "The worker log and /admin/costs show which stage failed.",
          ].join("\n"),
        });
      }
    } catch (e) {
      log(`[alerts] failed-jobs check: ${(e as Error).message}`);
    }

    // A silent worker checks no bucket either: worker-silent says it all, and worker-storage waits until it beats.
    let workerRuns = false;
    try {
      const beat = await limit("worker heartbeat", ops.lastBeat(WORKER_HEARTBEAT));
      checked.add("worker-silent");
      const silentMs = a.workerSilentMinutes * 60_000;
      workerRuns = !!beat && at.getTime() - beat.getTime() < silentMs;
      if (!workerRuns) {
        const ago = beat ? `${Math.round((at.getTime() - beat.getTime()) / 60_000)} minutes ago (${beat.toISOString()})` : "never";
        firing.push({
          kind: "worker-silent",
          title: "the worker is not running",
          detail: `The worker's last heartbeat was ${ago}; it writes one every ${a.heartbeatSeconds} seconds.\nGenerations and chat edits wait in the queue until it runs again. Check the worker service on Railway.`,
        });
      }
    } catch (e) {
      log(`[alerts] worker heartbeat check: ${(e as Error).message}`);
    }

    if (workerRuns) {
      try {
        const passed = await limit("worker storage check", ops.lastBeat(WORKER_STORAGE_HEARTBEAT));
        checked.add("worker-storage");
        if (!passed || at.getTime() - passed.getTime() >= a.workerSilentMinutes * 60_000) {
          firing.push({
            kind: "worker-storage",
            title: "the worker can't reach its bucket",
            detail: [
              `The worker's bucket check has not passed since ${passed ? passed.toISOString() : "it started (never)"}; generated pictures, published sites and backups can't be stored by the worker.`,
              "Compare the worker's S3_* variables on Railway with the web service's (the web's /health storage check passes with its own key).",
            ].join("\n"),
          });
        }
      } catch (e) {
        log(`[alerts] worker storage check: ${(e as Error).message}`);
      }
    }

    try {
      const cap = config.limits.dailyModelSpendCapEur;
      if (cap > 0) {
        const spent = await limit("spend today", usage.spentToday());
        const refusal = await limit("spend-cap refusal", ops.lastBeat(SPEND_CAP_REFUSAL));
        checked.add("spend-warning");
        checked.add("spend-cap");
        const line = `Model spend today (UTC ${utcDay(at)}): ${eur(spent)} of the ${eur(cap)} daily cap (${Math.round((spent / cap) * 100)}%).`;
        const refusedToday = refusal !== null && utcDay(refusal) === utcDay(at);
        if (spent >= cap || refusedToday) {
          const why = spent >= cap ? "" : `\nThe cap refused a model call at ${refusal!.toISOString()}: its estimated cost didn't fit in what is left today.`;
          firing.push({ kind: "spend-cap", title: `daily spend cap reached (${eur(spent)} of ${eur(cap)})`, detail: `${line}${why}\nNew generations and chat edits are refused until UTC midnight. The cap is DAILY_SPEND_CAP_EUR on Railway (web and worker).` });
        } else if (spent >= a.spendWarnShare * cap) {
          firing.push({ kind: "spend-warning", title: `${Math.round((spent / cap) * 100)}% of the daily spend cap used`, detail: `${line}\nAt the cap, new generations and chat edits are refused until UTC midnight.` });
        }
      }
    } catch (e) {
      log(`[alerts] spend check: ${(e as Error).message}`);
    }
    return { firing, checked };
  }

  async function record(kind: AlertKind, at: Date, detail: string) {
    memory.set(kind, { sentAt: at, firing: true });
    await limit("storing the alert", ops.alertSent(kind, at, detail)).catch((e: unknown) => log(`[alerts] storing ${kind}: ${(e as Error).message}`));
  }

  async function send(subject: string, text: string) {
    await mailer.send({ to, subject: `Postavi alert: ${subject}`, text });
  }

  async function round(): Promise<string[]> {
    const at = now();
    const { firing, checked } = await findings(at);
    const sent: string[] = [];
    // The cap reached says everything the warning would.
    const capHit = firing.some((f) => f.kind === "spend-cap");
    for (const f of firing) {
      const s = await stateOf(f.kind);
      // After a "resolved" email (firing false) a new failure is news: no cooldown.
      const due = SPEND_KINDS.has(f.kind) ? !s || utcDay(s.sentAt) !== utcDay(at) : !s || !s.firing || at.getTime() - s.sentAt.getTime() >= cooldownMs(f.kind);
      if (!due) continue;
      if (f.kind === "spend-warning" && capHit) continue;
      try {
        await send(f.title, `${f.detail}\n\nSent ${at.toISOString()} by the Postavi web service. This kind of alert is sent again ${SPEND_KINDS.has(f.kind) ? "tomorrow at the earliest" : `after ${cooldownMs(f.kind) / 60_000} minutes if it keeps failing`}.`);
      } catch (e) {
        log(`[alerts] email for ${f.kind} not sent: ${(e as Error).message}`);
        continue;
      }
      log(`[alerts] sent ${f.kind}: ${f.title}`);
      await record(f.kind, at, f.detail);
      // Once the cap is reached today, today's warning would be old news.
      if (f.kind === "spend-cap") await record("spend-warning", at, "covered by spend-cap");
      sent.push(f.kind);
    }
    // Kinds that were emailed and now pass: one "resolved" email each (the spend ones reset with the day instead).
    const firingNow = new Set(firing.map((f) => f.kind));
    for (const kind of ["health", "failed-jobs", "worker-silent", "worker-storage"] as const) {
      if (firingNow.has(kind) || !checked.has(kind)) continue;
      const s = await stateOf(kind);
      if (!s?.firing) continue;
      try {
        await send(`${kind} resolved`, `The ${kind} alert sent ${s.sentAt.toISOString()} no longer applies (checked ${at.toISOString()}).`);
      } catch (e) {
        log(`[alerts] resolved email for ${kind} not sent: ${(e as Error).message}`);
        continue;
      }
      log(`[alerts] ${kind} resolved`);
      memory.set(kind, { sentAt: s.sentAt, firing: false });
      await limit("storing the recovery", ops.alertRecovered(kind)).catch((e: unknown) => log(`[alerts] storing ${kind} resolved: ${(e as Error).message}`));
      sent.push(`${kind}:resolved`);
    }
    return sent;
  }

  return {
    /** One round; returns [] at once while the previous round still runs (no overlapping rounds, no double emails). */
    async check(): Promise<string[]> {
      if (running) {
        log("[alerts] previous check still running; skipped");
        return [];
      }
      running = true;
      try {
        return await round();
      } finally {
        running = false;
      }
    },
  };
}

/** Starts the watchdog when ALERT_EMAIL is set; returns the timer (to clear on shutdown) or null. */
export function startAlerts(deps: Omit<AlertDeps, "to"> & { to: string | undefined | null }): ReturnType<typeof setInterval> | null {
  const to = deps.to?.trim();
  if (!to) return null;
  const w = alertWatchdog({ ...deps, to });
  const log = deps.log ?? ((l: string) => console.warn(l));
  const timer = setInterval(() => void w.check().catch((e: unknown) => log(`[alerts] check failed: ${(e as Error).message}`)), deps.config.alerts.everyMinutes * 60_000);
  timer.unref();
  return timer;
}
