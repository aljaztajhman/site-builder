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
import { dayIn } from "../src/stats.ts";
import { adminCookie } from "./session-helpers.ts";
import { fillPlaceholderOps } from "../../../tools/eval/src/placeholder-fill.ts";

/**
 * The cookieless counts end to end in Chromium: a published page is counted once, stats.js reports taps
 * on call and directions, the editor's preview of the same site reports nothing, and no cookie is set.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const PASSWORD = "test-password-1234";
const PHONE_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";
const config = loadConfig();
let platform: Platform;
let dir: string;
let server: ServerType;
let base: string;
let cb: CheckBrowser;
let cookie: string;
let siteId: string;
let slug: string;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sb-stats-e2e-"));
  const db = await createDb("pglite://memory");
  await migrate(db);
  const queue: Queue = { send: async () => "job", work: async () => undefined, ping: async () => undefined, stop: async () => undefined };
  platform = { db, repo: new Repo(db), storage: createFsStorage(dir), queue, close: () => db.close() };
  const app = createApp({ platform, config, auth: { password: PASSWORD, secret: "s".repeat(32), secureCookies: false } });
  server = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" });
  await new Promise<void>((r) => server.once("listening", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const spec = JSON.parse(await readFile(path.join(here, "../../../tools/eval/golden/racunovodstvo-seliskar.json"), "utf8")) as SiteSpec;
  slug = spec.slug;
  const brief = JSON.parse(await readFile(path.join(here, "../../../tools/eval/fixtures/racunovodstvo-seliskar/brief.json"), "utf8")) as { description: string };
  const site = await platform.repo.createSite({ name: "Seliškar", slug, intake: { description: brief.description, photoAssetIds: [], scope: "full" } });
  siteId = site.id;
  await platform.repo.saveSpec(site.id, spec, "generate");
  cookie = await adminCookie((p, init) => fetch(`${base}${p}`, init), PASSWORD);
  const ops = fillPlaceholderOps(spec);
  if (ops.length) {
    const patch = await fetch(`${base}/api/sites/${site.id}/patch`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ baseVersion: 1, ops, message: "facts" }) });
    expect(patch.status, await patch.clone().text()).toBe(200);
  }
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

const counts = () => platform.repo.stats.totals(siteId, dayIn(config.stats.timeZone), dayIn(config.stats.timeZone, new Date(Date.now() + 86400_000)));

/** Taps a link the way a finger would, without leaving the page (tel: and Maps aren't opened in a test). */
type Page = Awaited<ReturnType<CheckBrowser["browser"]["newPage"]>>;
const tap = (page: Page, selector: string) =>
  page.evaluate((sel: string) => {
    document.addEventListener("click", (e) => e.preventDefault(), { once: true });
    (document.querySelector(sel) as HTMLElement).click();
  }, selector);

describe("cookieless counts in the browser", () => {
  it("counts the view and the taps on the live site, sets no cookie, and the preview counts nothing", async () => {
    const context = await cb.browser.newContext({ viewport: { width: 360, height: 780 }, userAgent: PHONE_UA, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    try {
      await page.goto(`${base}/s/${slug}/`);
      await expect.poll(async () => (await counts()).visits).toBe(1);
      expect(await page.locator('script[src$="/js/stats.js"]').count()).toBe(1);
      expect(await page.locator('a[href^="tel:"]').count()).toBeGreaterThan(0);
      expect(await page.locator('a[href^="https://www.google.com/maps/"]').count()).toBeGreaterThan(0);
      await tap(page, 'a[href^="tel:"]');
      await tap(page, 'a[href^="https://www.google.com/maps/"]');
      await expect.poll(async () => counts()).toMatchObject({ visits: 1, calls: 1, directions: 1 });
      expect(await context.cookies()).toEqual([]);

      // The same page in the editor's preview: stats.js is there (preview = published) but sends nothing.
      await context.addCookies(cookie.split("; ").map((kv) => ({ name: kv.split("=")[0]!, value: kv.slice(kv.indexOf("=") + 1), url: base })));
      const beacons: string[] = [];
      page.on("request", (r) => {
        if (r.url().endsWith("/_hit")) beacons.push(r.url());
      });
      await page.goto(`${base}/preview/${siteId}/index.html`);
      expect(await page.locator('script[src*="stats.js"]').count()).toBe(1);
      await tap(page, 'a[href^="tel:"]');
      await page.waitForTimeout(300);
      expect(beacons).toEqual([]);
      expect(await counts()).toMatchObject({ visits: 1, calls: 1, directions: 1 });
    } finally {
      await context.close();
    }
  }, 90_000);
});
