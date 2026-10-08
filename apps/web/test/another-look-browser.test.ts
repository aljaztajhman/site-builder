import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import { serve, type ServerType } from "@hono/node-server";
import { loadConfig, type AppConfig } from "@sb/config";
import { callButtonsPerScreen, launchCheckBrowser, lookKey, measurePage, mediaKey, processPhoto, runAxe, sameLook, type CheckBrowser } from "@sb/engine";
import { Repo, createDb, createFsStorage, migrate, type Platform, type Queue } from "@sb/platform";
import type { SiteSpec } from "@sb/spec";
import { createApp } from "../src/app.ts";
import { adminCookie } from "./session-helpers.ts";

/**
 * "Druga podoba" in the editor (config variety.families on), at 360 and 1280 px, without and with variety.skeleton: the
 * button sits under Oblika › Slog as a 44 px target; a tap saves a new version in another look and the preview shows
 * it at once; the preview of that version equals its published page byte for byte; the published page passes the page
 * checks (no banned pattern, one call button per screen with a skeleton); no sideways scroll; axe finds nothing; undo
 * brings the look before back. No model calls.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const PASSWORD = "test-password-1234";
// Variety switches pinned off here (the repo config has families, skeleton and concept on since sb-variety-switches).
const repoConfig = loadConfig();
const config: AppConfig = { ...repoConfig, variety: { ...repoConfig.variety, families: false, skeleton: false, concept: false, genome: false } };
const families: AppConfig = { ...config, variety: { ...config.variety, families: true } };
const withSkeleton: AppConfig = { ...families, variety: { ...families.variety, skeleton: true } };
let platform: Platform;
let dir: string;
const servers: ServerType[] = [];
const bases: Record<"families" | "skeleton", string> = { families: "", skeleton: "" };
let cb: CheckBrowser;
let cookie: string;

async function listen(app: ReturnType<typeof createApp>): Promise<string> {
  const server = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" });
  servers.push(server);
  await new Promise<void>((r) => server.once("listening", () => r()));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sb-look-browser-"));
  const db = await createDb("pglite://memory");
  await migrate(db);
  const queue: Queue = { send: async () => "job", work: async () => undefined, ping: async () => undefined, stop: async () => undefined };
  platform = { db, repo: new Repo(db), storage: createFsStorage(dir), queue, close: () => db.close() };
  const auth = { password: PASSWORD, secret: "s".repeat(32), secureCookies: false };
  bases.families = await listen(createApp({ platform, config: families, auth }));
  bases.skeleton = await listen(createApp({ platform, config: withSkeleton, auth }));
  cookie = await adminCookie((p, init) => fetch(`${bases.families}${p}`, init), PASSWORD);
  cb = await launchCheckBrowser();
}, 120_000);

afterAll(async () => {
  await cb?.close();
  for (const s of servers) s.close();
  await platform?.close();
  await rm(dir, { recursive: true, force: true });
}, 60_000);

let seq = 0;
/** The dentist's golden (a template with a family, every fact there, so it publishes) with its fixture photos stored. */
async function seed(): Promise<string> {
  const golden = "zobozdravstvo-lebar";
  const fixture = path.join(here, `../../../tools/eval/fixtures/${golden}`);
  const brief = JSON.parse(await readFile(path.join(fixture, "brief.json"), "utf8")) as { description: string; photos: { file: string }[] };
  const spec = JSON.parse(await readFile(path.join(here, `../../../tools/eval/golden/${golden}.json`), "utf8")) as SiteSpec;
  spec.slug = `${golden}-${++seq}`;
  const site = await platform.repo.createSite({ name: spec.slug, slug: spec.slug, intake: { description: brief.description, photoAssetIds: [], scope: "home" } });
  for (const [i, im] of spec.assets.images.entries()) {
    const photo = brief.photos[i % brief.photos.length]!;
    const processed = await processPhoto(im.id, new Uint8Array(await readFile(path.join(fixture, ...photo.file.split("/")))), [360], { avif: 40, webp: 60 });
    for (const v of processed.variants) await platform.storage.put(mediaKey(site.id, v.file), v.data, v.file.endsWith(".webp") ? "image/webp" : "image/avif");
  }
  await platform.repo.saveSpec(site.id, spec, "generate");
  await platform.repo.setStatus(site.id, "ready");
  return site.id;
}

const current = async (id: string) => (await platform.repo.getSpec(id))!;

describe("Druga podoba in the editor", () => {
  for (const mode of ["families", "skeleton"] as const) {
    for (const width of [360, 1280] as const) {
      it(`${mode === "skeleton" ? "with variety.skeleton, " : ""}at ${width} px: a tap shows another look, preview = published, undo goes back`, async () => {
        const base = bases[mode];
        const id = await seed();
        const before = await current(id);
        const context = await cb.browser.newContext({ viewport: { width, height: width === 360 ? 780 : 900 }, reducedMotion: "reduce", hasTouch: width === 360, isMobile: width === 360 });
        const [name, value] = cookie.split("=") as [string, string];
        await context.addCookies([{ name, value, url: base }]);
        try {
          const page = await context.newPage();
          await page.goto(`${base}/sites/${id}`);
          await page.frameLocator("iframe[title='Predogled strani']").locator("main").waitFor();
          await page.locator(".shortcut", { hasText: "Oblika" }).click();
          const button = page.getByRole("button", { name: "Druga podoba", exact: true });
          await button.waitFor();
          await button.scrollIntoViewIfNeeded();
          const box = (await button.boundingBox())!;
          expect(box.height).toBeGreaterThanOrEqual(44);
          expect(box.width).toBeGreaterThanOrEqual(44);
          expect(box.x + box.width).toBeLessThanOrEqual(width);

          // The preview's colours, read from the frame as it is now.
          const primaryInPreview = async () => {
            const frame = await (await page.locator("iframe[title='Predogled strani']").elementHandle())!.contentFrame();
            return frame!.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--c-primary").trim().toLowerCase());
          };
          expect(await primaryInPreview()).toBe(before.spec.design.colors.primary.toLowerCase());

          await button.click();
          await expect.poll(async () => (await current(id)).version, { timeout: 15_000 }).toBe(before.version + 1);
          const after = await current(id);
          expect(sameLook(lookKey(before.spec), lookKey(after.spec))).toBe(false);
          expect(after.spec.design.skeleton !== undefined).toBe(mode === "skeleton");
          // The preview shows the new look at once (no reload by hand).
          await expect.poll(primaryInPreview, { timeout: 15_000 }).toBe(after.spec.design.colors.primary.toLowerCase());
          await page.waitForTimeout(300);
          expect(await page.evaluate(() => document.documentElement.scrollWidth), "no sideways scroll").toBeLessThanOrEqual(width);
          const axe = await runAxe(page);
          expect(axe.map((x) => `${x.id} (${x.impact}): ${x.targets.join(" | ")}`)).toEqual([]);

          // The preview of this version equals its published page, byte for byte; the published page passes the checks.
          const published = await fetch(`${base}/api/sites/${id}/publish`, { method: "POST", headers: { cookie } });
          expect(published.status, await published.clone().text()).toBe(200);
          const live = await (await fetch(`${base}/s/${after.spec.slug}/`)).text();
          const preview = await (await fetch(`${base}/preview/${id}/index.html?v=${after.version}`, { headers: { cookie } })).text();
          expect(preview).toBe(live);
          const site = await context.newPage();
          await site.goto(`${base}/s/${after.spec.slug}/`, { waitUntil: "networkidle" });
          const t = config.checks.tapTarget;
          const m = await measurePage(site, { primaryMin: t.primaryMin, primaryGap: t.primaryGap, absoluteMin: t.absoluteMin });
          expect(m.banned).toEqual([]);
          expect(await site.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
          if (after.spec.design.skeleton) expect((await callButtonsPerScreen(site)).max).toBeLessThanOrEqual(1);
          expect((await runAxe(site)).map((x) => x.id)).toEqual([]);
          await site.close();

          // Undo: the look before comes back, in the repo and in the preview.
          await page.getByRole("button", { name: "Razveljavi" }).first().click();
          await expect.poll(async () => JSON.stringify((await current(id)).spec.design), { timeout: 15_000 }).toBe(JSON.stringify(before.spec.design));
          await expect.poll(primaryInPreview, { timeout: 15_000 }).toBe(before.spec.design.colors.primary.toLowerCase());
        } finally {
          await context.close();
        }
      }, 120_000);
    }
  }
});
