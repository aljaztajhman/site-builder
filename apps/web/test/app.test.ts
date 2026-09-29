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
    expect((await app.request("/")).status).toBe(302);
    expect((await app.request("/api/sites/x")).status).toBe(401);
    expect((await app.request("/preview/x/index.html")).status).toBe(302);
  });

  it("rejects a wrong password and accepts the right one", async () => {
    const bad = await app.request("/login", { method: "POST", body: new URLSearchParams({ password: "nope" }) });
    expect(bad.status).toBe(401);
    const cookie = await login();
    const res = await app.request("/", { headers: { cookie } });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Nova stran");
  });

  it("rejects a forged session cookie", async () => {
    const res = await app.request("/", { headers: { cookie: `${SESSION_COOKIE}=9999999999.forged` } });
    expect(res.status).toBe(302);
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
    expect((await app.request("/s/demo/..%2f..%2fsecret")).status).toBe(404);
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
    const site = await platform.repo.createSite({ name: "Pekarna Kvas", slug: "pekarna-kvas", intake: { description: "Pekarna Kvas", photoAssetIds: [], scope: "full" } });
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
    expect(published.status).toBe(200);
    const home = await app.request("/s/pekarna-kvas/");
    expect(home.status).toBe(200);
    const publishedHtml = await home.text();
    expect(publishedHtml).toContain("Kruh z drožmi iz Kamnika");
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
