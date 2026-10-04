import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import { serve, type ServerType } from "@hono/node-server";
import { loadConfig } from "@sb/config";
import { launchCheckBrowser, type CheckBrowser } from "@sb/engine";
import { Repo, createDb, createFsStorage, migrate, type Platform, type Queue } from "@sb/platform";
import { isoDay, type SiteSpec } from "@sb/spec";
import { createApp } from "../src/app.ts";
import { adminCookie } from "./session-helpers.ts";

/**
 * Collections in Chromium against the real app: the owner switches the blog on under Strani, adds a post in
 * the form (dated today by the date picker), and its pages work at 360 and 1280 px; past events disappear.
 * Screenshots go to SB_SHOTS when set (for looking at them), else nowhere.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const PASSWORD = "test-password-1234";
const SHOTS = process.env.SB_SHOTS;
let platform: Platform;
let dir: string;
let server: ServerType;
let base: string;
let cb: CheckBrowser;
let cookie: string;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sb-coll-e2e-"));
  const db = await createDb("pglite://memory");
  await migrate(db);
  const queue: Queue = { send: async () => "job", work: async () => undefined, ping: async () => undefined, stop: async () => undefined };
  platform = { db, repo: new Repo(db), storage: createFsStorage(dir), queue, close: () => db.close() };
  const app = createApp({ platform, config: loadConfig(), auth: { password: PASSWORD, secret: "s".repeat(32), secureCookies: false } });
  server = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" });
  await new Promise<void>((r) => server.once("listening", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  cookie = await adminCookie((p, init) => fetch(`${base}${p}`, init), PASSWORD);
  cb = await launchCheckBrowser();
  if (SHOTS) await mkdir(SHOTS, { recursive: true });
}, 120_000);

afterAll(async () => {
  await cb?.close();
  server?.close();
  await platform?.close();
  await rm(dir, { recursive: true, force: true });
});

async function bakery(slug: string): Promise<string> {
  const spec = JSON.parse(await readFile(path.join(here, "../../../tools/eval/golden/pekarna-kvas.json"), "utf8")) as SiteSpec;
  spec.slug = slug;
  const site = await platform.repo.createSite({ name: slug, slug, intake: { description: "Pekarna Kvas, Šutna 30, Kamnik.", photoAssetIds: [], scope: "home" } });
  await platform.repo.saveSpec(site.id, spec, "generate");
  return site.id;
}

async function context(width: number) {
  const ctx = await cb.browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce", ...(width < 500 ? { isMobile: true, hasTouch: true } : {}) });
  const [name, value] = cookie.split("=") as [string, string];
  await ctx.addCookies([{ name, value, url: base }]);
  return ctx;
}

const spec = async (siteId: string) => (await platform.repo.getSpec(siteId))!;
const patch = async (siteId: string, ops: unknown[]) => {
  const current = await spec(siteId);
  const res = await fetch(`${base}/api/sites/${siteId}/patch`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ baseVersion: current.version, ops }) });
  expect(res.status, await res.clone().text()).toBe(200);
};

describe.each([1280, 360])("collections at %i px", (width) => {
  it("switches the blog on in the editor and adds a post dated today", async () => {
    const id = await bakery(`zbirke-${width}`);
    const ctx = await context(width);
    try {
      const page = await ctx.newPage();
      await page.goto(`${base}/sites/${id}`);
      await page.getByRole("button", { name: /^Strani/ }).click();
      await page.getByRole("button", { name: "Vklopi novice" }).click();
      await page.getByRole("button", { name: "Uredi: Novice" }).click();
      await page.getByRole("button", { name: "+ Dodaj" }).click();
      await expect.poll(async () => (await spec(id)).spec.collections?.blog?.items.length ?? 0, { timeout: 10_000 }).toBe(1);
      // The date field is the browser's date picker, set to today.
      const date = page.locator('input[type="date"]').first();
      expect(await date.inputValue()).toBe(isoDay(new Date()));
      const title = page.locator('[data-path="/collections/blog/items"] input[type="text"]').first();
      await title.fill("Rženi kruh ob petkih");
      await expect.poll(async () => (await spec(id)).spec.collections?.blog?.items[0]?.title, { timeout: 10_000 }).toBe("Rženi kruh ob petkih");
      // The rest still holds starter text: the post can't be published until the owner writes it.
      const blockers = ((await (await fetch(`${base}/api/sites/${id}`, { headers: { cookie } })).json()) as { blockers: string[] }).blockers;
      expect(blockers.some((b) => b.startsWith("/collections/blog/items/0/") && b.includes("starter text"))).toBe(true);
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `editor-collection-${width}.png`) });
    } finally {
      await ctx.close();
    }
  }, 90_000);

  it("renders the list and the entry pages without sideways scrolling, and hides past events", async () => {
    const id = await bakery(`zbirke-strani-${width}`);
    const on = await fetch(`${base}/api/sites/${id}/collections`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ baseVersion: 1, kind: "events" }) });
    expect(on.status).toBe(200);
    const today = isoDay(new Date());
    const later = isoDay(new Date(Date.now() + 30 * 864e5));
    await patch(id, [
      { op: "add", path: "/collections/events/items/0", value: { title: "Lanski sejem", date: "2020-05-01", summary: "Že mimo." } },
      { op: "add", path: "/collections/events/items/1", value: { title: "Dan odprtih vrat pri krušni peči", date: later, start: "10:00", end: "14:00", place: "Pekarna Kvas, Šutna 30", summary: "Pokažemo peč in kvas, ki ga hranimo že od začetka.", body: ["Pridite v soboto dopoldne.", "Otroci lahko oblikujejo svojo štručko."], image: "img_02" } },
      { op: "add", path: "/collections/events/items/2", value: { title: "Današnja degustacija", date: today, summary: "Še traja." } },
    ]);
    const ctx = await context(width);
    try {
      const page = await ctx.newPage();
      await page.goto(`${base}/preview/${id}/dogodki.html`);
      const items = page.locator(".coll__item");
      await expect.poll(() => items.count()).toBe(3);
      // events.js: yesterday's and older events are hidden; today's and later ones stay.
      await expect.poll(() => page.locator(".coll__item:visible").allInnerTexts().then((t) => t.map((x) => x.split("\n").find((l) => l.length > 3)))).not.toContain("Lanski sejem");
      expect(await page.locator(".coll__item", { hasText: "Lanski sejem" }).isHidden()).toBe(true);
      expect(await page.locator(".coll__item", { hasText: "Današnja degustacija" }).isVisible()).toBe(true);
      const noScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
      expect(await noScroll()).toBe(true);
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `events-list-${width}.png`), fullPage: true });

      await page.locator(".coll__title a", { hasText: "Dan odprtih vrat" }).click();
      await page.waitForURL(/\/dogodki\/dan-odprtih-vrat-pri-krusni-peci\.html$/);
      await expect.poll(() => page.locator("h1").innerText()).toBe("Dan odprtih vrat pri krušni peči");
      expect(await page.locator(".entry__past").isHidden()).toBe(true);
      expect(await noScroll()).toBe(true);
      // The header, styles and pictures resolve one directory down.
      expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).not.toBe("");
      // (Test sites have no stored photo files; the picture's address is the site's media directory.)
      expect(await page.locator(".entry__media img").evaluate((img: HTMLImageElement) => new URL(img.src).pathname)).toMatch(new RegExp(`^/preview/${id}/media/img_02-\\d+\\.webp$`));
      // The back link leads to the list.
      const back = page.locator(".entry__back a");
      expect(await back.boundingBox().then((b) => (b?.height ?? 0) >= 44)).toBe(true);
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `event-page-${width}.png`), fullPage: true });
      await back.click();
      await page.waitForURL(/\/dogodki\.html$/);
    } finally {
      await ctx.close();
    }
  }, 90_000);
});
