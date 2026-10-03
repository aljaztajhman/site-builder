import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadConfig, type AppConfig } from "@sb/config";
import type { UrlCheckResult } from "@sb/engine";
import { Repo, createDb, createFsStorage, migrate, type Platform, type Queue } from "@sb/platform";
import { createApp } from "../src/app.ts";
import type { BotCheck } from "../src/turnstile.ts";
import { newBrowser, type Browser } from "./session-helpers.ts";

/** The public website checker's pages (/pregled): what is refused, what is queued, and the report. */

let platform: Platform;
let dir: string;
let config: AppConfig;
const sent: { name: string; data: unknown }[] = [];
const dns: Record<string, string[]> = { "frizer.si": ["93.184.216.34"], "www.frizer.si": ["93.184.216.34"], "notranji.si": ["10.0.0.7"] };
const resolve = async (h: string) => {
  if (!(h in dns)) throw new Error("ENOTFOUND");
  return dns[h]!;
};

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sb-checker-"));
  const db = await createDb("pglite://memory");
  await migrate(db);
  const queue: Queue = { send: async (name, data) => (sent.push({ name, data }), "job"), work: async () => undefined, ping: async () => undefined, stop: async () => undefined };
  platform = { db, repo: new Repo(db), storage: createFsStorage(dir), queue, close: () => db.close() };
  const base = loadConfig();
  config = { ...base, checker: { ...base.checker, perIpPerDay: 3, perDay: 5 } };
});
afterAll(async () => {
  await platform.close();
  await rm(dir, { recursive: true, force: true });
});

const appWith = (botCheck: BotCheck = { mode: "skip", siteKey: null, verify: async () => true }) =>
  createApp({ platform, config, auth: { password: "pw-123456789012", secret: "s".repeat(32), secureCookies: false }, botCheck, checkerResolve: resolve });

async function ask(app: ReturnType<typeof appWith>, b: Browser, url: string, ip = "203.0.113.5") {
  return app.request("/pregled", { method: "POST", body: new URLSearchParams({ url, _csrf: b.csrf }), headers: { cookie: b.cookie, "x-real-ip": ip }, redirect: "manual" });
}

describe("/pregled", () => {
  it("is public, noindexed, and carries the bot check when it's on", async () => {
    const app = appWith({ mode: "on", siteKey: "site-key-1", verify: async () => true });
    const res = await app.request("/pregled");
    expect(res.status).toBe(200);
    expect(res.headers.get("x-robots-tag")).toContain("noindex");
    expect(res.headers.get("content-security-policy")).toContain("https://challenges.cloudflare.com");
    const page = await res.text();
    expect(page).toContain("Pregled spletne strani");
    expect(page).toContain('data-sitekey="site-key-1"');
  });

  it("refuses what isn't a public web address, before anything is queued", async () => {
    const app = appWith();
    const b = await newBrowser(app.request.bind(app));
    const cases: [string, number, string][] = [
      ["ni naslov", 400, "Vpišite naslov spletne strani"],
      ["http://127.0.0.1/admin", 400, "Ta naslov ni javna spletna stran."],
      ["notranji.si", 400, "Ta naslov ni javna spletna stran."],
      ["ne-obstaja.si", 400, "Strani na tem naslovu nismo mogli odpreti."],
      ["http://frizer.si:8080/", 400, "Vpišite naslov spletne strani"],
    ];
    for (const [url, status, text] of cases) {
      const res = await ask(app, b, url, "203.0.113.1");
      expect(res.status, url).toBe(status);
      expect(await res.text(), url).toContain(text);
    }
    const noToken = await app.request("/pregled", { method: "POST", body: new URLSearchParams({ url: "frizer.si" }), headers: { cookie: b.cookie } });
    expect(noToken.status).toBe(403);
    const robot = appWith({ mode: "on", siteKey: "k", verify: async () => false });
    const rb = await newBrowser(robot.request.bind(robot));
    expect((await ask(robot, rb, "frizer.si", "203.0.113.2")).status).toBe(403);
    expect(sent).toEqual([]);
  });

  it("queues a check and shows the report page, which reloads itself until the worker is done", async () => {
    const app = appWith();
    const b = await newBrowser(app.request.bind(app));
    const res = await ask(app, b, "www.frizer.si", "203.0.113.3");
    expect(res.status).toBe(303);
    const where = res.headers.get("location")!;
    expect(where).toMatch(/^\/pregled\/chk_[0-9a-f]{24}$/);
    const id = where.split("/").pop()!;
    expect(sent.at(-1)).toEqual({ name: "check-url", data: { checkId: id } });
    expect(await platform.repo.checks.get(id)).toMatchObject({ url: "https://www.frizer.si/", host: "www.frizer.si", status: "queued" });

    const waiting = await app.request(where);
    expect(waiting.headers.get("refresh")).toBe("3");
    expect(await waiting.text()).toContain("Pregledujemo stran");

    const result: UrlCheckResult = {
      url: "https://www.frizer.si/",
      finalUrl: "https://www.frizer.si/",
      https: true,
      checkedAt: "2026-10-03T10:00:00Z",
      phone: { width: 360, viewportMeta: true, horizontalScroll: false, tinyTargets: 4, smallPrimaryTargets: 0, smallText: 0, hasCallLink: false, callInViewport: false },
      speed: { performance: 62, lcpMs: 4100 },
      cookiesBeforeConsent: [],
      company: { companyForm: true, address: true, email: true, registration: false, taxNumber: true },
      lang: "sl",
    };
    expect(await platform.repo.checks.start(id)).toBe(true);
    expect(await platform.repo.checks.start(id)).toBe(false);
    await platform.repo.checks.finish(id, result);
    const done = await app.request(where);
    expect(done.headers.get("refresh")).toBeNull();
    const page = await done.text();
    expect(page).toContain("Na telefonu smo našli štiri stvari, ki bi jih popravili.");
    expect(page).toContain("Premajhni gumbi za prst");
    expect(page).toContain("Ni klica s tapom");
    expect(page).toContain("Na prvi strani nismo našli: matična številka");
    expect(page).toContain('href="/#zacni"');
    // Fixes first, then what's fine.
    expect(page.indexOf("Popravite")).toBeLessThan(page.indexOf("V redu"));

    expect((await app.request("/pregled/chk_nope")).status).toBe(404);
    expect((await app.request(`/pregled/chk_${"0".repeat(24)}`)).status).toBe(404);
  });

  it("limits checks per visitor and per day", async () => {
    await platform.db.query("delete from url_checks");
    const app = appWith();
    const b = await newBrowser(app.request.bind(app));
    for (let i = 0; i < 3; i++) expect((await ask(app, b, "frizer.si", "203.0.113.9")).status).toBe(303);
    const fourth = await ask(app, b, "frizer.si", "203.0.113.9");
    expect(fourth.status).toBe(429);
    expect(await fourth.text()).toContain("Danes ste pregledali že 3 strani.");
    // Another visitor still can, until the day's total is reached.
    expect((await ask(app, b, "frizer.si", "203.0.113.10")).status).toBe(303);
    expect((await ask(app, b, "frizer.si", "203.0.113.11")).status).toBe(303);
    const full = await ask(app, b, "frizer.si", "203.0.113.12");
    expect(full.status).toBe(429);
    expect(await full.text()).toContain("Danes smo pregledali že veliko strani.");
    // The IP itself is never stored, only its keyed hash.
    const { rows } = await platform.db.query<{ ip_key: string }>("select ip_key from url_checks");
    expect(rows.every((r) => /^[0-9a-f]{32}$/.test(r.ip_key))).toBe(true);
  });

  it("housekeeping clears IP hashes after a day, fails stuck checks and deletes old reports", async () => {
    await platform.db.query("delete from url_checks");
    const id = await platform.repo.checks.create({ url: "https://frizer.si/", host: "frizer.si", ipKey: "k".repeat(32), deviceId: null });
    const old = await platform.repo.checks.create({ url: "https://frizer.si/", host: "frizer.si", ipKey: "k".repeat(32), deviceId: null });
    await platform.db.query("update url_checks set created_at = now() - interval '2 days' where id = $1", [id]);
    await platform.db.query("update url_checks set created_at = now() - interval '40 days' where id = $1", [old]);
    expect(await platform.repo.checks.cleanup(30)).toEqual({ deleted: 1 });
    const row = await platform.repo.checks.get(id);
    expect(row).toMatchObject({ status: "failed", error: "Pregled se ni končal. Poskusite znova." });
    const { rows } = await platform.db.query<{ ip_key: string }>("select ip_key from url_checks where id = $1", [id]);
    expect(rows[0]!.ip_key).toBe("");
  });
});
