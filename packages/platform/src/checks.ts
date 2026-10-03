import { randomBytes } from "node:crypto";
import type { Db } from "./db.ts";

export type UrlCheckStatus = "queued" | "running" | "done" | "failed";

export interface UrlCheckRow {
  id: string;
  url: string;
  host: string;
  status: UrlCheckStatus;
  /** The worker's report (engine's UrlCheckResult), null until done. */
  result: unknown;
  /** Why the check failed, in Slovene for the visitor. */
  error: string | null;
  created_at: string;
  finished_at: string | null;
}

/** The public website checker's rows (url_checks): created by the web, run by the worker. */
export class UrlChecks {
  constructor(private readonly db: Db) {}

  async create(c: { url: string; host: string; ipKey: string; deviceId: string | null }): Promise<string> {
    // The id is the report's link: random, not guessable from another report's.
    const id = `chk_${randomBytes(12).toString("hex")}`;
    await this.db.query("insert into url_checks (id, url, host, ip_key, device_id) values ($1, $2, $3, $4, $5)", [id, c.url, c.host, c.ipKey, c.deviceId]);
    return id;
  }

  async get(id: string): Promise<UrlCheckRow | null> {
    const { rows } = await this.db.query<UrlCheckRow>("select id, url, host, status, result, error, created_at, finished_at from url_checks where id = $1", [id]);
    const r = rows[0];
    if (!r) return null;
    return { ...r, result: typeof r.result === "string" ? JSON.parse(r.result) : r.result };
  }

  /** Checks asked in the last `hours`: by one visitor (IP hash), or by everyone. */
  async count(by: { ipKey: string } | "all", hours: number): Promise<number> {
    const { rows } =
      by === "all"
        ? await this.db.query<{ n: string | number }>("select count(*) as n from url_checks where created_at > now() - make_interval(hours => $1)", [hours])
        : await this.db.query<{ n: string | number }>("select count(*) as n from url_checks where ip_key = $1 and created_at > now() - make_interval(hours => $2)", [by.ipKey, hours]);
    return Number(rows[0]?.n ?? 0);
  }

  /** Takes a queued check for running; false when it isn't queued (already run, or gone). */
  async start(id: string): Promise<boolean> {
    const { rows } = await this.db.query("update url_checks set status = 'running' where id = $1 and status = 'queued' returning id", [id]);
    return rows.length > 0;
  }

  async finish(id: string, result: unknown): Promise<void> {
    await this.db.query("update url_checks set status = 'done', result = $2, finished_at = now() where id = $1", [id, JSON.stringify(result)]);
  }

  async fail(id: string, error: string): Promise<void> {
    await this.db.query("update url_checks set status = 'failed', error = $2, finished_at = now() where id = $1", [id, error.slice(0, 500)]);
  }

  /**
   * Housekeeping: IP hashes go after a day, reports after `keepDays`, and a check left running or queued
   * for an hour (its worker died) is marked failed so its page stops waiting.
   */
  async cleanup(keepDays: number): Promise<{ deleted: number }> {
    await this.db.query("update url_checks set ip_key = '' where ip_key <> '' and created_at < now() - interval '1 day'");
    await this.db.query(
      "update url_checks set status = 'failed', error = 'Pregled se ni končal. Poskusite znova.', finished_at = now() where status in ('queued', 'running') and created_at < now() - interval '1 hour'",
    );
    const { rows } = await this.db.query("delete from url_checks where created_at < now() - make_interval(days => $1) returning id", [keepDays]);
    return { deleted: rows.length };
  }
}
