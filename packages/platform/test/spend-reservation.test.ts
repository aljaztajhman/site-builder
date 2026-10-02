import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MIGRATIONS, Repo, createDb, migrate, type Db } from "../src/index.ts";

/** Paid calls reserve their estimate under the daily cap before they are sent, then settle or release it. */
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
beforeEach(async () => {
  await db.query("delete from model_calls");
});

const reserve = (estimateEur: number, capEur = 10) => repo.usage.reserveCall({ siteId: null, jobId: "j", stage: "content", model: "m", estimateEur, capEur, tier: "free" });
const log = (costEur: number) =>
  repo.logModelCall({ siteId: null, jobId: null, stage: "brief", model: "m", inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, costEur, durationMs: 0, ok: true });

describe("spend reservations", () => {
  it("lets only one of two parallel calls take the last room under the cap", async () => {
    await log(9.5);
    const results = await Promise.all([reserve(0.3), reserve(0.3), reserve(0.3)]);
    expect(results.filter((r) => "id" in r)).toHaveLength(1);
    const refused = results.filter((r) => !("id" in r)) as { spent: number }[];
    expect(refused).toHaveLength(2);
    expect(refused[0]!.spent).toBeCloseTo(9.8, 6);
    // The reservation counts as spent today (the cap, the pools) while the call is in flight.
    expect(await repo.usage.spentToday()).toBeCloseTo(9.8, 6);
    expect((await repo.usage.pool("free")).spent).toBeCloseTo(0.3, 6);
  });

  it("settles a reservation to the call's real tokens and cost", async () => {
    const r = await reserve(0.3);
    if (!("id" in r)) throw new Error("refused");
    await repo.usage.settleCall(r.id, { model: "claude-sonnet-5-5", inputTokens: 1200, outputTokens: 800, cacheCreationTokens: 0, cacheReadTokens: 500, costEur: 0.012, durationMs: 900, ok: true });
    const { rows } = await db.query<{ cost_eur: string; pending: boolean; input_tokens: number; tier: string; stage: string }>("select cost_eur, pending, input_tokens, tier, stage from model_calls");
    expect(rows).toEqual([{ cost_eur: expect.anything(), pending: false, input_tokens: 1200, tier: "free", stage: "content" }]);
    expect(Number(rows[0]!.cost_eur)).toBeCloseTo(0.012, 6);
    expect(await repo.usage.spentToday()).toBeCloseTo(0.012, 6);
    // Settled rows aren't released.
    await repo.usage.releaseCall(r.id);
    expect(await repo.usage.spentToday()).toBeCloseTo(0.012, 6);
  });

  it("releases a reservation the call didn't use, freeing the room", async () => {
    await log(9.6);
    const r = await reserve(0.3);
    if (!("id" in r)) throw new Error("refused");
    expect("id" in (await reserve(0.3))).toBe(false);
    await repo.usage.releaseCall(r.id);
    expect(await repo.usage.spentToday()).toBeCloseTo(9.6, 6);
    expect("id" in (await reserve(0.3))).toBe(true);
  });

  it("refuses everything once the cap is reached", async () => {
    await log(10);
    expect(await reserve(0.0001)).toEqual({ spent: 10 });
  });
});

describe("migration sites.failed_after_save", () => {
  it("sets a failed site back to ready when its last generation had saved the current version, and only then", async () => {
    const make = async (slug: string, steps: ("run" | "generate" | "manual")[]) => {
      const site = await repo.createSite({ name: slug, slug, intake: { description: "x", photoAssetIds: [], scope: "home" } });
      for (const s of steps) {
        if (s === "run") await repo.addEvent({ siteId: site.id, stage: "classify", message: "start" });
        else await db.query("insert into spec_versions (site_id, version, spec, source) select $1, coalesce(max(version), 0) + 1, '{}'::jsonb, $2 from spec_versions where site_id = $1", [site.id, s]);
        // Distinct timestamps, as between real steps.
        await new Promise((r) => setTimeout(r, 5));
      }
      await db.query("update sites set status = 'failed', current_version = (select max(version) from spec_versions where site_id = $1) where id = $1", [site.id]);
      return site.id;
    };
    // Its last run saved v2, then failed (Pekarna Kvas, 2026-09-29).
    const savedThenFailed = await make("shranjeno-nato-napaka", ["run", "generate", "run", "generate"]);
    // A regeneration that failed before saving: v1 is older than the run.
    const failedBeforeSave = await make("napaka-pred-shranjevanjem", ["run", "generate", "run"]);
    // Never saved anything.
    const nothing = await make("nic", ["run"]);
    // The owner's own edit after a failed run isn't the run's version.
    const manual = await make("rocno", ["run", "manual"]);

    await db.query("delete from schema_migrations where name = 'sites.failed_after_save'");
    expect(MIGRATIONS.find((m) => m.name === "sites.failed_after_save")).toBeDefined();
    await migrate(db);

    const status = async (id: string) => (await repo.getSite(id))?.status;
    expect(await status(savedThenFailed)).toBe("ready");
    expect(await status(failedBeforeSave)).toBe("failed");
    expect(await status(nothing)).toBe("failed");
    expect(await status(manual)).toBe("failed");
    const { rows } = await db.query<{ site_id: string; level: string }>("select site_id, level from site_events where message like 'Status set back to ready%'");
    expect(rows).toEqual([{ site_id: savedThenFailed, level: "warn" }]);
  });
});
