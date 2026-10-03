import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { serve, type ServerType } from "@hono/node-server";
import { loadConfig } from "@sb/config";
import { launchCheckBrowser, type CheckBrowser } from "@sb/engine";
import { Repo, createDb, createFsStorage, migrate, type Platform, type Queue } from "@sb/platform";
import { SHOWCASES } from "@sb/spec";
import { createApp } from "../src/app.ts";
import { tradeShowcases } from "../src/showcase.ts";

/**
 * The landing page's trade showcase in Chromium, at 1280 and 360 px: a chip restyles the page in the
 * trade's colours and heading face (a view transition), the demo shows the trade's site, the address
 * follows, "Nazaj" restores the product's look; /?primer= renders a trade's look without JavaScript;
 * reduced motion switches at once; phones fold the chips after five; nothing scrolls sideways.
 */
let platform: Platform;
let dir: string;
let server: ServerType;
let base: string;
let cb: CheckBrowser;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sb-showcase-"));
  const db = await createDb("pglite://memory");
  await migrate(db);
  const queue: Queue = { send: async () => "job", work: async () => undefined, ping: async () => undefined, stop: async () => undefined };
  platform = { db, repo: new Repo(db), storage: createFsStorage(dir), queue, close: () => db.close() };
  const app = createApp({ platform, config: loadConfig(), auth: { password: "test-password-1234", secret: "s".repeat(32), secureCookies: false } });
  server = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" });
  await new Promise<void>((r) => server.once("listening", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  cb = await launchCheckBrowser();
}, 120_000);

afterAll(async () => {
  await cb?.close();
  server?.close();
  await platform?.close();
  await rm(dir, { recursive: true, force: true });
});

type Page = Awaited<ReturnType<CheckBrowser["browser"]["newPage"]>>;

async function open(width: number, opts: { reducedMotion?: "reduce" | "no-preference"; javaScriptEnabled?: boolean; path?: string } = {}) {
  const context = await cb.browser.newContext({ viewport: { width, height: 900 }, reducedMotion: opts.reducedMotion ?? "no-preference", javaScriptEnabled: opts.javaScriptEnabled ?? true });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${base}${opts.path ?? "/"}`);
  return { page, errors, close: () => context.close() };
}

const cssVar = (page: Page, name: string) => page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);
const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
const frameSrc = (page: Page) => page.locator(".demo-screen iframe").getAttribute("src");
const trades = tradeShowcases();
const dentist = trades.find((t) => t.id === "zobozdravnik")!;

describe("landing trade showcase", () => {
  it("lists every showcase, in the spec's order", () => {
    expect(trades.map((t) => t.id)).toEqual(SHOWCASES.map((s) => s.id));
  });

  for (const width of [1280, 360] as const) {
    it(`at ${width} px: a chip restyles the page and shows the trade's site; Nazaj restores it`, async () => {
      const { page, errors, close } = await open(width);
      try {
        expect(await cssVar(page, "--accent")).toBe("#156b4a");
        // Count the view transitions the switch starts.
        await page.evaluate(() => {
          const w = window as unknown as { vt: number };
          w.vt = 0;
          const d = document as Document & { startViewTransition: (cb: () => unknown) => unknown };
          const orig = d.startViewTransition.bind(d);
          d.startViewTransition = (cb) => {
            w.vt++;
            return orig(cb);
          };
        });
        const chip = page.locator('a.chip[data-trade-id="zobozdravnik"]');
        await chip.scrollIntoViewIfNeeded();
        await chip.click();
        await expect.poll(() => page.evaluate(() => document.documentElement.dataset.trade), { timeout: 5000 }).toBe("zobozdravnik");
        await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains("trade-switch")), { timeout: 5000 }).toBe(false);
        expect(await page.evaluate(() => (window as unknown as { vt: number }).vt)).toBe(1);
        expect(await cssVar(page, "--accent")).toBe(dentist.vars["--accent"]);
        expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).not.toBe("rgb(245, 243, 239)");
        expect(await page.locator("h1").evaluate((h) => getComputedStyle(h).fontFamily)).toContain("Figtree");
        expect(await page.evaluate(() => document.fonts.check('700 40px "Figtree"'))).toBe(true);
        expect(await frameSrc(page)).toContain("examples/primer-zobozdravnik/index.html");
        expect(await chip.getAttribute("aria-current")).toBe("true");
        expect(await page.locator(".phone-cap").textContent()).toContain("zobozdravstveno ordinacijo");
        expect(await page.locator("[data-trade-status]").textContent()).toBe("Prikazan primer: Zobozdravnik");
        expect(new URL(page.url()).searchParams.get("primer")).toBe("zobozdravnik");
        // The site in the demo is there and is the showcase (its own colours, not the template's).
        const site = page.frameLocator(".demo-screen iframe");
        await expect.poll(() => site.locator("h1").count()).toBeGreaterThan(0);
        expect(await site.locator("html").evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--c-primary").trim())).toBe(dentist.vars["--accent"]);
        expect(await page.locator(".demo").getAttribute("data-step")).toBe("phone");
        expect(await sideways(page)).toBeLessThanOrEqual(0);

        // Another trade, then back to the product's look.
        await page.locator('a.chip[data-trade-id="gostilna"]').evaluate((a: HTMLElement) => a.scrollIntoView({ block: "center" }));
        const more = page.locator(".chip.more");
        if (await more.isVisible()) await more.click();
        await page.locator('a.chip[data-trade-id="gostilna"]').click();
        await expect.poll(() => page.evaluate(() => document.documentElement.dataset.trade), { timeout: 5000 }).toBe("gostilna");
        expect(await chip.getAttribute("aria-current")).toBeNull();
        expect(await frameSrc(page)).toContain("primer-gostilna");
        const reset = page.locator(".trades-reset");
        await reset.click();
        await expect.poll(() => page.evaluate(() => document.documentElement.dataset.trade ?? null), { timeout: 5000 }).toBeNull();
        expect(await cssVar(page, "--accent")).toBe("#156b4a");
        expect(await page.evaluate(() => document.documentElement.getAttribute("style") ?? "")).toBe("");
        expect(await frameSrc(page)).toContain("examples/trgovina-oljka-in-sol/index.html");
        expect(await page.locator(".phone-cap").textContent()).toContain("Oljka in sol");
        expect(await reset.isHidden()).toBe(true);
        expect(new URL(page.url()).searchParams.has("primer")).toBe(false);
        expect(await sideways(page)).toBeLessThanOrEqual(0);
        expect(errors).toEqual([]);
      } finally {
        await close();
      }
    }, 90_000);
  }

  it("at 360 px: five chips, the rest behind 'Več dejavnosti'; at 1280 px every chip shows", async () => {
    const phone = await open(360);
    try {
      const visible = () => phone.page.locator("a.chip[data-trade-id]").evaluateAll((as) => as.filter((a) => (a as HTMLElement).offsetParent !== null).length);
      expect(await visible()).toBe(5);
      const more = phone.page.locator(".chip.more");
      expect(await more.isVisible()).toBe(true);
      await more.click();
      expect(await visible()).toBe(trades.length);
      expect(await more.isHidden()).toBe(true);
      expect(await phone.page.evaluate(() => document.activeElement?.getAttribute("data-trade-id"))).toBe(trades[5]!.id);
      // Chips are big enough for a thumb and stay inside the screen.
      for (const box of await phone.page.locator("a.chip[data-trade-id]").evaluateAll((as) => as.map((a) => a.getBoundingClientRect().toJSON() as DOMRect))) {
        expect(box.height).toBeGreaterThanOrEqual(40);
        expect(box.right).toBeLessThanOrEqual(360);
      }
    } finally {
      await phone.close();
    }
    const desk = await open(1280);
    try {
      expect(await desk.page.locator(".chip.more").isHidden()).toBe(true);
      expect(await desk.page.locator("a.chip[data-trade-id]").evaluateAll((as) => as.filter((a) => (a as HTMLElement).offsetParent !== null).length)).toBe(trades.length);
    } finally {
      await desk.close();
    }
  }, 60_000);

  it("reduced motion: the look changes at once, without a view transition", async () => {
    const { page, errors, close } = await open(1280, { reducedMotion: "reduce" });
    try {
      await page.evaluate(() => {
        const d = document as Document & { startViewTransition: () => never };
        d.startViewTransition = () => {
          throw new Error("no transition with reduced motion");
        };
      });
      await page.locator('a.chip[data-trade-id="pekarna"]').click();
      await expect.poll(() => page.evaluate(() => document.documentElement.dataset.trade)).toBe("pekarna");
      expect(await cssVar(page, "--accent")).toBe(trades.find((t) => t.id === "pekarna")!.vars["--accent"]);
      expect(errors).toEqual([]);
    } finally {
      await close();
    }
  }, 60_000);

  it("/?primer=<id> renders the trade's look on the server, and the chips work as links without JavaScript", async () => {
    const { page, close } = await open(1280, { javaScriptEnabled: false, path: "/?primer=instalater" });
    try {
      const inst = trades.find((t) => t.id === "instalater")!;
      expect(await page.evaluate(() => document.documentElement.dataset.trade)).toBe("instalater");
      expect(await cssVar(page, "--canvas")).toBe(inst.vars["--canvas"]);
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe("dark");
      expect(await frameSrc(page)).toContain("primer-instalater");
      expect(await page.locator('a.chip[aria-current="true"]').getAttribute("data-trade-id")).toBe("instalater");
      expect(await page.locator(".trades-reset").isVisible()).toBe(true);
      expect(await page.locator("a.chip[data-trade-id]").count()).toBe(trades.length);
      await page.locator('a.chip[data-trade-id="frizer"]').click();
      await page.waitForURL(/primer=frizer/);
      expect(await page.evaluate(() => document.documentElement.dataset.trade)).toBe("frizer");
      expect(await sideways(page)).toBeLessThanOrEqual(0);
    } finally {
      await close();
    }
    // An unknown trade is the product's own look.
    const plain = await open(1280, { path: "/?primer=nic" });
    try {
      expect(await plain.page.evaluate(() => document.documentElement.dataset.trade ?? null)).toBeNull();
      expect(await cssVar(plain.page, "--accent")).toBe("#156b4a");
    } finally {
      await plain.close();
    }
  }, 60_000);

  it("every showcase page and its heading font load from the landing's assets", async () => {
    const html = await (await fetch(`${base}/`)).text();
    const data = JSON.parse(/<script type="application\/json" id="trades-data">([^<]*)<\/script>/.exec(html)![1]!) as { page: string; font: { url: string } }[];
    expect(data.length).toBe(trades.length);
    for (const t of data) {
      expect((await fetch(`${base}${t.page}`)).status, t.page).toBe(200);
      const font = await fetch(`${base}${t.font.url}`);
      expect([font.status, font.headers.get("content-type")], t.font.url).toEqual([200, "font/woff2"]);
    }
  }, 60_000);
});
