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
 * The dashboard editor in Chromium against the real app over HTTP: saves land in the section the owner
 * edited, the pre-publish checklist opens its field, and a tap on text edits it in place.
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
  dir = await mkdtemp(path.join(tmpdir(), "sb-editor-e2e-"));
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
  await page.goto(`${base}/sites/${siteId}`);
  await page.locator(".outline li").first().waitFor();
  return { page, close: () => context.close() };
}

const spec = async (siteId: string) => ((await platform.repo.getSpec(siteId))!).spec;
const home = (s: SiteSpec) => s.pages.find((p) => p.kind === "home")!;

describe("editor in a browser", () => {
  it("saves a typed change into the section it belongs to, even when the sections move before the save", async () => {
    const id = await bakery("urejanje-premik");
    const { page, close } = await open(id);
    try {
      await page.locator(".outline li", { hasText: "O nas" }).click();
      const heading = page.locator('[data-path$="/props/heading"] input');
      await heading.fill("Drožmi iz domače kleti");
      // Within the 0.7 s autosave delay the owner moves the section up: its index changes under the pending save.
      await page.frameLocator('iframe[title="Predogled strani"]').getByRole("button", { name: "Premakni gor: O nas" }).click();
      // Both land: the text in s_about, and the move (sent after the text, so it can't overtake it).
      await expect
        .poll(async () => {
          const h = home(await spec(id));
          return { heading: (h.sections.find((s) => s.id === "s_about")?.props as { heading?: string }).heading, at: h.sections.map((s) => s.id).indexOf("s_about") };
        }, { timeout: 10_000 })
        .toEqual({ heading: "Drožmi iz domače kleti", at: 2 });
      const after = home(await spec(id));
      // The products section it swapped places with is untouched.
      expect(JSON.stringify(after.sections.find((s) => s.id === "s_products"))).not.toContain("Drožmi iz domače kleti");
    } finally {
      await close();
    }
  }, 60_000);

  it("opens the field of a checklist entry when Objavi is tapped while something is missing (phone width)", async () => {
    const id = await bakery("urejanje-seznam");
    const { page, close } = await open(id, 375);
    try {
      await page.getByRole("button", { name: "Objavi" }).click();
      const first = page.locator(".checklist li button").first();
      await expect.poll(() => first.isVisible()).toBe(true);
      expect(await first.textContent()).toMatch(/Manjka/);
      await first.click();
      // Focus lands inside the block for that path (a price placeholder's "Vnesi" or a provider field).
      const focused = await page.evaluate(() => (document.activeElement?.closest("[data-path]") as HTMLElement | null)?.dataset.path ?? null);
      expect(focused).toMatch(/^\/(pages\/0\/sections\/2\/props\/items\/\d\/price|business\/provider\/\w+)$/);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    } finally {
      await close();
    }
  }, 60_000);

  it("picks up a change the worker saves while the site is busy, from the small poll", async () => {
    const id = await bakery("urejanje-pulz");
    await platform.repo.setStatus(id, "editing");
    const { page, close } = await open(id);
    try {
      const about = page.frameLocator('iframe[title="Predogled strani"]').locator("#s_about h2");
      await expect.poll(() => about.textContent(), { timeout: 10_000 }).not.toBe("Shranil pomočnik");
      // As the edit job would: a new version, then back to ready.
      const s = await spec(id);
      (home(s).sections.find((x) => x.id === "s_about")!.props as { heading: string }).heading = "Shranil pomočnik";
      await platform.repo.saveSpec(id, s, "edit", "pomočnik");
      await platform.repo.setStatus(id, "ready");
      await expect.poll(() => about.textContent(), { timeout: 10_000 }).toBe("Shranil pomočnik");
    } finally {
      await close();
    }
  }, 60_000);

  it("shows the selected section in each layout and switches to the one tapped", async () => {
    const id = await bakery("urejanje-postavitev");
    const { page, close } = await open(id);
    try {
      await page.locator(".outline li", { hasText: "O nas" }).click();
      const options = page.locator(".variants .variant");
      await expect.poll(() => options.count()).toBe(2);
      // Each thumbnail is the section itself, in that layout.
      for (const [i, variant] of ["image-side", "text-only"].entries()) {
        const section = page.frameLocator(".variants iframe").nth(i).locator("main section");
        await expect.poll(() => section.getAttribute("class"), { timeout: 10_000 }).toContain(`s-about--${variant}`);
        expect(await section.count()).toBe(1);
      }
      await page.locator(".variant", { hasText: "Samo besedilo" }).click();
      await expect.poll(async () => home(await spec(id)).sections.find((s) => s.id === "s_about")?.variant, { timeout: 10_000 }).toBe("text-only");
      await expect.poll(() => page.locator('.variant[aria-pressed="true"]').textContent()).toBe("Samo besedilo");
    } finally {
      await close();
    }
  }, 60_000);

  it("on a phone, the site fills the screen; the editor sheet opens on a tap: closed, peek, full", async () => {
    const id = await bakery("urejanje-list");
    const { page, close } = await open(id, 375);
    try {
      const panel = page.locator(".ed .panel");
      const sheet = () => panel.getAttribute("data-sheet");
      const box = async () => (await panel.boundingBox())!;
      expect(await panel.evaluate((p) => getComputedStyle(p).position)).toBe("fixed");
      // Nothing tapped yet: a slim strip, the preview above it gets most of the screen.
      expect(await sheet()).toBe("closed");
      const frame = (await page.locator(".canvas .frame").boundingBox())!;
      expect(frame.y + frame.height).toBeLessThanOrEqual((await box()).y + 1);
      expect((await box()).height).toBeLessThan(100);
      expect(frame.height).toBeGreaterThan(400);

      await page.getByRole("button", { name: "Razširi urejanje" }).click();
      expect(await sheet()).toBe("full");
      // Full stops under the app bar, so undo and publish stay visible.
      const bar = (await page.locator("header.top").boundingBox())!;
      await expect.poll(async () => Math.round((await box()).y)).toBe(Math.round(bar.y + bar.height));
      expect((await box()).height).toBeGreaterThan(900 * 0.6);
      await page.getByRole("button", { name: "Pomanjšaj urejanje" }).click();
      expect(await sheet()).toBe("closed");

      // A tap on a section in the preview opens the sheet halfway with its form in view.
      await page.frameLocator('iframe[title="Predogled strani"]').locator("#s_about h2").click();
      await expect.poll(() => sheet()).toBe("peek");
      const head = page.locator("#selected-head h2");
      await expect.poll(() => head.textContent()).toBe("O nas");
      await expect.poll(async () => {
        const h = (await head.boundingBox())!;
        const p = await box();
        return h.y >= p.y && h.y + h.height <= p.y + p.height;
      }).toBe(true);
      // Typing opens it fully (room above the keyboard).
      await page.locator('[data-path$="/props/heading"] input').click();
      expect(await sheet()).toBe("full");
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    } finally {
      await close();
    }
  }, 60_000);

  it("shows one call button on a phone: the bar's, not the hero's right above it", async () => {
    const id = await bakery("en-klic");
    const { page, close } = await open(id, 1280);
    try {
      const site = page.frameLocator('iframe[title="Predogled strani"]');
      // The preview is 360 px wide: the bakery's hero has "Pokličite" and the bar is on screen from the start.
      await expect.poll(() => site.locator(".action-bar [data-action='call'], .action-bar a[href^='tel:']").first().isVisible()).toBe(true);
      expect(await site.locator("main > :first-child [data-action='call']").isVisible()).toBe(false);
      // At desktop width there is no bar, so the hero keeps its button.
      await page.getByRole("button", { name: "Računalnik" }).click();
      await expect.poll(() => site.locator("main > :first-child [data-action='call']").isVisible(), { timeout: 10_000 }).toBe(true);
    } finally {
      await close();
    }
  }, 60_000);

  it("keeps the side panel on a wide screen (no sheet)", async () => {
    const id = await bakery("urejanje-siroko");
    const { page, close } = await open(id, 1280);
    try {
      expect(await page.locator(".ed .panel").evaluate((p) => getComputedStyle(p).position)).not.toBe("fixed");
      expect(await page.locator(".sheet-handle").isVisible()).toBe(false);
    } finally {
      await close();
    }
  }, 60_000);

  it("edits text in place with one tap once its section is selected", async () => {
    const id = await bakery("urejanje-dotik");
    const { page, close } = await open(id);
    try {
      const preview = page.frameLocator("iframe[title=\"Predogled strani\"]");
      const title = preview.locator("#s_about h2");
      await title.click(); // selects the section
      await title.click(); // edits its text
      await expect.poll(() => title.getAttribute("contenteditable")).toBe("plaintext-only");
      await page.keyboard.press("Control+A");
      await page.keyboard.type("Naše drožmi");
      await page.keyboard.press("Enter");
      await expect.poll(async () => (home(await spec(id)).sections.find((s) => s.id === "s_about")?.props as { heading?: string }).heading, { timeout: 10_000 }).toBe("Naše drožmi");
    } finally {
      await close();
    }
  }, 60_000);
});

describe("versions list in a browser", () => {
  it("shows a typing session as one row, keeps the chat edit and the generation apart, and restores the group's last state", async () => {
    const id = await bakery("razlicice");
    const golden = await spec(id);
    // v1 is the generation; then 5 text autosaves, a chat edit and a move, minutes apart.
    const save = async (source: "edit" | "manual", message: string, headline: string) => {
      const s = structuredClone(golden);
      (s.pages[0]!.sections[0]!.props as { headline: string }).headline = headline;
      await platform.repo.saveSpec(id, s, source, message);
    };
    for (let i = 0; i < 5; i++) await save("manual", "urejen razdelek hero", `Kruh z drožmi ${i}`); // v2–v6
    await save("edit", "Dodaj praznični delovni čas", "Kruh z drožmi 4"); // v7
    await save("manual", "premik", "Kruh z drožmi 4"); // v8
    await platform.db.query("update spec_versions set created_at = now() - make_interval(mins => 60 - version) where site_id = $1", [id]);
    await platform.db.query("update spec_versions set created_at = created_at - interval '30 minutes' where site_id = $1 and version = 1", [id]);

    for (const width of [375, 1280]) {
      const { page, close } = await open(id, width);
      try {
        await page.locator("details.menu > summary").click();
        await page.getByRole("button", { name: "Zgodovina sprememb" }).click();
        const rows = page.locator("ol.versions > li");
        await rows.first().waitFor();
        const texts = (await rows.allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
        // v8 (current), v7 (chat), v2–v6 as one row, v1.
        expect(texts).toHaveLength(4);
        expect(texts[0]).toMatch(/^v8 urejanje · .* premik trenutna$/);
        expect(texts[1]).toMatch(/^v7 pomočnik · .*Dodaj praznični delovni čas Obnovi$/);
        expect(texts[2]).toMatch(/^v6 5 sprememb besedila, \d\d:\d\d–\d\d:\d\d urejanje · .* · v2–v6 Obnovi$/);
        expect(texts[3]).toMatch(/^v1 ustvarjeno · /);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        if (width === 375) continue;
        // "Obnovi" on the group restores its last save (v6).
        await page.getByRole("button", { name: /^Obnovi različico 6, zadnjo od: 5 sprememb besedila/ }).click();
        await page.locator("ol.versions > li", { hasText: "povrnjeno na različico 6" }).waitFor();
        const current = await platform.repo.getSpec(id);
        expect(current?.version).toBe(9);
        expect((current!.spec.pages[0]!.sections[0]!.props as { headline: string }).headline).toBe("Kruh z drožmi 4");
      } finally {
        await close();
      }
    }
  }, 90_000);
});
