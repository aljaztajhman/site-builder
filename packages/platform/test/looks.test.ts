import { describe, expect, it } from "vitest";
import { MIGRATIONS, createDb, migrate } from "../src/index.ts";

/**
 * Migration 22, look_fingerprints: the design studio's uniqueness registry. The studio and its LookFingerprints code are
 * gone (2026-10-19); the migration stays as history, and the table is created and left unused.
 */
describe("migration look_fingerprints", () => {
  it("creates the table, and running migrations again changes nothing", async () => {
    const m = MIGRATIONS.find((x) => x.name === "look_fingerprints");
    expect(m).toBeDefined();
    expect(m!.id).toBe(22);
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
