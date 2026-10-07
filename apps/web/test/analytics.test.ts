import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, type AppConfig } from "@sb/config";
import { Repo, createDb, createFsStorage, memoryMailer, migrate, type EventKind, type JobData, type Platform, type ProductEventRow, type Queue } from "@sb/platform";
import type { SiteSpec } from "@sb/spec";
import { createApp } from "../src/app.ts";
import { deviceKey } from "../src/analytics.ts";
import { adminBrowser, newBrowser, ownerSignIn, setCookies, type Browser, type Req } from "./session-helpers.ts";
import { fillPlaceholderOps } from "../../../tools/eval/src/placeholder-fill.ts";

/**
 * Product events from the web process (docs/plans/analytics.md Step 1, it-analytics), with config analytics.events
 * on: each funnel step writes its event where it happens, with the device as a keyed hash and never an IP or an
 * email; with the switch off nothing is written; /admin/funnel and /admin/engine are the admin's alone.
 * The worker's events (preview_ready, site_generated, generation) are in apps/worker/test/telemetry.test.ts,
 * domain_connected in apps/worker/test/domain.test.ts.
 */
// The first landing page renders its bundles; on a loaded machine that takes longer than the default.
vi.setConfig({ testTimeout: 120_000 });
const here = path.dirname(fileURLToPath(import.meta.url));
const PASSWORD = "test-password-1234";
const SECRET = "s".repeat(32);
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const base = loadConfig();
const config: AppConfig = { ...structuredClone(base), analytics: { ...base.analytics, events: true } };
config.limits.dailyModelSpendCapEur = 100;
const mail = memoryMailer();
const sent: { name: keyof JobData; data: JobData[keyof JobData] }[] = [];
let platform: Platform;
let dir: string;
let req: Req;
/** Every IP address a request in this file came from: none may be in an event. */
const ips: string[] = [];
let ipCounter = 0;
const freshIp = () => {
  const ip = `203.0.113.${++ipCounter}`;
  ips.push(ip);
  return ip;
};
const skipBotCheck = { mode: "skip" as const, siteKey: null, verify: async () => true };

async function makePlatform(): Promise<Platform> {
  const db = await createDb("pglite://memory");
  await migrate(db);
  const queue: Queue = {
    send: async (name, data) => {
      sent.push({ name, data });
      return `job_${sent.length}`;
    },
    work: async () => undefined,
    ping: async () => undefined,
    stop: async () => undefined,
  };
  return { db, repo: new Repo(db), storage: createFsStorage(dir), queue, close: () => db.close() };
}

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sb-analytics-"));
  platform = await makePlatform();
  const app = createApp({ platform, config, auth: { password: PASSWORD, secret: SECRET, secureCookies: false }, mailer: mail, appUrl: "https://stranko.example", botCheck: skipBotCheck });
  req = (p, init) => app.request(p, init);
}, 60_000);
afterAll(async () => {
  await platform?.close();
  await rm(dir, { recursive: true, force: true });
});

const DESCRIPTION = "Pekarna Kvas v Kamniku, Šutna 30. Kruh z drožmi, rogljički in potica. Odprto vsak dan od 7.00 do 13.00.";
const eventsOf = (kind: EventKind): Promise<ProductEventRow[]> => platform.repo.events.list({ kind });
const deviceOf = (b: Browser) => /sb_device=([0-9a-f]{32})\./.exec(b.cookie)![1]!;
const json = (cookie: string) => ({ cookie, "content-type": "application/json" });

/** The landing page's form without an account: the ticket, then the form carrying it. */
async function anonymousIntake(b: Browser, description = DESCRIPTION) {
  const ip = freshIp();
  const ticket = await req("/api/intake/ticket", { method: "POST", body: new URLSearchParams({ _csrf: b.csrf, description }), headers: { cookie: b.cookie, "x-real-ip": ip } });
  if (ticket.status !== 200) return ticket;
  const form = new FormData();
  form.set("_csrf", b.csrf);
  form.set("description", description);
  const t = ((await ticket.json()) as { ticket: string }).ticket;
  return req(`/api/sites?ticket=${encodeURIComponent(t)}`, { method: "POST", body: form, headers: { cookie: b.cookie, "x-real-ip": ip } });
}

/** What the generation job would leave: a saved version of a golden site (its facts are in its fixture's description), the site ready. */
async function generated(siteId: string, fixture = "pekarna-kvas"): Promise<SiteSpec> {
  const golden = JSON.parse(await readFile(path.join(here, `../../../tools/eval/golden/${fixture}.json`), "utf8")) as SiteSpec;
  const site = (await platform.repo.getSite(siteId))!;
  await platform.repo.saveSpec(siteId, { ...golden, slug: site.slug }, "generate");
  await platform.repo.setStatus(siteId, "ready");
  return golden;
}
const fixtureDescription = async (fixture: string) => (JSON.parse(await readFile(path.join(here, `../../../tools/eval/fixtures/${fixture}/brief.json`), "utf8")) as { description: string }).description;

let anon: Browser;
let anonSite: string;

describe("the funnel's steps write their events", () => {
  it("landing_view: once per device in the window, not for bots or prefetches; upsell_clicked from the editor's link", async () => {
    anon = await newBrowser(req);
    for (let i = 0; i < 2; i++) expect((await req("/", { headers: { cookie: anon.cookie, "user-agent": UA, "x-real-ip": freshIp() } })).status).toBe(200);
    await req("/", { headers: { cookie: anon.cookie, "user-agent": "Googlebot/2.1" } });
    const other = await newBrowser(req);
    await req("/", { headers: { cookie: other.cookie, "user-agent": UA, "sec-purpose": "prefetch" } });
    const views = await eventsOf("landing_view");
    expect(views).toHaveLength(1);
    expect(views[0]).toMatchObject({ device_key: deviceKey(SECRET, deviceOf(anon)), tier: "anonymous", account_id: null, site_id: null });

    await req("/?ref=upsell", { headers: { cookie: anon.cookie, "user-agent": UA } });
    expect((await eventsOf("upsell_clicked")).map((e) => e.props)).toEqual([{ where: "plans" }]);
  });

  it("intake_refused: with the reason's code, from the ticket and from the form", async () => {
    const short = await anonymousIntake(anon, "Pekarna.");
    expect(short.status).toBe(400);
    const form = new FormData();
    form.set("_csrf", "wrong");
    form.set("description", DESCRIPTION);
    const signedOut = await req("/api/sites", { method: "POST", body: form, headers: { cookie: anon.cookie } });
    expect(signedOut.status).toBe(403);
    expect((await eventsOf("intake_refused")).map((e) => e.props.reason)).toEqual(["too_short", "no_javascript"]);
  });

  it("intake_submitted: the new site, the device, the tier and the scope", async () => {
    const res = await anonymousIntake(anon);
    expect(res.status).toBe(303);
    anonSite = res.headers.get("location")!.split("/").at(-1)!;
    const [e] = await eventsOf("intake_submitted");
    expect(e).toMatchObject({ site_id: anonSite, device_key: deviceKey(SECRET, deviceOf(anon)), tier: "anonymous", props: { scope: "home", photos: 0, logo: false } });
  });

  it("limit_hit: a second free homepage on the same device, with which limit and the job (and the intake's refusal)", async () => {
    const res = await anonymousIntake(anon);
    expect(res.status).toBe(429);
    const [hit] = await eventsOf("limit_hit");
    expect(hit).toMatchObject({ tier: "anonymous", props: { job: "generate" } });
    expect(typeof hit!.props.which).toBe("string");
    expect((await eventsOf("intake_refused")).at(-1)!.props.reason).toBe(hit!.props.which);
  });

  it("preview_opened: the editor's frame showing the homepage, once per device and site", async () => {
    await generated(anonSite);
    for (let i = 0; i < 2; i++) expect((await req(`/preview/${anonSite}/index.html`, { headers: { cookie: anon.cookie } })).status).toBe(200);
    // A layout thumbnail or an older version isn't the preview being opened.
    await req(`/preview/${anonSite}/index.html?v=1`, { headers: { cookie: anon.cookie } });
    const opened = await eventsOf("preview_opened");
    expect(opened).toHaveLength(1);
    expect(opened[0]).toMatchObject({ site_id: anonSite, device_key: deviceKey(SECRET, deviceOf(anon)) });
  });

  it("upsell_shown: a free preview's locked pages with the plan's price, once per device and site", async () => {
    await platform.repo.setBrief(anonSite, { pages: [{ kind: "standard", slug: "cenik", navLabel: "Cenik" }] });
    for (let i = 0; i < 2; i++) {
      const state = (await (await req(`/api/sites/${anonSite}`, { headers: { cookie: anon.cookie } })).json()) as { access: { lockedPages: string[] } };
      expect(state.access.lockedPages).toEqual(["Cenik"]);
    }
    const shown = await eventsOf("upsell_shown");
    expect(shown).toHaveLength(1);
    expect(shown[0]).toMatchObject({ site_id: anonSite, props: { where: "locked_pages" } });
  });

  it("signin_requested, signin_done and preview_claimed: on the device that asked, by the account's id", async () => {
    const signed = await ownerSignIn(req, mail.sent, "lastnica@pekarna-kvas.si", anon);
    anon = { ...anon, cookie: signed.cookie };
    const key = deviceKey(SECRET, deviceOf(anon));
    const account = (await platform.repo.accounts.byKey("lastnica@pekarna-kvas.si"))!;
    expect(await eventsOf("signin_requested")).toMatchObject([{ device_key: key, account_id: null }]);
    expect(await eventsOf("signin_done")).toMatchObject([{ device_key: key, account_id: account.id, tier: "free" }]);
    expect(await eventsOf("preview_claimed")).toMatchObject([{ site_id: anonSite, account_id: account.id, device_key: key, props: { via: "signin" } }]);
  });

  it("edit_direct, edit_chat and a plan limit an edit runs into (limit_hit and upsell_shown at the limit)", async () => {
    const patch = await req(`/api/sites/${anonSite}/patch`, { method: "POST", headers: json(anon.cookie), body: JSON.stringify({ ops: [{ op: "replace", path: "/business/name", value: "Pekarna Kvas" }] }) });
    expect(patch.status, await patch.clone().text()).toBe(200);
    expect(await eventsOf("edit_direct")).toMatchObject([{ site_id: anonSite, tier: "free" }]);
    const chat = await req(`/api/sites/${anonSite}/chat`, { method: "POST", headers: json(anon.cookie), body: JSON.stringify({ message: "Temnejša glava prosim" }) });
    expect(chat.status).toBe(200);
    expect(await eventsOf("edit_chat")).toMatchObject([{ site_id: anonSite, tier: "free" }]);
    // A free preview is one page: adding another runs into the plan limit, which names the plan that has more.
    const page = await req(`/api/sites/${anonSite}/pages`, { method: "POST", headers: json(anon.cookie), body: JSON.stringify({ slug: "cenik", label: "Cenik" }) });
    expect(page.status).toBe(403);
    const code = ((await page.json()) as { code: string }).code;
    expect((await eventsOf("limit_hit")).at(-1)).toMatchObject({ site_id: anonSite, props: { which: code } });
    expect((await eventsOf("upsell_shown")).at(-1)).toMatchObject({ site_id: anonSite, props: { where: "limit" } });
  });

  it("plan_changed (the admin's allow-list, by account id), published and exported (a paid owner)", async () => {
    const admin = await adminBrowser(req, PASSWORD);
    const email = "lastnik@frizer-ana.si";
    const owner = await ownerSignIn(req, mail.sent, email);
    const account = (await platform.repo.accounts.byKey(email))!;
    const add = await req("/admin/allow-list", { method: "POST", body: new URLSearchParams({ _csrf: admin.csrf, email, plan: "standard" }), headers: { cookie: admin.cookie } });
    expect(add.status).toBe(200);
    expect(await eventsOf("plan_changed")).toMatchObject([{ account_id: account.id, tier: "paid", plan: "standard", props: { from: null, to: "standard" } }]);
    // The same plan again is no change.
    await req("/admin/allow-list", { method: "POST", body: new URLSearchParams({ _csrf: admin.csrf, email, plan: "standard" }), headers: { cookie: admin.cookie } });
    expect(await eventsOf("plan_changed")).toHaveLength(1);

    const site = await platform.repo.createSite({ name: "Seliškar", slug: "racunovodstvo-seliskar", intake: { description: await fixtureDescription("racunovodstvo-seliskar"), photoAssetIds: [], scope: "full" }, accountId: account.id });
    const spec = await generated(site.id, "racunovodstvo-seliskar");
    const ops = fillPlaceholderOps(spec);
    if (ops.length) {
      const fill = await req(`/api/sites/${site.id}/patch`, { method: "POST", headers: json(owner.cookie), body: JSON.stringify({ ops, message: "podatki" }) });
      expect(fill.status, await fill.clone().text()).toBe(200);
    }
    const pub = await req(`/api/sites/${site.id}/publish`, { method: "POST", headers: json(owner.cookie), body: "{}" });
    expect(pub.status, await pub.clone().text()).toBe(200);
    expect(await eventsOf("published")).toMatchObject([{ site_id: site.id, account_id: account.id, tier: "paid", plan: "standard", props: { first: true } }]);
    const zip = await req(`/api/sites/${site.id}/export?anyway=1`, { headers: { cookie: owner.cookie } });
    expect(zip.status).toBe(200);
    expect(await eventsOf("exported")).toMatchObject([{ site_id: site.id, account_id: account.id }]);

    // Taken off the list: a change to no plan.
    await req("/admin/allow-list/remove", { method: "POST", body: new URLSearchParams({ _csrf: admin.csrf, key: email }), headers: { cookie: admin.cookie } });
    expect((await eventsOf("plan_changed")).at(-1)).toMatchObject({ account_id: account.id, plan: null, props: { from: "standard", to: null } });
  });

  it("the admin's own clicks are not the funnel's", async () => {
    const admin = await adminBrowser(req, PASSWORD);
    const before = (await platform.repo.events.list()).length;
    await req("/", { headers: { cookie: admin.cookie, "user-agent": UA } });
    await req(`/preview/${anonSite}/index.html`, { headers: { cookie: admin.cookie } });
    expect((await platform.repo.events.list()).length).toBe(before);
  });

  it("no event holds an IP address, an email address or the device cookie's id", async () => {
    const rows = await platform.repo.events.list();
    expect(rows.length).toBeGreaterThan(15);
    const dump = JSON.stringify(rows);
    for (const ip of ips) expect(dump).not.toContain(ip);
    expect(dump).not.toMatch(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/);
    expect(dump).not.toContain("@");
    expect(dump).not.toContain(deviceOf(anon));
    // Device keys are the keyed hash, 32 hex characters.
    for (const r of rows) if (r.device_key) expect(r.device_key).toMatch(/^[0-9a-f]{32}$/);
    const kinds = new Set(rows.map((r) => r.kind));
    for (const k of ["landing_view", "upsell_clicked", "intake_refused", "intake_submitted", "limit_hit", "preview_opened", "upsell_shown", "signin_requested", "signin_done", "preview_claimed", "edit_direct", "edit_chat", "plan_changed", "published", "exported"] as const) {
      expect(kinds.has(k), k).toBe(true);
    }
  });

  it("the privacy page says so in one sentence while events are written", async () => {
    const page = await (await req("/zasebnost")).text();
    expect(page).toContain('id="product-events"');
    expect(page).toContain(`po ${config.analytics.keepDays} dneh združimo v dnevna števila`);
  });
});

describe("/admin/funnel and /admin/engine", () => {
  it("are the admin's: a visitor is sent to sign in, an owner gets a 404", async () => {
    for (const p of ["/admin/funnel", "/admin/engine", "/admin/funnel?dni=30"]) {
      const anonymous = await req(p, { redirect: "manual" });
      expect(anonymous.status, p).toBe(302);
      expect(anonymous.headers.get("location"), p).toContain("/login");
      expect((await req(p, { headers: { cookie: anon.cookie } })).status, p).toBe(404);
    }
    const admin = await adminBrowser(req, PASSWORD);
    const funnel = await req("/admin/funnel", { headers: { cookie: admin.cookie } });
    expect(funnel.status).toBe(200);
    const text = await funnel.text();
    expect(text).toContain("Oddani opisi");
    expect(text).toContain("too_short");
    const engine = await req("/admin/engine?dni=30", { headers: { cookie: admin.cookie } });
    expect(engine.status).toBe(200);
    expect(await engine.text()).toContain("Ustvarjanja, zadnjih 30 dni");
    // /admin links to both.
    const home = await (await req("/admin", { headers: { cookie: admin.cookie } })).text();
    expect(home).toContain('href="/admin/funnel"');
    expect(home).toContain('href="/admin/engine"');
  });
});

describe("with analytics.events off (the default)", () => {
  it("writes nothing and the privacy page doesn't mention it", async () => {
    expect(base.analytics.events).toBe(false);
    const off = await makePlatform();
    try {
      const app = createApp({ platform: off, config: { ...structuredClone(base), limits: { ...base.limits, dailyModelSpendCapEur: 100 } }, auth: { password: PASSWORD, secret: SECRET, secureCookies: false }, mailer: mail, appUrl: "https://stranko.example", botCheck: skipBotCheck });
      const r: Req = (p, init) => app.request(p, init);
      const b = await newBrowser(r);
      await r("/", { headers: { cookie: b.cookie, "user-agent": UA } });
      const ticket = await r("/api/intake/ticket", { method: "POST", body: new URLSearchParams({ _csrf: b.csrf, description: DESCRIPTION }), headers: { cookie: b.cookie } });
      expect(ticket.status).toBe(200);
      await r("/api/intake/ticket", { method: "POST", body: new URLSearchParams({ _csrf: b.csrf, description: "kratko" }), headers: { cookie: b.cookie } });
      expect(await off.repo.events.list()).toEqual([]);
      expect(await (await r("/zasebnost")).text()).not.toContain("product-events");
      expect(setCookies(await r("/")).sb_device).toBeTruthy();
    } finally {
      await off.close();
    }
  });
});
