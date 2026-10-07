import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { loadConfig } from "@sb/config";
import {
  MIGRATIONS,
  Repo,
  assertEmptyDatabase,
  backupKey,
  checkBackups,
  createDb,
  createFsStorage,
  latestBackupSql,
  listBackups,
  migrate,
  migrateRestored,
  pgConnection,
  writeBackup,
  type BackupPolicy,
  type Storage,
} from "../src/index.ts";

/** Backups (pg_dump itself is stubbed: these run without Postgres; CI's migrations job runs the real one). */
const policy: BackupPolicy = { prefix: "backups/", keepDays: 30, maxAgeHours: 26, minBytes: 200, minShareOfPrevious: 0.5 };
const NOW = new Date("2026-10-07T03:05:00Z");
const day = (d: string) => new Date(`${d}T03:00:00Z`);
/** A plain-format dump as pg_dump ends one (17.6+ adds the \unrestrict line after the closing comment). */
const dump = (rows: number) =>
  new TextEncoder().encode(`--\n-- PostgreSQL database dump\n--\n${Array.from({ length: rows }, (_, i) => `insert into t values (${i}, '${"x".repeat(40)}${i}');`).join("\n")}\n--\n-- PostgreSQL database dump complete\n--\n\n\\unrestrict ${"k".repeat(60)}\n\n`);

let dir: string;
let storage: Storage;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sb-backups-"));
  storage = createFsStorage(dir);
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("backups", () => {
  it("are configured: 30 days in backups/", () => {
    const c = loadConfig().backups;
    expect(c.prefix).toBe("backups/");
    expect(c.keepDays).toBe(30);
  });

  it("writes today's dump gzipped under backups/<UTC date>.sql.gz and reads it back", async () => {
    const sql = dump(500);
    const r = await writeBackup(storage, policy, async () => sql, NOW);
    expect(r.key).toBe("backups/2026-10-07.sql.gz");
    expect(r.sqlBytes).toBe(sql.length);
    expect(r.bytes).toBeLessThan(sql.length);
    expect(new Uint8Array(gunzipSync((await storage.get(r.key))!))).toEqual(sql);
    const latest = await latestBackupSql(storage, policy.prefix);
    expect(latest?.key).toBe(r.key);
    expect(Buffer.from(latest!.sql).equals(Buffer.from(sql))).toBe(true);
  });

  it("refuses a dump without pg_dump's closing line and writes nothing", async () => {
    const cut = dump(500).subarray(0, 4000);
    await expect(writeBackup(storage, policy, async () => cut, NOW)).rejects.toThrow(/incomplete/);
    expect(await storage.list("backups/")).toEqual([]);
  });

  it("keeps 30 days, deletes older backups and never other keys under the prefix", async () => {
    for (const d of ["2026-09-01", "2026-09-06", "2026-09-07", "2026-09-08", "2026-10-06"]) await storage.put(backupKey(policy.prefix, day(d)), gzipSync(dump(300)), "application/gzip");
    await storage.put("backups/README.txt", new TextEncoder().encode("not a backup"), "text/plain");
    const r = await writeBackup(storage, policy, async () => dump(300), NOW);
    // 30 days before 2026-10-07 03:05 is 2026-09-07: that day stays, the two before it go.
    expect(r.pruned).toEqual(["backups/2026-09-01.sql.gz", "backups/2026-09-06.sql.gz"]);
    expect((await listBackups(storage, policy.prefix)).map((b) => b.day)).toEqual(["2026-09-07", "2026-09-08", "2026-10-06", "2026-10-07"]);
    expect(await storage.get("backups/README.txt")).not.toBeNull();
  });

  it("checks the newest backup: present, recent, complete, big enough and not much smaller than the one before", async () => {
    expect((await checkBackups(storage, policy, NOW)).problems).toEqual(["no backup under backups/"]);

    await writeBackup(storage, policy, async () => dump(800), day("2026-10-06"));
    const good = await writeBackup(storage, policy, async () => dump(800), NOW);
    const ok = await checkBackups(storage, policy, NOW);
    expect(ok).toMatchObject({ ok: true, problems: [], count: 2, latest: { key: good.key, bytes: good.bytes } });

    // The next night without a new backup: yesterday's day began 27 h before.
    expect((await checkBackups(storage, policy, new Date("2026-10-08T03:05:00Z"))).problems).toEqual(["the newest backup is from 2026-10-07, more than 26 h ago"]);

    // A dump cut short, smaller than half of yesterday's and under minBytes.
    await storage.put(backupKey(policy.prefix, NOW), gzipSync(dump(800).subarray(0, 100)), "application/gzip");
    const bad = await checkBackups(storage, policy, NOW);
    expect(bad.ok).toBe(false);
    expect(bad.problems.join("\n")).toMatch(/under 200/);
    expect(bad.problems.join("\n")).toMatch(/under 50 % of the one before/);
    expect(bad.problems.join("\n")).toMatch(/cut short/);

    await storage.put(backupKey(policy.prefix, NOW), new TextEncoder().encode("x".repeat(5000)), "application/gzip");
    expect((await checkBackups(storage, policy, NOW)).problems).toContain("the newest backup does not unpack (not gzip, or damaged)");
  });

  it("keeps the database password out of pg_dump's and psql's arguments", () => {
    const c = pgConnection("postgres://app:s3cr%40t@db.internal:5432/app?sslmode=require");
    expect(c.dbname).toBe("postgres://app@db.internal:5432/app?sslmode=require");
    expect(c.env).toEqual({ PGPASSWORD: "s3cr@t" });
    expect(() => pgConnection("pglite://memory")).toThrow(/postgres:\/\//);
  });
});

describe("migrate-check on a restored database (PGlite stands in for the throwaway Postgres)", () => {
  it("refuses a database that already has tables", async () => {
    const db = await createDb("pglite://memory");
    try {
      await assertEmptyDatabase(db);
      await migrate(db);
      await expect(assertEmptyDatabase(db)).rejects.toThrow(/empty throwaway database/);
    } finally {
      await db.close();
    }
  });

  it("runs the migrations a backup lacks and reports row counts; a migration that loses rows is reported", async () => {
    const db = await createDb("pglite://memory");
    const extra = [
      { id: 9001, name: "test.add_column", sql: "alter table sites add column test_note text" },
      { id: 9002, name: "test.drop_rows", sql: "delete from sites where slug = 'frizerstvo'" },
    ];
    try {
      // The backup: today's schema with two sites.
      await migrate(db);
      const repo = new Repo(db);
      await repo.createSite({ name: "Pekarna", slug: "pekarna", intake: { description: "x", photoAssetIds: [], scope: "full" } });
      await repo.createSite({ name: "Frizerstvo", slug: "frizerstvo", intake: { description: "y", photoAssetIds: [], scope: "full" } });
      const known = MIGRATIONS.map((m) => m.id);

      // The release adds a migration: it runs, pg-boss starts after it, no rows are lost.
      MIGRATIONS.push(extra[0]!);
      let started = 0;
      const r = await migrateRestored(db, async () => {
        started++;
      });
      expect(r.before).toEqual(known);
      expect(r.ran).toEqual([9001]);
      expect(started).toBe(1);
      expect(r.rowsBefore["public.sites"]).toBe(2);
      expect(r.rowsAfter["public.sites"]).toBe(2);
      expect(r.shrunk).toEqual([]);

      // One that deletes rows is reported (the script then fails without --allow-shrink).
      MIGRATIONS.push(extra[1]!);
      const loses = await migrateRestored(db);
      expect(loses.ran).toEqual([9002]);
      expect(loses.shrunk).toEqual(["public.sites"]);

      // Nothing pending: nothing runs.
      expect((await migrateRestored(db)).ran).toEqual([]);
    } finally {
      for (const m of extra) {
        const i = MIGRATIONS.indexOf(m);
        if (i >= 0) MIGRATIONS.splice(i, 1);
      }
      await db.close();
    }
  });
});
