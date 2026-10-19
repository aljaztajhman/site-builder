import { createDb } from "./db.ts";
import { latestBackupSql, restoreSql, tableCounts } from "./backups.ts";
import type { Storage } from "./storage.ts";

/**
 * The restore drill (`pnpm db:restore-drill`, docs/dev/workflow.md §4): the newest backup in the bucket is
 * restored into a throwaway database on the live server (`drill_<UTC timestamp>`), the row count of every table
 * is compared with the live database, and the throwaway database is always dropped afterwards.
 *
 * The rule: the same set of tables, and every live table has at least as many rows as the backup (the backup is
 * older, so rows can only have been added). pg-boss's tables (schema `pgboss`) churn by design: they must exist
 * on both sides, but their counts are only reported.
 */

export const DRILL_PREFIX = "drill_";
const DRILL_NAME = /^drill_\d{14}$/;
/** Schemas whose row counts are expected to go down between the backup and now (queue jobs come and go). */
const CHURN_SCHEMAS = ["pgboss"];

/** `drill_YYYYMMDDHHMMSS` (UTC): a plain identifier, so it needs no quoting tricks. */
export const drillDatabaseName = (now: Date): string => `${DRILL_PREFIX}${now.toISOString().replace(/\D/g, "").slice(0, 14)}`;

/** The same server and credentials as `url`, another database. */
export function databaseUrl(url: string, dbname: string): string {
  const u = new URL(url);
  u.pathname = `/${encodeURIComponent(dbname)}`;
  return u.toString();
}

/** Only drill databases may be created or dropped by the drill. */
export function assertDrillName(name: string): string {
  if (!DRILL_NAME.test(name)) throw new Error(`refusing to create or drop "${name}": the drill only touches databases named drill_<14 digits>`);
  return name;
}

export interface CountComparison {
  ok: boolean;
  /** Tables in the live database. */
  tables: number;
  onlyLive: string[];
  onlyBackup: string[];
  /** Tables (outside the churn schemas) with fewer live rows than in the backup. */
  fewerLive: { table: string; backup: number; live: number }[];
  /** Rows in the backup and live, summed over the tables outside the churn schemas. */
  backupRows: number;
  liveRows: number;
}

/** Compares the backup's row counts with the live ones by the drill's rule. */
export function compareCounts(backup: Record<string, number>, live: Record<string, number>): CountComparison {
  const churn = (t: string) => CHURN_SCHEMAS.some((s) => t.startsWith(`${s}.`));
  const onlyLive = Object.keys(live).filter((t) => !(t in backup)).sort();
  const onlyBackup = Object.keys(backup).filter((t) => !(t in live)).sort();
  const shared = Object.keys(live).filter((t) => t in backup && !churn(t)).sort();
  const fewerLive = shared.filter((t) => live[t]! < backup[t]!).map((t) => ({ table: t, backup: backup[t]!, live: live[t]! }));
  const sum = (c: Record<string, number>) => shared.reduce((n, t) => n + c[t]!, 0);
  return { ok: !onlyLive.length && !onlyBackup.length && !fewerLive.length, tables: Object.keys(live).length, onlyLive, onlyBackup, fewerLive, backupRows: sum(backup), liveRows: sum(live) };
}

/** Report lines for a comparison (no URLs, no keys). */
export function describeComparison(c: CountComparison): string[] {
  const lines = [`tables: ${c.tables} live; rows outside pg-boss: backup ${c.backupRows}, live ${c.liveRows}`];
  if (c.onlyLive.length) lines.push(`MISMATCH: only in the live database: ${c.onlyLive.join(", ")}`);
  if (c.onlyBackup.length) lines.push(`MISMATCH: only in the backup: ${c.onlyBackup.join(", ")}`);
  for (const f of c.fewerLive) lines.push(`MISMATCH: ${f.table} has ${f.live} rows live, ${f.backup} in the backup`);
  return lines;
}

/** What the drill does to the outside world; injected so the order and the cleanup can be tested. */
export interface DrillSteps {
  latest(): Promise<{ key: string; sql: Uint8Array } | null>;
  createDatabase(name: string): Promise<void>;
  restore(name: string, sql: Uint8Array): Promise<void>;
  counts(name: string | null): Promise<Record<string, number>>;
  dropDatabase(name: string): Promise<void>;
}

export interface DrillResult {
  ok: boolean;
  lines: string[];
  /** The throwaway database, null when none was created. */
  database: string | null;
  dropped: boolean;
}

/**
 * Runs the drill: newest backup → `drill_<timestamp>` → restore → compare with live → drop. The throwaway database
 * is dropped whatever happens after it was created; a failed drop fails the drill and names the database to drop
 * by hand. Errors become report lines (first line of the message only).
 */
export async function runRestoreDrill(steps: DrillSteps, now = new Date()): Promise<DrillResult> {
  const lines: string[] = [];
  let ok = false;
  let database: string | null = null;
  let dropped = false;
  try {
    const latest = await steps.latest();
    if (!latest) {
      lines.push("FAILED: no backup in the bucket");
      return { ok: false, lines, database, dropped };
    }
    const name = assertDrillName(drillDatabaseName(now));
    await steps.createDatabase(name);
    database = name;
    const t0 = Date.now();
    await steps.restore(name, latest.sql);
    lines.push(`restored ${latest.key} (${latest.sql.length} bytes of SQL) into ${name} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    const c = compareCounts(await steps.counts(name), await steps.counts(null));
    lines.push(...describeComparison(c));
    ok = c.ok;
  } catch (e) {
    lines.push(`FAILED: ${firstLine(e)}`);
  } finally {
    if (database) {
      try {
        await steps.dropDatabase(database);
        dropped = true;
        lines.push(`dropped ${database}`);
      } catch (e) {
        ok = false;
        lines.push(`FAILED to drop ${database} (drop it by hand): ${firstLine(e)}`);
      }
    }
  }
  return { ok, lines, database, dropped };
}

const firstLine = (e: unknown): string => (e instanceof Error ? e.message : String(e)).split("\n")[0]!;

/** The real steps against a Postgres server: `url` is the live database (its user may create databases). */
export function postgresDrillSteps(url: string, storage: Storage, prefix: string): DrillSteps {
  return {
    latest: () => latestBackupSql(storage, prefix),
    async createDatabase(name) {
      const db = await createDb(url);
      try {
        await db.query(`create database ${assertDrillName(name)}`);
      } finally {
        await db.close();
      }
    },
    restore: (name, sql) => restoreSql(databaseUrl(url, assertDrillName(name)), sql),
    async counts(name) {
      const db = await createDb(name ? databaseUrl(url, assertDrillName(name)) : url);
      try {
        return await tableCounts(db);
      } finally {
        await db.close();
      }
    },
    async dropDatabase(name) {
      const db = await createDb(url);
      try {
        await db.query(`drop database if exists ${assertDrillName(name)} with (force)`);
      } finally {
        await db.close();
      }
    },
  };
}
