import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import { serve, type ServerType } from "@hono/node-server";
import { loadConfig } from "@sb/config";
import { applyDirectEdit, launchCheckBrowser, startCollection, type CheckBrowser } from "@sb/engine";
import { Repo, createDb, createFsStorage, memoryMailer, migrate, type Platform, type Queue } from "@sb/platform";
import type { SiteSpec } from "@sb/spec";
import { createApp } from "../src/app.ts";
import { linkFor } from "./session-helpers.ts";

/**
 * Collections and the plans, in Chromium at 1280 and 360 px (it-collections-plus, it-collection-translations):
 * Osnovni keeps a blog it had on Plus (Uredi, and a note naming Plus) while the other collections carry "Plus";
 * a Plus site in two languages writes its posts' English in the collection pane (Slovenščina | Angleščina), the
 * English follows a post when another is deleted, and the English page shows it. No sideways scroll. No model calls.
 * Screenshots go to SB_SCREENSHOT_DIR when set.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = process.env.SB_SCREENSHOT_DIR;
const mail = memoryMailer();
let platform: Platform;
let dir: string;
let server: ServerType;
let base: string;
let cb: CheckBrowser;
let golden: SiteSpec;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sb-coll-plus-"));
  const db = await createDb("pglite://memory");
  await migrate(db);
  const queue: Queue = { send: async () => "job", work: async () => undefined, ping: async () => undefined, stop: async () => undefined };
  platform = { db, repo: new Repo(db), storage: createFsStorage(dir), queue, close: () => db.close() };
  const app = createApp({ platform, config: loadConfig(), mailer: mail, auth: { password: "test-password-1234", secret: "s".repeat(32), secureCookies: false } });
  server = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" });
  await new Promise<void>((r) => server.once("listening", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  golden = JSON.parse(await readFile(path.join(here, "../../../tools/eval/golden/pekarna-kvas.json"), "utf8")) as SiteSpec;
  cb = await launchCheckBrowser();
  if (SHOTS) await mkdir(SHOTS, { recursive: true });
}, 120_000);

afterAll(async () => {
  await cb?.close();
  server?.close();
  await platform?.close();
  await rm(dir, { recursive: true, force: true });
});

const POSTS = [
  { title: "Odprli smo", date: "2026-09-01", summary: "Prvi dan v pekarni.", body: ["Vrata smo odprli v ponedeljek."] },
  { title: "Rženi kruh ob petkih", date: "2026-10-02", summary: "Nov kruh v ponudbi.", body: ["Pečemo ga ob petkih zjutraj.", "Naročila sprejemamo po telefonu."] },
];

let seq = 0;
/** The bakery with its news switched on and two posts; `en`: in Slovene and English. */
async function site(accountId: string, en: boolean): Promise<string> {
  const slug = `novice-plus-${++seq}`;
  const spec = { ...structuredClone(golden), slug };
  if (en) spec.locales = { default: "sl", enabled: ["sl", "en"] };
  const ops = startCollection(spec, "blog");
  if ("error" in ops) throw new Error(ops.error);
  const withNews = applyDirectEdit(spec, ops).spec;
  withNews.collections!.blog!.items = structuredClone(POSTS);
  const s = await platform.repo.createSite({ name: slug, slug, intake: { description: "Pekarna Kvas, Šutna 30, Kamnik.", photoAssetIds: [], scope: "full" }, accountId });
  await platform.repo.saveSpec(s.id, withNews, "generate");
  await platform.repo.setStatus(s.id, "ready");
  return s.id;
}

type Page = Awaited<ReturnType<CheckBrowser["browser"]["newPage"]>>;
const noSidewaysScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const spec = async (id: string) => (await platform.repo.getSpec(id))!.spec;

async function context(width: number) {
  return cb.browser.newContext({ viewport: { width, height: width > 900 ? 900 : 780 }, reducedMotion: "reduce", ...(width < 500 ? { isMobile: true, hasTouch: true } : {}) });
}

async function signIn(page: Page, email: string, plan: "standard" | "premium"): Promise<string> {
  await platform.repo.accounts.allow(email, email, null, plan);
  await page.goto(`${base}/login`);
  await page.locator("#email").fill(email);
  await Promise.all([page.waitForNavigation(), page.getByRole("button", { name: "Pošlji povezavo" }).click()]);
  await page.goto(linkFor(mail.sent, email));
  await Promise.all([page.waitForNavigation(), page.getByRole("button", { name: "Prijava" }).click()]);
  return (await platform.repo.accounts.byKey(email))!.id;
}

describe.each([1280, 360])("collections and the plans at %i px", (width) => {
  it("Osnovni keeps a blog from Plus: Uredi and a note naming Plus; the other collections carry Plus", async () => {
    const ctx = await context(width);
    const page = await ctx.newPage();
    try {
      const id = await site(await signIn(page, `osnovni-novice${width}@siol.net`, "standard"), false);
      await page.goto(`${base}/sites/${id}`);
      await page.getByRole("button", { name: /^Strani/ }).click();
      const kept = page.locator('[data-kept="blog"]');
      await kept.waitFor();
      expect(await kept.textContent()).toBe("Novice so v paketu Plus (29 € na mesec). Vnosi, ki jih že imate, ostanejo na strani in jih lahko urejate.");
      expect(await page.getByRole("button", { name: "Uredi: Novice" }).isVisible()).toBe(true);
      expect(await page.locator("[data-locked] .plan-tag").allTextContents()).toEqual(["Plus", "Plus", "Plus"]);
      expect(await noSidewaysScroll(page)).toBe(true);
      if (SHOTS) {
        await kept.scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(SHOTS, `collections-kept-osnovni-${width}.png`) });
      }
      // Its posts are still the owner's to edit; no language switch on a one-language site.
      await page.getByRole("button", { name: "Uredi: Novice" }).click();
      await page.locator('[data-path="/collections/blog/items"]').waitFor();
      expect(await page.locator(".lang-switch").count()).toBe(0);
      await page.locator('[data-path="/collections/blog/items"] input[type="text"]').first().fill("Odprli smo pekarno");
      await expect.poll(async () => (await spec(id)).collections!.blog!.items[0]!.title, { timeout: 10_000 }).toBe("Odprli smo pekarno");
    } finally {
      await ctx.close();
    }
  }, 90_000);

  it("Plus in two languages: a post's English typed in the pane, kept on its post when another is deleted, shown on the English page", async () => {
    const ctx = await context(width);
    const page = await ctx.newPage();
    try {
      const id = await site(await signIn(page, `plus-novice${width}@siol.net`, "premium"), true);
      await page.goto(`${base}/sites/${id}`);
      await page.getByRole("button", { name: /^Strani/ }).click();
      await page.getByRole("button", { name: "Uredi: Novice" }).click();
      const sw = page.getByRole("group", { name: "Jezik vnosov" });
      await sw.waitFor();
      expect(await sw.getByRole("button", { name: "Slovenščina" }).getAttribute("aria-pressed")).toBe("true");
      await sw.getByRole("button", { name: "Angleščina" }).click();
      const posts = page.locator(".translations fieldset.translation");
      await expect.poll(() => posts.count()).toBe(2);
      expect(await posts.locator("legend").allTextContents()).toEqual(["Odprli smo", "Rženi kruh ob petkih"]);
      // The rye bread post: title and its second paragraph, each with the Slovene under it.
      const rye = posts.nth(1);
      await rye.getByLabel("Naslov (angleško)").fill("Rye bread on Fridays");
      await rye.getByLabel("Odstavek 2 (angleško)").fill("Orders by phone.");
      expect(await rye.locator(".original").first().textContent()).toBe("Slovensko: Rženi kruh ob petkih");
      await posts.nth(0).getByLabel("Naslov (angleško)").fill("We are open");
      await expect
        .poll(async () => (await spec(id)).translations?.en, { timeout: 10_000 })
        .toEqual({ "/collections/blog/items/1/title": "Rye bread on Fridays", "/collections/blog/items/1/body/1": "Orders by phone.", "/collections/blog/items/0/title": "We are open" });
      // Tap targets of the switch on a phone, and no sideways scroll.
      if (width < 500) for (const b of await sw.getByRole("button").all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      expect(await noSidewaysScroll(page)).toBe(true);
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `collection-english-${width}.png`), fullPage: width > 900 });

      // Back in Slovene, the first post is deleted: the rye bread's English moves up with it, the deleted one's goes.
      await sw.getByRole("button", { name: "Slovenščina" }).click();
      await page.locator('[data-path="/collections/blog/items"] button.icon[aria-label="Odstrani"]').first().click();
      await expect.poll(async () => (await spec(id)).collections!.blog!.items.length, { timeout: 10_000 }).toBe(1);
      expect((await spec(id)).translations!.en).toEqual({ "/collections/blog/items/0/title": "Rye bread on Fridays", "/collections/blog/items/0/body/1": "Orders by phone." });

      // The English page as a visitor sees it, from the pane's link.
      await sw.getByRole("button", { name: "Angleščina" }).click();
      const href = await page.getByRole("link", { name: "Poglej angleško stran" }).getAttribute("href");
      expect(href).toBe(`/preview/${id}/en/novice.html`);
      const visitor = await ctx.newPage();
      await visitor.goto(`${base}${href}`);
      await visitor.locator(".coll__title a", { hasText: "Rye bread on Fridays" }).click();
      await visitor.waitForURL(/\/en\/novice\/rzeni-kruh-ob-petkih\.html$/);
      await expect.poll(() => visitor.locator("h1").innerText()).toBe("Rye bread on Fridays");
      expect(await visitor.locator("html").getAttribute("lang")).toBe("en");
      expect(await visitor.locator("main").innerText()).toContain("Orders by phone.");
      expect(await noSidewaysScroll(visitor)).toBe(true);
      if (SHOTS) await visitor.screenshot({ path: path.join(SHOTS, `entry-english-${width}.png`), fullPage: true });
    } finally {
      await ctx.close();
    }
  }, 120_000);
});
