import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MIGRATIONS, Repo, createDb, createQueue, migrate, type Db, type RetentionPolicy } from "../src/index.ts";

/**
 * Version retention (Repo.pruneVersions) on PGlite. Days are local days in Europe/Ljubljana; at the end of
 * September it is UTC+2, so "2026-09-24 00:00" local is 2026-09-23T22:00Z.
 */
let db: Db;
let repo: Repo;
const policy: RetentionPolicy = { keepAllDays: 7, timeZone: "Europe/Ljubljana" };
/** The nightly run: 2026-10-01 03:30 in Ljubljana. Everything from 2026-09-24 00:00 local is kept in full. */
const NOW = new Date("2026-10-01T01:30:00Z");

beforeAll(async () => {
  db = await createDb("pglite://memory");
  await migrate(db);
  repo = new Repo(db);
});
afterAll(async () => {
  await db.close();
});

interface At {
  at: string;
  source?: "generate" | "critique" | "edit" | "manual" | "revert";
  message?: string;
  patch?: unknown;
}

let seq = 0;
/** A site whose versions were saved at the given instants (oldest first); returns its id. */
async function siteWith(versions: At[]): Promise<string> {
  const slug = `ret-${++seq}`;
  const s = await repo.createSite({ name: slug, slug, intake: { description: "x", photoAssetIds: [], scope: "home" } });
  for (const v of versions) {
    const n = await repo.saveSpec(s.id, { specVersion: 1, n: versions.indexOf(v) } as never, v.source ?? "manual", v.message, v.patch);
    await db.query("update spec_versions set created_at = $3 where site_id = $1 and version = $2", [s.id, n, v.at]);
  }
  return s.id;
}
const kept = async (id: string) => (await repo.listVersions(id)).map((v) => v.version).sort((a, b) => a - b);

describe("version retention", () => {
  it("keeps whole local days from the boundary day on, and only the last version of older days", async () => {
    const id = await siteWith([
      { at: "2026-09-20T08:00:00Z", source: "generate" }, // v1  09-20 10:00 local
      { at: "2026-09-20T08:05:00Z" }, //                     v2  09-20 10:05
      { at: "2026-09-20T15:00:00Z" }, //                     v3  09-20 17:00 (last of 09-20)
      { at: "2026-09-23T08:00:00Z" }, //                     v4  09-23 10:00
      { at: "2026-09-23T21:59:59Z" }, //                     v5  09-23 23:59:59, last before the boundary
      { at: "2026-09-23T22:00:00Z" }, //                     v6  09-24 00:00:00 local, first kept in full
      { at: "2026-09-23T23:30:00Z" }, //                     v7  09-24 01:30 local (09-23 in UTC)
      { at: "2026-09-24T06:00:00Z" }, //                     v8  09-24 08:00
      { at: "2026-09-30T19:00:00Z" }, //                     v9  09-30 21:00
      { at: "2026-10-01T01:00:00Z" }, //                     v10 10-01 03:00 (today, current)
    ]);
    const removed = await repo.pruneVersions(id, policy, NOW);
    expect(removed.map((r) => r.version)).toEqual([1, 2, 4]);
    expect(removed.every((r) => r.bytes > 0)).toBe(true);
    expect(await kept(id)).toEqual([3, 5, 6, 7, 8, 9, 10]);
  });

  it("follows keepAllDays from config: one day more kept in full keeps 09-23 too", async () => {
    const id = await siteWith([{ at: "2026-09-23T08:00:00Z" }, { at: "2026-09-23T10:00:00Z" }, { at: "2026-10-01T01:00:00Z" }]);
    expect(await repo.pruneVersions(id, { ...policy, keepAllDays: 8 }, NOW)).toEqual([]);
    expect((await repo.pruneVersions(id, policy, NOW)).map((r) => r.version)).toEqual([1]);
  });

  it("keeps every version that was ever published, not only the live one", async () => {
    const id = await siteWith([
      { at: "2026-09-10T08:00:00Z", source: "generate" }, // v1
      { at: "2026-09-10T08:10:00Z" }, //                     v2 published first
      { at: "2026-09-10T08:20:00Z" }, //                     v3
      { at: "2026-09-12T08:00:00Z" }, //                     v4 published now
      { at: "2026-09-12T08:10:00Z" }, //                     v5
      { at: "2026-09-12T08:20:00Z" }, //                     v6
      { at: "2026-09-30T08:00:00Z" }, //                     v7
    ]);
    await repo.markPublished(id, 2, "v2-a");
    await repo.markPublished(id, 4, "v4-b");
    expect((await repo.pruneVersions(id, policy, NOW)).map((r) => r.version)).toEqual([1, 5]);
    expect(await kept(id)).toEqual([2, 3, 4, 6, 7]);
    // The list marks them; the live one is the site's published_version.
    const list = await repo.listVersions(id);
    expect(list.filter((v) => v.published).map((v) => v.version)).toEqual([4, 2]);
    expect((await repo.getSite(id))?.published_version).toBe(4);
    expect(await repo.getSpec(id, 4)).not.toBeNull();
  });

  it("keeps the current version, also when a site has not been touched for weeks", async () => {
    const id = await siteWith([
      { at: "2026-09-01T08:00:00Z", source: "generate" },
      { at: "2026-09-01T08:01:00Z", source: "critique" },
      { at: "2026-09-01T09:00:00Z" },
      { at: "2026-09-01T09:01:00Z" },
    ]);
    expect((await repo.pruneVersions(id, policy, NOW)).map((r) => r.version)).toEqual([1, 2, 3]);
    expect(await kept(id)).toEqual([4]);
    expect((await repo.getSpec(id))?.version).toBe(4);
    // Even if the current version were not the newest of its day (saves always make it the newest), it stays.
    const other = await siteWith([{ at: "2026-09-01T08:00:00Z" }, { at: "2026-09-01T08:01:00Z" }, { at: "2026-09-01T08:02:00Z" }]);
    await db.query("update sites set current_version = 2 where id = $1", [other]);
    expect((await repo.pruneVersions(other, policy, NOW)).map((r) => r.version)).toEqual([1]);
    expect(await kept(other)).toEqual([2, 3]);
  });

  it("keeps the version an \"Ustvari znova\" replaced forever, also when the regeneration was the same day (sb-keep-replaced)", async () => {
    const id = await siteWith([
      { at: "2026-09-10T08:00:00Z", source: "generate" }, // v1  first generation (replaces nothing)
      { at: "2026-09-10T08:01:00Z", source: "critique" }, // v2
      { at: "2026-09-10T09:00:00Z" }, //                     v3
      { at: "2026-09-10T09:30:00Z" }, //                     v4  the owner's last edit, replaced the same day
      { at: "2026-09-10T10:00:00Z", source: "generate" }, // v5  "Ustvari znova"
      { at: "2026-09-10T10:01:00Z", source: "critique" }, // v6  last of 09-10
      { at: "2026-09-30T08:00:00Z" }, //                     v7  current
    ]);
    const rows = await db.query<{ version: number; keep_reason: string | null }>("select version, keep_reason from spec_versions where site_id = $1 order by version", [id]);
    expect(rows.rows.filter((r) => r.keep_reason === "replaced").map((r) => Number(r.version))).toEqual([4]);
    // 20 days later v4 is not the last of its day, yet it stays; the rest of the day goes as before.
    expect((await repo.pruneVersions(id, policy, NOW)).map((r) => r.version)).toEqual([1, 2, 3, 5]);
    expect(await kept(id)).toEqual([4, 6, 7]);
    // A year on, still there.
    expect((await repo.pruneVersions(id, policy, new Date("2027-10-01T01:30:00Z"))).map((r) => r.version)).toEqual([]);
    expect(await repo.getSpec(id, 4)).not.toBeNull();
  });

  it("a stale generate save (version conflict) marks nothing", async () => {
    const id = await siteWith([{ at: "2026-09-10T08:00:00Z" }, { at: "2026-09-10T08:01:00Z" }]);
    await expect(repo.saveSpec(id, { specVersion: 1 } as never, "generate", undefined, undefined, 1)).rejects.toThrow();
    const { rows } = await db.query<{ n: number | string }>("select count(*) as n from spec_versions where site_id = $1 and keep_reason is not null", [id]);
    expect(Number(rows[0]!.n)).toBe(0);
  });

  it("is idempotent: a second run the same night, or later that day, removes nothing", async () => {
    const id = await siteWith([{ at: "2026-09-15T08:00:00Z" }, { at: "2026-09-15T08:01:00Z" }, { at: "2026-09-15T08:02:00Z" }, { at: "2026-09-29T08:00:00Z" }]);
    expect((await repo.pruneVersions(id, policy, NOW)).map((r) => r.version)).toEqual([1, 2]);
    const after = await kept(id);
    expect(await repo.pruneVersions(id, policy, NOW)).toEqual([]);
    expect(await repo.pruneVersions(id, policy, new Date("2026-10-01T20:00:00Z"))).toEqual([]);
    expect(await kept(id)).toEqual(after);
    // Numbers are never reused: the next save is one above the current.
    expect(await repo.saveSpec(id, { specVersion: 1 } as never, "manual")).toBe(5);
  });

  it("prunes one site at a time; other sites keep everything", async () => {
    const days = [{ at: "2026-09-15T08:00:00Z" }, { at: "2026-09-15T08:01:00Z" }, { at: "2026-09-15T08:02:00Z" }, { at: "2026-09-30T08:00:00Z" }];
    const a = await siteWith(days);
    const b = await siteWith(days);
    expect(await repo.sitesWithVersionsBefore(new Date("2026-09-25T00:00:00Z"))).toEqual(expect.arrayContaining([a, b]));
    expect((await repo.pruneVersions(a, policy, NOW)).map((r) => r.version)).toEqual([1, 2]);
    expect(await kept(a)).toEqual([3, 4]);
    expect(await kept(b)).toEqual([1, 2, 3, 4]);
    expect((await repo.pruneVersions(b, policy, NOW)).map((r) => r.version)).toEqual([1, 2]);
    expect(await kept(b)).toEqual([3, 4]);
  });

  it("keeps the text typed in pruned versions for the fact check (manualPatches)", async () => {
    const typed = (value: string) => [{ op: "replace", path: "/business/phone", value }];
    const id = await siteWith([
      { at: "2026-09-15T08:00:00Z", source: "generate" },
      { at: "2026-09-15T08:01:00Z", message: "podatki", patch: typed("041 111 222") },
      { at: "2026-09-15T08:02:00Z", message: "podatki", patch: typed("041 333 444") },
      { at: "2026-09-15T08:03:00Z", source: "edit", message: "Temnejša glava" },
      { at: "2026-09-29T08:00:00Z", message: "podatki", patch: typed("041 555 666") },
    ]);
    const before = await repo.manualPatches(id);
    expect((await repo.pruneVersions(id, policy, NOW)).map((r) => r.version)).toEqual([1, 2, 3]);
    expect(await repo.manualPatches(id)).toEqual(before);
    expect(before).toHaveLength(3);
    // A second run doesn't archive twice.
    await repo.pruneVersions(id, policy, NOW);
    expect(await repo.manualPatches(id)).toEqual(before);
  });

  it("returns what each removed version referenced, so files only they used can go", async () => {
    const s = await repo.createSite({ name: "a", slug: "ret-assets", intake: { description: "x", photoAssetIds: [], scope: "home" } });
    const spec = (src: string) => ({ specVersion: 3, assets: { images: [{ id: "img_01", src, width: 400, height: 300, alt: "" }] } }) as never;
    await repo.saveSpec(s.id, spec("sites/x/uploads/a.jpg"), "manual");
    await repo.saveSpec(s.id, spec("sites/x/uploads/b.jpg"), "manual");
    await db.query("update spec_versions set created_at = '2026-09-01T08:00:00Z' where site_id = $1", [s.id]);
    const removed = await repo.pruneVersions(s.id, policy, NOW);
    expect(removed).toMatchObject([{ version: 1, assets: { images: [{ id: "img_01", src: "sites/x/uploads/a.jpg" }] } }]);
    expect(await repo.versionAssets(s.id)).toMatchObject([{ version: 2, assets: { images: [{ src: "sites/x/uploads/b.jpg" }] } }]);
  });

  it("nearestVersion finds the highest kept version at or below a number", async () => {
    const id = await siteWith([{ at: "2026-09-15T08:00:00Z" }, { at: "2026-09-15T08:01:00Z" }, { at: "2026-09-15T08:02:00Z" }, { at: "2026-09-30T08:00:00Z" }]);
    await repo.pruneVersions(id, policy, NOW);
    expect(await repo.nearestVersion(id, 4)).toBe(4);
    expect(await repo.nearestVersion(id, 2)).toBeNull();
    expect(await repo.nearestVersion(id, 3)).toBe(3);
    expect(await repo.nearestVersion(id, 99)).toBe(4);
  });
});

describe("migration 4 (version retention)", () => {
  it("backfills every earlier publish from the publish log and the live version", async () => {
    const old = await createDb("pglite://memory");
    try {
      // The database as it was before migration 4.
      await old.query("create table schema_migrations (id integer primary key, name text not null, applied_at timestamptz not null default now())");
      for (const m of MIGRATIONS.filter((m) => m.id < 4)) {
        for (const stmt of m.sql.split(/;\s*\n/).map((s) => s.trim().replace(/;$/, "")).filter(Boolean)) await old.query(stmt);
        await old.query("insert into schema_migrations (id, name) values ($1, $2)", [m.id, m.name]);
      }
      await old.query("insert into sites (id, slug, name, published_version, published_at) values ('site_a', 'a', 'A', 7, now()), ('site_b', 'b', 'B', 3, now())");
      await old.query(
        `insert into site_events (site_id, stage, message) values
           ('site_a', 'publish', 'Published version 2'), ('site_a', 'publish', 'Published version 7'),
           ('site_a', 'publish', 'Cannot publish: 2 blocking issue(s)'), ('site_a', 'edit', 'Published version 5')`,
      );
      // Migration 4 and every later one run.
      expect(await migrate(old)).toEqual(MIGRATIONS.filter((m) => m.id >= 4).map((m) => m.id));
      const { rows } = await old.query<{ site_id: string; version: number }>("select site_id, version from site_publishes order by site_id, version");
      expect(rows).toEqual([
        { site_id: "site_a", version: 2 },
        { site_id: "site_a", version: 7 },
        { site_id: "site_b", version: 3 },
      ]);
    } finally {
      await old.close();
    }
  });
});

describe("migration 8 (spec_versions.keep_reason)", () => {
  it("marks every existing version that a generation replaced", async () => {
    const old = await createDb("pglite://memory");
    try {
      await old.query("create table schema_migrations (id integer primary key, name text not null, applied_at timestamptz not null default now())");
      for (const m of MIGRATIONS.filter((m) => m.id < 8)) {
        for (const stmt of m.sql.split(/;\s*\n/).map((s) => s.trim().replace(/;$/, "")).filter(Boolean)) await old.query(stmt);
        await old.query("insert into schema_migrations (id, name) values ($1, $2)", [m.id, m.name]);
      }
      await old.query("insert into sites (id, slug, name, current_version) values ('site_a', 'a', 'A', 6), ('site_b', 'b', 'B', 1)");
      // site_a: v3 and v6 are regenerations (replacing v2 and v5); v1 and site_b's v1 are first generations.
      await old.query(
        `insert into spec_versions (site_id, version, spec, source) values
           ('site_a', 1, '{}', 'generate'), ('site_a', 2, '{}', 'manual'), ('site_a', 3, '{}', 'generate'),
           ('site_a', 4, '{}', 'critique'), ('site_a', 5, '{}', 'manual'), ('site_a', 6, '{}', 'generate'),
           ('site_b', 1, '{}', 'generate')`,
      );
      expect(await migrate(old)).toEqual(MIGRATIONS.filter((m) => m.id >= 8).map((m) => m.id));
      const { rows } = await old.query<{ site_id: string; version: number }>("select site_id, version from spec_versions where keep_reason = 'replaced' order by site_id, version");
      expect(rows.map((r) => [r.site_id, Number(r.version)])).toEqual([
        ["site_a", 2],
        ["site_a", 5],
      ]);
    } finally {
      await old.close();
    }
  });
});

describe("nightly schedule (pg-boss on PGlite)", () => {
  it("stores the prune schedule with its time zone; registering again keeps one", async () => {
    const queue = await createQueue(db, "pglite://memory");
    try {
      await queue.schedule!("prune", "30 3 * * *", {}, { tz: "Europe/Ljubljana" });
      await queue.schedule!("prune", "30 3 * * *", {}, { tz: "Europe/Ljubljana" });
      const { rows } = await db.query<{ name: string; cron: string; timezone: string; options: unknown }>("select name, cron, timezone, options from pgboss.schedule");
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ name: "prune", cron: "30 3 * * *", timezone: "Europe/Ljubljana" });
      // A night missed during a deploy runs once when the worker is back.
      const options = typeof rows[0]!.options === "string" ? JSON.parse(rows[0]!.options) : rows[0]!.options;
      expect(options).toMatchObject({ missed: "once" });
    } finally {
      await queue.stop();
    }
  }, 30_000);
});
