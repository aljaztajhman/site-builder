import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadConfig } from "@sb/config";
import { Repo, createDb, createFsStorage, migrate, runningVersion, type Platform, type Queue } from "@sb/platform";
import { EXPORT_CHECKLIST_MESSAGE, createApp } from "../src/app.ts";
import { SESSION_COOKIE, loginThrottle } from "../src/auth.ts";
import { homePage } from "../src/home.tsx";
import { adminBrowser, type Browser } from "./session-helpers.ts";

const PASSWORD = "test-password-1234";
let platform: Platform;
let dir: string;
let app: ReturnType<typeof createApp>;
const sent: { name: string; data: unknown }[] = [];

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sb-web-"));
  const db = await createDb("pglite://memory");
  await migrate(db);
  const queue: Queue = {
    send: async (name, data) => {
      sent.push({ name, data });
      return "job_1";
    },
    work: async () => undefined,
    ping: async () => undefined,
    stop: async () => undefined,
  };
  platform = { db, repo: new Repo(db), storage: createFsStorage(dir), queue, close: () => db.close() };
  app = createApp({ platform, config: loadConfig(), auth: { password: PASSWORD, secret: "s".repeat(32), secureCookies: false } });
});
afterAll(async () => {
  await platform.close();
  await rm(dir, { recursive: true, force: true });
});

/** The admin in a browser: session and device cookies, and the form token. */
const login = (): Promise<Browser> => adminBrowser(app.request.bind(app), PASSWORD);

describe("access control", () => {
  it("sends noindex on every response, public or not", async () => {
    for (const p of ["/health", "/login", "/", "/api/sites/x", "/s/nope/"]) {
      const res = await app.request(p);
      expect(res.headers.get("x-robots-tag"), p).toContain("noindex");
    }
  });

  it("redirects the dashboard and rejects the API without a session", async () => {
    expect((await app.request("/sites")).status).toBe(302);
    expect((await app.request("/new")).status).toBe(302);
    expect((await app.request("/sites/site_0000000000000000")).status).toBe(302);
    expect((await app.request("/api/sites/x")).status).toBe(401);
    expect((await app.request("/preview/x/index.html")).status).toBe(302);
  });

  it("rejects a wrong password and accepts the right one", async () => {
    const bad = await app.request("/login", { method: "POST", body: new URLSearchParams({ password: "nope" }) });
    expect(bad.status).toBe(401);
    const good = await app.request("/login", { method: "POST", body: new URLSearchParams({ password: PASSWORD, next: "/" }) });
    expect(good.status).toBe(302);
    expect(good.headers.getSetCookie().find((c) => c.startsWith(`${SESSION_COOKIE}=`))).toMatch(/HttpOnly/i);
    const { cookie } = await login();
    const res = await app.request("/sites", { headers: { cookie } });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Nova stran");
  });

  it("throttles login per client, and one client hammering the form doesn't lock out everyone", () => {
    const allow = loginThrottle(10, 200);
    const flood = Array.from({ length: 500 }, () => allow("attacker"));
    expect(flood.filter(Boolean)).toHaveLength(10);
    expect(allow("admin")).toBe(true);
    // Many clients together still hit the overall cap.
    const many = Array.from({ length: 300 }, (_, i) => allow(`ip${i % 30}`));
    expect(many.filter(Boolean).length).toBeLessThanOrEqual(200 - 11);
  });

  it("rejects a forged session cookie", async () => {
    const cookie = `${SESSION_COOKIE}=9999999999.forged`;
    expect((await app.request("/new", { headers: { cookie } })).status).toBe(302);
    expect((await app.request("/sites", { headers: { cookie } })).status).toBe(302);
    // A forged session doesn't count as signed in on the landing page either.
    const home = await (await app.request("/", { headers: { cookie } })).text();
    expect(home).toContain('href="/login"');
    expect(home).not.toContain("Moje strani");
  });
});

describe("product UI", () => {
  it("serves the stylesheet, fonts and icon without a session, cached by content hash", async () => {
    const login = await (await app.request("/login")).text();
    const css = login.match(/href="(\/assets\/ui\/([0-9a-f]{10})\/app\.css)"/);
    expect(css, "login page links the shared stylesheet").not.toBeNull();
    const res = await app.request(css![1]!);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/css");
    expect(res.headers.get("cache-control")).toContain("immutable");
    expect(await res.text()).toContain("--accent:");
    for (const f of ["fonts/figtree.woff2", "fonts/bricolage-grotesque.woff2"]) {
      const font = await app.request(`/assets/ui/${css![2]}/${f}`);
      expect(font.status, f).toBe(200);
      expect(font.headers.get("content-type")).toBe("font/woff2");
    }
    expect((await app.request(`/assets/ui/${css![2]}/icon.svg`)).headers.get("content-type")).toBe("image/svg+xml");
    // An old hash still gets the file, but not cached for good; unknown files and traversal get nothing.
    expect((await app.request("/assets/ui/0000000000/app.css")).headers.get("cache-control")).toBe("no-cache");
    expect((await app.request(`/assets/ui/${css![2]}/nope.css`)).status).toBe(404);
    expect((await app.request(`/assets/ui/${css![2]}/..%2f..%2fapp.ts`)).status).toBe(400);
    // Dashboard pages carry no inline <style>: everything comes from the one stylesheet.
    expect(login).not.toContain("<style");
  });

  it("has one intake, the landing page's prompt: /new and the empty sites list lead there", async () => {
    const { cookie } = await login();
    const moved = await app.request("/new", { headers: { cookie } });
    expect(moved.status).toBe(302);
    expect(moved.headers.get("location")).toBe("/#zacni");
    const sites = await (await app.request("/sites", { headers: { cookie } })).text();
    expect(sites).not.toContain('action="/api/sites"');
    expect(sites).toContain('href="/#zacni"');
    const home = await (await app.request("/", { headers: { cookie } })).text();
    const formTag = home.match(/<form class="prompt"[^>]*>/)?.[0] ?? "";
    expect(formTag).toContain('action="/api/sites"');
    expect(formTag).toContain('method="post"');
    expect(formTag.toLowerCase()).toContain('enctype="multipart/form-data"');
    expect(home).toMatch(/<textarea[^>]*name="description"/);
    const photos = home.match(/<input[^>]*name="photos"[^>]*>/)?.[0] ?? "";
    expect(photos).toContain('type="file"');
    expect(photos).toContain("multiple");
    expect(home).toMatch(/<input[^>]*type="file"[^>]*name="logo"/);
    expect(home).toMatch(/id="scope-home"[^>]*checked/);
  });

  it("keeps the description and says why on the landing page when the intake is refused", async () => {
    const { cookie, csrf } = await login();
    const form = new FormData();
    form.set("_csrf", csrf);
    form.set("description", "Prekratko.");
    const res = await app.request("/api/sites", { method: "POST", body: form, headers: { cookie } });
    expect(res.status).toBe(400);
    const page = await res.text();
    expect(page).toContain(`Opis naj ima vsaj ${loadConfig().tiers.junk.minDescriptionChars} znakov`);
    expect(page).toContain(">Prekratko.</textarea>");
    expect(page).toContain('id="zacni"');
  });
});

describe("landing page", () => {
  it("is / without a session: the designed page, its own stylesheet and script, price from config", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("x-robots-tag")).toContain("noindex");
    const page = await res.text();
    // The slogan is the h1 and the title (sb-slogan); one short line under it.
    expect(page).toContain('<h1 id="h1">Stran za vaše stranke.</h1>');
    expect(page).toContain("<title>Stranko · Stran za vaše stranke.</title>");
    for (const id of ["zacni", "kaj", "kako", "primer", "cena", "vprasanja"]) expect(page, id).toContain(`id="${id}"`);
    const plans = loadConfig().plans;
    const std = plans.standard;
    const plus = plans.premium;
    const eur = (n: number) => `${n}\u00a0€`;
    expect(page).toContain(`<h3>${std.name}</h3>`);
    expect(page).toContain(`<h3>${plus.name}</h3>`);
    expect(page).toContain(`${eur(std.monthlyEur)} <small>na mesec</small>`);
    expect(page).toContain(`${eur(plus.monthlyEur)} <small>na mesec</small>`);
    expect(page).toContain(`ali ${eur(std.yearlyEur)} na leto, domena vključena`);
    expect(page).toContain(`ali ${eur(plus.yearlyEur)} na leto, domena vključena`);
    // The founding offer with its places left (none given yet in this database: all of them; it-upsells).
    expect(page).toContain(`<dt>Prvo leto za prvih ${std.foundingOffer!.customers} strank<span class="left"> · še ${std.foundingOffer!.customers} prostih mest</span></dt><dd>${eur(std.foundingOffer!.firstYearEur)}</dd>`);
    expect(page).toContain(`<dd>${eur(std.setupService.eur)} enkratno</dd>`);
    expect(page).toContain(`Do ${std.site.maxPages} strani`);
    expect(page).toContain(`Do ${plus.site.maxPages} strani`);
    // Collections and a second language are built (spec v12, Jeziki in the editor): no "v pripravi" on them.
    expect(page).toContain("<li>Novice, dogodki, storitve in ekipa</li>");
    expect(page).not.toContain("dogodki (v pripravi)");
    // No billing yet: the prices are planned and nothing is charged.
    expect(plans.billingEnabled).toBe(false);
    expect(page).toContain("Načrtovane cene z DDV. Zaenkrat ničesar ne zaračunamo.");
    // The comparison with a designer names the cheapest plan as "from".
    expect(page).toContain(`<b>od ${eur(std.monthlyEur)}</b> na mesec (načrtovana cena)`);
    // Signed out the prompt is the intake too (the first homepage needs no account): a POST, never the URL.
    const formTag = page.match(/<form class="prompt"[^>]*>/)?.[0] ?? "";
    expect(formTag).toContain('action="/api/sites"');
    expect(formTag).toContain('method="post"');
    expect(page).toMatch(/<textarea[^>]*name="description"/);
    expect(page).toMatch(/<input[^>]*type="file"[^>]*name="photos"/);
    // No whole-site switch without paid rights; the copy says what's true.
    expect(page).not.toContain('id="scope-full"');
    expect(page).toContain("Brezplačno, brez prijave in brez kartice.");
    expect(page).not.toContain("Potrebujete le e-poštni naslov");
    expect(page).not.toContain("vodnim žigom");
    expect(page).toContain('href="/zasebnost"');
    expect(page).toContain('href="/login"');
    expect(page).not.toContain("<style");
    expect(page).not.toMatch(/<script>(?!<\/script>)/);

    const css = page.match(/href="(\/assets\/ui\/([0-9a-f]{10})\/home\.css)"/);
    expect(css, "landing page links its stylesheet").not.toBeNull();
    const cssRes = await app.request(css![1]!);
    expect(cssRes.status).toBe(200);
    expect(await cssRes.text()).toContain(".win{");
    const js = await app.request("/assets/home.js");
    expect(js.status).toBe(200);
    expect(js.headers.get("content-type")).toContain("javascript");
    expect(await js.text()).toContain("sb-intake-draft");
    // Plain URL: revalidated by ETag; the hashed URL pages link to once built: cached for good.
    const etag = js.headers.get("etag")!;
    expect(js.headers.get("cache-control")).toBe("no-cache");
    expect((await app.request("/assets/home.js", { headers: { "if-none-match": etag } })).status).toBe(304);
    const hashed = await app.request(`/assets/home.js?v=${etag.replaceAll('"', "")}`);
    expect(hashed.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
  });

  it("calls the prices planned only while billing is off", () => {
    const config = loadConfig();
    const withBilling = { ...config, plans: { ...config.plans, billingEnabled: true } };
    const page = homePage({ config: withBilling, signedIn: false, csrf: "t", fullSite: false, allowance: "", botSiteKey: null });
    expect(page).not.toContain("Načrtovane cene");
    expect(page).not.toContain("Plačevanja še ni");
    expect(page).toContain("Cene so z DDV. Letni paket plačate po računu z bančnim nakazilom.");
    expect(page).toContain("Pri letnem paketu bo domena vključena v ceno.");
    const noDomain = { ...config, plans: { ...config.plans, standard: { ...config.plans.standard, yearlyIncludesDomain: false }, premium: { ...config.plans.premium, yearlyIncludesDomain: false } } };
    const page2 = homePage({ config: noDomain, signedIn: false, csrf: "t", fullSite: false, allowance: "", botSiteKey: null });
    expect(page2).not.toContain("domena vključena");
    expect(page2).not.toContain("Pri letnem paketu bo domena");
  });

  it("says in the FAQ which versions can be restored, from the retention settings, not 'every change' forever", () => {
    const config = loadConfig();
    const page = homePage({ config, signedIn: false, csrf: "t", fullSite: false, allowance: "", botSiteKey: null });
    expect(page).not.toContain("Vsaka sprememba je shranjena kot različica, ki jo lahko obnovite.");
    expect(page).toContain(`Obnovite lahko vsako različico, ki ni starejša od ${config.versions.retention.keepAllDays} dni, iz starejših dni zadnjo različico dneva, objavljene pa vedno.`);
    const oneDay = { ...config, versions: { ...config.versions, retention: { ...config.versions.retention, keepAllDays: 1 } } };
    expect(homePage({ config: oneDay, signedIn: false, csrf: "t", fullSite: false, allowance: "", botSiteKey: null })).toContain("ni starejša od 1 dneva,");
  });

  it("serves the example site so the landing page can frame it, and nothing else may be framed", async () => {
    const page = await (await app.request("/")).text();
    // The "Primer" section: Pekarna Kvas rendered by our engine, the cinnamon rolls' price marked as missing.
    const src = page.match(/<iframe src="(\/assets\/ui\/([0-9a-f]{10})\/examples\/primer\/index\.html)"/);
    expect(src).not.toBeNull();
    const ex = await app.request(src![1]!);
    expect(ex.status).toBe(200);
    expect(ex.headers.get("content-type")).toContain("text/html");
    expect(ex.headers.get("content-security-policy")).toContain("frame-ancestors 'self'");
    const html = await ex.text();
    expect(html).toContain('<mark class="ph" data-ph="price"');
    // Its stylesheet resolves next to it.
    const css = /href="\.\.\/(_shared\/[0-9a-f]+\/site(?:-[a-z-]+)?\.css)"/.exec(html);
    expect(css, "the example links its stylesheet").not.toBeNull();
    expect((await app.request(`/assets/ui/${src![2]}/examples/${css![1]}`)).status).toBe(200);
    for (const p of ["/", "/login"]) expect((await app.request(p)).headers.get("content-security-policy"), p).toContain("frame-ancestors 'none'");
  });

  it("stays the landing page with a session, linking to the sites list; the dashboard is /sites", async () => {
    const { cookie, csrf } = await login();
    const home = await (await app.request("/", { headers: { cookie } })).text();
    expect(home).toContain('data-home-intake=""');
    expect(home).toMatch(/<a class="btn quiet sm login" href="\/sites">Moje strani<\/a>/);
    expect(home).not.toContain('href="/login"');
    const dashboard = await (await app.request("/sites", { headers: { cookie } })).text();
    expect(dashboard).not.toContain("data-home-intake");
    expect(dashboard).toContain('action="/logout"');
    expect(dashboard).toContain('class="brand" href="/sites"');
    // Signing in without a destination lands on the landing page, as does signing out.
    const signIn = await app.request("/login", { method: "POST", body: new URLSearchParams({ password: PASSWORD }) });
    expect(signIn.headers.get("location")).toBe("/");
    // Signing out is a form with the CSRF token; without it nothing happens.
    expect((await app.request("/logout", { method: "POST", headers: { cookie } })).status).toBe(403);
    const signOut = await app.request("/logout", { method: "POST", headers: { cookie }, body: new URLSearchParams({ _csrf: csrf }) });
    expect(signOut.headers.get("location")).toBe("/");
  });
});

describe("health", () => {
  it("reports database, storage and queue", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", checks: { database: "ok", storage: "ok", queue: "ok" }, version: runningVersion() });
  });

  it("shows the running version (tag and short SHA) on /health and on /admin", async () => {
    const version = { sha: "abc1234", tag: "v1.2.3" };
    const other = createApp({ platform, config: loadConfig(), auth: { password: PASSWORD, secret: "s".repeat(32), secureCookies: false }, version });
    expect((await (await other.request("/health")).json()).version).toEqual(version);
    const admin = await adminBrowser(other.request.bind(other), PASSWORD);
    const page = await (await other.request("/admin", { headers: { cookie: admin.cookie } })).text();
    expect(page).toContain("Različica v1.2.3 · abc1234");
  });

  it("echoes the caller's own IP as the limits see it (the proxy's rightmost entry) only when asked", async () => {
    const res = await app.request("/health?ip=1", { headers: { "x-forwarded-for": "1.2.3.4, 203.0.113.7" } });
    expect((await res.json()).you).toEqual({ ip: "203.0.113.7", forwarded: ["1.2.3.4", "203.0.113.7"], realIp: null });
    expect(await (await app.request("/health")).json()).not.toHaveProperty("you");
  });

  it("takes the visitor from X-Real-IP, as Railway's edge sets it, not the edge address at the end of X-Forwarded-For", async () => {
    const res = await app.request("/health?ip=1", { headers: { "x-forwarded-for": "95.143.153.82, 152.233.13.164", "x-real-ip": "95.143.153.82" } });
    expect((await res.json()).you.ip).toBe("95.143.153.82");
  });

  it("keeps internal error detail out of public responses", async () => {
    const detail = "connect ECONNREFUSED minio.internal:9000";
    const broken = { ...platform.storage, ping: () => Promise.reject(new Error(detail)), get: () => Promise.reject(new Error(detail)) };
    const other = createApp({ platform: { ...platform, storage: broken }, config: loadConfig(), auth: { password: PASSWORD, secret: "s".repeat(32), secureCookies: false } });
    const errors = console.error;
    console.error = () => undefined;
    try {
      const health = await other.request("/health");
      expect(health.status).toBe(503);
      expect(await health.text()).not.toContain("minio");
      const page = await other.request("/s/demo/");
      expect(page.status).toBe(500);
      const body = await page.text();
      expect(body).not.toContain("minio");
      expect(body).toContain("Poskusite znova");
    } finally {
      console.error = errors;
    }
  });
});

describe("published sites", () => {
  it("serve without a session, with the site's 404 page for missing files", async () => {
    const enc = new TextEncoder();
    await platform.storage.put("published/demo/index.html", enc.encode("<h1>Demo</h1>"), "text/html");
    await platform.storage.put("published/demo/404.html", enc.encode("<h1>Ni</h1>"), "text/html");
    expect((await app.request("/s/demo")).status).toBe(301);
    const home = await app.request("/s/demo/");
    expect(home.status).toBe(200);
    expect(await home.text()).toBe("<h1>Demo</h1>");
    const missing = await app.request("/s/demo/nic.html");
    expect(missing.status).toBe(404);
    expect(await missing.text()).toBe("<h1>Ni</h1>");
    // URL normalisation resolves ".." before routing; it must never reach storage outside published/.
    expect((await app.request("/s/demo/../../etc/passwd")).status).not.toBe(200);
    expect((await app.request("/s/demo/..%2f..%2fsecret")).status).toBe(400);
    expect((await app.request("/s/..%2F./sites/x/uploads/a.svg")).status).toBe(400);
    // The query may carry encoded slashes: the login redirect encodes next=/ as %2F.
    expect((await app.request("/login?next=%2F")).status).toBe(200);
    const redirect = await app.request("/new");
    expect(redirect.status).toBe(302);
    expect((await app.request(redirect.headers.get("location")!)).status).toBe(200);
    expect((await app.request("/s/Demo!/index.html")).status).toBe(404);
  });

  it("published pages allow only our own scripts plus the header snippet by hash (no 'unsafe-inline')", async () => {
    const { createHash } = await import("node:crypto");
    const { JS_FLAG } = await import("@sb/components");
    const csp = (await app.request("/s/demo/")).headers.get("content-security-policy") ?? "";
    const scriptSrc = csp.split(";").find((d) => d.trim().startsWith("script-src")) ?? "";
    expect(scriptSrc).not.toContain("unsafe-inline");
    expect(scriptSrc).toContain(`'sha256-${createHash("sha256").update(JS_FLAG).digest("base64")}'`);
  });
});

describe("intake", () => {
  it("creates a site and queues generation", async () => {
    const { cookie, csrf } = await login();
    const form = new FormData();
    form.set("_csrf", csrf);
    form.set("description", "Frizerski salon Lipa v Ljubljani, Trubarjeva cesta 12. Striženje in barvanje.");
    form.set("scope", "home");
    const res = await app.request("/api/sites", { method: "POST", body: form, headers: { cookie } });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toMatch(/^\/sites\/site_/);
    expect(sent.at(-1)).toMatchObject({ name: "generate", data: { scope: "home" } });
    const sites = await platform.repo.listSites();
    expect(sites[0]!.slug).toBe("frizerski-salon-lipa");
    // The dashboard lists it as a card that opens the editor.
    const list = await (await app.request("/sites", { headers: { cookie } })).text();
    expect(list).toContain(`href="/sites/${sites[0]!.id}"`);
    expect(list).toContain("Ustvarjam …");
  });

  it("takes more than 1 MB of photos (the site API's 1 MB JSON limit doesn't apply to the intake)", async () => {
    const { readFile, readdir } = await import("node:fs/promises");
    const { cookie, csrf } = await login();
    const dir = path.join(import.meta.dirname, "../../../tools/eval/fixtures/gostilna-zlata-zlica/photos");
    const form = new FormData();
    form.set("_csrf", csrf);
    form.set("description", "Gostilna Zlata žlica v Šentjurju, domača hrana, malice med tednom in nedeljska kosila.");
    let bytes = 0;
    for (const f of (await readdir(dir)).filter((n) => n.endsWith(".jpg"))) {
      const data = await readFile(path.join(dir, f));
      bytes += data.length;
      form.append("photos", new File([data], f, { type: "image/jpeg" }));
    }
    expect(bytes).toBeGreaterThan(1024 * 1024);
    const res = await app.request("/api/sites", { method: "POST", body: form, headers: { cookie } });
    expect(res.status).toBe(303);
  }, 60_000);

  it("starts one generation when generate is clicked twice at once", async () => {
    const { cookie } = await login();
    const site = (await platform.repo.listSites())[0]!;
    await platform.repo.setStatus(site.id, "ready");
    const before = sent.length;
    const post = () => app.request(`/api/sites/${site.id}/generate`, { method: "POST", body: "{}", headers: { cookie, "content-type": "application/json" } });
    const statuses = (await Promise.all([post(), post()])).map((r) => r.status).sort();
    expect(statuses).toEqual([200, 409]);
    expect(sent.slice(before).filter((m) => m.name === "generate")).toHaveLength(1);
    expect((await platform.repo.getSite(site.id))?.status).toBe("generating");
  });

  it("refuses AI work once the daily spend cap is reached", async () => {
    const { cookie } = await login();
    const site = (await platform.repo.listSites())[0]!;
    await platform.repo.setStatus(site.id, "ready");
    await platform.repo.logModelCall({ siteId: site.id, jobId: null, stage: "brief", model: "claude-sonnet-5-5", inputTokens: 1, outputTokens: 1, cacheCreationTokens: 0, cacheReadTokens: 0, costEur: 1000, durationMs: 1, ok: true });
    const res = await app.request(`/api/sites/${site.id}/generate`, { method: "POST", body: "{}", headers: { cookie, "content-type": "application/json" } });
    expect(res.status).toBe(429);
    // The refused request gives the site its status back.
    expect((await platform.repo.getSite(site.id))?.status).toBe("ready");
  });
});

describe("photos in the editor", () => {
  it("adds the owner's photo, replaces a picture with it, queues the description, and explains refusals", async () => {
    const { readFile } = await import("node:fs/promises");
    const { cookie } = await login();
    // The spend-cap test above logged €1000 today; photo descriptions are model work under that cap.
    await platform.db.query("delete from model_calls");
    const golden = JSON.parse(await readFile(path.join(import.meta.dirname, "../../../tools/eval/golden/pekarna-kvas.json"), "utf8"));
    const site = await platform.repo.createSite({ name: "foto", slug: "foto", intake: { description: "x", photoAssetIds: [], scope: "home" } });
    const v1 = await platform.repo.saveSpec(site.id, { ...golden, slug: "foto" }, "generate");
    await platform.repo.setStatus(site.id, "ready");
    const jpeg = await readFile(path.join(import.meta.dirname, "../../../tools/eval/fixtures/pekarna-kvas/photos/03.jpg"));
    const form = new FormData();
    form.append("photos", new Blob([jpeg], { type: "image/jpeg" }), "pec.jpg");
    form.set("replace", "img_02");
    form.set("baseVersion", String(v1));
    const res = await app.request(`/api/sites/${site.id}/photos`, { method: "POST", body: form, headers: { cookie } });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, added: ["img_04"], replaced: "img_02" });
    expect(sent.at(-1)).toEqual({ name: "alt", data: { siteId: site.id, imageIds: ["img_04"], aiJobId: expect.any(String) } });
    // Busy until the description job is done, so the editor keeps polling.
    expect((await platform.repo.getSite(site.id))!.status).toBe("editing");
    const spec = (await platform.repo.getSpec(site.id))!.spec;
    expect(spec.assets.images.map((i: { id: string }) => i.id)).toEqual(["img_01", "img_03", "img_04"]);
    expect((await app.request(`/preview/${site.id}/media/img_04-360.webp`, { headers: { cookie } })).status).toBe(200);

    const bad = new FormData();
    bad.append("photos", new Blob([new Uint8Array([1, 2, 3])], { type: "image/gif" }), "a.gif");
    const refused = await app.request(`/api/sites/${site.id}/photos`, { method: "POST", body: bad, headers: { cookie } });
    expect(refused.status).toBe(400);
    expect(((await refused.json()) as { error: string }).error).toMatch(/Nepodprta vrsta slike/);
    const stale = new FormData();
    stale.append("photos", new Blob([jpeg], { type: "image/jpeg" }), "b.jpg");
    stale.set("baseVersion", String(v1));
    expect((await app.request(`/api/sites/${site.id}/photos`, { method: "POST", body: stale, headers: { cookie } })).status).toBe(409);
    // Without a session the API refuses.
    expect((await app.request(`/api/sites/${site.id}/photos`, { method: "POST", body: new FormData() })).status).toBe(401);
  });
});

describe("direct editor API (no model calls)", () => {
  it("patches, adds sections, detects conflicts, reverts, blocks and allows publishing, exports", async () => {
    const { readFile } = await import("node:fs/promises");
    const golden = JSON.parse(await readFile(path.join(import.meta.dirname, "../../../tools/eval/golden/pekarna-kvas.json"), "utf8"));
    const { cookie } = await login();
    const json = { cookie, "content-type": "application/json" };
    const brief = JSON.parse(await readFile(path.join(import.meta.dirname, "../../../tools/eval/fixtures/pekarna-kvas/brief.json"), "utf8"));
    const site = await platform.repo.createSite({ name: "Pekarna Kvas", slug: "pekarna-kvas", intake: { description: brief.description, photoAssetIds: [], scope: "full" } });
    await platform.repo.saveSpec(site.id, golden, "manual");
    const before = sent.length;

    // The editor's poll: a small pulse that moves with status, versions, chat and events.
    {
      const site = await platform.repo.createSite({ name: "Pulz", slug: "pulz", intake: { description: "x", photoAssetIds: [], scope: "home" } });
      const pulse = async () => (await (await app.request(`/api/sites/${site.id}/pulse`, { headers: { cookie } })).json()) as { status: string; version: number | null; chat: number; lastEvent: number };
      expect(await pulse()).toEqual({ status: "new", version: null, chat: 0, lastEvent: 0 });
      await platform.repo.saveSpec(site.id, { ...golden, slug: "pulz" }, "generate");
      await platform.repo.setStatus(site.id, "editing");
      await platform.repo.addChat(site.id, "user", "Temnejša glava");
      await platform.repo.addEvent({ siteId: site.id, stage: "edit", message: "start" });
      const p = await pulse();
      expect(p).toMatchObject({ status: "editing", version: 1, chat: 1 });
      expect(p.lastEvent).toBeGreaterThan(0);
      // The full state carries the same pulse, so the editor knows what it has.
      const full = (await (await app.request(`/api/sites/${site.id}`, { headers: { cookie } })).json()) as { pulse: typeof p };
      expect(full.pulse).toEqual(p);
      expect((await app.request(`/api/sites/site_nope/pulse`, { headers: { cookie } })).status).toBe(404);
      expect((await app.request(`/api/sites/${site.id}/pulse`)).status).toBe(401);
    }

    const patched = await app.request(`/api/sites/${site.id}/patch`, {
      method: "POST",
      headers: json,
      // The whole section, as the editor's section form sends it.
      body: JSON.stringify({ baseVersion: 1, ops: [{ op: "replace", path: "/pages/0/sections/0/props", value: { ...golden.pages[0]!.sections[0]!.props, headline: "Kruh z drožmi iz Kamnika" } }] }),
    });
    expect(patched.status).toBe(200);
    expect(await patched.json()).toMatchObject({ ok: true, version: 2 });
    // Only what changed is stored as the owner's text: the rest of the section stays fact-checked.
    expect(await platform.repo.manualPatches(site.id)).toEqual([[{ op: "replace", path: "/pages/0/sections/0/props", value: { headline: "Kruh z drožmi iz Kamnika" } }]]);
    // And marked as the owner's, so "Ustvari znova" keeps it (it-keep-owner-edits); the edit can't set the marks itself.
    expect((await platform.repo.getSpec(site.id))!.spec.ownerEdits).toEqual([{ section: golden.pages[0]!.sections[0]!.id, path: "/props/headline" }]);
    const forged = await app.request(`/api/sites/${site.id}/patch`, { method: "POST", headers: json, body: JSON.stringify({ baseVersion: 2, ops: [{ op: "replace", path: "/ownerEdits", value: [] }] }) });
    expect(forged.status).toBe(422);

    const stale = await app.request(`/api/sites/${site.id}/patch`, { method: "POST", headers: json, body: JSON.stringify({ baseVersion: 1, ops: [{ op: "remove", path: "/pages/0/sections/1" }] }) });
    expect(stale.status).toBe(409);

    const invalid = await app.request(`/api/sites/${site.id}/patch`, { method: "POST", headers: json, body: JSON.stringify({ baseVersion: 2, ops: [{ op: "replace", path: "/pages/0/sections/0/props/headline", value: "Dobrodošli" }] }) });
    expect(invalid.status).toBe(422);

    const added = await app.request(`/api/sites/${site.id}/sections`, { method: "POST", headers: json, body: JSON.stringify({ baseVersion: 2, pageIndex: 0, index: 2, type: "faq" }) });
    expect(added.status).toBe(200);
    const state = await (await app.request(`/api/sites/${site.id}`, { headers: { cookie } })).json();
    expect(state.version).toBe(3);
    expect(state.spec.pages[0].sections[2].type).toBe("faq");
    expect(state.blockers.some((b: string) => b.includes("starter text"))).toBe(true);

    const blocked = await app.request(`/api/sites/${site.id}/publish`, { method: "POST", headers: { cookie } });
    expect(blocked.status).toBe(422);

    // Export warns with the same checklist (sb-export-checklist = warn) and works once confirmed.
    const publishList = ((await blocked.json()) as { checklist: unknown[] }).checklist;
    const warned = await app.request(`/api/sites/${site.id}/export`, { headers: { cookie } });
    expect(warned.status).toBe(409);
    const warning = (await warned.json()) as { error: string; message: string; checklist: unknown[]; blockers: string[] };
    expect(warning).toMatchObject({ error: "checklist", message: EXPORT_CHECKLIST_MESSAGE });
    expect(warning.checklist).toEqual(publishList);
    expect(warning.checklist).toEqual(state.checklist);
    expect(warning.message).not.toMatch(/—/);
    // A browser following the link lands in the editor with the warning open.
    const followed = await app.request(`/api/sites/${site.id}/export`, { headers: { cookie, accept: "text/html,application/xhtml+xml" }, redirect: "manual" });
    expect(followed.status).toBe(303);
    expect(followed.headers.get("location")).toBe(`/sites/${site.id}?export=1`);
    const anyway = await app.request(`/api/sites/${site.id}/export?anyway=1`, { headers: { cookie } });
    expect(anyway.status).toBe(200);
    expect(anyway.headers.get("content-type")).toBe("application/zip");
    expect(anyway.headers.get("content-disposition")).toContain(`-v3.zip`);
    expect((await anyway.arrayBuffer()).byteLength).toBeGreaterThan(10_000);

    const reverted = await app.request(`/api/sites/${site.id}/revert`, { method: "POST", headers: json, body: JSON.stringify({ version: 2 }) });
    expect(await reverted.json()).toMatchObject({ ok: true, version: 4 });

    // Fill the three missing provider facts, then publishing works.
    const fill = await app.request(`/api/sites/${site.id}/patch`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({
        baseVersion: 4,
        ops: [
          { op: "replace", path: "/business/provider/legalName", value: "Pekarna Kvas, Jure Petek s.p." },
          { op: "replace", path: "/business/provider/registrationNumber", value: "1234567000" },
          { op: "replace", path: "/business/provider/taxNumber", value: "SI12345678" },
          { op: "replace", path: "/pages/0/sections/2/props/items/4/price", value: { amount: 0.9 } },
          { op: "remove", path: "/pages/0/sections/2/props/items/5" },
        ],
      }),
    });
    expect(fill.status).toBe(200);
    const published = await app.request(`/api/sites/${site.id}/publish`, { method: "POST", headers: { cookie } });
    expect(published.status, JSON.stringify(await published.clone().json())).toBe(200);
    const home = await app.request("/s/pekarna-kvas/");
    expect(home.status).toBe(200);
    const publishedHtml = await home.text();
    expect(publishedHtml).toContain("Kruh z drožmi iz Kamnika");
    // ?v= shows an earlier version: v1 still has the golden headline.
    const v1 = await (await app.request(`/preview/${site.id}/index.html?v=1`, { headers: { cookie } })).text();
    expect(v1).not.toContain("Kruh z drožmi iz Kamnika");
    // Preview equals published output, byte for byte.
    const previewHtml = await (await app.request(`/preview/${site.id}/index.html`, { headers: { cookie } })).text();
    expect(previewHtml).toBe(publishedHtml);
    // A miss at any depth gets the 404 page with paths for that depth (styled, links work), same in the preview.
    for (const [missing, up] of [["nic.html", ""], ["storitve/nic", "../"], ["a/b/nic.html", "../../"]] as const) {
      const live = await app.request(`/s/pekarna-kvas/${missing}`);
      expect(live.status, missing).toBe(404);
      const liveHtml = await live.text();
      expect(liveHtml, missing).toContain(`<link rel="stylesheet" href="${up}../_shared/`);
      expect(liveHtml, missing).toContain(`href="${up}index.html"`);
      const preview = await app.request(`/preview/${site.id}/${missing}`, { headers: { cookie } });
      expect(preview.status, missing).toBe(404);
      expect(await preview.text(), missing).toBe(liveHtml);
    }

    // Two publishes at once: one writes its release, the other is told to wait; the live site stays whole.
    const twice = await Promise.all([1, 2].map(() => app.request(`/api/sites/${site.id}/publish`, { method: "POST", headers: { cookie } })));
    expect(twice.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(((await twice.find((r) => r.status === 409)!.json()) as { message: string }).message).toMatch(/že objavlja/);
    expect((await app.request("/s/pekarna-kvas/")).status).toBe(200);
    expect((await platform.repo.getSite(site.id))?.publishing_since).toBeNull();
    // A publish that crashed long ago doesn't hold the site forever.
    await platform.db.query("update sites set publishing_since = now() - interval '1 hour' where id = $1", [site.id]);
    expect((await app.request(`/api/sites/${site.id}/publish`, { method: "POST", headers: { cookie } })).status).toBe(200);

    // Layout thumbnails: one section alone, in the variant asked for, with its own content.
    const thumb = await (await app.request(`/preview/${site.id}/index.html?section=s_about&variant=text-only`, { headers: { cookie } })).text();
    expect(thumb.match(/<section id="s_[a-z_]+"/g)).toEqual(['<section id="s_about"']);
    expect(thumb).toContain("s-about--text-only");
    expect(thumb).toContain(golden.pages[0].sections.find((s: { id: string }) => s.id === "s_about").props.heading);
    for (const bad of ["section=s_about&variant=grid", "section=s_nope&variant=text-only", "section=s_about"]) {
      expect((await app.request(`/preview/${site.id}/index.html?${bad}`, { headers: { cookie } })).status, bad).toBe(404);
    }

    const zip = await app.request(`/api/sites/${site.id}/export`, { headers: { cookie } });
    expect(zip.headers.get("content-type")).toBe("application/zip");
    expect((await zip.arrayBuffer()).byteLength).toBeGreaterThan(10_000);

    // None of this touched the model queue.
    expect(sent.length).toBe(before);
  }, 60_000);
});

describe("login redirect", () => {
  it("only follows same-origin paths", async () => {
    const { safeNext } = await import("../src/app.ts");
    expect(safeNext("/sites/x")).toBe("/sites/x");
    for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com", "/ x", 42, undefined]) expect(safeNext(bad)).toBe("/");
  });
});
