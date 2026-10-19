// @module-tag slow
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import { serve, type ServerType } from "@hono/node-server";
import { loadConfig } from "@sb/config";
import { launchCheckBrowser, type CheckBrowser } from "@sb/engine";
import { Repo, createDb, createFsStorage, migrate, type Platform, type Queue } from "@sb/platform";
import type { SiteSpec } from "@sb/spec";
import { createApp } from "../src/app.ts";
import { adminCookie } from "./session-helpers.ts";

/**
 * The editor's feel (editor UX POC, 2026-10-19), in Chromium against the real app over HTTP: an edit swaps only its
 * section in the preview (no reload), saving is said in the app bar, a delete needs no dialog and offers "Razveljavi",
 * ↷ Ponovi and Ctrl+Z / Ctrl+Y work, "Še to potrebujemo" counts what is filled in, and a phone shows what is selected.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const PASSWORD = "test-password-1234";
let platform: Platform;
let dir: string;
let server: ServerType;
let base: string;
let cb: CheckBrowser;
let cookie: string;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sb-editor-ux-"));
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
}, 120_000);

afterAll(async () => {
  await cb?.close();
  server?.close();
  await platform?.close();
  await rm(dir, { recursive: true, force: true });
});

/** A fresh copy of the bakery's golden site (home: hero, strip, products, about, order, hours, contact). */
async function bakery(slug: string): Promise<string> {
  const spec = JSON.parse(await readFile(path.join(here, "../../../tools/eval/golden/pekarna-kvas.json"), "utf8")) as SiteSpec;
  spec.slug = slug;
  const site = await platform.repo.createSite({ name: slug, slug, intake: { description: "Pekarna Kvas, Šutna 30, Kamnik.", photoAssetIds: [], scope: "home" } });
  await platform.repo.saveSpec(site.id, spec, "generate");
  return site.id;
}

async function open(siteId: string, width = 1280) {
  const context = await cb.browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
  const [name, value] = cookie.split("=") as [string, string];
  await context.addCookies([{ name, value, url: base }]);
  const page = await context.newPage();
  const dialogs: string[] = [];
  page.on("dialog", (d) => {
    dialogs.push(d.message());
    void d.dismiss();
  });
  await page.goto(`${base}/sites/${siteId}`);
  await page.locator(".outline li").first().waitFor();
  await page.frameLocator(PREVIEW).locator("#s_about").waitFor();
  // The preview's editing layer is attached on the frame's load.
  await page.waitForTimeout(300);
  return { page, dialogs, close: () => context.close() };
}

type Page = Awaited<ReturnType<typeof open>>["page"];
const PREVIEW = 'iframe[title="Predogled strani"]';
const spec = async (siteId: string) => ((await platform.repo.getSpec(siteId))!).spec;
const home = (s: SiteSpec) => s.pages.find((p) => p.kind === "home")!;
const aboutHeading = async (id: string) => (home(await spec(id)).sections.find((s) => s.id === "s_about")?.props as { heading?: string } | undefined)?.heading;
const hasAbout = async (id: string) => home(await spec(id)).sections.some((s) => s.id === "s_about");

/** A mark on the preview's window: still there after a save means the frame was not reloaded. */
const setMarker = (page: Page) =>
  page.evaluate((sel) => {
    ((document.querySelector(sel) as HTMLIFrameElement).contentWindow as unknown as Record<string, unknown>).__sbMarker = 1;
  }, PREVIEW);
const marker = (page: Page) =>
  page.evaluate((sel) => ((document.querySelector(sel) as HTMLIFrameElement).contentWindow as unknown as Record<string, unknown>).__sbMarker ?? null, PREVIEW);

describe("editor UX in a browser", () => {
  it("edits text in place: the edit affordance shows, the save is said in the bar, the preview is not reloaded", async () => {
    const id = await bakery("ux-na-mestu");
    const { page, close } = await open(id);
    try {
      const title = page.frameLocator(PREVIEW).locator("#s_about h2");
      await title.click(); // selects the section
      // The selected section's editable text is marked for the hover outline (in the frame's DOM only).
      await expect.poll(() => title.getAttribute("data-sb-edit")).toBe("");
      await setMarker(page);
      await title.click(); // edits its text
      await expect.poll(() => title.getAttribute("contenteditable")).toBe("plaintext-only");
      await page.keyboard.press("Control+A");
      await page.keyboard.type("Naše drožmi");
      await page.keyboard.press("Enter");
      await expect.poll(() => page.locator("header.top .save-status").textContent(), { timeout: 10_000 }).toContain("Shranjeno");
      await expect.poll(() => aboutHeading(id), { timeout: 10_000 }).toBe("Naše drožmi");
      // The section was swapped for its re-rendered HTML: same window, new text, still selected with its toolbar.
      await expect.poll(() => title.textContent()).toBe("Naše drožmi");
      expect(await marker(page)).toBe(1);
      await expect.poll(() => page.frameLocator(PREVIEW).locator("#s_about[data-sb-selected] > .sb-tools").count()).toBe(1);
      // No toast for a plain save.
      expect(await page.locator(".toast").isVisible()).toBe(false);
      // The marks live in the frame's DOM only: the page the swap copies from (and that publishing renders, byte for
      // byte the same) carries no editor attribute.
      const served = await (await fetch(`${base}/preview/${id}/index.html`, { headers: { cookie } })).text();
      expect(served).toContain("Naše drožmi");
      expect(served).not.toMatch(/data-sb-|contenteditable|sb-tools/);
    } finally {
      await close();
    }
  }, 60_000);

  it("a section's form field swaps the section without reloading the preview", async () => {
    const id = await bakery("ux-obrazec");
    const { page, close } = await open(id);
    try {
      await page.locator(".outline li", { hasText: "O nas" }).click();
      await setMarker(page);
      await page.locator('[data-path$="/props/heading"] input').fill("Drožmi iz domače kleti");
      await expect.poll(() => aboutHeading(id), { timeout: 10_000 }).toBe("Drožmi iz domače kleti");
      await expect.poll(() => page.frameLocator(PREVIEW).locator("#s_about h2").textContent(), { timeout: 10_000 }).toBe("Drožmi iz domače kleti");
      expect(await marker(page)).toBe(1);
      // A layout switch swaps it too.
      await page.locator(".variant", { hasText: "Samo besedilo" }).click();
      await expect.poll(() => page.frameLocator(PREVIEW).locator("#s_about").getAttribute("class"), { timeout: 10_000 }).toContain("s-about--text-only");
      expect(await marker(page)).toBe(1);
    } finally {
      await close();
    }
  }, 60_000);

  it("deletes a section without a dialog; Razveljavi brings it back, ↷ Ponovi and Ctrl+Z / Ctrl+Y move through it", async () => {
    const id = await bakery("ux-brisanje");
    const { page, dialogs, close } = await open(id);
    try {
      await page.locator(".outline li", { hasText: "O nas" }).click();
      await page.frameLocator(PREVIEW).getByRole("button", { name: "Izbriši: O nas" }).click();
      await expect.poll(() => hasAbout(id), { timeout: 10_000 }).toBe(false);
      const toast = page.locator(".toast");
      await expect.poll(() => toast.locator(".toast-text").textContent()).toBe("Razdelek »O nas« izbrisan.");
      const again = toast.locator(".toast-action");
      expect(await again.textContent()).toBe("Razveljavi");
      await again.click();
      await expect.poll(() => hasAbout(id), { timeout: 10_000 }).toBe(true);
      // Redo: the delete again.
      const redo = page.getByRole("button", { name: "Ponovi" });
      await expect.poll(() => redo.count(), { timeout: 10_000 }).toBe(1);
      await redo.click();
      await expect.poll(() => hasAbout(id), { timeout: 10_000 }).toBe(false);
      // Nothing left to redo: the button goes away (it shows only while it can do something).
      await expect.poll(() => redo.count(), { timeout: 10_000 }).toBe(0);
      // The keyboard, with no field focused.
      await page.locator("h1.site-name").click();
      await page.keyboard.press("Control+z");
      await expect.poll(() => hasAbout(id), { timeout: 10_000 }).toBe(true);
      await page.keyboard.press("Control+y");
      await expect.poll(() => hasAbout(id), { timeout: 10_000 }).toBe(false);
      expect(dialogs).toEqual([]);
    } finally {
      await close();
    }
  }, 60_000);

  it("Razveljavi after a delete goes back to the version before it, and not after another save landed meanwhile", async () => {
    const id = await bakery("ux-razveljavi");
    const { page, close } = await open(id);
    try {
      await page.locator(".outline li", { hasText: "O nas" }).click();
      await page.frameLocator(PREVIEW).getByRole("button", { name: "Izbriši: O nas" }).click();
      await expect.poll(() => hasAbout(id), { timeout: 10_000 }).toBe(false);
      await expect.poll(() => page.locator(".toast .toast-text").textContent()).toBe("Razdelek »O nas« izbrisan.");
      // Typing elsewhere before the tap (saved within the toast's 8 s): the toast says so and undoes nothing.
      await page.locator(".shortcut", { hasText: "Podatki" }).click();
      await page.locator('[data-path="/business/name"] input').fill("Pekarna Kvas in sin");
      await expect.poll(async () => (await spec(id)).business.name, { timeout: 10_000 }).toBe("Pekarna Kvas in sin");
      await page.locator(".toast .toast-action").click();
      await expect.poll(() => page.locator(".toast .toast-text").textContent(), { timeout: 10_000 }).toContain("Medtem je bilo shranjeno še kaj");
      await page.waitForTimeout(500);
      expect(await hasAbout(id)).toBe(false);
      expect((await spec(id)).business.name).toBe("Pekarna Kvas in sin");
    } finally {
      await close();
    }
  }, 60_000);

  it("↷ Ponovi goes away once a version from elsewhere lands", async () => {
    const id = await bakery("ux-ponovi");
    const { page, close } = await open(id);
    try {
      await page.locator(".outline li", { hasText: "O nas" }).click();
      await page.frameLocator(PREVIEW).getByRole("button", { name: "Izbriši: O nas" }).click();
      await expect.poll(() => hasAbout(id), { timeout: 10_000 }).toBe(false);
      await page.locator("h1.site-name").click();
      await page.keyboard.press("Control+z");
      await expect.poll(() => hasAbout(id), { timeout: 10_000 }).toBe(true);
      const redo = page.getByRole("button", { name: "Ponovi" });
      await expect.poll(() => redo.count(), { timeout: 10_000 }).toBe(1);
      // A version from elsewhere (here: the first one restored from the history): redoing would throw it away, so
      // there is nothing to redo any more.
      const versionBefore = (await platform.repo.getSpec(id))!.version;
      await page.locator("details.menu > summary").click();
      await page.getByRole("button", { name: "Zgodovina sprememb" }).click();
      await page.getByRole("button", { name: "Obnovi različico 1", exact: true }).click();
      await expect.poll(async () => (await platform.repo.getSpec(id))!.version, { timeout: 10_000 }).toBeGreaterThan(versionBefore);
      await expect.poll(() => redo.count(), { timeout: 10_000 }).toBe(0);
      const versionAfter = (await platform.repo.getSpec(id))!.version;
      await page.locator("h1.site-name").click();
      await page.keyboard.press("Control+y");
      await page.waitForTimeout(800);
      expect((await platform.repo.getSpec(id))!.version).toBe(versionAfter);
    } finally {
      await close();
    }
  }, 60_000);

  it("deletes a page without a dialog and offers Razveljavi", async () => {
    const id = await bakery("ux-stran");
    const s = await spec(id);
    const about = structuredClone(home(s).sections.find((x) => x.id === "s_about")!);
    s.pages.push({ ...structuredClone(home(s)), id: "p_extra", kind: "standard", slug: "o-pekarni", nav: { label: "O pekarni", show: true }, seo: { title: "O pekarni", description: "O pekarni Kvas." }, sections: [{ ...about, id: "s_extra_about" }] } as SiteSpec["pages"][number]);
    await platform.repo.saveSpec(id, s, "manual", "nova stran");
    const { page, dialogs, close } = await open(id);
    try {
      await page.locator(".shortcut", { hasText: "Strani" }).click();
      await page.getByRole("button", { name: "Izbriši stran" }).click();
      await expect.poll(async () => (await spec(id)).pages.some((p) => p.id === "p_extra"), { timeout: 10_000 }).toBe(false);
      await expect.poll(() => page.locator(".toast .toast-text").textContent()).toBe("Stran »O pekarni« izbrisana.");
      await page.locator(".toast .toast-action").click();
      await expect.poll(async () => (await spec(id)).pages.some((p) => p.id === "p_extra"), { timeout: 10_000 }).toBe(true);
      expect(dialogs).toEqual([]);
    } finally {
      await close();
    }
  }, 60_000);

  it("Še to potrebujemo counts what is filled in and groups the facts by page and section", async () => {
    const id = await bakery("ux-manjka");
    const { page, close } = await open(id);
    try {
      await page.locator("#checklist-summary").click();
      await page.locator("#facts-ask").waitFor();
      const count = page.locator("#facts-ask .ask-count");
      const total = await page.locator("#facts-ask [data-ask]").count();
      expect(await count.textContent()).toBe(`Vpisano 0 od ${total}`);
      expect(await page.locator("#facts-ask [role=progressbar]").getAttribute("aria-valuenow")).toBe("0");
      // Headings: the business's facts, and the products section for its prices.
      const groups = await page.locator("#facts-ask h3.ask-group").allTextContents();
      expect(groups).toContain("Podatki o podjetju");
      expect(groups.some((g) => g.includes("›"))).toBe(true);
      // A price typed: the count and the bar move while the screen stays open, and the bar's chip drops.
      const chip = page.locator("#checklist-summary");
      const before = Number(/\d+/.exec((await chip.textContent())!)![0]);
      await page.locator('#facts-ask [data-ask$="/price"] input').first().fill("2,40");
      await expect.poll(() => count.textContent(), { timeout: 10_000 }).toBe(`Vpisano 1 od ${total}`);
      expect(await page.locator("#facts-ask [role=progressbar]").getAttribute("aria-valuenow")).toBe("1");
      await expect.poll(async () => Number(/\d+/.exec((await chip.textContent())!)![0])).toBe(before - 1);
      // A value typed and taken back before it was saved (nothing to save): the bar goes quiet, not "Shranjujem…" for good.
      const status = page.locator("header.top .save-status");
      const tax = page.locator('#facts-ask [data-ask="/business/provider/taxNumber"] input');
      await tax.fill("1");
      await tax.fill("");
      await expect.poll(() => status.getAttribute("data-state"), { timeout: 5000 }).toBe("idle");
    } finally {
      await close();
    }
  }, 60_000);

  it("on a phone, a tapped section shows its name and Uredi under the sheet's handle; Uredi opens its form", async () => {
    const id = await bakery("ux-telefon");
    const { page, close } = await open(id, 375);
    try {
      const panel = page.locator(".ed .panel");
      const strip = page.locator(".sel-strip");
      expect(await strip.count()).toBe(0);
      await page.frameLocator(PREVIEW).locator("#s_about h2").click();
      await expect.poll(() => strip.isVisible()).toBe(true);
      expect(await strip.textContent()).toContain("O nas");
      // Closed: the strip is the sheet's one line, with Uredi in reach (44 px tall at least on touch; on screen here).
      await page.getByRole("button", { name: "Razširi urejanje" }).click();
      await page.getByRole("button", { name: "Pomanjšaj urejanje" }).click();
      expect(await panel.getAttribute("data-sheet")).toBe("closed");
      const uredi = strip.getByRole("button", { name: "Uredi" });
      await expect.poll(async () => {
        const b = (await uredi.boundingBox())!;
        const p = (await panel.boundingBox())!;
        return b.y >= p.y && b.y + b.height <= p.y + p.height;
      }).toBe(true);
      await uredi.click();
      expect(await panel.getAttribute("data-sheet")).toBe("full");
      expect(await strip.isVisible()).toBe(false);
      const head = page.locator("#selected-head h2");
      await expect.poll(() => head.textContent()).toBe("O nas");
      await expect.poll(async () => {
        const hb = (await head.boundingBox())!;
        const p = (await panel.boundingBox())!;
        return hb.y >= p.y && hb.y + hb.height <= p.y + p.height;
      }).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    } finally {
      await close();
    }
  }, 60_000);
});
