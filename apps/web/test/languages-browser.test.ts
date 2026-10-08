import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import { serve, type ServerType } from "@hono/node-server";
import { loadConfig } from "@sb/config";
import { applyDirectEdit, launchCheckBrowser, runAxe, type CheckBrowser } from "@sb/engine";
import { Repo, createDb, createFsStorage, memoryMailer, migrate, type Platform, type Queue } from "@sb/platform";
import { translatableTexts, type SiteSpec } from "@sb/spec";
import { createApp } from "../src/app.ts";
import { linkFor } from "./session-helpers.ts";
import { fillPlaceholderOps } from "../../../tools/eval/src/placeholder-fill.ts";

/**
 * The site's second language in the editor, in Chromium at 1280 and 360 px (it-editor-languages): Osnovni reads the
 * "Jeziki" note naming Plus and has no button; on Plus "+ Dodaj jezik: angleščina" switches English on, "Prevedi
 * besedila" shows the English page in the preview and its texts in the panel (each with the Slovene under it, marked
 * "Manjka prevod" until typed), a checklist entry opens the section's English, and "Odstrani angleščino" switches it
 * off again. No sideways scroll, 44 px targets, axe finds nothing in the English panel. No model calls.
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
  dir = await mkdtemp(path.join(tmpdir(), "sb-languages-browser-"));
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

let seq = 0;
async function site(accountId: string): Promise<string> {
  const slug = `jeziki-${++seq}`;
  const s = await platform.repo.createSite({ name: slug, slug, intake: { description: "Pekarna Kvas, Šutna 30, Kamnik.", photoAssetIds: [], scope: "full" }, accountId });
  // The facts the generator left as placeholders are filled, so the checklist opens as a list (not "Še to potrebujemo").
  const spec = { ...structuredClone(golden), slug };
  await platform.repo.saveSpec(s.id, applyDirectEdit(spec, fillPlaceholderOps(spec)).spec, "generate");
  await platform.repo.setStatus(s.id, "ready");
  return s.id;
}

type Page = Awaited<ReturnType<CheckBrowser["browser"]["newPage"]>>;
const noSidewaysScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const spec = async (id: string) => (await platform.repo.getSpec(id))!.spec;
const preview = (page: Page) => page.frameLocator('iframe[title="Predogled strani"]');
const frameSrc = (page: Page) => page.locator('iframe[title="Predogled strani"]').getAttribute("src");

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

/** Height and width of each element, for the 44 px targets. */
const sizes = (page: Page, selector: string) => page.locator(selector).evaluateAll((els) => els.map((e) => [e.getBoundingClientRect().width, e.getBoundingClientRect().height]));

describe.each([1280, 360])("the second language at %i px", (width) => {
  it("Osnovni: the Jeziki note names Plus, no button", async () => {
    const ctx = await context(width);
    const page = await ctx.newPage();
    try {
      const id = await site(await signIn(page, `osnovni-jeziki${width}@siol.net`, "standard"));
      await page.goto(`${base}/sites/${id}`);
      await preview(page).locator("main").waitFor();
      await page.getByRole("button", { name: /^Strani/ }).click();
      const note = page.locator("#locales-limit");
      await note.waitFor();
      expect(await note.textContent()).toBe("Paket Osnovni ima stran v enem jeziku. Paket Plus (29 € na mesec) ima stran v dveh jezikih, na primer v slovenščini in angleščini. Plus");
      expect(await page.locator("#add-locale-en").count()).toBe(0);
      expect(await page.locator(".lang-switch").count()).toBe(0);
      expect(await noSidewaysScroll(page)).toBe(true);
      if (SHOTS) {
        await note.scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(SHOTS, `languages-osnovni-${width}.png`) });
      }
    } finally {
      await ctx.close();
    }
  }, 90_000);

  it("Plus: adds English, types its texts on the English page, follows the checklist, removes it again", async () => {
    const ctx = await context(width);
    const page = await ctx.newPage();
    page.on("dialog", (d) => void d.accept());
    try {
      const id = await site(await signIn(page, `plus-jeziki${width}@siol.net`, "premium"));
      const total = translatableTexts(await spec(id)).length;
      await page.goto(`${base}/sites/${id}`);
      await preview(page).locator("main").waitFor();
      await page.getByRole("button", { name: /^Strani/ }).click();
      const add = page.locator("#add-locale-en");
      await add.waitFor();
      expect(await add.textContent()).toBe("+ Dodaj jezik: angleščina");
      expect(await page.locator("#locales-limit").count()).toBe(0);
      if (SHOTS) {
        await add.scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(SHOTS, `languages-add-${width}.png`) });
      }
      await add.click();
      await expect.poll(async () => (await spec(id)).locales.enabled, { timeout: 10_000 }).toEqual(["sl", "en"]);
      const block = page.locator("#languages");
      await expect.poll(() => block.locator(".tr-progress").textContent()).toBe(`Prevedeno 0 od ${total} besedil.`);
      for (const [w, h] of await sizes(page, "#languages .btn")) expect(Math.min(w!, h!)).toBeGreaterThanOrEqual(44);
      expect(await noSidewaysScroll(page)).toBe(true);
      if (SHOTS) {
        await block.scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(SHOTS, `languages-on-${width}.png`) });
      }

      // "Prevedi besedila": the English home page in the preview, its own texts and its sections in the panel.
      await block.getByRole("button", { name: "Prevedi besedila" }).click();
      const sw = page.getByRole("group", { name: "Jezik urejanja" });
      await sw.waitFor();
      expect(await sw.getByRole("button", { name: "Angleščina" }).getAttribute("aria-pressed")).toBe("true");
      await expect.poll(() => frameSrc(page)).toContain(`/preview/${id}/en/index.html`);
      await expect.poll(() => preview(page).locator("html").getAttribute("lang")).toBe("en");
      const pane = page.locator(".pane.translate");
      const menu = pane.getByLabel("Ime v meniju (angleško)");
      expect(await pane.locator(".translation-field").first().locator(".original").textContent()).toBe("Slovensko: Domov");
      expect(await pane.locator(".tr-missing:visible").count()).toBe(3);
      await menu.fill("Home");
      expect(await pane.locator(".tr-missing:visible").count()).toBe(2);
      await expect.poll(async () => (await spec(id)).translations?.en?.["/pages/0/nav/label"], { timeout: 10_000 }).toBe("Home");
      // Phone: the switch, the sections and the buttons are 44 px targets; nothing scrolls sideways.
      if (width < 500) for (const [w, h] of await sizes(page, ".lang-switch button, .translate .outline-item")) expect(Math.min(w!, h!)).toBeGreaterThanOrEqual(44);
      else for (const [, h] of await sizes(page, ".translate .outline-item")) expect(h).toBeGreaterThanOrEqual(44);
      expect(await noSidewaysScroll(page)).toBe(true);
      const violations = await runAxe(page);
      expect(violations.map((v) => `${v.id}: ${v.targets.join(", ")}`)).toEqual([]);
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `languages-translate-home-${width}.png`), fullPage: width > 900 });

      // The hero: a tap on it in the English preview (on a phone, where the panel covers the preview, its row in the
      // panel) opens its English texts; the typed headline shows on the English page.
      const hero = golden.pages[0]!.sections[0]!;
      if (width > 900) await preview(page).locator(`#${hero.id}`).click({ position: { x: 20, y: 20 } });
      else await pane.locator(".outline-item", { hasText: "manjka 5" }).first().click();
      const head = page.locator("#selected-head");
      await head.waitFor();
      const headline = pane.getByLabel("Naslov (angleško)", { exact: true });
      expect(await headline.locator("xpath=..").locator(".original").textContent()).toBe(`Slovensko: ${String((hero.props as Record<string, unknown>).headline)}`);
      await headline.fill("Sourdough bread that rises overnight");
      await expect
        .poll(async () => (await spec(id)).translations?.en?.["/pages/0/sections/0/props/headline"], { timeout: 10_000 })
        .toBe("Sourdough bread that rises overnight");
      await expect.poll(() => preview(page).locator(`#${hero.id}`).innerText(), { timeout: 10_000 }).toContain("Sourdough bread that rises overnight");
      expect(await noSidewaysScroll(page)).toBe(true);
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `languages-translate-hero-${width}.png`) });

      // Publishing waits: the checklist counts the texts left and an entry opens that section's English.
      const chip = page.locator("#checklist-summary");
      await chip.click();
      const list = page.locator("#checklist");
      await list.waitFor();
      expect(await list.locator(".sp strong").textContent()).toContain(`brez prevoda je še ${total - 2} besedil`);
      const about = golden.pages[0]!.sections.findIndex((s) => s.type === "about");
      const entry = list.locator("li button", { hasText: "brez angleškega prevoda" }).filter({ hasText: "O nas" }).first();
      expect(await entry.textContent()).toContain("Še 4 besedila brez angleškega prevoda.");
      if (SHOTS) {
        await list.scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(SHOTS, `languages-checklist-${width}.png`) });
      }
      await entry.click();
      await expect.poll(() => page.evaluate(() => (document.activeElement as HTMLElement | null)?.closest("[data-path]")?.getAttribute("data-path"))).toBe(`/pages/0/sections/${about}/props/heading`);
      expect(await sw.getByRole("button", { name: "Angleščina" }).getAttribute("aria-pressed")).toBe("true");

      // Back to Slovene: the Slovene page and its forms.
      await sw.getByRole("button", { name: "Slovenščina" }).click();
      await expect.poll(() => frameSrc(page)).toMatch(new RegExp(`/preview/${id}/index\\.html`));
      expect(await page.locator(".pane.translate").count()).toBe(0);

      // "Odstrani angleščino": the language and its English go (a version keeps them).
      await page.getByRole("button", { name: "← Vsi razdelki" }).click();
      await page.getByRole("button", { name: /^Strani/ }).click();
      await page.getByRole("button", { name: "Odstrani angleščino" }).click();
      await expect.poll(async () => (await spec(id)).locales.enabled, { timeout: 10_000 }).toEqual(["sl"]);
      expect((await spec(id)).translations).toBeUndefined();
      await page.locator("#add-locale-en").waitFor();
      expect(await page.locator(".lang-switch").count()).toBe(0);
    } finally {
      await ctx.close();
    }
  }, 150_000);
});
