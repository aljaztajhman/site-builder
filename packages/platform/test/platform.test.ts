import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { SPEC_VERSION } from "@sb/spec";
import { MIGRATIONS, createDb, createFsStorage, createQueue, migrate, Repo, type Db } from "../src/index.ts";

let db: Db;
let repo: Repo;

beforeAll(async () => {
  db = await createDb("pglite://memory");
  await migrate(db);
  repo = new Repo(db);
});
afterAll(async () => {
  await db.close();
});

describe("migrations", () => {
  it("are idempotent", async () => {
    expect(await migrate(db)).toEqual([]);
  });

  it("heal a database that ran a branch's migration under the number a merge gave to another (Railway PR environments)", async () => {
    const old = await createDb("pglite://memory");
    try {
      // Before the merge with main this branch's "accounts" was migration 4; main's 4 is "version retention".
      await old.query("create table schema_migrations (id integer primary key, name text not null, applied_at timestamptz not null default now())");
      const byName = (name: string) => MIGRATIONS.find((m) => m.name === name)!;
      const run = async (m: (typeof MIGRATIONS)[number], id: number) => {
        for (const stmt of m.sql.split(/;\s*\n/).map((s) => s.trim().replace(/;$/, "")).filter(Boolean)) await old.query(stmt);
        await old.query("insert into schema_migrations (id, name) values ($1, $2)", [id, m.name]);
      };
      for (const m of MIGRATIONS.filter((m) => m.id < 4)) await run(m, m.id);
      await run(byName("accounts"), 4);
      // This PR's environment also ran "generation_limits" as 5 (now 6; 5 is "accounts").
      await run(byName("generation_limits"), 5);
      // Runs main's 4 (its table didn't exist) and anything newer, doesn't run "accounts" or "generation_limits" again, moves their records.
      const ran = await migrate(old);
      // Migrations added after these branches (id > 6) run as usual.
      expect(ran).toEqual([byName("version retention").id, ...MIGRATIONS.filter((m) => m.id > 6).map((m) => m.id)]);
      const { rows } = await old.query<{ id: number; name: string }>("select id, name from schema_migrations order by id");
      expect(rows.map((r) => [Number(r.id), r.name])).toEqual(MIGRATIONS.map((m) => [m.id, m.name]));
      expect((await old.query("select to_regclass('site_publishes') as t")).rows[0]).toEqual({ t: "site_publishes" });
      // And it stays settled.
      expect(await migrate(old)).toEqual([]);
    } finally {
      await old.close();
    }
  });

  it("have unique, increasing ids and unique names", () => {
    const ids = MIGRATIONS.map((m) => m.id);
    expect(ids).toEqual([...new Set(ids)].sort((a, b) => a - b));
    expect(new Set(MIGRATIONS.map((m) => m.name)).size).toBe(MIGRATIONS.length);
  });
});

describe("repo", () => {
  it("stores sites, spec versions, events, chat and model spend", async () => {
    const slug = await repo.uniqueSlug("salon-lipa");
    const site = await repo.createSite({ name: "Salon Lipa", slug, intake: { description: "x", photoAssetIds: [], scope: "home" } });
    expect(site.status).toBe("new");
    expect(await repo.uniqueSlug("salon-lipa")).toBe("salon-lipa-2");

    const v1 = await repo.saveSpec(site.id, { specVersion: 1 } as never, "generate");
    const v2 = await repo.saveSpec(site.id, { specVersion: 1, slug: "b" } as never, "edit", "temnejša glava");
    expect([v1, v2]).toEqual([1, 2]);
    expect((await repo.getSpec(site.id))?.version).toBe(2);
    // Stored at v1, read back migrated to the current version.
    expect((await repo.getSpec(site.id, 1))?.spec).toEqual({ specVersion: SPEC_VERSION });

    await repo.addEvent({ siteId: site.id, stage: "brief", message: "ok" });
    expect((await repo.listEvents(site.id)).map((e) => e.stage)).toEqual(["brief"]);

    const msg = await repo.addChat(site.id, "user", "dodaj pogosta vprašanja");
    expect((await repo.getChat(Number(msg.id)))?.content).toBe("dodaj pogosta vprašanja");

    await repo.logModelCall({
      siteId: site.id,
      jobId: null,
      stage: "brief",
      model: "claude-sonnet-5-5",
      inputTokens: 1000,
      outputTokens: 500,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      costEur: 0.0123,
      durationMs: 900,
      ok: true,
    });
    expect(await repo.spendToday()).toBeCloseTo(0.0123, 6);
    const cost = await repo.siteCost(site.id);
    expect(cost[0]).toMatchObject({ stage: "brief", calls: 1, input: 1000, output: 500 });
  });
});

describe("queue (pg-boss on PGlite)", () => {
  it("delivers a job to a worker", async () => {
    const queue = await createQueue(db, "pglite://memory");
    const got = new Promise<unknown>((resolve) => {
      void queue.work("alt", async (data) => resolve(data));
    });
    await queue.send("alt", { siteId: "site_x", imageIds: ["img_01"] });
    expect(await got).toEqual({ siteId: "site_x", imageIds: ["img_01"] });
    await queue.stop();
  }, 30_000);

  it("brings an existing queue's options back to no retries (billed jobs never retry)", async () => {
    await (await createQueue(db, "pglite://memory")).stop();
    await db.query("update pgboss.queue set retry_limit = 3 where name = 'edit'");
    const queue = await createQueue(db, "pglite://memory");
    const { rows } = await db.query<{ retry_limit: number }>("select retry_limit from pgboss.queue where name = 'edit'");
    expect(rows[0]?.retry_limit).toBe(0);
    await queue.stop();
  }, 30_000);

  it("marks only sites without a waiting or running job as interrupted", async () => {
    const queue = await createQueue(db, "pglite://memory");
    const waiting = await repo.createSite({ name: "W", slug: "cakajoca", intake: { description: "x", photoAssetIds: [], scope: "home" } });
    const dead = await repo.createSite({ name: "D", slug: "prekinjena", intake: { description: "x", photoAssetIds: [], scope: "home" } });
    await repo.setStatus(waiting.id, "generating");
    await repo.setStatus(dead.id, "generating");
    // Queued behind other work (no worker for this queue in the tests): still live.
    await queue.send("alt", { siteId: waiting.id, imageIds: [] });
    const failed = await repo.failInterrupted(0);
    expect(failed).toContain(dead.id);
    expect(failed).not.toContain(waiting.id);
    expect((await repo.getSite(waiting.id))?.status).toBe("generating");
    await queue.stop();
  }, 30_000);

  it("runs jobs in parallel with concurrency 2", async () => {
    const queue = await createQueue(db, "pglite://memory");
    let running = 0;
    let peak = 0;
    let done = 0;
    const finished = new Promise<void>((resolve) => {
      void queue.work(
        "generate",
        async () => {
          peak = Math.max(peak, ++running);
          await new Promise((r) => setTimeout(r, 1500));
          running--;
          if (++done === 2) resolve();
        },
        { concurrency: 2 },
      );
    });
    await queue.send("generate", { siteId: "site_a", scope: "home" });
    await queue.send("generate", { siteId: "site_b", scope: "home" });
    await finished;
    expect(peak).toBe(2);
    await queue.stop();
  }, 30_000);
});

describe("fs storage", () => {
  it("puts, gets, lists and deletes by prefix", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sb-storage-"));
    const s = createFsStorage(dir);
    await s.put("sites/a/one.txt", new TextEncoder().encode("1"), "text/plain");
    await s.put("sites/a/sub/two.txt", new TextEncoder().encode("2"), "text/plain");
    expect(new TextDecoder().decode((await s.get("sites/a/one.txt"))!)).toBe("1");
    expect(await s.get("missing")).toBeNull();
    expect(await s.list("sites/a/")).toEqual(["sites/a/one.txt", "sites/a/sub/two.txt"]);
    await s.put("sites/b/keep.txt", new TextEncoder().encode("3"), "text/plain");
    await s.deletePrefix("sites/a/");
    expect(await s.list("sites/")).toEqual(["sites/b/keep.txt"]);
    // No empty folders left behind, and nothing outside the prefix touched.
    expect(await readdir(path.join(dir, "sites"))).toEqual(["b"]);
    // Writes land whole (temporary file, then rename) and the temporary file never lists.
    await s.put("sites/b/keep.txt", new TextEncoder().encode("4"), "text/plain");
    expect(await readdir(path.join(dir, "sites", "b"))).toEqual(["keep.txt"]);
    expect(new TextDecoder().decode((await s.get("sites/b/keep.txt"))!)).toBe("4");
    await expect(s.put("../escape.txt", new Uint8Array(), "text/plain")).rejects.toThrow();
    await rm(dir, { recursive: true, force: true });
  });
});

describe("spec versions", () => {
  it("compare-and-swap: a save based on a stale version is refused", async () => {
    const { VersionConflictError } = await import("../src/index.ts");
    const site = await repo.createSite({ name: "x", slug: await repo.uniqueSlug("cas"), intake: { description: "x", photoAssetIds: [], scope: "home" } });
    expect(await repo.saveSpec(site.id, { specVersion: 1 } as never, "generate")).toBe(1);
    expect(await repo.saveSpec(site.id, { specVersion: 1 } as never, "manual", "a", undefined, 1)).toBe(2);
    await expect(repo.saveSpec(site.id, { specVersion: 1 } as never, "edit", "stale", undefined, 1)).rejects.toBeInstanceOf(VersionConflictError);
    expect((await repo.getSpec(site.id))?.version).toBe(2);
  });

  it("marks interrupted jobs as failed", async () => {
    const site = await repo.createSite({ name: "x", slug: await repo.uniqueSlug("stuck"), intake: { description: "x", photoAssetIds: [], scope: "home" } });
    await repo.setStatus(site.id, "generating");
    expect(await repo.failInterrupted(0)).toContain(site.id);
    expect((await repo.getSite(site.id))?.status).toBe("failed");
  });
});
