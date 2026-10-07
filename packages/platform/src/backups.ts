import { spawn } from "node:child_process";
import { gunzipSync, gzipSync } from "node:zlib";
import type { Db } from "./db.ts";
import { migrate } from "./migrations.ts";
import type { Storage } from "./storage.ts";

/**
 * Database backups and the migrate-check (docs/dev/workflow.md §4).
 * - `pnpm db:backup`: pg_dump → gzip → `<prefix><YYYY-MM-DD>.sql.gz` in the bucket, older than keepDays deleted,
 *   then the newest one checked. `pnpm db:backup --check` only checks (the nightly workflow's backup check).
 * - `pnpm db:migrate-check`: restores a backup into an empty throwaway database and runs the pending
 *   migrations (ours, then pg-boss's) against it, so a migration that fails on real data fails there first.
 * pg_dump and psql come from PATH; their major version must be at least the server's.
 */

export interface BackupPolicy {
  prefix: string;
  keepDays: number;
  maxAgeHours: number;
  minBytes: number;
  minShareOfPrevious: number;
}

export interface BackupFile {
  key: string;
  /** UTC day the backup was made, YYYY-MM-DD. */
  day: string;
}

/** The last line pg_dump writes in plain format: a dump without it was cut short. */
const DUMP_COMPLETE = "-- PostgreSQL database dump complete";
const DAY_MS = 86_400_000;

export const backupKey = (prefix: string, now: Date): string => `${prefix}${now.toISOString().slice(0, 10)}.sql.gz`;

/** The backups under the prefix, oldest first. Other keys there are ignored (and never deleted). */
export async function listBackups(storage: Storage, prefix: string): Promise<BackupFile[]> {
  const re = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\d{4}-\\d{2}-\\d{2})\\.sql\\.gz$`);
  return (await storage.list(prefix))
    .map((key) => ({ key, day: re.exec(key)?.[1] }))
    .filter((b): b is BackupFile => !!b.day)
    .sort((a, b) => a.day.localeCompare(b.day));
}

/** Writes today's backup from a plain-format dump, then deletes backups older than keepDays. */
export async function writeBackup(storage: Storage, policy: BackupPolicy, dump: () => Promise<Uint8Array>, now = new Date()): Promise<{ key: string; bytes: number; sqlBytes: number; pruned: string[] }> {
  const sql = await dump();
  if (!Buffer.from(sql.subarray(Math.max(0, sql.length - 512))).toString("utf8").includes(DUMP_COMPLETE)) throw new Error("the dump is incomplete (pg_dump's closing line is missing); nothing was written");
  const gz = gzipSync(sql, { level: 9 });
  const key = backupKey(policy.prefix, now);
  await storage.put(key, gz, "application/gzip");
  const oldest = new Date(now.getTime() - policy.keepDays * DAY_MS).toISOString().slice(0, 10);
  const pruned = (await listBackups(storage, policy.prefix)).filter((b) => b.day < oldest).map((b) => b.key);
  if (pruned.length) await storage.delete(pruned);
  return { key, bytes: gz.length, sqlBytes: sql.length, pruned };
}

export interface BackupCheck {
  ok: boolean;
  problems: string[];
  latest: (BackupFile & { bytes: number }) | null;
  previous: (BackupFile & { bytes: number }) | null;
  count: number;
}

/**
 * The nightly check: the newest backup exists, is recent (its UTC day began at most maxAgeHours ago),
 * unpacks, ends with pg_dump's closing line, and is at least minBytes and minShareOfPrevious of the one before.
 */
export async function checkBackups(storage: Storage, policy: BackupPolicy, now = new Date()): Promise<BackupCheck> {
  const all = await listBackups(storage, policy.prefix);
  const problems: string[] = [];
  const sized = async (b: BackupFile | undefined) => {
    if (!b) return { file: null, data: null };
    const data = await storage.get(b.key);
    return { file: { ...b, bytes: data?.length ?? 0 }, data };
  };
  const latest = await sized(all.at(-1));
  const previous = await sized(all.at(-2));
  if (!latest.file || !latest.data) {
    problems.push(`no backup under ${policy.prefix}`);
    return { ok: false, problems, latest: null, previous: previous.file, count: all.length };
  }
  const ageHours = (now.getTime() - Date.parse(`${latest.file.day}T00:00:00Z`)) / 3_600_000;
  if (ageHours > policy.maxAgeHours) problems.push(`the newest backup is from ${latest.file.day}, more than ${policy.maxAgeHours} h ago`);
  if (latest.file.bytes < policy.minBytes) problems.push(`the newest backup is ${latest.file.bytes} bytes, under ${policy.minBytes}`);
  if (previous.file && latest.file.bytes < policy.minShareOfPrevious * previous.file.bytes) {
    problems.push(`the newest backup (${latest.file.bytes} bytes) is under ${Math.round(policy.minShareOfPrevious * 100)} % of the one before (${previous.file.bytes} bytes)`);
  }
  try {
    const sql = gunzipSync(latest.data);
    if (!sql.subarray(Math.max(0, sql.length - 512)).toString("utf8").includes(DUMP_COMPLETE)) problems.push("the newest backup is cut short (pg_dump's closing line is missing)");
  } catch {
    problems.push("the newest backup does not unpack (not gzip, or damaged)");
  }
  return { ok: problems.length === 0, problems, latest: latest.file, previous: previous.file, count: all.length };
}

/** The newest backup's SQL (unpacked), or null when there is none. */
export async function latestBackupSql(storage: Storage, prefix: string): Promise<{ key: string; sql: Uint8Array } | null> {
  const latest = (await listBackups(storage, prefix)).at(-1);
  const data = latest && (await storage.get(latest.key));
  return latest && data ? { key: latest.key, sql: gunzipSync(data) } : null;
}

/**
 * libpq arguments for a postgres:// URL, with the password moved to PGPASSWORD so it never sits in a
 * process list or an error message.
 */
export function pgConnection(url: string): { dbname: string; env: Record<string, string> } {
  const u = new URL(url);
  if (u.protocol !== "postgres:" && u.protocol !== "postgresql:") throw new Error("a postgres:// database URL is required (pg_dump and psql don't read PGlite)");
  const password = decodeURIComponent(u.password);
  u.password = "";
  return { dbname: u.toString(), env: password ? { PGPASSWORD: password } : {} };
}

function run(cmd: string, args: string[], env: Record<string, string>, input?: Uint8Array): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { env: { ...process.env, ...env }, stdio: ["pipe", "pipe", "pipe"] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (d: Buffer) => out.push(d));
    child.stderr.on("data", (d: Buffer) => err.push(d));
    child.on("error", (e) => reject(new Error(`${cmd} could not start: ${e.message} (is the PostgreSQL client installed?)`)));
    child.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(out));
      else reject(new Error(`${cmd} exited with ${code}: ${Buffer.concat(err).toString("utf8").trim().slice(0, 2000)}`));
    });
    child.stdin.on("error", () => undefined);
    child.stdin.end(input ?? null);
  });
}

/** Plain-format dump of the whole database (schema, data, pg-boss's schema), without owners or grants. */
export async function pgDump(url: string): Promise<Uint8Array> {
  const c = pgConnection(url);
  return run("pg_dump", ["--format=plain", "--no-owner", "--no-privileges", `--dbname=${c.dbname}`], c.env);
}

/** Runs a plain-format dump into a database in one transaction, stopping at the first error. */
export async function restoreSql(url: string, sql: Uint8Array): Promise<void> {
  const c = pgConnection(url);
  await run("psql", ["-X", "-q", "-v", "ON_ERROR_STOP=1", "--single-transaction", `--dbname=${c.dbname}`, "-f", "-"], c.env, sql);
}

/** Row count of every table outside the system schemas, "schema.table" → rows. */
export async function tableCounts(db: Db): Promise<Record<string, number>> {
  const { rows } = await db.query<{ s: string; t: string }>(
    `select table_schema as s, table_name as t from information_schema.tables
      where table_type = 'BASE TABLE' and table_schema not in ('pg_catalog', 'information_schema') order by 1, 2`,
  );
  const out: Record<string, number> = {};
  for (const r of rows) {
    const ident = `"${r.s.replace(/"/g, '""')}"."${r.t.replace(/"/g, '""')}"`;
    out[`${r.s}.${r.t}`] = Number((await db.query<{ n: string }>(`select count(*) as n from ${ident}`)).rows[0]?.n ?? 0);
  }
  return out;
}

/** Refuses any database that already has tables: the migrate-check restores into a throwaway database only. */
export async function assertEmptyDatabase(db: Db): Promise<void> {
  const { rows } = await db.query<{ n: string }>(`select count(*) as n from information_schema.tables where table_schema not in ('pg_catalog', 'information_schema')`);
  const n = Number(rows[0]?.n ?? 0);
  if (n > 0) throw new Error(`the target database already has ${n} table(s); the migrate-check only restores into an empty throwaway database`);
}

export interface MigrateReport {
  /** Migration ids recorded in the restored backup. */
  before: number[];
  /** Migration ids this check ran. */
  ran: number[];
  rowsBefore: Record<string, number>;
  rowsAfter: Record<string, number>;
  /** Tables (outside pgboss) with fewer rows after the migrations than before. */
  shrunk: string[];
}

/**
 * Runs our pending migrations on an already restored database and reports what ran and what it did to the
 * row counts; `startQueue` (pg-boss's own schema migration, as at app start) runs after ours.
 */
export async function migrateRestored(db: Db, startQueue?: () => Promise<void>): Promise<MigrateReport> {
  const rowsBefore = await tableCounts(db);
  const before = (await db.query<{ id: number }>("select id from schema_migrations order by id").catch(() => ({ rows: [] as { id: number }[] }))).rows.map((r) => Number(r.id));
  const ran = await migrate(db);
  if (startQueue) await startQueue();
  const rowsAfter = await tableCounts(db);
  const shrunk = Object.keys(rowsBefore).filter((t) => !t.startsWith("pgboss.") && (rowsAfter[t] ?? 0) < rowsBefore[t]!);
  return { before, ran, rowsBefore, rowsAfter, shrunk };
}
