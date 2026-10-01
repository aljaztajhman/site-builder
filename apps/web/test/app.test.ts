import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadConfig } from "@sb/config";
import { Repo, createDb, createFsStorage, migrate, type Platform, type Queue } from "@sb/platform";
import { createApp } from "../src/app.ts";
import { SESSION_COOKIE } from "../src/auth.ts";
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
    expect(page).toContain("Opis mora imeti vsaj 30 znakov.");
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
    expect(page).toContain("Opišite svoje podjetje.<br/>Spletna stran je narejena.");
    for (const id of ["zacni", "kaj", "kako", "primer", "cena", "vprasanja"]) expect(page, id).toContain(`id="${id}"`);
    const paid = loadConfig().plans.paid;
    const eur = (n: number) => `${n}\u00a0€`;
    expect(page).toContain(`${eur(paid.monthlyEur)} <small>na mesec</small>`);
    expect(page).toContain(`ali ${eur(paid.yearlyEur)} na leto, domena vključena`);
    expect(page).toContain(`<dt>Prvo leto za prvih ${paid.foundingOffer.customers} strank</dt><dd>${eur(paid.foundingOffer.firstYearEur)}</dd>`);
    expect(page).toContain(`<dd>${eur(paid.setupService.eur)} enkratno</dd>`);
    // No billing yet: the prices are planned and nothing is charged.
    expect(paid.billingEnabled).toBe(false);
    expect(page).toContain("Načrtovane cene, z DDV. Plačevanja še ni, zato zaenkrat ničesar ne zaračunamo.");
    expect(page).not.toMatch(/od \d+\u00a0€/);
    // Signed out the prompt goes to the login and back to /; the description never lands in the URL (no name attribute).
    const formTag = page.match(/<form class="prompt"[^>]*>/)?.[0] ?? "";
    expect(formTag).toContain('action="/login"');
    expect(formTag).toContain('method="get"');
    expect(page).toContain('<input type="hidden" name="next" value="/"/>');
    expect(page).not.toMatch(/<textarea[^>]*name=/);
    expect(page).not.toMatch(/type="file"/);
    expect(page).toContain('href="/login"');
    expect(page).not.toContain("<style");
    expect(page).not.toMatch(/<script>(?!<\/script>)/);

    const css = page.match(/href="(\/assets\/ui\/([0-9a-f]{10})\/home\.css)"/);
    expect(css, "landing page links its stylesheet").not.toBeNull();
    const cssRes = await app.request(css![1]!);
    expect(cssRes.status).toBe(200);
    expect(await cssRes.text()).toContain(".vig{");
    const js = await app.request("/assets/home.js");
    expect(js.status).toBe(200);
    expect(js.headers.get("content-type")).toContain("javascript");
    expect(await js.text()).toContain("sb-intake-draft");
  });

  it("calls the prices planned only while billing is off", () => {
    const config = loadConfig();
    const withBilling = { ...config, plans: { ...config.plans, paid: { ...config.plans.paid, billingEnabled: true } } };
    const page = homePage({ config: withBilling, signedIn: false, csrf: "t", fullSite: false });
    expect(page).not.toContain("Načrtovane cene");
    expect(page).not.toContain("Plačevanja še ni");
    expect(page).toContain("Cene so z DDV. Letno naročnino plačate po računu z bančnim nakazilom.");
    expect(page).toContain("Pri letni naročnini bo domena vključena v ceno.");
    const noDomain = { ...config, plans: { ...config.plans, paid: { ...config.plans.paid, yearlyIncludesDomain: false } } };
    const page2 = homePage({ config: noDomain, signedIn: false, csrf: "t", fullSite: false });
    expect(page2).not.toContain("domena vključena");
    expect(page2).not.toContain("Pri letni naročnini bo domena");
  });

  it("serves the example site so the landing page can frame it, and nothing else may be framed", async () => {
    const page = await (await app.request("/")).text();
    const src = page.match(/<iframe src="(\/assets\/ui\/([0-9a-f]{10})\/example-home\.html)"/);
    expect(src).not.toBeNull();
    const ex = await app.request(src![1]!);
    expect(ex.status).toBe(200);
    expect(ex.headers.get("content-type")).toContain("text/html");
    expect(ex.headers.get("content-security-policy")).toContain("frame-ancestors 'self'");
    expect(await ex.text()).toContain('url("fonts/fraunces.woff2")');
    for (const f of ["fonts/fraunces.woff2", "fonts/source-sans-3.woff2"]) expect((await app.request(`/assets/ui/${src![2]}/${f}`)).status, f).toBe(200);
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
    // Signing in without a destination lands on the sites list; signing out on the landing page.
    const signIn = await app.request("/login", { method: "POST", body: new URLSearchParams({ password: PASSWORD }) });
    expect(signIn.headers.get("location")).toBe("/sites");
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
    expect(await res.json()).toEqual({ status: "ok", checks: { database: "ok", storage: "ok", queue: "ok" } });
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

  it("refuses AI work once the daily spend cap is reached", async () => {
    const { cookie } = await login();
    const site = (await platform.repo.listSites())[0]!;
    await platform.repo.logModelCall({ siteId: site.id, jobId: null, stage: "brief", model: "claude-sonnet-5-5", inputTokens: 1, outputTokens: 1, cacheCreationTokens: 0, cacheReadTokens: 0, costEur: 1000, durationMs: 1, ok: true });
    const res = await app.request(`/api/sites/${site.id}/generate`, { method: "POST", body: "{}", headers: { cookie, "content-type": "application/json" } });
    expect(res.status).toBe(429);
  });
});

describe("photos in the editor", () => {
  it("adds the owner's photo, replaces a picture with it, queues the description, and explains refusals", async () => {
    const { readFile } = await import("node:fs/promises");
    const { cookie } = await login();
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
    expect(sent.at(-1)).toEqual({ name: "alt", data: { siteId: site.id, imageIds: ["img_04"] } });
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
      body: JSON.stringify({ baseVersion: 1, ops: [{ op: "replace", path: "/pages/0/sections/0/props/headline", value: "Kruh z drožmi iz Kamnika" }] }),
    });
    expect(patched.status).toBe(200);
    expect(await patched.json()).toMatchObject({ ok: true, version: 2 });

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
    for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com", "/ x", 42, undefined]) expect(safeNext(bad)).toBe("/sites");
  });
});
