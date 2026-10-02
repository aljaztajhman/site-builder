import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MIGRATIONS, Repo, createDb, migrate, type Db } from "../src/index.ts";

/** Image numbers are issued once per site (Repo.claimImageNumbers), on PGlite. */
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

const newSite = (slug: string) => repo.createSite({ name: slug, slug, intake: { description: "x", photoAssetIds: [], scope: "home" } });

describe("claimImageNumbers", () => {
  it("counts up per site and kind, never handing out a number twice", async () => {
    const a = await newSite("seq-a");
    const b = await newSite("seq-b");
    expect(await repo.claimImageNumbers(a.id, "generated", 2)).toEqual([1, 2]);
    expect(await repo.claimImageNumbers(a.id, "generated", 2)).toEqual([3, 4]);
    expect(await repo.claimImageNumbers(a.id, "photo", 1)).toEqual([1]);
    expect(await repo.claimImageNumbers(b.id, "generated", 1)).toEqual([1]);
    expect(await repo.claimImageNumbers(a.id, "photo", 0)).toEqual([]);
    expect(await repo.getSite(a.id)).toMatchObject({ photo_seq: 1, generated_seq: 4 });
  });

  it("starts above a floor it didn't issue, and never goes back below what it issued", async () => {
    const s = await newSite("seq-floor");
    expect(await repo.claimImageNumbers(s.id, "photo", 2, 7)).toEqual([8, 9]);
    expect(await repo.claimImageNumbers(s.id, "photo", 1, 3)).toEqual([10]);
  });

  it("gives concurrent claims different numbers", async () => {
    const s = await newSite("seq-race");
    const claims = await Promise.all(Array.from({ length: 8 }, () => repo.claimImageNumbers(s.id, "photo", 2)));
    const all = claims.flat().sort((x, y) => x - y);
    expect(all).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
  });

  it("fails for a site that doesn't exist", async () => {
    await expect(repo.claimImageNumbers("site_missing", "photo", 1)).rejects.toThrow(/not found/);
  });
});

describe("migration 9 (sites.image_seq)", () => {
  it("starts every existing site's counters above every id any stored version or the intake used", async () => {
    const old = await createDb("pglite://memory");
    try {
      await old.query("create table schema_migrations (id integer primary key, name text not null, applied_at timestamptz not null default now())");
      for (const m of MIGRATIONS.filter((m) => m.id < 9)) {
        for (const stmt of m.sql.split(/;\s*\n/).map((s) => s.trim().replace(/;$/, "")).filter(Boolean)) await old.query(stmt);
        await old.query("insert into schema_migrations (id, name) values ($1, $2)", [m.id, m.name]);
      }
      const images = (...ids: string[]) => JSON.stringify({ specVersion: 5, assets: { images: ids.map((id) => ({ id, src: `x/${id}` })) } });
      await old.query(
        `insert into sites (id, slug, name, intake) values
           ('site_a', 'a', 'A', '{"photoAssetIds": ["p1", "p2"]}'),
           ('site_b', 'b', 'B', '{"photoAssetIds": ["p1", "p2", "p3", "p4", "p5", "p6"]}'),
           ('site_c', 'c', 'C', '{}')`,
      );
      // site_a: an older version showed img_07 and img_g2; the current one shows less (the highest removed, a regeneration's img_g3).
      await old.query(
        `insert into spec_versions (site_id, version, spec, source) values
           ('site_a', 1, $1, 'generate'), ('site_a', 2, $2, 'manual'), ('site_a', 3, $3, 'generate'),
           ('site_b', 1, $4, 'generate'),
           ('site_c', 1, '{"specVersion": 5}', 'generate'), ('site_c', 2, '{"assets": {"images": "not a list"}}', 'manual')`,
        [images("img_01", "img_g1", "img_g2"), images("img_01", "img_07", "img_g1"), images("img_01", "img_g3"), images("img_01", "img_03")],
      );
      expect(await migrate(old)).toEqual(MIGRATIONS.filter((m) => m.id >= 9).map((m) => m.id));
      const { rows } = await old.query<{ id: string; photo_seq: number; generated_seq: number }>("select id, photo_seq, generated_seq from sites order by id");
      expect(rows.map((r) => [r.id, Number(r.photo_seq), Number(r.generated_seq)])).toEqual([
        ["site_a", 7, 3],
        // Six intake photos: the pipeline numbers them img_01..img_06 although this version shows two.
        ["site_b", 6, 0],
        ["site_c", 0, 0],
      ]);
      // The next ids continue from there.
      const r = new Repo(old);
      expect(await r.claimImageNumbers("site_a", "photo", 1)).toEqual([8]);
      expect(await r.claimImageNumbers("site_a", "generated", 2)).toEqual([4, 5]);
    } finally {
      await old.close();
    }
  });
});
