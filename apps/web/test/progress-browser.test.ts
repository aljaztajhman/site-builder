import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import { serve, type ServerType } from "@hono/node-server";
import { loadConfig } from "@sb/config";
import { launchCheckBrowser, mediaKey, processPhoto, type CheckBrowser } from "@sb/engine";
import { Repo, createDb, createFsStorage, migrate, type Platform, type Queue } from "@sb/platform";
import { createApp } from "../src/app.ts";

/**
 * The generation screen in Chromium: every running stage counts up, the picture step is listed, and the
 * preview frame fills in with the run's real name, colours and pictures before the text is written.
 * SB_SHOTS=<dir> also saves a screenshot of each state at 1280 and 360 px.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const PASSWORD = "test-password-1234";
const config = loadConfig();
let platform: Platform;
let dir: string;
let server: ServerType;
let base: string;
let cb: CheckBrowser;
let cookie: string;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sb-progress-e2e-"));
  const db = await createDb("pglite://memory");
  await migrate(db);
  const queue: Queue = { send: async () => "job", work: async () => undefined, ping: async () => undefined, stop: async () => undefined };
  platform = { db, repo: new Repo(db), storage: createFsStorage(dir), queue, close: () => db.close() };
  const app = createApp({ platform, config, auth: { password: PASSWORD, secret: "s".repeat(32), secureCookies: false } });
  server = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" });
  await new Promise<void>((r) => server.once("listening", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const login = await fetch(`${base}/login`, { method: "POST", body: new URLSearchParams({ password: PASSWORD, next: "/" }), redirect: "manual" });
  cookie = (login.headers.get("set-cookie") ?? "").split(";")[0]!;
  cb = await launchCheckBrowser();
}, 120_000);

afterAll(async () => {
  await cb?.close();
  server?.close();
  await platform?.close();
  await rm(dir, { recursive: true, force: true });
});

const BRIEF = {
  name: "Inštalacije Rebernik",
  town: "Ptuj",
  summary: "Vodovodne in odtočne inštalacije, talno in radiatorsko ogrevanje ter montaža toplotnih črpalk na Ptuju in v okolici.",
  offerings: [{ name: "Vodovod in odtoki" }, { name: "Talno ogrevanje" }, { name: "Toplotne črpalke" }, { name: "Prenove kopalnic" }],
};
const COLORS = { background: "#ffffff", surface: "#f1f4f8", text: "#111418", muted: "#4a5360", primary: "#c2410c", onPrimary: "#ffffff", accent: "#c2410c", border: "#d5dbe3", inverse: "#111418", onInverse: "#ffffff" };

async function event(siteId: string, stage: string, message: string, data?: unknown) {
  await platform.repo.addEvent({ siteId, stage, message, ...(data === undefined ? {} : { data }) });
}

type Page = Awaited<ReturnType<CheckBrowser["browser"]["newPage"]>>;

async function shot(page: Page, name: string) {
  const out = process.env.SB_SHOTS;
  if (!out) return;
  await mkdir(out, { recursive: true });
  await page.screenshot({ path: path.join(out, `${name}.png`) });
}

describe("generation progress in a browser", () => {
  it("counts up the running stage, lists the picture step and fills the preview as results arrive", async () => {
    const site = await platform.repo.createSite({ name: "Inštalacije Rebernik", slug: "rebernik-progress", intake: { description: "Inštalacije Rebernik, Ptuj.", photoAssetIds: [], scope: "home" } });
    await platform.repo.setStatus(site.id, "generating");
    for (const width of [1280, 360]) {
      const context = await cb.browser.newContext({ viewport: { width, height: 900 } });
      const [name, value] = cookie.split("=") as [string, string];
      await context.addCookies([{ name, value, url: base }]);
      const page = await context.newPage();
      try {
        if (width === 1280) {
          await event(site.id, "classify", "start");
          await event(site.id, "classify", "done", { ms: 1200 });
          await event(site.id, "brief", "start");
        }
        await page.goto(`${base}/sites/${site.id}`);
        await page.locator(".frame.live").waitFor();
        if (width === 1280) {
          // A running stage counts up on its own, between polls.
          const counter = page.locator(".stages li.run .num");
          await expect.poll(() => counter.count()).toBe(1);
          const first = await counter.textContent();
          await page.waitForTimeout(2200);
          expect(await counter.textContent()).not.toBe(first);
          await expect.poll(() => page.locator(".sk-activity").textContent()).toContain("Razumevanje opisa");
          await shot(page, "1-brief-running-1280");

          // Brief done, pictures and design start side by side: the picture step appears and runs.
          await platform.repo.setBrief(site.id, BRIEF, BRIEF.name);
          await event(site.id, "brief", "done", { ms: 11_000 });
          await event(site.id, "imageGen", "start");
          await event(site.id, "design", "start");
          await expect.poll(() => page.locator(".sk-name").textContent(), { timeout: 10_000 }).toBe(BRIEF.name);
          await expect.poll(() => page.locator(".stages li.run").allTextContents()).toEqual(expect.arrayContaining([expect.stringContaining("Ustvarjanje slik")]));
          expect(await page.locator(".sk-offers li").allTextContents()).toEqual(BRIEF.offerings.map((o) => o.name));

          // The design is chosen: the skeleton takes its colours.
          await event(site.id, "design", "Direction chosen", { direction: "bold-local", colors: COLORS });
          await event(site.id, "design", "done", { ms: 2500 });
          await expect.poll(() => page.locator(".sk-btn.wide").evaluate((n) => getComputedStyle(n).backgroundColor), { timeout: 10_000 }).toBe("rgb(194, 65, 12)");
          await expect.poll(() => page.locator(".sk-activity").textContent()).toContain("Ustvarjanje slik");
          await shot(page, "2-design-1280");

          // The first picture lands: it shows in the hero slot with its AI label.
          const photo = await readFile(path.join(here, "../../../tools/eval/fixtures/frizerstvo-lana/photos/01.jpg"));
          const processed = await processPhoto("img_g1", new Uint8Array(photo), [720], { avif: 40, webp: 60 });
          for (const v of processed.variants) await platform.storage.put(mediaKey(site.id, v.file), v.data, v.file.endsWith(".webp") ? "image/webp" : "image/avif");
          await event(site.id, "imageGen", "Image ready", { id: "img_g1", alt: "Bakrene cevi na delovni mizi" });
          const img = page.locator(".sk-hero-pic img");
          await img.waitFor({ timeout: 10_000 });
          await expect.poll(() => img.evaluate((n) => (n as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
          expect(await page.locator(".sk-hero-pic .sk-ai").textContent()).toBe("Ustvarjeno z UI");
          await page.waitForTimeout(1000);
          await shot(page, "3-picture-1280");

          // The size switch works before the first version exists: the live preview at desktop width.
          await page.getByRole("button", { name: "Računalnik" }).click();
          await expect.poll(async () => (await page.locator(".frame.live").boundingBox())!.width, { timeout: 5000 }).toBeGreaterThan(640);
          await expect.poll(() => page.locator(".sk-hero").evaluate((n) => getComputedStyle(n).gridTemplateColumns.split(" ").length)).toBe(2);
          await shot(page, "4-desktop-1280");
        } else {
          await page.waitForTimeout(1200);
          await shot(page, "3-picture-360");
          // Nothing spills sideways on a phone.
          expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
        }
      } finally {
        await context.close();
      }
    }
  }, 120_000);
});
