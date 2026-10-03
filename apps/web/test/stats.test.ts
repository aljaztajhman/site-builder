import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, type AppConfig } from "@sb/config";
import { newReleaseId, writeRelease } from "@sb/engine";
import { Repo, createDb, createFsStorage, memoryMailer, migrate, normaliseEmail, type MailMessage, type Mailer, type Platform, type Queue } from "@sb/platform";
import type { SiteSpec } from "@sb/spec";
import { createApp } from "../src/app.ts";
import { dayIn, monthlyReportMail, previousMonth, sendMonthlyReports } from "../src/stats.ts";
import { adminBrowser } from "./session-helpers.ts";

/** Cookieless counts for published sites, and the monthly report email to the owner. */

const here = path.dirname(fileURLToPath(import.meta.url));
const OWNER = "lastnica@primer.si";
const BROWSER = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36";
let platform: Platform;
let dir: string;
let golden: SiteSpec;
let config: AppConfig;
const enc = new TextEncoder();

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sb-stats-"));
  const db = await createDb("pglite://memory");
  await migrate(db);
  const queue: Queue = { send: async () => "job", work: async () => undefined, ping: async () => undefined, stop: async () => undefined };
  platform = { db, repo: new Repo(db), storage: createFsStorage(dir), queue, close: () => db.close() };
  golden = JSON.parse(await readFile(path.join(here, "../../../tools/eval/golden/pekarna-kvas.json"), "utf8")) as SiteSpec;
  config = loadConfig();
});
afterAll(async () => {
  await platform.close();
  await rm(dir, { recursive: true, force: true });
});

const appWith = (mailer: Mailer = memoryMailer()) => createApp({ platform, config, mailer, appUrl: "https://stranko.example", auth: { password: "pw-123456789012", secret: "s".repeat(32), secureCookies: false } });

/** A published site (owned by OWNER unless `owner` is false) with two pages and a picture in its live release. */
async function site(slug: string, o: { owner?: boolean; publish?: boolean } = {}): Promise<string> {
  const spec = structuredClone(golden);
  spec.slug = slug;
  spec.pages[0]!.sections.push({ id: "s_enquiry", type: "contact-form", variant: "stacked", props: { title: "Pišite nam", askPhone: false } });
  const account = o.owner === false ? null : await platform.repo.accounts.signIn(OWNER, normaliseEmail(OWNER)!.key);
  const s = await platform.repo.createSite({ name: slug, slug, intake: { description: "x", photoAssetIds: [], scope: "full" }, accountId: account?.id ?? null });
  const v = await platform.repo.saveSpec(s.id, spec, "generate");
  if (o.publish === false) return s.id;
  await platform.repo.markPublished(s.id, v);
  const files = new Map([
    [`${slug}/index.html`, enc.encode("<!doctype html><title>Domov</title>")],
    [`${slug}/kontakt/index.html`, enc.encode("<!doctype html><title>Kontakt</title>")],
    [`${slug}/media/a.webp`, enc.encode("img")],
    [`${slug}/media/logo.png`, enc.encode("logo")],
  ]);
  await writeRelease(platform.storage, slug, newReleaseId(v), files);
  return s.id;
}

const today = () => dayIn(config.stats.timeZone);
const tomorrow = () => dayIn(config.stats.timeZone, new Date(Date.now() + 86400_000));
const counts = (id: string) => platform.repo.stats.totals(id, today(), tomorrow());
/** Visit counting runs after the answer: wait for it. */
const settle = () => new Promise((r) => setTimeout(r, 150));

describe("counting without cookies", () => {
  it("counts page views of a published site, once per visitor and page in the dedupe window, without setting a cookie", async () => {
    const app = appWith();
    const id = await site("stetje-obiskov");
    const visit = (p: string, ip: string, extra: Record<string, string> = {}) => app.request(`/s/stetje-obiskov/${p}`, { headers: { "user-agent": BROWSER, "x-real-ip": ip, ...extra } });
    const first = await visit("", "198.51.100.1");
    expect(first.status).toBe(200);
    expect(first.headers.get("set-cookie")).toBeNull();
    await visit("", "198.51.100.1"); // a reload: not again
    await visit("kontakt/", "198.51.100.1"); // another page: yes
    await visit("", "198.51.100.2"); // another visitor: yes
    await visit("media/a.webp", "198.51.100.3"); // a picture isn't a page view
    await visit("", "198.51.100.4", { "user-agent": "Googlebot/2.1 (+http://www.google.com/bot.html)" });
    await visit("", "198.51.100.5", { "sec-purpose": "prefetch;prerender" });
    await visit("ni-je/", "198.51.100.6"); // a 404 isn't a view
    await settle();
    expect(await counts(id)).toEqual({ visits: 3, calls: 0, directions: 0, forms: 0 });
    // Nothing about a visitor is stored: the table holds totals only.
    const { rows } = await platform.db.query("select * from site_stats where site_id = $1", [id]);
    expect(Object.keys(rows[0]!).sort()).toEqual(["calls", "day", "directions", "forms", "site_id", "visits"]);
  });

  it("counts taps on call and directions from the beacon, capped per visitor and day; anything else answers 204 and counts nothing", async () => {
    const app = appWith();
    const id = await site("stetje-tapov");
    const tap = (body: string, ip = "198.51.100.20", slug = "stetje-tapov") =>
      app.request(`/s/${slug}/_hit`, { method: "POST", body, headers: { "content-type": "text/plain;charset=UTF-8", "user-agent": BROWSER, "x-real-ip": ip } });
    expect((await tap("call")).status).toBe(204);
    expect((await tap("directions")).status).toBe(204);
    expect((await tap("call", "198.51.100.21")).status).toBe(204);
    for (const bad of ["visits", "forms", "", "call; drop table site_stats"]) expect((await tap(bad)).status).toBe(204);
    expect((await tap("call", "198.51.100.22", "ni-te-strani")).status).toBe(204);
    expect(await counts(id)).toEqual({ visits: 0, calls: 2, directions: 1, forms: 0 });
    for (let i = 0; i < config.stats.tapsPerVisitorPerDay + 5; i++) await tap("call", "198.51.100.30");
    // The first 2 came from two other visitors; this one counts up to the cap.
    expect((await counts(id)).calls).toBe(2 + config.stats.tapsPerVisitorPerDay);
  });

  it("an unpublished site counts nothing", async () => {
    const app = appWith();
    const id = await site("neobjavljena", { publish: false });
    await app.request("/s/neobjavljena/_hit", { method: "POST", body: "call", headers: { "user-agent": BROWSER } });
    expect(await counts(id)).toEqual({ visits: 0, calls: 0, directions: 0, forms: 0 });
  });

  it("counts contact-form messages, and shows the last 30 days on the sites list", async () => {
    const app = appWith();
    const id = await site("stetje-sporocil");
    const res = await app.request("/s/stetje-sporocil/_submit", {
      method: "POST",
      body: new URLSearchParams({ section: "s_enquiry", name: "Ana", email: "ana@primer.si", message: "Zanima me ponudba." }),
      headers: { "x-forwarded-for": "203.0.113.40", accept: "application/json" },
    });
    expect(res.status).toBe(200);
    expect((await counts(id)).forms).toBe(1);
    const admin = await adminBrowser(app.request.bind(app), "pw-123456789012");
    const list = await (await app.request("/sites", { headers: { cookie: admin.cookie } })).text();
    expect(list).toContain("Zadnjih 30 dni: ogledi 0 · klici 0 · pot 0 · sporočila 1");
  });
});

describe("published files' caching", () => {
  it("caches photos for good, but the logo (same name when replaced) and pages only briefly", async () => {
    const app = appWith();
    await site("predpomnjenje");
    const cache = async (p: string) => (await app.request(`/s/predpomnjenje/${p}`)).headers.get("cache-control");
    expect(await cache("media/a.webp")).toBe("public, max-age=31536000, immutable");
    expect(await cache("media/logo.png")).toBe("public, max-age=300");
    expect(await cache("")).toBe("public, max-age=60");
  });
});

describe("stats.js", () => {
  it("sends only from the live address, only for call and directions links", async () => {
    const js = await readFile(path.join(here, "../../../packages/components/islands/stats.js"), "utf8");
    expect(js).toContain("sendBeacon");
    expect(js).not.toMatch(/document\.cookie|localStorage|sessionStorage|fetch\(|XMLHttpRequest/);
    expect(js).toContain("/^\\/s\\/");
    expect(Buffer.byteLength(js)).toBeLessThan(1500);
  });
});

describe("monthly report", () => {
  it("knows the month before, in Ljubljana time", () => {
    expect(previousMonth("Europe/Ljubljana", new Date("2026-11-01T07:30:00Z"))).toMatchObject({ month: "2026-10", start: "2026-10-01", end: "2026-11-01", day: 1, hour: 8 });
    expect(previousMonth("Europe/Ljubljana", new Date("2027-01-01T00:30:00Z"))).toMatchObject({ month: "2026-12", start: "2026-12-01", end: "2027-01-01", day: 1, hour: 1 });
    // 23:30 UTC on 31 October is already 1 November in Ljubljana.
    expect(previousMonth("Europe/Ljubljana", new Date("2026-10-31T23:30:00Z")).month).toBe("2026-10");
  });

  it("words the email in Slovene, with last month beside it", () => {
    const m = monthlyReportMail({
      to: OWNER,
      siteId: "site_0123456789abcdef",
      siteName: "Pekarna Kvas",
      month: "2026-10",
      totals: { visits: 1203, calls: 14, directions: 9, forms: 2 },
      before: { visits: 980, calls: 11, directions: 4, forms: 0 },
      siteUrl: "https://stranko.example/s/pekarna-kvas/",
      dashboardUrl: "https://stranko.example/sites/site_0123456789abcdef",
    });
    // Slovene groups digits from five up (CLDR): 1203, 12.030.
    expect(m.subject).toBe("Pekarna Kvas: 1203 ogledi v oktobru");
    expect(m.text).toContain("v oktobru 2026:");
    expect(m.text).toContain("Ogledi strani: 1203 (september: 980)");
    expect(monthlyReportMail({ ...base(), totals: { visits: 12030, calls: 0, directions: 0, forms: 0 } }).subject).toBe("Pekarna Kvas: 12.030 ogledov v oktobru");
    expect(m.text).toContain("Tapi na klic: 14 (september: 11)");
    expect(m.idempotencyKey).toBe("stats-report-site_0123456789abcdef-2026-10");
    expect(monthlyReportMail({ ...base(), totals: { visits: 1, calls: 0, directions: 0, forms: 0 } }).subject).toBe("Pekarna Kvas: 1 ogled v oktobru");
    expect(monthlyReportMail({ ...base(), totals: { visits: 5, calls: 0, directions: 0, forms: 0 } }).subject).toBe("Pekarna Kvas: 5 ogledov v oktobru");
    expect(monthlyReportMail({ ...base(), siteName: "<b>X</b>" }).html).toContain("&lt;b&gt;X&lt;/b&gt;");
  });

  const base = () => ({ to: OWNER, siteId: "site_x", siteName: "Pekarna Kvas", month: "2026-10", totals: { visits: 0, calls: 0, directions: 0, forms: 0 }, before: null, siteUrl: null, dashboardUrl: null });

  it("sends last month's numbers once to each published site's owner, in the first days of the month, and retries a failed send", async () => {
    await platform.db.query("delete from stats_reports");
    const owned = await site("porocilo-lastnik");
    const noOwner = await site("porocilo-brez-lastnika", { owner: false });
    await platform.repo.stats.bump(owned, "visits", "2026-10-03");
    await platform.repo.stats.bump(owned, "visits", "2026-10-20");
    await platform.repo.stats.bump(owned, "calls", "2026-10-20");
    await platform.repo.stats.bump(owned, "visits", "2026-11-01"); // November: not in October's report
    const sent: MailMessage[] = [];
    let fail = true;
    const mailer: Mailer = {
      kind: "memory",
      async send(m) {
        if (fail) throw new Error("Resend refused the message: HTTP 503");
        sent.push(m);
      },
    };
    const deps = { repo: platform.repo, config, mailer, appUrl: "https://stranko.example", log: () => undefined };
    // Before 08:00 on the 1st, and after the 5th: nothing.
    expect(await sendMonthlyReports(deps, new Date("2026-11-01T05:00:00Z"))).toBe(0);
    expect(await sendMonthlyReports(deps, new Date("2026-11-06T10:00:00Z"))).toBe(0);
    // A failed send stays pending; the retry waits for retryEveryMinutes.
    expect(await sendMonthlyReports(deps, new Date("2026-11-01T09:00:00Z"))).toBe(0);
    expect(await platform.repo.stats.report(owned, "2026-10")).toEqual({ status: "pending", attempts: 1 });
    // A site without an owner account never gets one.
    expect(await platform.repo.stats.report(noOwner, "2026-10")).toBeNull();
    fail = false;
    expect(await sendMonthlyReports(deps, new Date("2026-11-01T09:05:00Z"))).toBe(0);
    await platform.db.query("update stats_reports set last_attempt_at = now() - interval '2 hours'");
    // Every published site with an owner gets one (the earlier tests' sites too).
    const owners = await platform.db.query<{ n: string | number }>("select count(*) as n from sites where account_id is not null and published_version is not null");
    expect(await sendMonthlyReports(deps, new Date("2026-11-01T10:00:00Z"))).toBe(Number(owners.rows[0]!.n));
    const mine = sent.filter((m) => m.idempotencyKey === `stats-report-${owned}-2026-10`);
    expect(mine).toHaveLength(1);
    expect(mine[0]!.to).toBe(OWNER);
    expect(mine[0]!.text).toContain("Ogledi strani: 2");
    expect(mine[0]!.text).toContain("Tapi na klic: 1");
    expect(mine[0]!.text).toContain("https://stranko.example/s/porocilo-lastnik/");
    // Never twice.
    expect(await sendMonthlyReports(deps, new Date("2026-11-02T10:00:00Z"))).toBe(0);
    expect(await platform.repo.stats.report(owned, "2026-10")).toEqual({ status: "sent", attempts: 2 });
  });
});
