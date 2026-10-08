import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { serve, type ServerType } from "@hono/node-server";
import { loadConfig } from "@sb/config";
import { HOMEPAGE_READY, launchCheckBrowser, type CheckBrowser } from "@sb/engine";
import { Repo, createDb, createFsStorage, migrate, type Platform, type Queue } from "@sb/platform";
import { createApp } from "../src/app.ts";
import { adminCookie } from "./session-helpers.ts";
import { goldenWithDraft } from "./homepage-draft-helpers.ts";

/**
 * Config pipeline.homepageFirst in Chromium at 1280 and 360 px: a full-site generation's live preview shows the
 * homepage as rendered as soon as the run logs "Homepage ready" (read only: no editing layer, links do nothing), before
 * any version is saved; once the first version is saved, the editor shows it as before. Events are written by the test
 * (a scripted pipeline, no model call). SB_SHOTS=<dir> saves a screenshot of each state.
 */
const PASSWORD = "test-password-1234";
const config = loadConfig();
let platform: Platform;
let dir: string;
let server: ServerType;
let base: string;
let cb: CheckBrowser;
let cookie: string;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sb-draft-e2e-"));
  const db = await createDb("pglite://memory");
  await migrate(db);
  const queue: Queue = { send: async () => "job", work: async () => undefined, ping: async () => undefined, stop: async () => undefined };
  platform = { db, repo: new Repo(db), storage: createFsStorage(dir), queue, close: () => db.close() };
  const app = createApp({ platform, config, auth: { password: PASSWORD, secret: "s".repeat(32), secureCookies: false } });
  server = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" });
  await new Promise<void>((r) => server.once("listening", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  cookie = await adminCookie((p, init) => fetch(`${base}${p}`, init), PASSWORD);
  cb = await launchCheckBrowser();
}, 120_000);

afterAll(async () => {
  await cb?.close();
  server?.close();
  await platform?.close();
  await rm(dir, { recursive: true, force: true });
});

type Page = Awaited<ReturnType<CheckBrowser["browser"]["newPage"]>>;

async function shot(page: Page, name: string) {
  const out = process.env.SB_SHOTS;
  if (!out) return;
  await mkdir(out, { recursive: true });
  await page.screenshot({ path: path.join(out, `${name}.png`) });
}

const event = (siteId: string, stage: string, message: string, data?: unknown) => platform.repo.addEvent({ siteId, stage, message, ...(data === undefined ? {} : { data }) });
const BRIEF = { name: "Računovodstvo Seliškar d.o.o.", town: "Murska Sobota", summary: "Računovodski servis v Murski Soboti.", offerings: [{ name: "Poslovne knjige" }, { name: "Plače" }] };

describe("homepage shown before the other pages are written (pipeline.homepageFirst)", () => {
  for (const width of [1280, 360]) {
    it(`${width} px: the live preview becomes the rendered homepage, then the saved version`, async () => {
      const slug = `seliskar-draft-${width}`;
      const { full, draft } = await goldenWithDraft(slug);
      const site = await platform.repo.createSite({ name: "Računovodstvo Seliškar", slug, intake: { description: "Računovodstvo Seliškar, Murska Sobota.", photoAssetIds: [], scope: "full" } });
      await platform.repo.setStatus(site.id, "generating");
      for (const s of ["classify", "brief", "design", "images"]) {
        await event(site.id, s, "start");
        if (s === "brief") await platform.repo.setBrief(site.id, BRIEF, BRIEF.name);
        if (s === "design") await event(site.id, "design", "Direction chosen", { direction: full.design.direction, colors: full.design.colors });
        await event(site.id, s, "done", { ms: 1500 });
      }
      await event(site.id, "content", "start");

      const context = await cb.browser.newContext({ viewport: { width, height: 900 } });
      const [name, value] = cookie.split("=") as [string, string];
      await context.addCookies([{ name, value, url: base }]);
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      try {
        await page.goto(`${base}/sites/${site.id}`);
        // Before the homepage: the live skeleton, as today.
        await page.locator(".frame.live").waitFor();
        expect(await page.locator("iframe").count()).toBe(0);

        // The homepage is written; the other pages are still being written.
        await event(site.id, "content", HOMEPAGE_READY, { ms: 12_000, attempts: 1, issues: [], homepage: draft });
        const draftFrame = page.locator(".frame-box.draft iframe");
        await draftFrame.waitFor({ timeout: 10_000 });
        expect(await page.locator(".frame.live").count()).toBe(0);
        const inner = page.frameLocator(".frame-box.draft iframe");
        await expect.poll(() => inner.locator("h1").textContent(), { timeout: 10_000 }).toBe("Računovodstvo za s.p., d.o.o. in društva");
        // The site's own stylesheet loaded: the page is the rendered site, not a skeleton.
        await expect.poll(() => inner.locator("header.site-header").evaluate((n) => getComputedStyle(n).display)).not.toBe("inline");
        expect(await page.locator(".stages li.run").allTextContents()).toEqual([expect.stringContaining("Besedila in postavitev")]);
        expect(await page.locator(".panel").textContent()).toContain("Domača stran je napisana, druge strani še pišemo.");
        // Read only: no editing layer, no version yet, a link does nothing.
        expect(await inner.locator(".sb-tools, [contenteditable]").count()).toBe(0);
        expect(await inner.locator("style").evaluateAll((s) => s.some((n) => n.textContent?.includes("data-sb-selected")))).toBe(false);
        const src = await draftFrame.getAttribute("src");
        expect(src).toContain("?draft=homepage");
        await inner.locator('footer a[href="storitve.html"]').first().evaluate((a) => (a as HTMLAnchorElement).click());
        await page.waitForTimeout(500);
        expect(await draftFrame.evaluate((f) => (f as HTMLIFrameElement).contentWindow!.location.search)).toBe(`?draft=homepage&e=${src!.split("&e=")[1]}`);
        expect(await platform.repo.listVersions(site.id)).toEqual([]);
        if (width === 360) {
          await page.waitForTimeout(800);
          await shot(page, "1-homepage-ready-360");
          expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
        } else {
          await page.waitForTimeout(800);
          await shot(page, "1-homepage-ready-phone-1280");
          // The size switch shows the homepage at desktop width too.
          await page.getByRole("button", { name: "Računalnik" }).click();
          await expect.poll(() => page.locator(".frame-box.draft iframe").getAttribute("data-width")).toBe("1280");
          await expect.poll(() => inner.locator("h1").textContent(), { timeout: 10_000 }).toBe("Računovodstvo za s.p., d.o.o. in društva");
          expect(await inner.locator("body").evaluate(() => window.innerWidth)).toBe(1280);
          await page.waitForTimeout(800);
          await shot(page, "2-homepage-ready-1280");
        }

        // The other pages are written and merged: the first version is saved and the editor switches to it.
        await event(site.id, "content", "done", { ms: 20_000 });
        await platform.repo.saveSpec(site.id, full, "generate");
        await event(site.id, "preview", "First version saved; the editor shows it while checks and critique run", { ms: 30_000, version: 1 });
        await event(site.id, "check", "start");
        const savedFrame = page.locator(".frame-box:not(.draft) iframe");
        await savedFrame.waitFor({ timeout: 10_000 });
        expect(await page.locator(".frame-box.draft").count()).toBe(0);
        await expect.poll(() => savedFrame.getAttribute("src")).toMatch(/\/preview\/site_[0-9a-f]+\/index\.html\?v=1$/);
        const saved = page.frameLocator(".frame-box:not(.draft) iframe");
        await expect.poll(() => saved.locator("h1").textContent(), { timeout: 10_000 }).toBe("Računovodstvo za s.p., d.o.o. in društva");
        await expect.poll(() => page.locator(".panel").textContent()).toContain("Stran preverjamo");
        await page.waitForTimeout(800);
        await shot(page, `3-first-version-${width}`);
        if (width === 360) expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
        expect(errors).toEqual([]);
      } finally {
        await context.close();
      }
    }, 120_000);
  }
});
