import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { serve, type ServerType } from "@hono/node-server";
import { loadConfig } from "@sb/config";
import { launchCheckBrowser, runAxe, type CheckBrowser } from "@sb/engine";
import { Repo, createDb, createFsStorage, migrate, type GenerationProps, type Platform, type Queue } from "@sb/platform";
import { createApp } from "../src/app.ts";
import { adminCookie } from "./session-helpers.ts";

/**
 * /admin/funnel and /admin/engine in Chromium at phone and desktop width, filled with a week of events: axe (WCAG 2.2
 * A and AA rules) finds nothing and nothing scrolls sideways. SB_SHOTS_DIR=<dir> saves a screenshot of each.
 */
const PASSWORD = "test-password-1234";
let platform: Platform;
let dir: string;
let server: ServerType;
let base: string;
let cb: CheckBrowser;
let session: string;

const generation = (p: Partial<GenerationProps>): GenerationProps => ({
  scope: "home",
  outcome: "done",
  seconds: 74.2,
  firstVersionSeconds: 38.5,
  eur: 0.2412,
  stages: { classify: { seconds: 0.6, eur: 0.0006 }, brief: { seconds: 9.1, eur: 0.031 }, design: { seconds: 5.2, eur: 0.018 }, images: { seconds: 11, eur: 0.004 }, imageGen: { seconds: 14.3, eur: 0.06 }, content: { seconds: 21.4, eur: 0.09 }, check: { seconds: 12.2, eur: 0 }, critique: { seconds: 8.8, eur: 0.037 } },
  failedStage: null,
  error: null,
  checksFailed: [],
  lighthouse: { performance: 96, accessibility: 100, bestPractices: 100, seo: 100 },
  critique: { rounds: 1, issues: [3] },
  pictures: 2,
  retries: 0,
  caps: { spend: false, pictures: false },
  direction: "topla-pekarna",
  hero: "hero-split:image-right",
  ...p,
});

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sb-analytics-browser-"));
  const db = await createDb("pglite://memory");
  await migrate(db);
  const queue: Queue = { send: async () => "job", work: async () => undefined, ping: async () => undefined, stop: async () => undefined };
  platform = { db, repo: new Repo(db), storage: createFsStorage(dir), queue, close: () => db.close() };
  const loaded = loadConfig();
  const app = createApp({ platform, config: { ...loaded, analytics: { ...loaded.analytics, events: true } }, auth: { password: PASSWORD, secret: "s".repeat(32), secureCookies: false } });
  server = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" });
  await new Promise<void>((r) => server.once("listening", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  session = (await adminCookie((p, init) => fetch(`${base}${p}`, init), PASSWORD)).split("=")[1]!;

  // A week of a small funnel: 40 devices see the page, 14 describe their business, and so on down.
  const e = platform.repo.events;
  for (let i = 0; i < 40; i++) await e.add({ kind: "landing_view", deviceKey: `d${i}`, tier: "anonymous" });
  for (let i = 0; i < 14; i++) {
    await e.add({ kind: "intake_submitted", deviceKey: `d${i}`, siteId: `site_${i}`, tier: "anonymous", props: { scope: "home", photos: i % 3, logo: false } });
    if (i < 12) await e.add({ kind: "preview_ready", siteId: `site_${i}`, tier: "anonymous", props: { seconds: 30 + i * 2, eur: 0.2 + i / 100 } });
    if (i < 11) await e.add({ kind: "preview_opened", siteId: `site_${i}`, deviceKey: `d${i}`, tier: "anonymous" });
    if (i < 5) await e.add({ kind: "signin_done", deviceKey: `d${i}`, accountId: `acc_${i}`, tier: "free" });
    if (i < 4) await e.add({ kind: "preview_claimed", siteId: `site_${i}`, deviceKey: `d${i}`, accountId: `acc_${i}`, tier: "free" });
    if (i < 2) await e.add({ kind: "plan_changed", accountId: `acc_${i}`, tier: "paid", plan: "standard", props: { from: null, to: "standard" } });
    if (i < 2) await e.add({ kind: "site_generated", siteId: `site_${i}`, accountId: `acc_${i}`, tier: "paid", props: { seconds: 95, eur: 0.43 } });
    if (i < 1) await e.add({ kind: "published", siteId: `site_${i}`, accountId: `acc_${i}`, tier: "paid", props: { version: 3, first: true } });
  }
  for (const reason of ["too_short", "too_short", "junk_intake", "anonymous_homepages_used", "form_expired"]) await e.add({ kind: "intake_refused", props: { reason } });
  for (const which of ["anonymous_homepages_used", "free_edits_used", "plan_pages"]) await e.add({ kind: "limit_hit", props: { which } });
  await e.add({ kind: "upsell_shown", deviceKey: "d1", siteId: "site_1", props: { where: "locked_pages" } });
  await e.add({ kind: "upsell_clicked", deviceKey: "d1", props: { where: "plans" } });
  for (const k of ["edit_direct", "edit_direct", "edit_chat", "exported", "signin_requested"] as const) await e.add({ kind: k, siteId: "site_1" });
  // Spread over the week, so the medians between steps are minutes to hours.
  await db.query("update product_events set at = now() - ((1000 - id) * interval '9 minutes')");
  for (let i = 0; i < 9; i++) await e.add({ kind: "generation", siteId: `site_${i}`, tier: i < 2 ? "paid" : "anonymous", props: generation({ seconds: 60 + i * 9, eur: 0.2 + i / 50, checksFailed: i % 3 ? [] : ["axe:color-contrast", "scroll-360"] }) as unknown as Record<string, unknown> });
  await e.add({ kind: "generation", siteId: "site_20", tier: "free", props: generation({ outcome: "failed", failedStage: "content", error: "SpendCapError", caps: { spend: true, pictures: false }, firstVersionSeconds: null, seconds: 31 }) as unknown as Record<string, unknown> });
  cb = await launchCheckBrowser();
}, 120_000);

afterAll(async () => {
  await cb?.close();
  server?.close();
  await platform?.close();
  await rm(dir, { recursive: true, force: true });
}, 60_000);

describe("/admin/funnel and /admin/engine in the browser", () => {
  for (const width of [360, 1280] as const) {
    it(`at ${width} px: axe finds nothing and nothing scrolls sideways`, async () => {
      const context = await cb.browser.newContext({ viewport: { width, height: 800 }, reducedMotion: "reduce" });
      try {
        await context.addCookies([{ name: "sb_session", value: session, url: base }]);
        const page = await context.newPage();
        for (const p of ["/admin/funnel", "/admin/engine", "/admin/funnel?dni=30", "/admin"]) {
          const res = await page.goto(`${base}${p}`, { waitUntil: "load" });
          expect(res?.status(), p).toBe(200);
          expect(await runAxe(page), p).toEqual([]);
          expect(await page.evaluate(() => document.documentElement.scrollWidth), p).toBeLessThanOrEqual(width);
          if (process.env.SB_SHOTS_DIR && !p.includes("?")) {
            await mkdir(process.env.SB_SHOTS_DIR, { recursive: true });
            await page.screenshot({ path: path.join(process.env.SB_SHOTS_DIR, `${p.replace(/\//g, "_").slice(1)}-${width}.png`), fullPage: true });
          }
        }
        // The funnel's numbers made it onto the page.
        await page.goto(`${base}/admin/funnel`, { waitUntil: "load" });
        const text = await page.evaluate(() => document.body.innerText);
        expect(text).toContain("Ogledi prve strani");
        expect(text).toMatch(/35 % \(14\/40\)/);
      } finally {
        await context.close();
      }
    }, 180_000);
  }
});
