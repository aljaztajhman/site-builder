import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MIGRATIONS, Repo, createDb, migrate, type Db } from "../src/index.ts";

/** The pre-launch waitlist (migration "waitlist", Repo.addToWaitlist), on PGlite. */
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

describe("waitlist", () => {
  it("is a migration of its own", () => {
    expect(MIGRATIONS.find((m) => m.name === "waitlist")).toBeDefined();
  });

  it("keeps one row per address in any case; a repeat sign-up keeps the first one", async () => {
    expect(await repo.addToWaitlist({ email: "Ana@Primer.si", source: "homepage", senderKey: "k1" })).toBe(true);
    expect(await repo.addToWaitlist({ email: "ana@primer.si", source: "other", senderKey: "k2" })).toBe(false);
    const { rows } = await db.query<{ email: string; source: string; consented_at: string }>("select email, source, consented_at from waitlist where lower(email) = 'ana@primer.si'");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ email: "Ana@Primer.si", source: "homepage" });
    expect(rows[0]!.consented_at).toBeTruthy();
  });

  it("counts sign-ups per sender within the window", async () => {
    await repo.addToWaitlist({ email: "a@primer.si", source: "", senderKey: "s1" });
    await repo.addToWaitlist({ email: "b@primer.si", source: "", senderKey: "s1" });
    await repo.addToWaitlist({ email: "c@primer.si", source: "", senderKey: "s2" });
    expect(await repo.countWaitlistFromSender("s1", 10)).toBe(2);
    expect(await repo.countWaitlistFromSender("s2", 10)).toBe(1);
    await db.query("update waitlist set consented_at = now() - interval '20 minutes' where email = 'a@primer.si'");
    expect(await repo.countWaitlistFromSender("s1", 10)).toBe(1);
    expect(await repo.countWaitlistFromSender("s1", 24 * 60)).toBe(2);
  });

  it("forgets the hashed sender after a day (the privacy policy says so)", async () => {
    await repo.addToWaitlist({ email: "old@primer.si", source: "", senderKey: "s-old" });
    await db.query("update waitlist set consented_at = now() - interval '25 hours' where email = 'old@primer.si'");
    await repo.addToWaitlist({ email: "new@primer.si", source: "", senderKey: "s-new" });
    const { rows } = await db.query<{ email: string; sender_key: string }>("select email, sender_key from waitlist where email in ('old@primer.si', 'new@primer.si') order by email");
    expect(rows).toEqual([
      { email: "new@primer.si", sender_key: "s-new" },
      { email: "old@primer.si", sender_key: "" },
    ]);
  });
});
