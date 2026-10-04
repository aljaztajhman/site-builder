import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import { serve, type ServerType } from "@hono/node-server";
import { loadConfig, type AppConfig } from "@sb/config";
import { defaultSection, launchCheckBrowser, type CheckBrowser } from "@sb/engine";
import { Repo, createDb, createFsStorage, fakeDns, fakeEdge, fakeRegistrar, memoryMailer, migrate, type Platform, type Queue } from "@sb/platform";
import type { SiteSpec } from "@sb/spec";
import { createApp } from "../src/app.ts";
import { linkFor } from "./session-helpers.ts";

/**
 * The upsells in the editor, in Chromium at 1280 and 360 px (it-upsells, it-plan-limits): a free preview lists the
 * brief's other pages locked with Osnovni's price, a guest can ask for the reminder before deletion, Objavi names the
 * free domain the check found, and on Osnovni the buttons that reached a limit (the 9th page, a collection, a second
 * language, this month's pictures) carry "Plus" and say why. No horizontal scroll at either width. No model calls;
 * the registrar is the fake.
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
let config: AppConfig;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sb-upsell-"));
  const db = await createDb("pglite://memory");
  await migrate(db);
  const queue: Queue = { send: async () => "job", work: async () => undefined, ping: async () => undefined, stop: async () => undefined };
  platform = { db, repo: new Repo(db), storage: createFsStorage(dir), queue, close: () => db.close() };
  const base0 = loadConfig();
  config = { ...base0, domains: { ...base0.domains, enabled: true } };
  const edge = fakeEdge();
  const app = createApp({ platform, config, mailer: mail, domainProviders: { registrar: fakeRegistrar(), edge, dns: fakeDns({}, { anyCnameTo: edge.cnameTarget }) }, auth: { password: "test-password-1234", secret: "s".repeat(32), secureCookies: false } });
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

const BRIEF = { name: "Pekarna Kvas", pages: [{ kind: "home", slug: "", navLabel: "Domov" }, { kind: "standard", slug: "ponudba", navLabel: "Ponudba" }, { kind: "standard", slug: "o-nas", navLabel: "O nas" }, { kind: "standard", slug: "kontakt", navLabel: "Kontakt" }] };

/** The bakery with `pages` home and standard pages. */
function bakery(pages: number): SiteSpec {
  const spec = structuredClone(golden);
  const extra = Array.from({ length: pages - 1 }, (_, i) => ({
    id: `p_s${i + 1}`,
    kind: "standard" as const,
    slug: `stran-${i + 1}`,
    nav: { label: `Stran ${i + 1}`, show: true },
    seo: { title: `Stran ${i + 1}`, description: "Stran" },
    sections: [defaultSection(spec, "page-header", `s_s${i + 1}_head`) as unknown as SiteSpec["pages"][number]["sections"][number]],
  }));
  spec.pages = [spec.pages[0]!, ...extra, ...spec.pages.slice(1)];
  return spec;
}

let seq = 0;
async function site(owner: { accountId?: string; deviceId?: string }, pages = 1): Promise<string> {
  const slug = `ponudba-${++seq}`;
  const s = await platform.repo.createSite({ name: slug, slug, intake: { description: "Pekarna Kvas, Šutna 30, Kamnik.", photoAssetIds: [], scope: pages > 1 ? "full" : "home" }, ...owner });
  await platform.repo.setBrief(s.id, BRIEF);
  await platform.repo.saveSpec(s.id, { ...bakery(pages), slug }, "generate");
  await platform.repo.setStatus(s.id, "ready");
  return s.id;
}

type Page = Awaited<ReturnType<CheckBrowser["browser"]["newPage"]>>;
const preview = (page: Page) => page.frameLocator('iframe[title="Predogled strani"]');
const noSidewaysScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

async function context(width: number) {
  return cb.browser.newContext({ viewport: { width, height: width > 900 ? 900 : 780 }, reducedMotion: "reduce", ...(width < 500 ? { isMobile: true, hasTouch: true } : {}) });
}

/** Signs in by magic link in this page; returns the account id. */
async function signIn(page: Page, email: string, plan: "standard" | "premium" | null): Promise<string> {
  if (plan) await platform.repo.accounts.allow(email, email, null, plan);
  await page.goto(`${base}/login`);
  await page.locator("#email").fill(email);
  await Promise.all([page.waitForNavigation(), page.getByRole("button", { name: "Pošlji povezavo" }).click()]);
  await page.goto(linkFor(mail.sent, email));
  await Promise.all([page.waitForNavigation(), page.getByRole("button", { name: "Prijava" }).click()]);
  return (await platform.repo.accounts.byKey(email))!.id;
}

describe.each([1280, 360])("upsells at %i px", (width) => {
  it("a guest's preview: the other pages locked with Osnovni's price, the free domain, and the reminder before deletion", async () => {
    const ctx = await context(width);
    const page = await ctx.newPage();
    try {
      await page.goto(`${base}/login`);
      const device = (await ctx.cookies()).find((c) => c.name === "sb_device")!.value.split(".")[0]!;
      const id = await site({ deviceId: device });
      await page.goto(`${base}/sites/${id}`);
      await preview(page).locator("main").waitFor();
      const locked = page.locator(".guest #locked-pages");
      await locked.waitFor();
      expect(await locked.locator("li .name").allTextContents()).toEqual(["Ponudba", "O nas", "Kontakt"]);
      expect(await locked.locator("li .plan-tag").first().textContent()).toBe("Osnovni");
      expect(await locked.locator(".price-line").textContent()).toBe("Osnovni: 15 € na mesec ali 150 € na leto, domena je vključena v letno ceno.");
      // The domain the publish step would offer (the fake registrar's check), named before any account.
      await expect.poll(() => locked.textContent()).toMatch(/Domena [a-z0-9-]+\.si je prosta\. Objava na njej je del naročnine Osnovni\./);
      // The reminder: one address, said back with the day it goes.
      const form = page.locator("#reminder");
      await form.locator("#reminder-email").fill("ana@siol.net");
      await form.getByRole("button", { name: "Opomni me" }).click();
      await expect.poll(() => page.locator("#reminder").textContent()).toMatch(/^Opomnik pošljemo \d+\. \S+ na ana@siol\.net\./);
      expect((await platform.repo.getSite(id))!.reminder_email).toBe("ana@siol.net");
      expect(await noSidewaysScroll(page)).toBe(true);
      if (SHOTS) {
        await page.locator(".guest").scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(SHOTS, `upsell-guest-${width}.png`), fullPage: width > 900 });
      }
    } finally {
      await ctx.close();
    }
  }, 90_000);

  it("a free account: the locked pages where the page list would be, and Objavi names the domain and the plan", async () => {
    const ctx = await context(width);
    const page = await ctx.newPage();
    try {
      const accountId = await signIn(page, `prosti${width}@siol.net`, null);
      const id = await site({ accountId });
      await page.goto(`${base}/sites/${id}`);
      await preview(page).locator("main").waitFor();
      const locked = page.locator("#locked-pages");
      await locked.waitFor();
      expect(await locked.locator("li").count()).toBe(3);
      const publish = page.locator(".top .publish");
      await expect.poll(() => publish.textContent()).toMatch(/^Objavi\sna [a-z0-9-]+\.si$/);
      const domain = /na (\S+)$/.exec((await publish.textContent())!)![1]!;
      // On a phone the bar has room for "Objavi" only; the panel names the domain.
      expect(await publish.locator(".label").isVisible()).toBe(width > 900);
      await publish.click();
      await expect.poll(() => page.locator(".toast-text").textContent()).toBe(`Objava na ${domain} je del naročnine Osnovni: 15 € na mesec ali 150 € na leto, domena je vključena v letno ceno. Predogled lahko še naprej urejate.`);
      expect(await noSidewaysScroll(page)).toBe(true);
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `upsell-free-${width}.png`) });
    } finally {
      await ctx.close();
    }
  }, 90_000);

  it("Osnovni at 8 pages: Plus at the 9th page, at the collections and at a second language; the server agrees", async () => {
    const ctx = await context(width);
    const page = await ctx.newPage();
    try {
      const accountId = await signIn(page, `osnovni${width}@siol.net`, "standard");
      const id = await site({ accountId }, 8);
      // This month's 3 generated pictures are used up.
      for (let i = 0; i < 3; i++) await platform.repo.logModelCall({ siteId: id, jobId: null, stage: "imageGen", model: "gpt-image-2.5", inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, costEur: 0.068, durationMs: 1, ok: true, tier: "paid", accountId });
      await page.goto(`${base}/sites/${id}`);
      await preview(page).locator("main").waitFor();
      await page.getByRole("button", { name: /^Strani/ }).click();
      const add = page.locator("#add-page");
      await add.waitFor();
      expect(await add.locator(".plan-tag").textContent()).toBe("Plus");
      expect(await page.locator("#pages-limit").textContent()).toBe("Paket Osnovni ima največ 8 strani. Paket Plus (29 € na mesec) jih ima do 20.");
      await add.click();
      await expect.poll(() => page.locator(".toast").textContent()).toContain("Paket Plus (29 € na mesec) jih ima do 20.");
      expect((await platform.repo.getSpec(id))!.spec.pages.filter((p) => p.kind === "standard").length).toBe(7);
      // Collections are Plus: each button names it, and a tap says so.
      expect(await page.locator("[data-locked] .plan-tag").allTextContents()).toEqual(["Plus", "Plus", "Plus", "Plus"]);
      await page.locator('[data-locked="blog"]').click();
      await expect.poll(() => page.locator(".toast-text").textContent()).toBe("Novice so v paketu Plus (29 € na mesec).");
      expect(await page.locator("#locales-limit").textContent()).toBe("Paket Osnovni ima stran v enem jeziku. Paket Plus (29 € na mesec) ima stran v dveh jezikih, na primer v slovenščini in angleščini. Plus");
      expect(await noSidewaysScroll(page)).toBe(true);
      if (SHOTS) {
        await add.scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(SHOTS, `upsell-osnovni-pages-${width}.png`) });
      }
      // The month's pictures used up: "Ustvari celotno stran znova" carries Plus.
      await page.getByRole("button", { name: "← Nazaj" }).click();
      await page.locator("details.menu > summary").click();
      expect(await page.locator("#regenerate .plan-tag").textContent()).toBe("Plus");
    } finally {
      await ctx.close();
    }
  }, 90_000);

  it("Plus at 8 pages: no tags, the page is added", async () => {
    const ctx = await context(width);
    const page = await ctx.newPage();
    try {
      const accountId = await signIn(page, `plus${width}@siol.net`, "premium");
      const id = await site({ accountId }, 8);
      await page.goto(`${base}/sites/${id}`);
      await preview(page).locator("main").waitFor();
      await page.getByRole("button", { name: /^Strani/ }).click();
      await page.locator("#add-page").waitFor();
      expect(await page.locator(".plan-tag").count()).toBe(0);
      expect(await page.locator("#locales-limit").count()).toBe(0);
      await page.getByLabel("Ime v meniju").last().fill("Galerija");
      await page.getByLabel("Naslov datoteke (brez šumnikov)").fill("galerija");
      await page.locator("#add-page").click();
      await expect.poll(async () => (await platform.repo.getSpec(id))!.spec.pages.filter((p) => p.kind === "standard").length, { timeout: 10_000 }).toBe(8);
    } finally {
      await ctx.close();
    }
  }, 90_000);
});
