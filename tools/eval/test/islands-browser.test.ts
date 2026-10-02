import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "playwright";
import { loadConfig } from "@sb/config";
import { launchCheckBrowser, serveStatic, type CheckBrowser, type StaticServer } from "@sb/engine";
import { siteFiles } from "@sb/render";
import { migrateSpec, type SiteSpec } from "@sb/spec";

/**
 * The island scripts every site ships (packages/components/islands), driven in Chromium on a rendered golden site
 * at 360 px: the menu (focus trap, Escape, outside click), the gallery dialog (arrows, Escape, focus back) and
 * the consent-gated map (nothing before a click, the map after one). They are typechecked (tsconfig.islands.json);
 * this proves the behaviour the types were written around.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const config = loadConfig();
let cb: CheckBrowser;
let server: StaticServer;
let dir: string;
let slug: string;

beforeAll(async () => {
  const spec = migrateSpec(JSON.parse(await readFile(path.join(here, "../golden/kmetija-grabnar.json"), "utf8"))) as SiteSpec;
  slug = spec.slug;
  dir = await mkdtemp(path.join(tmpdir(), "sb-islands-"));
  for (const [rel, data] of siteFiles(spec, new Map(), { imageWidths: config.images.widths })) {
    const file = path.join(dir, rel);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, data);
  }
  server = await serveStatic(dir);
  cb = await launchCheckBrowser();
}, 120_000);

afterAll(async () => {
  await cb?.close();
  await server?.close();
  await rm(dir, { recursive: true, force: true });
});

async function open(width = 360): Promise<Page> {
  const context = await cb.browser.newContext({ viewport: { width, height: 800 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${server.url}/${slug}/index.html`);
  page.on("close", () => expect(errors).toEqual([]));
  return page;
}

/** Whether the focused element matches `selector`. */
const focusedIs = (page: Page, selector: string) => page.evaluate((sel) => document.activeElement?.matches(sel) ?? false, selector);

describe("island scripts in Chromium", () => {
  it("menu: opens, traps Tab inside, closes on Escape with focus back on the button, and on an outside tap", async () => {
    const page = await open();
    const toggle = page.locator("[data-nav-toggle]");
    await toggle.click();
    await expect.poll(() => toggle.getAttribute("aria-expanded")).toBe("true");
    const links = await page.locator(`#${await toggle.getAttribute("aria-controls")} a[href]`).count();
    expect(links).toBeGreaterThan(0);
    // Tab past the last link wraps to the toggle; Shift+Tab from the toggle wraps to the last link.
    for (let i = 0; i <= links; i++) await page.keyboard.press("Tab");
    expect(await focusedIs(page, "[data-nav-toggle]")).toBe(true);
    await page.keyboard.press("Shift+Tab");
    expect(await focusedIs(page, ".is-open a[href]")).toBe(true);
    await page.keyboard.press("Escape");
    expect(await toggle.getAttribute("aria-expanded")).toBe("false");
    expect(await focusedIs(page, "[data-nav-toggle]")).toBe(true);
    await toggle.click();
    await page.mouse.click(350, 780);
    expect(await toggle.getAttribute("aria-expanded")).toBe("false");
    await page.close();
  }, 60_000);

  it("gallery: a photo opens the dialog, arrows move through the photos, Escape closes it and returns focus", async () => {
    const page = await open();
    const items = page.locator("a[data-gallery-item]");
    const hrefs = await items.evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    expect(hrefs.length).toBeGreaterThan(1);
    await items.first().click();
    const dialog = page.locator("dialog.lightbox");
    await expect.poll(() => dialog.evaluate((d) => (d as HTMLDialogElement).open)).toBe(true);
    const shown = () => page.locator(".lightbox__img").getAttribute("src");
    expect(await shown()).toBe(hrefs[0]);
    await page.keyboard.press("ArrowRight");
    expect(await shown()).toBe(hrefs[1]);
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    expect(await shown()).toBe(hrefs[hrefs.length - 1]);
    expect(await page.locator(".lightbox [aria-live]").textContent()).not.toBe("");
    await page.keyboard.press("Escape");
    await expect.poll(() => dialog.evaluate((d) => (d as HTMLDialogElement).open)).toBe(false);
    // The dialog's close event (where focus returns) fires after `open` turns false.
    await expect.poll(() => focusedIs(page, `a[data-gallery-item][href="${hrefs[hrefs.length - 1]}"]`)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe("");
    await page.close();
  }, 60_000);

  it("consent: no map before a click, the map after one; a refusal hides the notice and loads nothing", async () => {
    const page = await open(1280);
    expect(await page.locator("[data-embed-src] iframe").count()).toBe(0);
    await expect.poll(() => page.locator("[data-consent-notice]").isVisible()).toBe(true);
    await page.locator('[data-consent="denied"]').click();
    expect(await page.locator("[data-consent-notice]").isVisible()).toBe(false);
    expect(await page.locator("[data-embed-src] iframe").count()).toBe(0);
    await page.route("https://**", (r) => r.fulfill({ status: 204, body: "" }));
    await page.locator("[data-embed-load]").first().click();
    const frame = page.locator("[data-embed-src] iframe");
    await expect.poll(() => frame.count()).toBe(1);
    expect(await frame.getAttribute("src")).toMatch(/^https:\/\//);
    await page.close();
  }, 60_000);
});
