import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import { serve, type ServerType } from "@hono/node-server";
import { loadConfig } from "@sb/config";
import { OWNER_TEXT_NOTE, launchCheckBrowser, type CheckBrowser } from "@sb/engine";
import { Repo, createDb, createFsStorage, migrate, type Platform, type Queue } from "@sb/platform";
import { migrateSpec, type SiteSpec } from "@sb/spec";
import { createApp } from "../src/app.ts";
import { adminCookie } from "./session-helpers.ts";

/**
 * After "Ustvari znova" the editor says which of the owner's own texts the new site kept and how many it had no place
 * for (it-keep-owner-edits), at phone and desktop width; the confirmation before it says what stays.
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
  dir = await mkdtemp(path.join(tmpdir(), "sb-regen-browser-"));
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

let n = 0;
/** A bakery regenerated a moment ago: its log says the headline was kept and one text had no place. */
async function regenerated(): Promise<string> {
  const spec = migrateSpec(JSON.parse(await readFile(path.join(here, "../../../tools/eval/golden/pekarna-kvas.json"), "utf8"))) as SiteSpec;
  spec.slug = `pekarna-${++n}`;
  const site = await platform.repo.createSite({ name: spec.slug, slug: spec.slug, intake: { description: "Pekarna Kvas", photoAssetIds: [], scope: "full" } });
  await platform.repo.saveSpec(site.id, spec, "generate");
  await platform.repo.addEvent({ siteId: site.id, stage: "classify", message: "start" });
  await platform.repo.addEvent({ siteId: site.id, stage: "content", message: OWNER_TEXT_NOTE, data: { kept: ["/pages/0/sections/0/props/headline"], dropped: ["Domov › O nas › Naslov"] } });
  await platform.repo.saveSpec(site.id, { ...spec, ownerEdits: [{ section: spec.pages[0]!.sections[0]!.id, path: "/props/headline" }] }, "generate");
  await platform.repo.setStatus(site.id, "ready");
  return site.id;
}

describe("the editor after Ustvari znova", () => {
  for (const width of [360, 1280] as const) {
    it(`at ${width} px: names the texts it kept and what had no place, and closes`, async () => {
      const id = await regenerated();
      const context = await cb.browser.newContext({ viewport: { width, height: width === 360 ? 800 : 900 }, reducedMotion: "reduce", hasTouch: width === 360 });
      const [name, value] = cookie.split("=") as [string, string];
      await context.addCookies([{ name, value, url: base }]);
      try {
        const page = await context.newPage();
        await page.goto(`${base}/sites/${id}`);
        const note = page.locator("#kept-texts");
        await note.waitFor({ state: "attached" });
        expect(await note.textContent()).toContain("Ohranili smo 1 besedilo, ki ste ga vpisali sami.");
        expect(await note.locator("li").allTextContents()).toEqual(["Domov › Uvod s fotografijo › Naslov"]);
        expect(await note.textContent()).toContain("1 besedilo nova stran nima na istem mestu (Domov › O nas › Naslov).");
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        await note.getByRole("button", { name: "Zapri obvestilo" }).click({ force: true });
        expect(await page.locator("#kept-texts").count()).toBe(0);

        // The confirmation before a regeneration says what stays.
        let asked = "";
        page.once("dialog", (d) => {
          asked = d.message();
          void d.dismiss();
        });
        await page.locator("details.menu summary").click();
        await page.locator("#regenerate").click();
        await expect.poll(() => asked).toContain("besedila, ki ste jih vpisali sami, ostanejo");
      } finally {
        await context.close();
      }
    }, 90_000);
  }
});
