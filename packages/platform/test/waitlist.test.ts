import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MIGRATIONS, Repo, createDb, migrate, type Db } from "../src/index.ts";

/** The pre-launch waitlist (migration "waitlist", Repo.joinWaitlist), on PGlite. */
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

const join = (email: string, senderKey: string, o: { per10Min?: number; perDay?: number; source?: string } = {}) =>
  repo.joinWaitlist({ email, senderKey, source: o.source ?? "", per10Min: o.per10Min ?? 5, perDay: o.perDay ?? 20 });
const attempts = async (key: string) => Number((await db.query<{ n: string }>("select count(*) as n from waitlist_attempts where sender_key = $1", [key])).rows[0]!.n);

describe("waitlist", () => {
  it("is a migration of its own", () => {
    expect(MIGRATIONS.find((m) => m.name === "waitlist")).toBeDefined();
  });

  it("keeps one row per address in any case, without the sender; a repeat keeps the first one", async () => {
    expect(await join("Ana@Primer.si", "k1", { source: "homepage" })).toBe("added");
    expect(await join("ana@primer.si", "k2", { source: "other" })).toBe("repeat");
    const { rows } = await db.query<Record<string, unknown>>("select * from waitlist where lower(email) = 'ana@primer.si'");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ email: "Ana@Primer.si", source: "homepage" });
    expect(Object.keys(rows[0]!).sort()).toEqual(["consented_at", "email", "id", "source"]);
  });

  it("counts a repeat against the sender's limit like a new address, so the limit tells nothing about the list", async () => {
    expect(await join("on-list@primer.si", "setup")).toBe("added");
    const fresh = async (key: string) => {
      let ok = 0;
      for (let i = 0; i < 10; i++) if ((await join(`${key}-${i}@primer.si`, key, { per10Min: 3 })) !== "limited") ok++;
      return ok;
    };
    expect(await join("on-list@primer.si", "probe-a", { per10Min: 3 })).toBe("repeat");
    expect(await join("not-on-list@primer.si", "probe-b", { per10Min: 3 })).toBe("added");
    expect(await fresh("probe-a")).toBe(await fresh("probe-b"));
  });

  it("holds the limit when requests arrive at once", async () => {
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) => join(`par-${i}@primer.si`, "parallel", { per10Min: 5 })));
    expect(results.filter((r) => r !== "limited")).toHaveLength(5);
    expect(await attempts("parallel")).toBe(5);
  });

  it("has a 10-minute and a daily limit", async () => {
    for (let i = 0; i < 2; i++) expect(await join(`w-${i}@primer.si`, "windows", { per10Min: 2, perDay: 3 })).toBe("added");
    expect(await join("w-2@primer.si", "windows", { per10Min: 2, perDay: 3 })).toBe("limited");
    await db.query("update waitlist_attempts set at = now() - interval '20 minutes' where sender_key = 'windows'");
    expect(await join("w-2@primer.si", "windows", { per10Min: 2, perDay: 3 })).toBe("added");
    expect(await join("w-3@primer.si", "windows", { per10Min: 2, perDay: 3 })).toBe("limited");
  });

  it("deletes the hashed sender after a day (the privacy policy says so), also without new sign-ups", async () => {
    await join("old@primer.si", "s-old");
    await db.query("update waitlist_attempts set at = now() - interval '25 hours' where sender_key = 's-old'");
    await repo.clearOldWaitlistAttempts();
    expect(await attempts("s-old")).toBe(0);
    await join("old2@primer.si", "s-old2");
    await db.query("update waitlist_attempts set at = now() - interval '25 hours' where sender_key = 's-old2'");
    await join("new@primer.si", "s-new");
    expect(await attempts("s-old2")).toBe(0);
    expect(await attempts("s-new")).toBe(1);
  });
});
