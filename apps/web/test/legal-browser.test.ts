import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { serve, type ServerType } from "@hono/node-server";
import { loadConfig } from "@sb/config";
import { launchCheckBrowser, runAxe, type CheckBrowser } from "@sb/engine";
import { Repo, createDb, createFsStorage, migrate, type Platform, type Queue } from "@sb/platform";
import { createApp } from "../src/app.ts";

/**
 * The product's public pages in Chromium at phone and desktop width, as the accessibility statement (/dostopnost)
 * says they are checked: axe (WCAG 2.2 A and AA rules) finds nothing, nothing scrolls sideways, and the landing
 * footer's links are at least 24 px tall (WCAG 2.5.8) and lead to their pages.
 */
const PAGES = ["/", "/login", "/zasebnost", "/pogoji", "/dostopnost"];
let platform: Platform;
let dir: string;
let server: ServerType;
let base: string;
let cb: CheckBrowser;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sb-legal-browser-"));
  const db = await createDb("pglite://memory");
  await migrate(db);
  const queue: Queue = { send: async () => "job", work: async () => undefined, ping: async () => undefined, stop: async () => undefined };
  platform = { db, repo: new Repo(db), storage: createFsStorage(dir), queue, close: () => db.close() };
  const app = createApp({ platform, config: loadConfig(), auth: { password: "test-password-1234", secret: "s".repeat(32), secureCookies: false } });
  server = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" });
  await new Promise<void>((r) => server.once("listening", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  cb = await launchCheckBrowser();
}, 120_000);

afterAll(async () => {
  await cb?.close();
  server?.close();
  await platform?.close();
  await rm(dir, { recursive: true, force: true });
});

describe("the product's public pages", () => {
  for (const width of [360, 1280] as const) {
    it(`at ${width} px: axe finds nothing and nothing scrolls sideways`, async () => {
      const context = await cb.browser.newContext({ viewport: { width, height: 800 }, reducedMotion: "reduce" });
      try {
        const page = await context.newPage();
        for (const p of PAGES) {
          await page.goto(`${base}${p}`, { waitUntil: "load" });
          expect(await runAxe(page), p).toEqual([]);
          expect(await page.evaluate(() => document.documentElement.scrollWidth), p).toBeLessThanOrEqual(width);
        }
      } finally {
        await context.close();
      }
    }, 120_000);

    it(`at ${width} px: the landing footer's legal links are big enough and open their pages`, async () => {
      const context = await cb.browser.newContext({ viewport: { width, height: 800 }, reducedMotion: "reduce" });
      try {
        const page = await context.newPage();
        await page.goto(`${base}/`);
        const sizes = await page.locator("footer a").evaluateAll((els) => els.map((e) => ({ text: e.textContent, h: e.getBoundingClientRect().height })));
        for (const s of sizes) expect(s.h, s.text ?? "").toBeGreaterThanOrEqual(24);
        for (const [name, h1] of [["Pogoji uporabe", "Pogoji uporabe"], ["Izjava o dostopnosti", "Izjava o dostopnosti"], ["Zasebnost", "Zasebnost"]] as const) {
          await page.goto(`${base}/`);
          await page.locator("footer").getByRole("link", { name, exact: true }).click();
          await expect.poll(() => page.locator("h1").textContent()).toBe(h1);
        }
      } finally {
        await context.close();
      }
    }, 120_000);
  }
});
