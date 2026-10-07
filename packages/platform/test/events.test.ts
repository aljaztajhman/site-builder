import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "@sb/config";
import { MIGRATIONS, Repo, createDb, engineSummary, median, migrate, recordEvent, type Db, type GenerationProps, type ProductEvents } from "../src/index.ts";

/**
 * Product events (docs/plans/analytics.md Steps 1 and 3) against real Postgres (PGlite): the migration, the
 * once-per-window writes, retention with its daily roll-up, the funnel's conversions and medians, and the
 * engine summary. The web and worker tests check that each step writes its event.
 */
let db: Db;
let events: ProductEvents;

beforeAll(async () => {
  db = await createDb("pglite://memory");
  await migrate(db);
  events = new Repo(db).events;
});
afterAll(async () => {
  await db.close();
});
beforeEach(async () => {
  await db.query("delete from product_events");
  await db.query("delete from product_events_daily");
});

/** Moves the newest row of a kind `minutes` into the past. */
const ago = async (kind: string, minutes: number) =>
  db.query("update product_events set at = now() - make_interval(mins => $2) where id = (select max(id) from product_events where kind = $1)", [kind, minutes]);

describe("migration product_events", () => {
  it("creates both tables, and running migrations again changes nothing", async () => {
    const m = MIGRATIONS.find((x) => x.name === "product_events");
    expect(m).toBeDefined();
    const fresh = await createDb("pglite://memory");
    try {
      const ran = await migrate(fresh);
      expect(ran).toContain(m!.id);
      expect(await migrate(fresh)).toEqual([]);
      const { rows } = await fresh.query<{ table_name: string; column_name: string }>(
        "select table_name, column_name from information_schema.columns where table_name in ('product_events', 'product_events_daily') order by table_name, ordinal_position",
      );
      expect(rows.filter((r) => r.table_name === "product_events").map((r) => r.column_name)).toEqual(["id", "at", "kind", "site_id", "account_id", "device_key", "tier", "plan", "source", "props"]);
      expect(rows.filter((r) => r.table_name === "product_events_daily").map((r) => r.column_name)).toEqual(["day", "kind", "tier", "plan", "source", "n"]);
    } finally {
      await fresh.close();
    }
  });
});

describe("writing events", () => {
  it("writes a row with its ids and props, and refuses an unknown kind", async () => {
    expect(await events.add({ kind: "intake_submitted", siteId: "site_1", deviceKey: "dk1", tier: "anonymous", props: { scope: "home", photos: 2 } })).toBe(true);
    const [row] = await events.list();
    expect(row).toMatchObject({ kind: "intake_submitted", site_id: "site_1", device_key: "dk1", tier: "anonymous", account_id: null, props: { scope: "home", photos: 2 } });
    await expect(events.add({ kind: "nope" as never })).rejects.toThrow(/unknown event/);
  });

  it("writes a once-per-window event only once per device (and site, and where) inside the window", async () => {
    expect(await events.add({ kind: "landing_view", deviceKey: "dk1" }, { onceMinutes: 30 })).toBe(true);
    expect(await events.add({ kind: "landing_view", deviceKey: "dk1" }, { onceMinutes: 30 })).toBe(false);
    expect(await events.add({ kind: "landing_view", deviceKey: "dk2" }, { onceMinutes: 30 })).toBe(true);
    await ago("landing_view", 31);
    await db.query("update product_events set at = now() - interval '31 minutes' where device_key = 'dk1'");
    expect(await events.add({ kind: "landing_view", deviceKey: "dk1" }, { onceMinutes: 30 })).toBe(true);
    // Per site and per where.
    expect(await events.add({ kind: "upsell_shown", deviceKey: "dk1", siteId: "a", props: { where: "locked_pages" } }, { onceMinutes: 60 })).toBe(true);
    expect(await events.add({ kind: "upsell_shown", deviceKey: "dk1", siteId: "b", props: { where: "locked_pages" } }, { onceMinutes: 60 })).toBe(true);
    expect(await events.add({ kind: "upsell_shown", deviceKey: "dk1", siteId: "a", props: { where: "limit" } }, { onceMinutes: 60 })).toBe(true);
    expect(await events.add({ kind: "upsell_shown", deviceKey: "dk1", siteId: "a", props: { where: "locked_pages" } }, { onceMinutes: 60 })).toBe(false);
    expect((await events.list({ kind: "landing_view" })).length).toBe(3);
    expect((await events.list({ kind: "upsell_shown" })).length).toBe(3);
  });

  it("recordEvent writes nothing with analytics.events off, and a failed write never throws", async () => {
    const config = loadConfig();
    await recordEvent(events, { analytics: { ...config.analytics, events: false } }, { kind: "published", siteId: "s" });
    expect(await events.list()).toEqual([]);
    await recordEvent(events, { analytics: { ...config.analytics, events: true } }, { kind: "published", siteId: "s" });
    expect((await events.list()).map((e) => e.kind)).toEqual(["published"]);
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(recordEvent({ add: () => Promise.reject(new Error("db down")) }, { analytics: { ...config.analytics, events: true } }, { kind: "published" })).resolves.toBeUndefined();
    expect(err).toHaveBeenCalledWith(expect.stringContaining("published not written"), "db down");
    err.mockRestore();
  });
});

describe("retention", () => {
  it("rolls rows past keepDays into daily counts once, keeps newer rows raw, and daily() adds both", async () => {
    for (let i = 0; i < 3; i++) await events.add({ kind: "intake_submitted", tier: "anonymous" });
    await events.add({ kind: "intake_submitted", tier: "paid", plan: "standard", source: "letak" });
    await events.add({ kind: "published", tier: "paid" });
    await events.add({ kind: "intake_submitted", tier: "anonymous" }); // stays raw
    // 100 days old: past the 90 days kept.
    await db.query("update product_events set at = now() - interval '100 days' where id not in (select max(id) from product_events)");
    const r = await events.rollUp(90);
    expect(r).toEqual({ rolled: 5, days: 1 });
    expect((await events.list()).length).toBe(1);
    const { rows } = await db.query<{ kind: string; tier: string; plan: string; source: string; n: number }>("select kind, tier, plan, source, n from product_events_daily order by kind, tier");
    expect(rows).toEqual([
      { kind: "intake_submitted", tier: "anonymous", plan: "", source: "", n: 3 },
      { kind: "intake_submitted", tier: "paid", plan: "standard", source: "letak", n: 1 },
      { kind: "published", tier: "paid", plan: "", source: "", n: 1 },
    ]);
    // Again: nothing more to roll, the counts don't double.
    expect(await events.rollUp(90)).toEqual({ rolled: 0, days: 0 });
    const { rows: again } = await db.query<{ n: number }>("select sum(n)::int as n from product_events_daily");
    expect(again[0]!.n).toBe(5);
    // A later roll-up of the same day adds to it.
    await events.add({ kind: "published", tier: "paid" });
    await db.query("update product_events set at = now() - interval '100 days' where kind = 'published'");
    await events.rollUp(90);
    const { rows: pub } = await db.query<{ n: number }>("select n from product_events_daily where kind = 'published'");
    expect(pub[0]!.n).toBe(2);
    // The daily series: the rolled-up day and today's raw row.
    const series = await events.daily("intake_submitted", new Date(Date.now() - 120 * 86400_000));
    expect(series.map((d) => d.n)).toEqual([4, 1]);
  });
});

describe("the funnel", () => {
  it("counts each step, the share that reached the next one after it, and the median time between", async () => {
    // Three devices see the landing page; two submit a description (one 60 s, one 180 s later).
    for (const d of ["d1", "d2", "d3"]) await events.add({ kind: "landing_view", deviceKey: d });
    await db.query("update product_events set at = now() - interval '1 hour'");
    await events.add({ kind: "intake_submitted", deviceKey: "d1", siteId: "s1" });
    await db.query("update product_events set at = now() - interval '1 hour' + interval '60 seconds' where kind = 'intake_submitted' and device_key = 'd1'");
    await events.add({ kind: "intake_submitted", deviceKey: "d2", siteId: "s2" });
    await db.query("update product_events set at = now() - interval '1 hour' + interval '180 seconds' where kind = 'intake_submitted' and device_key = 'd2'");
    // One preview ready (by site), opened; the visitor signs in on that device; the account claims it.
    await events.add({ kind: "preview_ready", siteId: "s1", tier: "anonymous", props: { seconds: 40, eur: 0.2 } });
    await events.add({ kind: "preview_opened", siteId: "s1", deviceKey: "d1" });
    await events.add({ kind: "signin_done", deviceKey: "d1", accountId: "acc1" });
    await events.add({ kind: "preview_claimed", accountId: "acc1", siteId: "s1" });
    // A landing view a device had only after its intake doesn't count as reaching it.
    await events.add({ kind: "landing_view", deviceKey: "d9" });
    await events.add({ kind: "intake_submitted", deviceKey: "d9" });
    await db.query("update product_events set at = now() - interval '2 hours' where kind = 'intake_submitted' and device_key = 'd9'");
    // Older than the window: not counted.
    await events.add({ kind: "landing_view", deviceKey: "old" });
    await db.query("update product_events set at = now() - interval '9 days' where device_key = 'old'");

    const f = await events.funnel(new Date(Date.now() - 7 * 86400_000));
    const step = (k: string) => f.find((s) => s.kind === k)!;
    expect(f.map((s) => s.kind)).toEqual(["landing_view", "intake_submitted", "preview_ready", "preview_opened", "signin_done", "preview_claimed", "plan_changed", "site_generated", "published"]);
    expect(step("landing_view")).toMatchObject({ events: 4, from: 4, reached: 2 });
    // Median of 60 s and 180 s.
    expect(step("landing_view").medianSeconds).toBeCloseTo(120, 0);
    expect(step("intake_submitted")).toMatchObject({ events: 3, from: 2, reached: 1 });
    expect(step("preview_ready")).toMatchObject({ events: 1, from: 1, reached: 1 });
    expect(step("preview_opened")).toMatchObject({ from: 1, reached: 1 });
    expect(step("signin_done")).toMatchObject({ from: 1, reached: 1 });
    expect(step("preview_claimed")).toMatchObject({ from: 1, reached: 0, medianSeconds: null });
    expect(step("published")).toMatchObject({ events: 0, from: null, reached: null });
  });

  it("counts by a props field and takes medians per tier", async () => {
    await events.add({ kind: "intake_refused", props: { reason: "too_short" } });
    await events.add({ kind: "intake_refused", props: { reason: "too_short" } });
    await events.add({ kind: "intake_refused", props: { reason: "junk_intake" } });
    expect(await events.countBy("intake_refused", "reason", new Date(Date.now() - 86400_000))).toEqual([
      { value: "too_short", n: 2 },
      { value: "junk_intake", n: 1 },
    ]);
    await expect(events.countBy("intake_refused", "x'; drop", new Date())).rejects.toThrow(/bad field/);
    for (const [s, e] of [[30, 0.1], [50, 0.3], [40, 0.2]] as const) await events.add({ kind: "preview_ready", tier: "anonymous", props: { seconds: s, eur: e } });
    await events.add({ kind: "preview_ready", tier: "paid", props: { seconds: 90, eur: 0.5 } });
    const m = await events.medianByTier("preview_ready", new Date(Date.now() - 86400_000));
    expect(m).toEqual([
      { tier: "anonymous", n: 3, seconds: 40, eur: 0.2 },
      { tier: "paid", n: 1, seconds: 90, eur: 0.5 },
    ]);
  });
});

describe("the engine summary", () => {
  const job = (p: Partial<GenerationProps>, siteId = "s") => ({
    at: new Date().toISOString(),
    site_id: siteId,
    tier: "anonymous",
    props: {
      scope: "home",
      outcome: "done",
      seconds: 60,
      firstVersionSeconds: 30,
      eur: 0.2,
      stages: { brief: { seconds: 10, eur: 0.05 }, content: { seconds: 20, eur: 0.1 } },
      failedStage: null,
      error: null,
      checksFailed: [],
      lighthouse: null,
      critique: { rounds: 1, issues: [2] },
      pictures: 0,
      retries: 0,
      caps: { spend: false, pictures: false },
      direction: "warm",
      hero: "hero-split:left",
      ...p,
    } as Record<string, unknown>,
  });

  it("gives medians per stage, failures by stage, failed checks, cap hits and the slowest jobs", () => {
    const s = engineSummary([
      job({ seconds: 50 }, "a"),
      job({ seconds: 300, eur: 0.6, retries: 2, pictures: 2, checksFailed: ["axe:color-contrast", "scroll-360"], stages: { brief: { seconds: 30, eur: 0.1 }, content: { seconds: 200, eur: 0.4 }, imageGen: { seconds: 20, eur: 0.1 } } }, "b"),
      job({ outcome: "failed", failedStage: "content", seconds: 120, firstVersionSeconds: null, checksFailed: ["axe:color-contrast"], caps: { spend: true, pictures: false }, direction: "bold" }, "c"),
      job({ outcome: "refused", seconds: 5, stages: {}, caps: { spend: false, pictures: true } }, "d"),
    ]);
    expect(s.jobs).toBe(4);
    expect(s.outcomes).toEqual({ done: 2, failed: 1, refused: 1 });
    expect(s.medianSeconds).toBe(85);
    expect(s.medianFirstVersionSeconds).toBe(30);
    expect(s.stages.map((x) => x.stage)).toEqual(["brief", "imageGen", "content"]);
    expect(s.stages.find((x) => x.stage === "content")).toEqual({ stage: "content", jobs: 3, seconds: 20, eur: 0.1 });
    expect(s.stages.find((x) => x.stage === "imageGen")).toEqual({ stage: "imageGen", jobs: 1, seconds: 20, eur: 0.1 });
    expect(s.failuresByStage).toEqual([{ stage: "content", n: 1 }]);
    expect(s.checksFailed).toEqual([{ check: "axe:color-contrast", n: 2 }, { check: "scroll-360", n: 1 }]);
    expect(s.capHits).toEqual({ spend: 1, pictures: 1 });
    expect(s.pictures).toEqual({ jobs: 1, total: 2 });
    expect(s.retries).toBe(2);
    expect(s.directions).toEqual([{ direction: "warm", n: 3 }, { direction: "bold", n: 1 }]);
    expect(s.slowest.map((j) => j.siteId)).toEqual(["b", "c", "a", "d"]);
    expect(engineSummary([]).medianSeconds).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
  });

  it("reads the window's generation rows newest first", async () => {
    await events.add({ kind: "generation", siteId: "old", props: { seconds: 1 } });
    await ago("generation", 60 * 24 * 10);
    await events.add({ kind: "generation", siteId: "new", props: { seconds: 2 } });
    const rows = await events.generations(new Date(Date.now() - 7 * 86400_000));
    expect(rows.map((r) => r.site_id)).toEqual(["new"]);
  });
});
