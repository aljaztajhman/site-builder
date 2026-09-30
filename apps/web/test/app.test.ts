import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadConfig } from "@sb/config";
import { Repo, createDb, createFsStorage, migrate, type Platform, type Queue } from "@sb/platform";
import { createApp } from "../src/app.ts";
import { SESSION_COOKIE } from "../src/auth.ts";

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

async function login(): Promise<string> {
  const res = await app.request("/login", { method: "POST", body: new URLSearchParams({ password: PASSWORD, next: "/" }) });
  expect(res.status).toBe(302);
  const cookie = res.headers.get("set-cookie") ?? "";
  expect(cookie).toContain(`${SESSION_COOKIE}=`);
  expect(cookie).toMatch(/HttpOnly/i);
  return cookie.split(";")[0]!;
}

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
    const cookie = await login();
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

  it("shows the intake as the whole page when there are no sites, and at /new", async () => {
    const cookie = await login();
    expect((await app.request("/new")).status).toBe(302);
    const page = await (await app.request("/new", { headers: { cookie } })).text();
    expect(page).toContain('action="/api/sites"');
    expect(page).toContain('name="description"');
    expect(page).toMatch(/id="scope-home"[^>]*checked/);
  });

  it("keeps the description and says why when the intake is refused", async () => {
    const cookie = await login();
    const form = new FormData();
    form.set("description", "Prekratko.");
    const res = await app.request("/api/sites", { method: "POST", body: form, headers: { cookie } });
    expect(res.status).toBe(400);
    const page = await res.text();
    expect(page).toContain("Opis mora imeti vsaj 30 znakov.");
    expect(page).toContain(">Prekratko.</textarea>");
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
    const [low, high] = loadConfig().plans.paid.monthlyEurRange;
    expect(page).toContain(`od ${low}\u00a0€`);
    expect(page).toContain(`(${low}–${high}\u00a0€)`);
    // The prompt goes to the intake form; the description never lands in the URL (no name attribute).
    const formTag = page.match(/<form class="prompt"[^>]*>/)?.[0] ?? "";
    expect(formTag).toContain('action="/new"');
    expect(formTag).toContain('method="get"');
    expect(page).not.toMatch(/<textarea[^>]*name=/);
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
    const cookie = await login();
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
    const signOut = await app.request("/logout", { method: "POST", headers: { cookie } });
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
    const cookie = await login();
    const form = new FormData();
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

  it("refuses AI work once the daily spend cap is reached", async () => {
    const cookie = await login();
    const site = (await platform.repo.listSites())[0]!;
    await platform.repo.logModelCall({ siteId: site.id, jobId: null, stage: "brief", model: "claude-sonnet-5-5", inputTokens: 1, outputTokens: 1, cacheCreationTokens: 0, cacheReadTokens: 0, costEur: 1000, durationMs: 1, ok: true });
    const res = await app.request(`/api/sites/${site.id}/generate`, { method: "POST", body: "{}", headers: { cookie, "content-type": "application/json" } });
    expect(res.status).toBe(429);
  });
});

describe("direct editor API (no model calls)", () => {
  it("patches, adds sections, detects conflicts, reverts, blocks and allows publishing, exports", async () => {
    const { readFile } = await import("node:fs/promises");
    const golden = JSON.parse(await readFile(path.join(import.meta.dirname, "../../../tools/eval/golden/pekarna-kvas.json"), "utf8"));
    const cookie = await login();
    const json = { cookie, "content-type": "application/json" };
    const brief = JSON.parse(await readFile(path.join(import.meta.dirname, "../../../tools/eval/fixtures/pekarna-kvas/brief.json"), "utf8"));
    const site = await platform.repo.createSite({ name: "Pekarna Kvas", slug: "pekarna-kvas", intake: { description: brief.description, photoAssetIds: [], scope: "full" } });
    await platform.repo.saveSpec(site.id, golden, "manual");
    const before = sent.length;

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
