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
      await page.getByRole("button", { name: "Premakni gor: O nas" }).click();
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

  it("edits text in place with one tap once its section is selected", async () => {
    const id = await bakery("urejanje-dotik");
    const { page, close } = await open(id);
    try {
      const preview = page.frameLocator("iframe");
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
