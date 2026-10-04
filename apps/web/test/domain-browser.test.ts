import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import { serve, type ServerType } from "@hono/node-server";
import { loadConfig, type AppConfig } from "@sb/config";
import { launchCheckBrowser, provisionDomain, type CheckBrowser } from "@sb/engine";
import { Repo, createDb, createFsStorage, fakeDns, fakeEdge, fakeRegistrar, migrate, type DomainProviders, type Platform, type Queue } from "@sb/platform";
import type { SiteSpec } from "@sb/spec";
import { createApp } from "../src/app.ts";
import { dayIn } from "../src/stats.ts";
import { adminCookie } from "./session-helpers.ts";
import { fillPlaceholderOps } from "../../../tools/eval/src/placeholder-fill.ts";

/**
 * Publish → pick a domain → live, in Chromium at 360 and 1280 px against the fake registrar, edge and DNS,
 * counting taps (typing is not counted; focusing a field to type is one tap). Target (custom-domains plan):
 * at most 3 taps when the site's facts are filled. The "domain" queue runs the provisioning job in-process,
 * as the worker would. Then the site on its own domain in the same browser: the page is served at the
 * root of its hostname and stats.js reports a tap there. SB_TAPS_OUT=<file> writes the numbers as JSON.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const PASSWORD = "test-password-1234";
const TARGET_TAPS = 3;
let platform: Platform;
let dir: string;
let server: ServerType;
let base: string;
let port: number;
let cb: CheckBrowser;
let cookie: string;
let config: AppConfig;
let providers: DomainProviders;
const running: Promise<unknown>[] = [];
const results: Record<string, number> = {};

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sb-domain-e2e-"));
  const db = await createDb("pglite://memory");
  await migrate(db);
  const base0 = loadConfig();
  config = { ...base0, domains: { ...base0.domains, enabled: true } };
  const edge = fakeEdge();
  providers = { registrar: fakeRegistrar(), edge, dns: fakeDns({}, { anyCnameTo: edge.cnameTarget }) };
  const repo = new Repo(db);
  const storage = createFsStorage(dir);
  // The worker's "domain" job, run in this process.
  const queue: Queue = {
    send: async (name, data) => {
      if (name === "domain") running.push(provisionDomain({ repo, storage, config, providers }, (data as { hostname: string }).hostname));
      return "job";
    },
    work: async () => undefined,
    ping: async () => undefined,
    stop: async () => undefined,
  };
  platform = { db, repo, storage, queue, close: () => db.close() };
  const app = createApp({ platform, config, domainProviders: providers, siteHostCacheMs: 0, auth: { password: PASSWORD, secret: "s".repeat(32), secureCookies: false } });
  server = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" });
  await new Promise<void>((r) => server.once("listening", () => r()));
  port = (server.address() as AddressInfo).port;
  base = `http://127.0.0.1:${port}`;
  cookie = await adminCookie((p, init) => fetch(`${base}${p}`, init), PASSWORD);
  // The site's own domains resolve to this server (Chromium only), so a page can be opened on its hostname.
  cb = await launchCheckBrowser(["--host-resolver-rules=MAP *.si 127.0.0.1"]);
}, 120_000);

afterAll(async () => {
  await Promise.allSettled(running);
  if (process.env.SB_TAPS_OUT) await writeFile(process.env.SB_TAPS_OUT, JSON.stringify(results, null, 2));
  await cb?.close();
  server?.close();
  await platform?.close();
  await rm(dir, { recursive: true, force: true });
});

let seq = 0;
/** The installer's golden site (Matej Rebernik s.p., no photos) with its missing facts filled in, as an owner would. */
async function seed(): Promise<string> {
  const spec = JSON.parse(await readFile(path.join(here, "../../../tools/eval/golden/instalacije-rebernik.json"), "utf8")) as SiteSpec;
  const brief = JSON.parse(await readFile(path.join(here, "../../../tools/eval/fixtures/instalacije-rebernik/brief.json"), "utf8")) as { description: string };
  spec.slug = `instalacije-rebernik-${++seq}`;
  const site = await platform.repo.createSite({ name: "Instalacije Rebernik", slug: spec.slug, intake: { description: brief.description, photoAssetIds: [], scope: "full" } });
  await platform.repo.saveSpec(site.id, spec, "generate");
  await platform.repo.setStatus(site.id, "ready");
  const ops = fillPlaceholderOps(spec);
  const r = await fetch(`${base}/api/sites/${site.id}/patch`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ baseVersion: 1, ops, message: "facts" }) });
  expect(r.status, await r.clone().text()).toBe(200);
  return site.id;
}

type Page = Awaited<ReturnType<CheckBrowser["browser"]["newPage"]>>;
type Locator = ReturnType<Page["locator"]>;

async function open(siteId: string, width: 360 | 1280) {
  const context = await cb.browser.newContext({ viewport: { width, height: width === 360 ? 780 : 900 }, reducedMotion: "reduce", hasTouch: width === 360, isMobile: width === 360 });
  const [name, value] = cookie.split("=") as [string, string];
  await context.addCookies([{ name, value, url: base }]);
  const page = await context.newPage();
  await page.goto(`${base}/sites/${siteId}`);
  await page.frameLocator("iframe[title='Predogled strani']").locator("main").waitFor();
  let taps = 0;
  const tap = async (l: Locator) => {
    taps++;
    await l.click();
  };
  return { page, tap, taps: () => taps, close: () => context.close() };
}

const noSideScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const shot = (page: Page, name: string) => (process.env.SB_SHOTS ? page.screenshot({ path: path.join(process.env.SB_SHOTS, `${name}.png`), fullPage: false }) : Promise.resolve());

describe("publish on the owner's own domain", () => {
  for (const width of [360, 1280] as const) {
    it(`at ${width} px: Publish → a suggested domain → live in at most ${TARGET_TAPS} taps`, async () => {
      const id = await seed();
      const ui = await open(id, width);
      try {
        expect(await ui.page.locator("#checklist-summary").count(), "the facts are filled: nothing blocks publishing").toBe(0);
        await ui.tap(ui.page.getByRole("button", { name: "Objavi", exact: true }));
        const confirm = ui.page.locator("#domain-confirm");
        await confirm.waitFor();
        // The best free name from the business name is preselected, with the price from config and the holder prefilled.
        const label = (await confirm.textContent())!;
        const hostname = label.replace(/^Objavi na /, "");
        expect(hostname).toMatch(/^instalacij.*rebernik.*\.si$/);
        await expect.poll(() => ui.page.locator(".domain-choice input:checked").getAttribute("value")).toBe(hostname);
        expect(await ui.page.locator(".domain-choice").first().textContent()).toContain(`${config.domains.tlds[0]!.priceEurPerYear} € na leto`);
        expect(await ui.page.locator(".domain-holder").textContent()).toContain("Matej Rebernik");
        expect(await noSideScroll(ui.page)).toBe(true);
        await shot(ui.page, `domain-step-${width}`);
        await ui.tap(confirm);
        // Live: the editor shows "Objavljeno" for the domain once the job is done (it polls).
        const status = ui.page.locator("#domain-status .domain-progress");
        await expect.poll(async () => (await status.textContent()) ?? "", { timeout: 20_000 }).toContain("Objavljeno");
        expect(await status.locator("a").getAttribute("href")).toBe(`https://${hostname}/`);
        expect(await noSideScroll(ui.page)).toBe(true);
        await shot(ui.page, `domain-live-${width}`);
        const site = (await platform.repo.getSite(id))!;
        expect(site.published_version).not.toBeNull();
        expect(site.published_address).toBe(`https://${hostname}/`);
        expect(await platform.repo.domains.get(hostname)).toMatchObject({ status: "active", kind: "registered", notify: "pending" });
        results[`registered-${width}`] = ui.taps();
        expect(ui.taps()).toBeLessThanOrEqual(TARGET_TAPS);
      } finally {
        await ui.close();
      }
    }, 90_000);
  }

  it("at 360 px: 'Že imam domeno' shows the record, connects and goes live (taps counted, typing not)", async () => {
    const id = await seed();
    const ui = await open(id, 360);
    try {
      await ui.tap(ui.page.getByRole("button", { name: "Objavi", exact: true }));
      await ui.tap(ui.page.locator("#own-domain"));
      const field = ui.page.locator("input[name=own-domain]");
      await ui.tap(field);
      await field.fill("rebernik-instalacije.si");
      await ui.tap(ui.page.locator("#own-domain-check"));
      await ui.page.locator(".domain-own .dns-record").waitFor();
      expect(await ui.page.locator(".domain-own .dns-record tbody").textContent()).toBe(`CNAMEwww${providers.edge.cnameTarget}`);
      expect(await noSideScroll(ui.page)).toBe(true);
      await shot(ui.page, "domain-own-360");
      await ui.tap(ui.page.locator("#domain-confirm"));
      await expect.poll(async () => (await ui.page.locator("#domain-status").textContent()) ?? "", { timeout: 20_000 }).toContain("Objavljeno");
      expect((await platform.repo.getSite(id))!.published_address).toBe("https://www.rebernik-instalacije.si/");
      results["connected-360"] = ui.taps();
    } finally {
      await ui.close();
    }
  }, 90_000);

  it("the site on its own domain: served at the root of its hostname, and a tap on the phone number is counted", async () => {
    const row = (await platform.db.query<{ hostname: string; site_id: string }>("select hostname, site_id from site_domains where status = 'active' and kind = 'registered' and is_primary limit 1")).rows[0]!;
    const context = await cb.browser.newContext({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36" });
    const page = await context.newPage();
    try {
      const day = dayIn(config.stats.timeZone);
      const totals = () => platform.repo.stats.totals(row.site_id, day, dayIn(config.stats.timeZone, new Date(Date.now() + 86400_000)));
      const before = await totals();
      const res = await page.goto(`http://${row.hostname}:${port}/`);
      expect(res?.status()).toBe(200);
      expect(await page.locator("link[rel=canonical]").getAttribute("href")).toBe(`https://${row.hostname}/`);
      await page.evaluate(() => {
        document.addEventListener("click", (e) => e.preventDefault(), { once: true });
        (document.querySelector('a[href^="tel:"]') as HTMLElement).click();
      });
      await expect.poll(async () => (await totals()).calls).toBe(before.calls + 1);
      expect((await totals()).visits).toBe(before.visits + 1);
      expect(await context.cookies()).toEqual([]);
    } finally {
      await context.close();
    }
  }, 60_000);
});
