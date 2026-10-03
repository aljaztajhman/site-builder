import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "@sb/config";
import { Repo, createDb, createFsStorage, memoryMailer, migrate, type Platform, type Queue } from "@sb/platform";
import type { SiteSpec } from "@sb/spec";
import { createApp } from "../src/app.ts";
import { hashToken } from "../src/access.ts";
import { adminBrowser, csrfIn, linkFor, newBrowser, ownerSignIn, setCookies, type Req } from "./session-helpers.ts";

/** Owner accounts: magic-link sign-in, sessions, one owner per site, the admin's allow-list, CSRF. */
const here = path.dirname(fileURLToPath(import.meta.url));
const PASSWORD = "test-password-1234";
const config = loadConfig();
const mail = memoryMailer();
const sent: { name: string; data: unknown }[] = [];
let platform: Platform;
let dir: string;
let app: ReturnType<typeof createApp>;
let req: Req;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sb-accounts-"));
  const db = await createDb("pglite://memory");
  await migrate(db);
  const queue: Queue = {
    send: async (name, data) => {
      sent.push({ name, data });
      return "job";
    },
    work: async () => undefined,
    ping: async () => undefined,
    stop: async () => undefined,
  };
  platform = { db, repo: new Repo(db), storage: createFsStorage(dir), queue, close: () => db.close() };
  app = createApp({ platform, config, auth: { password: PASSWORD, secret: "s".repeat(32), secureCookies: false }, mailer: mail, appUrl: "https://stranko.example" });
  req = (p, init) => app.request(p, init);
});
afterAll(async () => {
  await platform.close();
  await rm(dir, { recursive: true, force: true });
});

const askLink = (b: { cookie: string; csrf: string }, email: string, ip = "198.51.100.1") =>
  req("/login/email", { method: "POST", body: new URLSearchParams({ email, _csrf: b.csrf, next: "/sites" }), headers: { cookie: b.cookie, "x-forwarded-for": ip } });

async function ownedSite(accountId: string | null, slug: string): Promise<string> {
  const golden = JSON.parse(await readFile(path.join(here, "../../../tools/eval/golden/pekarna-kvas.json"), "utf8")) as SiteSpec;
  const site = await platform.repo.createSite({ name: slug, slug, intake: { description: "Pekarna Kvas, Šutna 30, Kamnik.", photoAssetIds: [], scope: "home" }, accountId });
  await platform.repo.saveSpec(site.id, { ...golden, slug }, "generate");
  await platform.repo.setStatus(site.id, "ready");
  return site.id;
}

describe("magic-link sign-in", () => {
  it("sends a single-use link, stored only as a hash, that signs in after one tap", async () => {
    const b = await newBrowser(req);
    const asked = await askLink(b, "Ana.Novak@Siol.net");
    expect(asked.status).toBe(200);
    expect(await asked.text()).toContain("Preverite e-pošto");
    const url = new URL(linkFor(mail.sent, "ana.novak@siol.net"));
    expect(url.origin).toBe("https://stranko.example");
    const token = url.searchParams.get("t")!;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(mail.sent.at(-1)!.subject).toBe("Prijava v Stranko");
    // Only the hash is stored.
    const { rows } = await platform.db.query<{ token_hash: string }>("select token_hash from login_tokens");
    expect(rows.map((r) => r.token_hash)).toContain(hashToken(token));
    expect(JSON.stringify(rows)).not.toContain(token);

    // Opening the link (what a mail scanner does) only shows the button.
    const page = await req(`/login/link?t=${token}`, { headers: { cookie: b.cookie } });
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("Prijavljate se kot ana.novak@siol.net.");
    expect(await platform.repo.accounts.peekLoginToken(hashToken(token))).not.toBeNull();
    // Without the form token nothing happens and the link still works.
    expect((await req("/login/link", { method: "POST", body: new URLSearchParams({ t: token }), headers: { cookie: b.cookie } })).status).toBe(403);
    const done = await req("/login/link", { method: "POST", body: new URLSearchParams({ t: token, _csrf: csrfIn(html) }), headers: { cookie: b.cookie } });
    expect(done.status).toBe(303);
    expect(done.headers.get("location")).toBe("/sites");
    const cookie = done.headers.getSetCookie().find((c) => c.startsWith("sb_account="))!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    const session = setCookies(done).sb_account!;
    expect((await req("/sites", { headers: { cookie: `${b.cookie}; sb_account=${session}` } })).status).toBe(200);

    // Single use: the same link again is refused.
    const again = await req("/login/link", { method: "POST", body: new URLSearchParams({ t: token, _csrf: csrfIn(html) }), headers: { cookie: b.cookie } });
    expect(again.status).toBe(400);
    expect(await again.text()).toContain("Povezava ne velja več");
    expect((await req(`/login/link?t=${token}`)).status).toBe(400);
  });

  it("refuses an expired link", async () => {
    const b = await newBrowser(req);
    await askLink(b, "pozna@siol.net", "198.51.100.2");
    const token = new URL(linkFor(mail.sent, "pozna@siol.net")).searchParams.get("t")!;
    await platform.db.query("update login_tokens set expires_at = now() - interval '1 second' where token_hash = $1", [hashToken(token)]);
    const page = await req(`/login/link?t=${token}`, { headers: { cookie: b.cookie } });
    expect(page.status).toBe(400);
    const done = await req("/login/link", { method: "POST", body: new URLSearchParams({ t: token, _csrf: b.csrf }), headers: { cookie: b.cookie } });
    expect(done.status).toBe(400);
    expect(setCookies(done).sb_account).toBeUndefined();
  });

  it("links expire after the configured minutes", async () => {
    const b = await newBrowser(req);
    await askLink(b, "rok@siol.net", "198.51.100.3");
    const token = new URL(linkFor(mail.sent, "rok@siol.net")).searchParams.get("t")!;
    const { rows } = await platform.db.query<{ m: number }>("select extract(epoch from expires_at - created_at) / 60 as m from login_tokens where token_hash = $1", [hashToken(token)]);
    expect(Number(rows[0]!.m)).toBeCloseTo(config.accounts.magicLink.ttlMinutes, 1);
  });

  it("answers the same whether or not the address has an account (no enumeration)", async () => {
    const b = await newBrowser(req);
    await ownerSignIn(req, mail.sent, "obstaja@siol.net", b);
    const known = await (await askLink(b, "obstaja@siol.net", "198.51.100.4")).text();
    const unknown = await (await askLink(b, "nikoli@siol.net", "198.51.100.4")).text();
    expect(known.replace("obstaja@siol.net", "X")).toBe(unknown.replace("nikoli@siol.net", "X"));
  });

  it("refuses throwaway inboxes and bad addresses, keeping what was typed", async () => {
    const b = await newBrowser(req);
    const throwaway = await askLink(b, "nekdo@mailinator.com");
    expect(throwaway.status).toBe(400);
    const text = await throwaway.text();
    expect(text).toContain("Naslovov za enkratno uporabo ne sprejemamo");
    expect(text).toContain('value="nekdo@mailinator.com"');
    expect((await askLink(b, "ni-naslov")).status).toBe(400);
    expect(mail.sent.some((m) => m.to === "nekdo@mailinator.com")).toBe(false);
  });

  it("rate-limits links per normalised address and per IP", async () => {
    const b = await newBrowser(req);
    const n = config.accounts.magicLink.perEmailPerHour;
    // Variants of one Gmail inbox count together.
    const variants = ["Mojca.Kos@gmail.com", "mojcakos+a@gmail.com", "mojca.kos@googlemail.com", "MOJCAKOS@gmail.com"];
    for (let i = 0; i < n; i++) expect((await askLink(b, variants[i % variants.length]!, `198.51.100.${10 + i}`)).status).toBe(200);
    expect((await askLink(b, variants[n % variants.length]!, "198.51.100.99")).status).toBe(429);

    const perIp = config.accounts.magicLink.perIpPerHour;
    for (let i = 0; i < perIp; i++) expect((await askLink(b, `oseba${i}@siol.net`, "203.0.113.50")).status).toBe(200);
    expect((await askLink(b, "se-ena@siol.net", "203.0.113.50")).status).toBe(429);
  });

  it("refuses a link request without the form token", async () => {
    const b = await newBrowser(req);
    const res = await req("/login/email", { method: "POST", body: new URLSearchParams({ email: "ana@siol.net" }), headers: { cookie: b.cookie } });
    expect(res.status).toBe(403);
  });

  it("puts every variant of one inbox in one account", async () => {
    const a = await ownerSignIn(req, mail.sent, "Petra.Zupan+stran@gmail.com");
    const b = await ownerSignIn(req, mail.sent, "petrazupan@googlemail.com");
    const accounts = (await platform.repo.accounts.list()).filter((x) => x.email_key === "petrazupan@gmail.com");
    expect(accounts).toHaveLength(1);
    expect(a.cookie).not.toBe(b.cookie);
  });
});

describe("sessions", () => {
  it("end on sign-out and when they expire", async () => {
    const owner = await ownerSignIn(req, mail.sent, "seja@siol.net");
    expect((await req("/sites", { headers: { cookie: owner.cookie } })).status).toBe(200);
    const out = await req("/logout", { method: "POST", body: new URLSearchParams({ _csrf: owner.csrf }), headers: { cookie: owner.cookie } });
    expect(out.status).toBe(303);
    expect((await req("/sites", { headers: { cookie: owner.cookie } })).status).toBe(302);

    const again = await ownerSignIn(req, mail.sent, "seja@siol.net");
    expect((await req("/sites", { headers: { cookie: again.cookie } })).status).toBe(200);
    await platform.db.query("update sessions set expires_at = now() - interval '1 second'");
    expect((await req("/sites", { headers: { cookie: again.cookie } })).status).toBe(302);
    expect((await req("/api/sites/site_0000000000000000", { headers: { cookie: again.cookie } })).status).toBe(401);
  });

  it("are Secure when deployed", async () => {
    const deployed = createApp({ platform, config, auth: { password: PASSWORD, secret: "s".repeat(32), secureCookies: true }, mailer: mail, appUrl: "https://stranko.example" });
    const dreq: Req = (p, init) => deployed.request(p, init);
    const res = await dreq("/login");
    expect(res.headers.getSetCookie().find((c) => c.startsWith("sb_device="))).toMatch(/Secure/);
    const owner = await newBrowser(dreq);
    const asked = await dreq("/login/email", { method: "POST", body: new URLSearchParams({ email: "varno@siol.net", _csrf: owner.csrf }), headers: { cookie: owner.cookie, "x-forwarded-for": "198.51.100.200" } });
    expect(asked.status).toBe(200);
    const token = new URL(linkFor(mail.sent, "varno@siol.net")).searchParams.get("t")!;
    const page = await (await dreq(`/login/link?t=${token}`, { headers: { cookie: owner.cookie } })).text();
    const done = await dreq("/login/link", { method: "POST", body: new URLSearchParams({ t: token, _csrf: csrfIn(page) }), headers: { cookie: owner.cookie } });
    expect(done.headers.getSetCookie().find((c) => c.startsWith("sb_account="))).toMatch(/Secure/);
  });
});

describe("one owner per site", () => {
  it("shows owners only their own sites; the admin sees all; someone else's site is a 404", async () => {
    const ana = await ownerSignIn(req, mail.sent, "ana.lastnica@siol.net");
    const bor = await ownerSignIn(req, mail.sent, "bor.lastnik@siol.net");
    const anaId = (await platform.repo.accounts.byKey("ana.lastnica@siol.net"))!.id;
    const site = await ownedSite(anaId, "anina-pekarna");
    const adminSite = await ownedSite(null, "skrbnikova");

    const anaList = await (await req("/sites", { headers: { cookie: ana.cookie } })).text();
    expect(anaList).toContain(`href="/sites/${site}"`);
    expect(anaList).not.toContain(`href="/sites/${adminSite}"`);
    expect(anaList).toContain("Moje strani");
    // Owners never see the platform's spend.
    expect(anaList).not.toContain("danes</span>");
    const borList = await (await req("/sites", { headers: { cookie: bor.cookie } })).text();
    expect(borList).not.toContain(`href="/sites/${site}"`);

    for (const p of [`/sites/${site}`, `/api/sites/${site}`, `/api/sites/${site}/pulse`, `/preview/${site}/index.html`, `/sites/${site}/messages`]) {
      expect((await req(p, { headers: { cookie: ana.cookie } })).status, `ana ${p}`).toBe(200);
      expect((await req(p, { headers: { cookie: bor.cookie } })).status, `bor ${p}`).toBe(404);
    }
    const patch = (cookie: string) =>
      req(`/api/sites/${site}/patch`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ ops: [{ op: "replace", path: "/pages/0/sections/0/props/headline", value: "Kruh iz Kamnika" }] }) });
    expect((await patch(bor.cookie)).status).toBe(404);
    expect((await patch(ana.cookie)).status).toBe(200);
    // The admin's own sites stay the admin's.
    expect((await req(`/api/sites/${adminSite}`, { headers: { cookie: ana.cookie } })).status).toBe(404);

    const admin = await adminBrowser(req, PASSWORD);
    const all = await (await req("/sites", { headers: { cookie: admin.cookie } })).text();
    expect(all).toContain(`href="/sites/${site}"`);
    expect(all).toContain(`href="/sites/${adminSite}"`);
    const state = (await (await req(`/api/sites/${site}`, { headers: { cookie: admin.cookie } })).json()) as { access: { viewer: string }; spendToday: number | null };
    expect(state.access.viewer).toBe("admin");
    expect(typeof state.spendToday).toBe("number");
    const owner = (await (await req(`/api/sites/${site}`, { headers: { cookie: ana.cookie } })).json()) as { access: { viewer: string; can: Record<string, boolean> }; spendToday: number | null; cap: number | null };
    expect(owner.access).toMatchObject({ viewer: "free", can: { edit: true, chat: true, regenerate: true, publish: false, export: false, fullSite: false } });
    expect(owner.spendToday).toBeNull();
    expect(owner.cap).toBeNull();
  });
});

describe("allow-list (full sites before billing)", () => {
  it("is the admin's page; an allow-listed owner gets publishing, export, full sites and AI work", async () => {
    const eva = await ownerSignIn(req, mail.sent, "eva.partner@siol.net");
    const evaId = (await platform.repo.accounts.byKey("eva.partner@siol.net"))!.id;
    const site = await ownedSite(evaId, "evina-stran");

    expect((await req("/admin")).status).toBe(302);
    expect((await req("/admin", { headers: { cookie: eva.cookie } })).status).toBe(404);
    const refused = (await (await req(`/api/sites/${site}/publish`, { method: "POST", headers: { cookie: eva.cookie } })).json()) as { code: string; message: string };
    expect(refused.code).toBe("paid_only");
    expect(refused.message).toMatch(/naročnine/);
    expect((await req(`/api/sites/${site}/export`, { headers: { cookie: eva.cookie } })).status).toBe(403);
    // A whole site isn't a free right.
    const full = await req(`/api/sites/${site}/generate`, { method: "POST", headers: { cookie: eva.cookie, "content-type": "application/json" }, body: JSON.stringify({ scope: "full" }) });
    expect(full.status).toBe(403);
    expect(((await full.json()) as { code: string }).code).toBe("full_site_paid");

    const admin = await adminBrowser(req, PASSWORD);
    // The admin's forms carry the token too.
    expect((await req("/admin/allow-list", { method: "POST", body: new URLSearchParams({ email: "eva.partner@siol.net" }), headers: { cookie: admin.cookie } })).status).toBe(403);
    const added = await req("/admin/allow-list", { method: "POST", body: new URLSearchParams({ email: "Eva.Partner+x@Siol.net", note: "prva partnerka", _csrf: admin.csrf }), headers: { cookie: admin.cookie } });
    expect(added.status).toBe(200);
    const page = await added.text();
    expect(page).toContain("prva partnerka");
    expect(page).toContain("eva.partner+x@siol.net");
    // Listed without a choice: Osnovni. The accounts list shows her plan, sites and AI cost, and a summary per plan.
    expect(page).toContain("ima zdaj paket Osnovni.");
    expect(page).toMatch(/<dt>Paket<\/dt><dd>Osnovni od \d+\. \d+\. \d{4}<\/dd>/);
    expect(page).toMatch(/<p class="muted num" id="plan-summary">Brezplačno \d+ · Osnovni 1 · Plus 0\. Mesečno po načrtovanih cenah 15,00\u00a0€ z DDV, pomočnik ta mesec [\d,]+\u00a0€\.<\/p>/);
    // The admin moves her to Plus from her account card; the date her paid rights started stays.
    const since = (await platform.repo.accounts.allowed("eva.partner@siol.net"))!.added_at;
    const plus = await req("/admin/allow-list", { method: "POST", body: new URLSearchParams({ email: "eva.partner+x@siol.net", plan: "premium", _csrf: admin.csrf }), headers: { cookie: admin.cookie } });
    expect(await plus.text()).toContain("ima zdaj paket Plus.");
    expect(await platform.repo.accounts.allowed("eva.partner@siol.net")).toMatchObject({ plan: "premium", added_at: since });
    await req("/admin/allow-list", { method: "POST", body: new URLSearchParams({ email: "eva.partner+x@siol.net", plan: "standard", _csrf: admin.csrf }), headers: { cookie: admin.cookie } });

    const state = (await (await req(`/api/sites/${site}`, { headers: { cookie: eva.cookie } })).json()) as { access: { viewer: string; can: Record<string, boolean> } };
    expect(state.access).toMatchObject({ viewer: "paid", can: { edit: true, chat: true, regenerate: true, publish: true, export: true, fullSite: true } });
    const queued = await req(`/api/sites/${site}/chat`, { method: "POST", headers: { cookie: eva.cookie, "content-type": "application/json" }, body: JSON.stringify({ message: "Temnejša glava" }) });
    expect(queued.status).toBe(200);
    expect(sent.at(-1)).toMatchObject({ name: "edit", data: { siteId: site } });
    // The landing page offers the whole site to her.
    expect(await (await req("/", { headers: { cookie: eva.cookie } })).text()).toContain('id="scope-full"');

    // A new site from the landing page belongs to her.
    const form = new FormData();
    form.set("_csrf", eva.csrf);
    form.set("description", "Pekarna na vasi v Mengšu, kruh z drožmi, odprto vsak dan od 7.00 do 13.00.");
    form.set("scope", "full");
    const made = await req("/api/sites", { method: "POST", body: form, headers: { cookie: eva.cookie } });
    expect(made.status).toBe(303);
    const id = made.headers.get("location")!.split("/").at(-1)!;
    expect((await platform.repo.getSite(id))!.account_id).toBe(evaId);

    const removed = await req("/admin/allow-list/remove", { method: "POST", body: new URLSearchParams({ key: "eva.partner@siol.net", _csrf: admin.csrf }), headers: { cookie: admin.cookie } });
    expect(removed.status).toBe(200);
    expect((await req(`/api/sites/${site}/export`, { headers: { cookie: eva.cookie } })).status).toBe(403);
  });

  it("free owners can't ask for a whole site", async () => {
    const o = await ownerSignIn(req, mail.sent, "brez.celotne@siol.net");
    expect(await (await req("/", { headers: { cookie: o.cookie } })).text()).not.toContain('id="scope-full"');
  });

  it("lets the admin make a sign-in link (support, deployed smoke test), nobody else", async () => {
    const admin = await adminBrowser(req, PASSWORD);
    const made = await req("/admin/login-link", { method: "POST", headers: { cookie: admin.cookie, "content-type": "application/json" }, body: JSON.stringify({ email: "podpora@siol.net" }) });
    const { url } = (await made.json()) as { url: string };
    expect(url).toMatch(/^https:\/\/stranko\.example\/login\/link\?t=/);
    expect((await req("/admin/login-link", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "x@siol.net" }) })).status).toBe(302);
  });
});

describe("cross-site requests", () => {
  it("are refused when the browser says they come from another site, or the Origin names another host", async () => {
    const admin = await adminBrowser(req, PASSWORD);
    const post = (headers: Record<string, string>) => req("/logout", { method: "POST", body: new URLSearchParams({ _csrf: admin.csrf }), headers: { cookie: admin.cookie, host: "stranko.example", ...headers } });
    expect((await post({ "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect((await post({ "sec-fetch-site": "same-site" })).status).toBe(403);
    expect((await post({ origin: "https://evil.example" })).status).toBe(403);
    expect((await post({ origin: "https://stranko.example", "sec-fetch-site": "same-origin" })).status).toBe(303);
    // The published sites' contact form is exempt (posted from the site itself, later from other domains).
    expect((await req("/s/nope/_submit", { method: "POST", headers: { "sec-fetch-site": "cross-site" }, body: new URLSearchParams({}) })).status).toBe(404);
  });

  it("published pages get no cookies", async () => {
    const res = await req("/s/nope/");
    expect(res.headers.getSetCookie()).toEqual([]);
  });
});
