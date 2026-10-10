import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { GenomeView } from "@sb/spec";
import { MIGRATIONS, Repo, createDb, migrate, type Db, type LookFingerprint } from "../src/index.ts";

/**
 * The design studio's uniqueness registry (docs/plans/design-studio.md §5.4) against real Postgres (PGlite): the
 * migration, recording a look, the gate's nearest looks, and the rows going with the site.
 */
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
  await db.query("delete from sites");
});

const GENOME: GenomeView = {
  preset: "tablica",
  type: "archivo-public-sans",
  palette: "preset",
  ground: "white",
  hero: "hero-signature:photo",
  header: "bar",
  footer: "columns",
  rhythm: "alternate",
  imagery: "natural",
  shape: "square",
  density: "regular",
  motif: "plate",
};

const fp = (siteId: string, o: Partial<LookFingerprint> = {}): Omit<LookFingerprint, "createdAt"> => ({
  siteId,
  generation: 0,
  trade: "car-repair",
  town: "Celje",
  stance: "workshop-docket",
  seed: "k3x9q2a",
  genome: GENOME,
  composition: "opener:hero-signature/photo offer:services-list/aside contact:contact/split",
  paletteLab: { background: [100, 0, 0], primary: [20, 1, -3], band: [85, -2, 80], accent: [85, -2, 80] },
  phash360: "0f0f0f0f0f0f0f0f",
  phash1280: null,
  ...o,
});

async function site(id: string): Promise<void> {
  await repo.createSite({ id, name: id, slug: id, intake: {} as never });
}

describe("migration look_fingerprints", () => {
  it("creates the table, and running migrations again changes nothing", async () => {
    const m = MIGRATIONS.find((x) => x.name === "look_fingerprints");
    expect(m).toBeDefined();
    expect(m!.id).toBe(Math.max(...MIGRATIONS.map((x) => x.id)));
    const fresh = await createDb("pglite://memory");
    try {
      const ran = await migrate(fresh);
      expect(ran).toContain(m!.id);
      expect(await migrate(fresh)).toEqual([]);
      const { rows } = await fresh.query<{ column_name: string; data_type: string }>(
        "select column_name, data_type from information_schema.columns where table_name = 'look_fingerprints' order by ordinal_position",
      );
      expect(rows.map((r) => r.column_name)).toEqual([
        "site_id",
        "generation",
        "trade",
        "town",
        "stance",
        "seed",
        "genome",
        "composition",
        "palette_lab",
        "phash_360",
        "phash_1280",
        "created_at",
      ]);
      expect(rows.find((r) => r.column_name === "genome")?.data_type).toBe("jsonb");
    } finally {
      await fresh.close();
    }
  });
});

describe("LookFingerprints", () => {
  it("records a look and reads it back; the same generation again replaces it", async () => {
    await site("s1");
    await repo.looks.record(fp("s1", { town: "  Celje " }));
    await repo.looks.record(fp("s1", { phash1280: "ffffffffffffffff" }));
    const [row, ...rest] = await repo.looks.forSite("s1");
    expect(rest).toEqual([]);
    expect(row).toMatchObject({ ...fp("s1", { phash1280: "ffffffffffffffff" }) });
    expect(row!.genome).toEqual(GENOME);
    expect(typeof row!.createdAt).toBe("string");
  });

  it("nearest: each other site's latest look of the same trade or town, the same town first", async () => {
    for (const id of ["self", "a", "b", "c", "d"]) await site(id);
    await repo.looks.record(fp("self"));
    await repo.looks.record(fp("a", { town: "Maribor" }));
    await repo.looks.record(fp("a", { town: "Maribor", generation: 1, stance: "swiss-grid" }));
    await repo.looks.record(fp("b", { trade: "bakery", town: "celje" }));
    await repo.looks.record(fp("c", { trade: "bakery", town: "Koper" }));
    await repo.looks.record(fp("d", { town: null }));
    const near = await repo.looks.nearest({ trade: "car-repair", town: "Celje", limit: 10, excludeSiteId: "self" });
    expect(near.map((n) => n.siteId).slice(0, 1)).toEqual(["b"]);
    expect(near.map((n) => n.siteId).sort()).toEqual(["a", "b", "d"]);
    expect(near.find((n) => n.siteId === "a")).toMatchObject({ generation: 1, stance: "swiss-grid" });
    expect(await repo.looks.nearest({ trade: "car-repair", town: "Celje", limit: 1, excludeSiteId: "self" })).toHaveLength(1);
    expect(await repo.looks.nearest({ trade: "car-repair", town: null, limit: 0 })).toEqual([]);
    // Without a town: only the trade.
    expect((await repo.looks.nearest({ trade: "bakery", town: null, limit: 10 })).map((n) => n.siteId).sort()).toEqual(["b", "c"]);
    // Without an exclusion the site's own look is a neighbour too.
    expect((await repo.looks.nearest({ trade: "car-repair", town: null, limit: 10 })).map((n) => n.siteId).sort()).toEqual(["a", "d", "self"]);
  });

  it("goes with the site", async () => {
    await site("gone");
    await repo.looks.record(fp("gone"));
    await repo.looks.record(fp("gone", { generation: 1 }));
    await db.query("delete from sites where id = $1", ["gone"]);
    expect(await repo.looks.forSite("gone")).toEqual([]);
    const { rows } = await db.query<{ n: string }>("select count(*) as n from look_fingerprints");
    expect(Number(rows[0]!.n)).toBe(0);
  });
});
