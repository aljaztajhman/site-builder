import { describe, expect, it } from "vitest";
import { assertDrillName, compareCounts, databaseUrl, describeComparison, drillDatabaseName, runRestoreDrill, type DrillSteps } from "../src/index.ts";

/** The restore drill's logic (psql and the server are stubbed; the real steps need a live Postgres). */
const NOW = new Date("2026-10-19T03:30:05.123Z");
const NAME = "drill_20261019033005";

function fakeSteps(over: Partial<DrillSteps> = {}, counts: { backup?: Record<string, number>; live?: Record<string, number> } = {}) {
  const calls: string[] = [];
  const backup = counts.backup ?? { "public.sites": 3, "public.users": 2, "pgboss.job": 40 };
  const live = counts.live ?? { "public.sites": 4, "public.users": 2, "pgboss.job": 5 };
  const steps: DrillSteps = {
    latest: async () => (calls.push("latest"), { key: "backups/2026-10-19.sql.gz", sql: new Uint8Array(100) }),
    createDatabase: async (n) => void calls.push(`create ${n}`),
    restore: async (n) => void calls.push(`restore ${n}`),
    counts: async (n) => (calls.push(`counts ${n ?? "live"}`), n ? backup : live),
    dropDatabase: async (n) => void calls.push(`drop ${n}`),
    ...over,
  };
  return { steps, calls };
}

describe("restore drill", () => {
  it("names the throwaway database drill_<UTC timestamp> and refuses any other name", () => {
    expect(drillDatabaseName(NOW)).toBe(NAME);
    expect(assertDrillName(NAME)).toBe(NAME);
    for (const bad of ["railway", "drill_1", "drill_20261019033005; drop database railway", "Drill_20261019033005"]) expect(() => assertDrillName(bad)).toThrow(/refusing/);
  });

  it("points the live URL at another database on the same server, keeping credentials and options", () => {
    const u = new URL(databaseUrl("postgresql://u:p%40ss@db.internal:5432/railway?sslmode=require", NAME));
    expect(u.pathname).toBe(`/${NAME}`);
    expect([u.username, u.password, u.host, u.search]).toEqual(["u", "p%40ss", "db.internal:5432", "?sslmode=require"]);
  });

  describe("compareCounts", () => {
    it("passes when the tables match and live has at least the backup's rows", () => {
      const c = compareCounts({ "public.a": 2, "public.b": 0 }, { "public.a": 5, "public.b": 0 });
      expect(c).toMatchObject({ ok: true, tables: 2, backupRows: 2, liveRows: 5, onlyLive: [], onlyBackup: [], fewerLive: [] });
    });

    it("fails on fewer live rows, naming the table", () => {
      const c = compareCounts({ "public.a": 7 }, { "public.a": 6 });
      expect(c.ok).toBe(false);
      expect(c.fewerLive).toEqual([{ table: "public.a", backup: 7, live: 6 }]);
      expect(describeComparison(c)).toContain("MISMATCH: public.a has 6 rows live, 7 in the backup");
    });

    it("fails when a table is only on one side", () => {
      const c = compareCounts({ "public.a": 1, "public.gone": 1 }, { "public.a": 1, "public.new": 0 });
      expect(c.ok).toBe(false);
      expect(c.onlyLive).toEqual(["public.new"]);
      expect(c.onlyBackup).toEqual(["public.gone"]);
    });

    it("lets pg-boss's tables shrink but not disappear", () => {
      expect(compareCounts({ "pgboss.job": 50 }, { "pgboss.job": 1 }).ok).toBe(true);
      expect(compareCounts({ "pgboss.job": 50 }, {}).onlyBackup).toEqual(["pgboss.job"]);
    });
  });

  it("restores into the throwaway database, compares with live and drops it", async () => {
    const { steps, calls } = fakeSteps();
    const r = await runRestoreDrill(steps, NOW);
    expect(r).toMatchObject({ ok: true, database: NAME, dropped: true });
    expect(calls).toEqual(["latest", `create ${NAME}`, `restore ${NAME}`, `counts ${NAME}`, "counts live", `drop ${NAME}`]);
    expect(r.lines.join("\n")).toMatch(/restored backups\/2026-10-19\.sql\.gz/);
  });

  it("fails on a count mismatch and still drops", async () => {
    const { steps, calls } = fakeSteps({}, { live: { "public.sites": 1, "public.users": 2, "pgboss.job": 5 } });
    const r = await runRestoreDrill(steps, NOW);
    expect(r.ok).toBe(false);
    expect(r.lines.some((l) => l.startsWith("MISMATCH: public.sites"))).toBe(true);
    expect(calls.at(-1)).toBe(`drop ${NAME}`);
  });

  it("drops the throwaway database when the restore fails, and reports only the error's first line", async () => {
    const { steps, calls } = fakeSteps({
      restore: async () => {
        throw new Error("psql exited with 3: ERROR: syntax error\nLINE 1: ...");
      },
    });
    const r = await runRestoreDrill(steps, NOW);
    expect(r).toMatchObject({ ok: false, dropped: true });
    expect(r.lines).toContain("FAILED: psql exited with 3: ERROR: syntax error");
    expect(calls.at(-1)).toBe(`drop ${NAME}`);
  });

  it("fails and names the database when the drop fails", async () => {
    const { steps } = fakeSteps({
      dropDatabase: async () => {
        throw new Error("connection lost");
      },
    });
    const r = await runRestoreDrill(steps, NOW);
    expect(r).toMatchObject({ ok: false, dropped: false });
    expect(r.lines.at(-1)).toBe(`FAILED to drop ${NAME} (drop it by hand): connection lost`);
  });

  it("creates nothing (and drops nothing) when there is no backup or the create fails", async () => {
    const none = fakeSteps({ latest: async () => null });
    expect(await runRestoreDrill(none.steps, NOW)).toMatchObject({ ok: false, database: null, lines: ["FAILED: no backup in the bucket"] });
    expect(none.calls).toEqual([]);
    const refused = fakeSteps({
      createDatabase: async () => {
        throw new Error("permission denied to create database");
      },
    });
    const r = await runRestoreDrill(refused.steps, NOW);
    expect(r).toMatchObject({ ok: false, database: null, dropped: false });
    expect(refused.calls.some((c) => c.startsWith("drop"))).toBe(false);
  });
});
