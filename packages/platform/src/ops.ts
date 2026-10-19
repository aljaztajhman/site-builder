import type { Db } from "./db.ts";

/**
 * Operations state for the admin alerts (apps/web/src/alerts.ts): process heartbeats (the worker writes one every
 * minute) and the last email sent per alert kind, so a restart of the web service never sends one twice.
 * Times are passed in by the caller (its clock), so the watchdog can be tested with a fake one.
 */

/** The name the worker's heartbeat is stored under. */
export const WORKER_HEARTBEAT = "worker";

export interface AlertState {
  kind: string;
  /** When the last email for this kind went out. */
  sentAt: Date;
  /** Still failing at the last check; false once it recovered (and the recovery email went out). */
  firing: boolean;
}

export class OpsState {
  constructor(private readonly db: Db) {}

  /** Records that `name` (e.g. "worker") is alive at `at`. */
  async beat(name: string, at: Date = new Date()): Promise<void> {
    await this.db.query(
      "insert into ops_heartbeats (name, beat_at) values ($1, $2) on conflict (name) do update set beat_at = greatest(ops_heartbeats.beat_at, excluded.beat_at)",
      [name, at.toISOString()],
    );
  }

  /** The last heartbeat of `name`, or null when it never wrote one. */
  async lastBeat(name: string): Promise<Date | null> {
    const { rows } = await this.db.query<{ beat_at: string | Date }>("select beat_at from ops_heartbeats where name = $1", [name]);
    return rows[0] ? new Date(rows[0].beat_at) : null;
  }

  async alert(kind: string): Promise<AlertState | null> {
    const { rows } = await this.db.query<{ kind: string; sent_at: string | Date; firing: boolean }>("select kind, sent_at, firing from ops_alerts where kind = $1", [kind]);
    const r = rows[0];
    return r ? { kind: r.kind, sentAt: new Date(r.sent_at), firing: r.firing } : null;
  }

  /** An alert email for `kind` went out at `at`. */
  async alertSent(kind: string, at: Date, detail: string): Promise<void> {
    await this.db.query(
      "insert into ops_alerts (kind, sent_at, firing, detail) values ($1, $2, true, $3) on conflict (kind) do update set sent_at = excluded.sent_at, firing = true, detail = excluded.detail",
      [kind, at.toISOString(), detail.slice(0, 1000)],
    );
  }

  /** `kind` stopped failing: its next failure is a new alert. The last send time stays (the cooldown still counts). */
  async alertRecovered(kind: string): Promise<void> {
    await this.db.query("update ops_alerts set firing = false where kind = $1", [kind]);
  }

  /**
   * Generation and chat-edit jobs that a worker started and that failed since `since`. Interrupted ones (a deploy's)
   * and upload tickets that were never used (also marked failed, never started) don't count.
   */
  async failedJobsSince(since: Date): Promise<number> {
    const { rows } = await this.db.query<{ n: string | number }>(
      "select count(*) as n from ai_jobs where kind in ('generate', 'edit') and status = 'failed' and started_at is not null and finished_at >= $1",
      [since.toISOString()],
    );
    return Number(rows[0]?.n ?? 0);
  }
}
