import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import { serve, type ServerType } from "@hono/node-server";
import { loadConfig } from "@sb/config";
import { launchCheckBrowser, type CheckBrowser } from "@sb/engine";
import { Repo, createDb, createFsStorage, memoryMailer, migrate, type Platform, type Queue } from "@sb/platform";
import type { SiteSpec } from "@sb/spec";
import { createApp } from "../src/app.ts";
import { adminCookie, linkFor } from "./session-helpers.ts";

/**
 * The editor shows what the viewer may do (GET /api/sites/:id `access`): a preview without an account
 * gets "Shrani in uredi" and no editing; a free account edits, sees what it has left, and gets told
 * why it can't publish yet; only the admin sees model spend and the log. No model calls.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const PASSWORD = "test-password-1234";
const mail = memoryMailer();
let platform: Platform;
let dir: string;
let server: ServerType;
let base: string;
let cb: CheckBrowser;
let golden: SiteSpec;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sb-editor-access-"));
  const db = await createDb("pglite://memory");
  await migrate(db);
  const queue: Queue = { send: async () => "job", work: async () => undefined, ping: async () => undefined, stop: async () => undefined };
  platform = { db, repo: new Repo(db), storage: createFsStorage(dir), queue, close: () => db.close() };
  const app = createApp({ platform, config: loadConfig(), auth: { password: PASSWORD, secret: "s".repeat(32), secureCookies: false }, mailer: mail });
  server = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" });
  await new Promise<void>((r) => server.once("listening", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  golden = JSON.parse(await readFile(path.join(here, "../../../tools/eval/golden/pekarna-kvas.json"), "utf8")) as SiteSpec;
  cb = await launchCheckBrowser();
}, 120_000);

afterAll(async () => {
  await cb?.close();
  server?.close();
  await platform?.close();
  await rm(dir, { recursive: true, force: true });
});

let seq = 0;
async function site(owner: { accountId?: string; deviceId?: string }): Promise<string> {
  const slug = `dostop-${++seq}`;
  const s = await platform.repo.createSite({ name: slug, slug, intake: { description: "Pekarna Kvas, Šutna 30, Kamnik.", photoAssetIds: [], scope: "home" }, ...owner });
  await platform.repo.saveSpec(s.id, { ...golden, slug }, "generate");
  await platform.repo.setStatus(s.id, "ready");
  return s.id;
}

const preview = (page: Awaited<ReturnType<CheckBrowser["browser"]["newPage"]>>) => page.frameLocator('iframe[title="Predogled strani"]');

describe("editor by viewer", () => {
  it("a preview without an account: \"Shrani in uredi\", no editing, the assistant closed", async () => {
    const context = await cb.browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    try {
      await page.goto(`${base}/login`);
      const device = (await context.cookies()).find((c) => c.name === "sb_device")!.value.split(".")[0]!;
      const id = await site({ deviceId: device });
      await page.goto(`${base}/sites/${id}`);
      await preview(page).locator("main").waitFor();
      await expect.poll(() => page.locator(".guest h2").textContent()).toBe("Vaš brezplačni predogled");
      expect(await page.getByRole("link", { name: "Shrani in uredi" }).first().getAttribute("href")).toContain("/login");
      expect(await page.getByRole("button", { name: "Objavi" }).count()).toBe(0);
      expect(await page.locator(".shortcut").count()).toBe(0);
      expect(await page.locator("#ask").isDisabled()).toBe(true);
      expect(await page.locator(".ask-note").textContent()).toContain("brezplačno prijavo");
      // Tapping the preview doesn't edit: no toolbar, no selection.
      await preview(page).locator("main section").nth(1).click();
      await page.waitForTimeout(400);
      expect(await preview(page).locator(".sb-tools").count()).toBe(0);
    } finally {
      await context.close();
    }
  }, 60_000);

  it("a free account edits, sees what it has left, and is told why it can't publish yet", async () => {
    const context = await cb.browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    try {
      await page.goto(`${base}/login`);
      await page.locator("#email").fill("lana@siol.net");
      await Promise.all([page.waitForNavigation(), page.getByRole("button", { name: "Pošlji povezavo" }).click()]);
      await page.goto(linkFor(mail.sent, "lana@siol.net"));
      await Promise.all([page.waitForNavigation(), page.getByRole("button", { name: "Prijava" }).click()]);
      const { rows } = await platform.db.query<{ id: string }>("select id from accounts where email = $1", ["lana@siol.net"]);
      const id = await site({ accountId: rows[0]!.id });
      await page.goto(`${base}/sites/${id}`);
      await preview(page).locator("main").waitFor();
      await expect.poll(() => page.locator(".ask-note").textContent()).toContain("Še ");
      expect(await page.locator("#ask").isDisabled()).toBe(false);
      // Editing works: a tap on a section gives it its toolbar.
      await preview(page).locator("#s_about h2").click();
      await expect.poll(() => preview(page).locator(".sb-tools").count()).toBe(1);
      // Publishing says why, no export, no spend.
      await page.getByRole("button", { name: "Objavi" }).click();
      await expect.poll(() => page.locator(".toast").textContent()).toContain("z naročnino");
      await page.locator("details.menu > summary").click();
      expect(await page.locator("details.menu .list").getByText("Prenesi stran (.zip)").count()).toBe(0);
      expect(await page.getByRole("button", { name: "Poraba in dnevnik" }).count()).toBe(0);
    } finally {
      await context.close();
    }
  }, 60_000);

  it("the admin keeps everything and sees no allowance line", async () => {
    const context = await cb.browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    try {
      const [name, value] = (await adminCookie((p, init) => fetch(`${base}${p}`, init), PASSWORD)).split("=") as [string, string];
      await context.addCookies([{ name, value, url: base }]);
      const id = await site({});
      await page.goto(`${base}/sites/${id}`);
      await preview(page).locator("main").waitFor();
      await page.locator(".shortcut").first().waitFor();
      expect(await page.locator(".ask-note").isVisible()).toBe(false);
      await page.locator("details.menu > summary").click();
      expect(await page.getByRole("button", { name: "Prenesi stran (.zip)" }).count()).toBe(1);
      expect(await page.getByRole("button", { name: "Poraba in dnevnik" }).count()).toBe(1);
      // A paid viewer's preview has no free-preview badge.
      expect(await page.locator(".preview-badge").count()).toBe(0);    } finally {
      await context.close();
    }
  }, 60_000);

  it("export shows the publish checklist as a warning first; \"Izvozi vseeno\" downloads the zip (sb-export-checklist)", async () => {
    const context = await cb.browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce", acceptDownloads: true });
    const page = await context.newPage();
    try {
      const [name, value] = (await adminCookie((p, init) => fetch(`${base}${p}`, init), PASSWORD)).split("=") as [string, string];
      await context.addCookies([{ name, value, url: base }]);
      // The golden bakery still misses its provider data and a price: the publish checklist isn't empty.
      const id = await site({});
      await page.goto(`${base}/sites/${id}`);
      await preview(page).locator("main").waitFor();
      const todo = Number(/\d+/.exec((await page.locator("#checklist-summary").textContent()) ?? "")?.[0]);
      expect(todo).toBeGreaterThan(0);
      await page.locator("details.menu > summary").click();
      await page.getByRole("button", { name: "Prenesi stran (.zip)" }).click();
      const box = page.locator("#checklist");
      await box.waitFor();
      expect(await box.locator("strong").first().textContent()).toMatch(/^Stran še ni pripravljena za objavo: .*Če jo izvozite zdaj, ostanejo te napake tudi v datotekah\./);
      expect(await box.locator("li").count()).toBe(todo);
      expect(await box.textContent()).not.toMatch(/—/);
      if (process.env.SB_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.SB_SCREENSHOT_DIR, "export-warning-1280.png") });
      const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Izvozi vseeno" }).click()]);
      expect(download.suggestedFilename()).toBe(`dostop-${seq}-v1.zip`);
      // A plain export link opened in the browser lands back here with the warning open.
      await page.goto(`${base}/api/sites/${id}/export`);
      await page.locator("#checklist").getByRole("link", { name: "Izvozi vseeno" }).waitFor();
      expect(new URL(page.url()).pathname).toBe(`/sites/${id}`);
      expect(new URL(page.url()).search).toBe("");
    } finally {
      await context.close();
    }
  }, 60_000);
});

describe("free-preview badge (sb-preview-watermark)", () => {
  const shots = process.env.SB_SCREENSHOT_DIR;
  const badge = (page: Awaited<ReturnType<CheckBrowser["browser"]["newPage"]>>) => page.locator(".frame-box > .preview-badge");

  for (const width of [1280, 360]) {
    it(`a preview without an account shows "Predogled · Stranko" beside the frame, not inside the site (${width} px)`, async () => {
      const context = await cb.browser.newContext({ viewport: { width, height: width > 900 ? 900 : 780 }, reducedMotion: "reduce" });
      const page = await context.newPage();
      try {
        await page.goto(`${base}/login`);
        const device = (await context.cookies()).find((c) => c.name === "sb_device")!.value.split(".")[0]!;
        const id = await site({ deviceId: device });
        await page.goto(`${base}/sites/${id}`);
        await preview(page).locator("main").waitFor();
        await badge(page).waitFor();
        expect(await badge(page).textContent()).toBe("Predogled · Stranko");
        // Not in the site: neither the frame's document nor the preview HTML carries it.
        expect(await preview(page).locator("body").textContent()).not.toContain("Predogled · Stranko");
        const html = await (await page.request.get(`${base}/preview/${id}/index.html`)).text();
        expect(html).not.toContain("Predogled · Stranko");
        // A tab on the frame's top-right corner: it ends where the frame begins (covers nothing of the site)
        // and starts inside the stage.
        const b = (await badge(page).boundingBox())!;
        const f = (await page.locator(".frame-box > .frame").boundingBox())!;
        const s = (await page.locator(".stage").boundingBox())!;
        expect(b.x + b.width).toBeLessThanOrEqual(f.x + f.width);
        expect(b.x + b.width).toBeGreaterThan(f.x + f.width - 40);
        expect(Math.abs(b.y + b.height - f.y)).toBeLessThanOrEqual(1);
        expect(b.y).toBeGreaterThanOrEqual(s.y);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        if (shots) await page.screenshot({ path: path.join(shots, `badge-anonymous-${width}.png`) });
      } finally {
        await context.close();
      }
    }, 60_000);
  }

  it("a free account sees it in the editor and on the sites list until the site is published", async () => {
    const context = await cb.browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    try {
      await page.goto(`${base}/login`);
      await page.locator("#email").fill("mojca@siol.net");
      await Promise.all([page.waitForNavigation(), page.getByRole("button", { name: "Pošlji povezavo" }).click()]);
      await page.goto(linkFor(mail.sent, "mojca@siol.net"));
      await Promise.all([page.waitForNavigation(), page.getByRole("button", { name: "Prijava" }).click()]);
      const { rows } = await platform.db.query<{ id: string }>("select id from accounts where email = $1", ["mojca@siol.net"]);
      const id = await site({ accountId: rows[0]!.id });
      await page.goto(`${base}/sites/${id}`);
      await preview(page).locator("main").waitFor();
      await badge(page).waitFor();
      await page.goto(`${base}/sites`);
      expect(await page.locator(".site-card .shot .preview-badge").textContent()).toBe("Predogled · Stranko");
      if (shots) await page.screenshot({ path: path.join(shots, "badge-sites-list-1280.png") });
      // Published (e.g. by the admin for a design partner): no badge anywhere.
      await platform.repo.markPublished(id, 1, "test");
      await page.reload();
      expect(await page.locator(".preview-badge").count()).toBe(0);
      await page.goto(`${base}/sites/${id}`);
      await preview(page).locator("main").waitFor();
      await page.waitForTimeout(300);
      expect(await page.locator(".preview-badge").count()).toBe(0);
    } finally {
      await context.close();
    }
  }, 60_000);
});
