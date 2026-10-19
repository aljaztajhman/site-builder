import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadConfig } from "@sb/config";
import { Repo, createDb, createFsStorage, migrate, type Platform, type Queue } from "@sb/platform";
import { createApp } from "../src/app.ts";
import { privacyPage } from "../src/privacy.tsx";

/** POST /api/waitlist: the postavi.si homepage's "Obvestite me ob odprtju" (waitlist.ts). */
const PASSWORD = "test-password-1234";
let platform: Platform;
let dir: string;
let app: ReturnType<typeof createApp>;
const config = loadConfig();

const signUp = (fields: Record<string, string> = {}, o: { ip?: string; origin?: string | null; json?: boolean; host?: string } = {}) =>
  app.request("/api/waitlist", {
    method: "POST",
    body: new URLSearchParams({ email: "ana@primer.si", consent: "1", source: "homepage", website: "", ...fields }),
    headers: {
      "x-forwarded-for": o.ip ?? "203.0.113.7",
      ...(o.origin === null ? {} : { origin: o.origin ?? "https://postavi.si" }),
      ...(o.json === false ? {} : { accept: "application/json" }),
      ...(o.host ? { host: o.host } : {}),
    },
  });

const rows = async () => (await platform.db.query<{ email: string; source: string }>("select email, source from waitlist order by id")).rows;
const senderKeys = async () => (await platform.db.query<{ sender_key: string }>("select sender_key from waitlist_attempts")).rows.map((r) => r.sender_key);

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sb-waitlist-"));
  const db = await createDb("pglite://memory");
  await migrate(db);
  const queue: Queue = { send: async () => "job", work: async () => undefined, ping: async () => undefined, stop: async () => undefined };
  platform = { db, repo: new Repo(db), storage: createFsStorage(dir), queue, close: () => db.close() };
  app = createApp({ platform, config, auth: { password: PASSWORD, secret: "s".repeat(32), secureCookies: false }, platformDomain: "postavi.si", appUrl: "https://app.postavi.si" });
});
afterAll(async () => {
  await platform.close();
  await rm(dir, { recursive: true, force: true });
});

describe("POST /api/waitlist", () => {
  it("stores the address with its source and a hashed sender, never the IP, without a session or a cookie", async () => {
    const res = await signUp({}, { ip: "203.0.113.1" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, message: "Hvala. Ko odpremo, vam pišemo." });
    expect(res.headers.getSetCookie()).toEqual([]);
    expect(await rows()).toEqual([{ email: "ana@primer.si", source: "homepage" }]);
    const keys = await senderKeys();
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/^[0-9a-f]{32}$/);
    expect(keys[0]).not.toContain("203.0.113.1");
  });

  it("answers a repeat sign-up (any case) the same and keeps one row", async () => {
    const res = await signUp({ email: "ANA@primer.si" }, { ip: "203.0.113.2" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, message: "Hvala. Ko odpremo, vam pišemo." });
    expect((await rows()).filter((r) => r.email.toLowerCase() === "ana@primer.si")).toHaveLength(1);
  });

  it("refuses a bad address and a missing consent, and stores nothing", async () => {
    const before = (await rows()).length;
    for (const email of ["", "no-at", "a@b", "ana@primer.si?cc=x@y.si", `${"a".repeat(250)}@primer.si`]) {
      const res = await signUp({ email }, { ip: "203.0.113.3" });
      expect(res.status, email).toBe(400);
      expect(((await res.json()) as { error: string }).error).toBe("invalid_email");
    }
    for (const consent of ["", "0", "on"]) {
      const res = await signUp({ email: "brez@primer.si", consent }, { ip: "203.0.113.3" });
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: string }).error).toBe("consent_required");
    }
    expect((await rows()).length).toBe(before);
  });

  it("pretends success for the honeypot and stores nothing", async () => {
    const res = await signUp({ email: "bot@primer.si", website: "http://spam.example" }, { ip: "203.0.113.4" });
    expect(res.status).toBe(200);
    expect((await rows()).some((r) => r.email === "bot@primer.si")).toBe(false);
  });

  it("drops a source that isn't a plain name", async () => {
    await signUp({ email: "vir@primer.si", source: "<script>" }, { ip: "203.0.113.5" });
    expect((await rows()).find((r) => r.email === "vir@primer.si")?.source).toBe("");
  });

  it("rate-limits one sender, then lets another through", async () => {
    for (let i = 0; i < config.limits.waitlistPerSenderPer10Min; i++) expect((await signUp({ email: `r${i}@primer.si` }, { ip: "198.51.100.1" })).status).toBe(200);
    const blocked = await signUp({ email: "r-next@primer.si" }, { ip: "198.51.100.1" });
    expect(blocked.status).toBe(429);
    expect(((await blocked.json()) as { error: string }).error).toBe("rate_limited");
    expect((await rows()).some((r) => r.email === "r-next@primer.si")).toBe(false);
    expect((await signUp({ email: "r-other@primer.si" }, { ip: "198.51.100.2" })).status).toBe(200);
  });

  it("counts a repeat against the limit and holds it under parallel requests", async () => {
    const limit = config.limits.waitlistPerSenderPer10Min;
    for (let i = 0; i < limit; i++) expect((await signUp({ email: "ana@primer.si" }, { ip: "198.51.100.3" })).status).toBe(200);
    expect((await signUp({ email: "nova@primer.si" }, { ip: "198.51.100.3" })).status).toBe(429);
    const all = await Promise.all(Array.from({ length: 3 * limit }, (_, i) => signUp({ email: `p${i}@primer.si` }, { ip: "198.51.100.4" })));
    expect(all.filter((r) => r.status === 200)).toHaveLength(limit);
    expect(all.filter((r) => r.status === 429)).toHaveLength(2 * limit);
  });

  it("lets postavi.si and www read the answer (CORS) and refuses other origins", async () => {
    for (const origin of ["https://postavi.si", "https://www.postavi.si"]) {
      const res = await signUp({ email: `cors${origin.length}@primer.si` }, { ip: "203.0.113.6", origin });
      expect(res.status).toBe(200);
      expect(res.headers.get("access-control-allow-origin")).toBe(origin);
      expect(res.headers.get("vary")).toContain("Origin");
    }
    for (const origin of ["https://evil.example", "http://postavi.si", "https://postavi.si.evil.example", "null"]) {
      const res = await signUp({ email: "tuje@primer.si" }, { ip: "203.0.113.6", origin });
      expect(res.status, origin).toBe(403);
      expect(res.headers.get("access-control-allow-origin")).toBeNull();
    }
    expect((await rows()).some((r) => r.email === "tuje@primer.si")).toBe(false);
  });

  it("accepts the app's own host and requests without an Origin, without a CORS header", async () => {
    const own = await signUp({ email: "app@primer.si" }, { ip: "203.0.113.8", origin: "https://app.postavi.si", host: "app.postavi.si" });
    expect(own.status).toBe(200);
    expect(own.headers.get("access-control-allow-origin")).toBeNull();
    expect((await signUp({ email: "curl@primer.si" }, { ip: "203.0.113.8", origin: null })).status).toBe(200);
  });

  it("answers a plain form post (no JavaScript) with a Slovene page linking back to the homepage", async () => {
    const res = await signUp({ email: "brezjs@primer.si" }, { ip: "203.0.113.9", json: false });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const page = await res.text();
    expect(page).toContain("Hvala. Ko odpremo, vam pišemo.");
    expect(page).toContain('href="https://postavi.si/"');
    const bad = await signUp({ email: "x" }, { ip: "203.0.113.9", json: false });
    expect(bad.status).toBe(400);
    expect(await bad.text()).toContain("Vpišite veljaven e-poštni naslov.");
  });

  it("refuses a body over 4 KB", async () => {
    const res = await signUp({ email: "velik@primer.si", pad: "x".repeat(5000) }, { ip: "203.0.113.10" });
    expect(res.status).toBe(413);
  });
});

describe("/zasebnost", () => {
  it("says what the waitlist keeps, for how long, and how to withdraw", () => {
    const page = privacyPage(config);
    expect(page).toContain('id="waitlist"');
    expect(page).toMatch(/obvestilo ob odprtju, z vašim soglasjem hranimo vaš e-poštni naslov in čas prijave/);
    expect(page).toContain("nato naslov");
    expect(page).toMatch(/s povezavo za prijavo, obvestilo ob odprtju in sporočila/);
  });
});
