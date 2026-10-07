import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import { serve, type ServerType } from "@hono/node-server";
import { loadConfig } from "@sb/config";
import { launchCheckBrowser, runAxe, type AxeViolation, type CheckBrowser } from "@sb/engine";
import { Repo, createDb, createFsStorage, memoryMailer, migrate, type Platform, type Queue } from "@sb/platform";
import type { SiteSpec } from "@sb/spec";
import { createApp } from "../src/app.ts";
import { adminCookie, ownerSignIn } from "./session-helpers.ts";

/**
 * The signed-in product pages in the "Arctic & teal" colours (sb-ui-palette), in Chromium at 360 and 1280 px: axe
 * (WCAG 2.2 A/AA and best practices, colour contrast included) finds nothing and nothing scrolls sideways on the
 * admin's sites list, the admin page, a site's messages and the website checker, and on a free account's sites list
 * and editor, where the free-preview badge shows (at 360 px its stage used to scroll: the frame was sized before the
 * free account's longer note under it arrived, and axe flagged the scrolling region without a tab stop). The landing and login are in legal-browser.test.ts, the editor's
 * other states in editor-a11y-browser.test.ts. SB_SCREENSHOT_DIR=<dir> saves a screenshot of each page and the landing.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const PASSWORD = "test-password-1234";
const shots = process.env.SB_SCREENSHOT_DIR;
const mail = memoryMailer();
let platform: Platform;
let dir: string;
let server: ServerType;
let base: string;
let cb: CheckBrowser;
let golden: SiteSpec;
let cookie: string;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sb-ui-pages-"));
  const db = await createDb("pglite://memory");
  await migrate(db);
  const queue: Queue = { send: async () => "job", work: async () => undefined, ping: async () => undefined, stop: async () => undefined };
  platform = { db, repo: new Repo(db), storage: createFsStorage(dir), queue, close: () => db.close() };
  const app = createApp({ platform, config: loadConfig(), auth: { password: PASSWORD, secret: "s".repeat(32), secureCookies: false }, mailer: mail });
  server = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" });
  await new Promise<void>((r) => server.once("listening", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  golden = JSON.parse(await readFile(path.join(here, "../../../tools/eval/golden/pekarna-kvas.json"), "utf8")) as SiteSpec;
  cookie = await adminCookie((p, init) => fetch(`${base}${p}`, init), PASSWORD);
  cb = await launchCheckBrowser();
}, 120_000);

afterAll(async () => {
  await cb?.close();
  server?.close();
  await platform?.close();
  await rm(dir, { recursive: true, force: true });
}, 60_000);

let seq = 0;
async function site(owner: { accountId?: string } = {}): Promise<string> {
  const slug = `barve-${++seq}`;
  const s = await platform.repo.createSite({ name: `Pekarna Kvas ${seq}`, slug, intake: { description: "Pekarna Kvas, Šutna 30, Kamnik.", photoAssetIds: [], scope: "home" }, ...owner });
  await platform.repo.saveSpec(s.id, { ...golden, slug }, "generate");
  await platform.repo.setStatus(s.id, "ready");
  return s.id;
}

const describeAxe = (v: AxeViolation[]) => v.map((x) => `${x.id} (${x.impact}, ${x.nodes}): ${x.targets.join(" | ")}`);
type Page = Awaited<ReturnType<CheckBrowser["browser"]["newPage"]>>;

async function check(page: Page, width: number, name: string): Promise<void> {
  expect(describeAxe(await runAxe(page)), name).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth), name).toBeLessThanOrEqual(width);
  if (shots) await page.screenshot({ path: path.join(shots, `${name}-${width}.png`), fullPage: false });
}

async function context(width: number) {
  const ctx = await cb.browser.newContext({ viewport: { width, height: width === 360 ? 780 : 900 }, reducedMotion: "reduce", hasTouch: width === 360, isMobile: width === 360 });
  // The sites list and the editor load site previews in frames: slow when other browser tests share the machine.
  ctx.setDefaultTimeout(90_000);
  return ctx;
}

describe("product pages in the UI colours", () => {
  for (const width of [360, 1280] as const) {
    it(`at ${width} px: the admin's sites list, admin page, messages and checker`, async () => {
      const id = await site();
      await site();
      await platform.repo.addFormMessage({ siteId: id, sectionId: "s_contact", name: "Maja K.", email: "maja@example.si", phone: null, message: "Ali imate v soboto še kruh z drožmi?", senderKey: `k${width}` });
      const ctx = await context(width);
      const [name, value] = cookie.split("=") as [string, string];
      await ctx.addCookies([{ name, value, url: base }]);
      try {
        const page = await ctx.newPage();
        await page.goto(`${base}/sites`, { waitUntil: "load" });
        await page.locator(".site-card").first().waitFor();
        await page.waitForTimeout(300);
        await check(page, width, "sites-admin");
        await page.goto(`${base}/admin`, { waitUntil: "load" });
        await check(page, width, "admin");
        await page.goto(`${base}/sites/${id}/messages`, { waitUntil: "load" });
        await check(page, width, "messages");
        await page.goto(`${base}/pregled`, { waitUntil: "load" });
        await check(page, width, "checker");
      } finally {
        await ctx.close();
      }
    }, 300_000);

    it(`at ${width} px: a free account's sites list and editor, with the free-preview badge`, async () => {
      const ctx = await context(width);
      try {
        // Signed in by magic link over HTTP (the login page's own axe check is in legal-browser.test.ts).
        const email = `barve-${width}@siol.net`;
        const owner = await ownerSignIn((p, init) => fetch(`${base}${p}`, init), mail.sent, email);
        await ctx.addCookies(owner.cookie.split("; ").map((c) => {
          const i = c.indexOf("=");
          return { name: c.slice(0, i), value: c.slice(i + 1), url: base };
        }));
        const page = await ctx.newPage();
        const { rows } = await platform.db.query<{ id: string }>("select id from accounts where email = $1", [email]);
        const id = await site({ accountId: rows[0]!.id });
        await page.goto(`${base}/sites`, { waitUntil: "load" });
        await page.locator(".site-card .preview-badge").waitFor();
        await page.waitForTimeout(300);
        await check(page, width, "sites-free");
        await page.goto(`${base}/sites/${id}`);
        await page.frameLocator("iframe[title='Predogled strani']").locator("main").waitFor();
        await page.locator(".frame-box > .preview-badge").waitFor();
        await page.waitForTimeout(300);
        await check(page, width, "editor-free");
      } finally {
        await ctx.close();
      }
    }, 300_000);
  }

  it.runIf(shots)("screenshots of the landing", async () => {
    for (const width of [360, 1280]) {
      const ctx = await context(width);
      try {
        const page = await ctx.newPage();
        await page.goto(`${base}/`, { waitUntil: "load", timeout: 90_000 });
        await page.waitForTimeout(500);
        await page.screenshot({ path: path.join(shots!, `landing-${width}.png`) });
        await page.screenshot({ path: path.join(shots!, `landing-full-${width}.png`), fullPage: true });
      } finally {
        await ctx.close();
      }
    }
  }, 300_000);
});
