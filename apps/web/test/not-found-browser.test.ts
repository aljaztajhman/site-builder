import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import { serve, type ServerType } from "@hono/node-server";
import { loadConfig } from "@sb/config";
import { launchCheckBrowser, type CheckBrowser } from "@sb/engine";
import { Repo, createDb, createFsStorage, migrate, type Platform, type Queue } from "@sb/platform";
import type { SiteSpec } from "@sb/spec";
import { createApp } from "../src/app.ts";
import { adminCookie } from "./session-helpers.ts";
import { fillPlaceholderOps } from "../../../tools/eval/src/placeholder-fill.ts";

/**
 * The 404 page in Chromium at the site root and deeper down (published and preview): styled (the shared
 * stylesheet and fonts load), no horizontal scroll at 1280 and 360 px, and its home button reaches the
 * homepage. SB_SCREENSHOT_DIR keeps screenshots.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const PASSWORD = "test-password-1234";
let platform: Platform;
let dir: string;
let server: ServerType;
let base: string;
let cb: CheckBrowser;
let cookie: string;
let siteId: string;
let slug: string;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sb-404-e2e-"));
  const db = await createDb("pglite://memory");
  await migrate(db);
  const queue: Queue = { send: async () => "job", work: async () => undefined, ping: async () => undefined, stop: async () => undefined };
  platform = { db, repo: new Repo(db), storage: createFsStorage(dir), queue, close: () => db.close() };
  const app = createApp({ platform, config: loadConfig(), auth: { password: PASSWORD, secret: "s".repeat(32), secureCookies: false } });
  server = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" });
  await new Promise<void>((r) => server.once("listening", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const spec = JSON.parse(await readFile(path.join(here, "../../../tools/eval/golden/racunovodstvo-seliskar.json"), "utf8")) as SiteSpec;
  const brief = JSON.parse(await readFile(path.join(here, "../../../tools/eval/fixtures/racunovodstvo-seliskar/brief.json"), "utf8")) as { description: string };
  slug = spec.slug;
  const site = await platform.repo.createSite({ name: "Seliškar", slug, intake: { description: brief.description, photoAssetIds: [], scope: "full" } });
  siteId = site.id;
  await platform.repo.saveSpec(site.id, spec, "generate");
  cookie = await adminCookie((p, init) => fetch(`${base}${p}`, init), PASSWORD);
  const patch = await fetch(`${base}/api/sites/${site.id}/patch`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ baseVersion: 1, ops: fillPlaceholderOps(spec), message: "facts" }),
  });
  expect(patch.status, await patch.clone().text()).toBe(200);
  const pub = await fetch(`${base}/api/sites/${site.id}/publish`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: "{}" });
  expect(pub.status, await pub.clone().text()).toBe(200);
  cb = await launchCheckBrowser();
}, 120_000);

afterAll(async () => {
  await cb?.close();
  server?.close();
  await platform?.close();
  await rm(dir, { recursive: true, force: true });
});

describe("404 page at any depth in Chromium", () => {
  const cases = [
    { name: "published-root", url: () => `/s/${slug}/nic.html`, home: () => `/s/${slug}/index.html`, auth: false },
    { name: "published-depth1", url: () => `/s/${slug}/storitve/nic`, home: () => `/s/${slug}/index.html`, auth: false },
    { name: "published-depth2", url: () => `/s/${slug}/a/b/nic.html`, home: () => `/s/${slug}/index.html`, auth: false },
    { name: "preview-depth2", url: () => `/preview/${siteId}/a/b/nic.html`, home: () => `/preview/${siteId}/index.html`, auth: true },
  ];
  for (const width of [1280, 360]) {
    it.each(cases)(`$name at ${width} px: styled, no horizontal scroll, the home button works`, async (c) => {
      const context = await cb.browser.newContext({ viewport: { width, height: 800 }, reducedMotion: "reduce" });
      if (c.auth) {
        const [name, value] = cookie.split(";")[0]!.split("=");
        await context.addCookies([{ name: name!, value: value!, url: base }]);
      }
      const page = await context.newPage();
      const failed: string[] = [];
      page.on("response", (r) => {
        if (r.status() >= 400 && r.url() !== `${base}${c.url()}`) failed.push(`${r.status()} ${r.url()}`);
      });
      try {
        const res = await page.goto(`${base}${c.url()}`, { waitUntil: "networkidle" });
        expect(res?.status()).toBe(404);
        expect(failed).toEqual([]);
        const look = await page.evaluate(() => ({
          sheets: [...document.styleSheets].filter((s) => s.href?.includes("/_shared/")).length,
          bodyFont: getComputedStyle(document.body).fontFamily,
          buttonBg: getComputedStyle(document.querySelector(".not-found .btn--primary")!).backgroundColor,
          scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          fonts: [...document.fonts].filter((f) => f.status === "loaded").length,
        }));
        expect(look.sheets).toBe(1);
        expect(look.bodyFont).not.toMatch(/^"?Times/);
        expect(look.buttonBg).not.toBe("rgba(0, 0, 0, 0)");
        expect(look.scroll).toBeLessThanOrEqual(0);
        expect(look.fonts).toBeGreaterThan(0);
        if (process.env.SB_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.SB_SCREENSHOT_DIR, `404-${c.name}-${width}.png`) });
        await page.locator(".not-found .btn--primary").click();
        await page.waitForURL(`${base}${c.home()}`);
        expect(await page.title()).not.toMatch(/ni mogoče najti/i);
      } finally {
        await context.close();
      }
    });
  }
});
