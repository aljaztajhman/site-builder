import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { serve, type ServerType } from "@hono/node-server";
import { loadConfig } from "@sb/config";
import { launchCheckBrowser, type CheckBrowser } from "@sb/engine";
import { Repo, createDb, createFsStorage, migrate, type Platform, type Queue } from "@sb/platform";
import { LANDING_TRADES } from "@sb/spec";
import { createApp } from "../src/app.ts";
import { tradeCaption, tradeClientData, tradeShowcases, tradeTitle } from "../src/showcase.ts";
import { DEMO } from "../src/client/demo-timing.ts";

/**
 * The landing page's trade demo in Chromium, at 1280 and 360 px (docs/plans/landing-trade-demo.md,
 * "Checks"): the intro types, builds and shows the first site without moving the card or the column; the
 * build's last frame is the finished page; the demo moves on by itself, by tab, by arrow key; pause
 * stops it; the view switch resizes the device; Gostilna's label card stays above its photo while
 * transforming; reduced motion plays the intro and the switches in fades, nothing moving (?primer= still
 * shows the trade at once); without JavaScript the tabs are links.
 * Playwright's clock drives the demo's timers; CSS transitions and the view transitions run in real time.
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
type Frame = ReturnType<Page["mainFrame"]>;

const trades = tradeShowcases();
const CLOCK_START = Date.parse("2026-10-04T10:00:00Z");
const client = tradeClientData(trades);
const byId = (id: string) => trades.find((t) => t.id === id)!;

interface Opened {
  page: Page;
  /** Console errors, page errors and failed responses. */
  problems: string[];
  close: () => Promise<void>;
}

async function open(width: number, opts: { reducedMotion?: "reduce" | "no-preference"; javaScriptEnabled?: boolean; path?: string; clock?: boolean } = {}): Promise<Opened> {
  const context = await cb.browser.newContext({ viewport: { width, height: 900 }, reducedMotion: opts.reducedMotion ?? "no-preference", javaScriptEnabled: opts.javaScriptEnabled ?? true });
  const page = await context.newPage();
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`console: ${m.text()}`);
  });
  page.on("response", (r) => {
    if (r.status() >= 400) problems.push(`${r.status()} ${r.url()}`);
  });
  // The landing's <html> never gets an inline style or a data-trade (the page keeps its own look).
  await page.addInitScript(() => {
    if (window !== window.top) return;
    const w = window as unknown as { htmlTouched: string[] };
    w.htmlTouched = [];
    new MutationObserver((ms) => {
      for (const m of ms) if (m.target === document.documentElement) w.htmlTouched.push(m.attributeName!);
    }).observe(document, { attributes: true, subtree: true, attributeFilter: ["style", "data-trade"] });
  });
  // The demo's timers run only when the test advances them.
  if (opts.clock) {
    await page.clock.install({ time: CLOCK_START });
    await page.clock.pauseAt(CLOCK_START + 1000);
  }
  await page.goto(`${base}${opts.path ?? "/"}`);
  return { page, problems, close: () => context.close() };
}

const step = (page: Page) => page.evaluate(() => document.querySelector<HTMLElement>(".devbox")!.dataset.step ?? null);
const selected = (page: Page) => page.locator('.tab[aria-selected="true"]').getAttribute("data-id");
const frameTitle = (page: Page) => page.locator("iframe.main").getAttribute("title");
const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
const mainFrame = async (page: Page): Promise<Frame> => (await (await page.locator("iframe.main").elementHandle())!.contentFrame())!;
/** A switch has finished when the clock runs again (its tab's underline filling). */
const switched = (page: Page) => page.waitForFunction(() => document.querySelector(".tabs")!.classList.contains("auto"), undefined, { timeout: 15_000 });

async function cleanHtml(page: Page) {
  expect(await page.evaluate(() => (window as unknown as { htmlTouched: string[] }).htmlTouched)).toEqual([]);
  expect(await page.evaluate(() => [document.documentElement.getAttribute("style"), document.documentElement.dataset.trade ?? null])).toEqual([null, null]);
}

/**
 * In the page: every running animation or transition that changes a place or a size (transform, position,
 * size, clipping, a background's size or position), as "name: properties". Fades (opacity, colour,
 * filter) are fine under reduced motion.
 */
function movingAnimations(): string[] {
  const moving = /^(transform|translate|scale|rotate|left|top|right|bottom|inset|width|height|clipPath|backgroundSize|backgroundPosition|offsetPath)/;
  return document.getAnimations().flatMap((a) => {
    const keyframes = (a.effect as KeyframeEffect | null)?.getKeyframes() ?? [];
    const props = [...new Set(keyframes.flatMap((k) => Object.keys(k)))].filter((p) => moving.test(p));
    const name = (a as CSSAnimation).animationName ?? (a as CSSTransition).transitionProperty ?? "?";
    const el = (a.effect as KeyframeEffect | null)?.target;
    return props.length ? [`${name} on ${el?.nodeName ?? "?"}.${(el as Element | null)?.className ?? ""}: ${props.join(",")}`] : [];
  });
}

/** Advances the demo's timers by `ms`, a little at a time (CSS keeps running in real time). */
async function run(page: Page, ms: number, slice = 100) {
  for (let t = 0; t < ms; t += slice) await page.clock.runFor(Math.min(slice, ms - t));
}

describe("landing trade demo", () => {
  it("shows the five landing trades, in order", () => {
    expect(trades.map((t) => t.id)).toEqual([...LANDING_TRADES]);
    expect(trades.every((t) => t.intro.length > 40 && t.intro.endsWith("…"))).toBe(true);
  });

  it("serves every example page and the fonts it uses", async () => {
    for (const t of client) {
      const res = await fetch(new URL(t.page, base));
      expect(res.status, t.page).toBe(200);
      const html = await res.text();
      const fonts = [...new Set([...html.matchAll(/url\("([^"]+\.woff2)"\)/g)].map((m) => m[1]!))];
      expect(fonts.length, t.page).toBeGreaterThan(0);
      for (const f of fonts) expect((await fetch(new URL(f, new URL(t.page, base)))).status, f).toBe(200);
    }
  });

  for (const width of [1280, 360] as const) {
    it(`at ${width} px: the intro types, builds and shows the first site; the build's last frame is the finished page`, async () => {
      const { page, problems, close } = await open(width, { clock: true });
      try {
        const frizer = byId("frizer");
        await page.locator(".devwrap").scrollIntoViewIfNeeded();
        await page.waitForFunction(() => document.querySelector(".ask")!.classList.contains("placed"));
        expect(await step(page)).toBe("type");
        // While typing: one card rect, one text height, one column height.
        const sample = () =>
          page.evaluate(() => {
            const r = document.querySelector(".ask")!.getBoundingClientRect();
            return JSON.stringify([r.x, r.y, r.width, r.height, document.querySelector(".ask-text")!.getBoundingClientRect().height, document.querySelector<HTMLElement>(".devwrap")!.offsetHeight]);
          });
        await run(page, 50, 10); // fonts.ready, then the card is placed for typing
        const samples = new Set<string>();
        let typed = "";
        while ((await step(page)) === "type") {
          samples.add(await sample());
          typed = (await page.locator(".ask-text .typed").textContent()) ?? "";
          await page.clock.runFor(DEMO.typing.everyMs * 2);
        }
        expect(typed).toBe(frizer.intro);
        expect([...samples]).toHaveLength(1);
        expect(await step(page)).toBe("build");
        expect(await selected(page)).toBe("frizer");
        expect(await page.locator(".tabs").evaluate((el) => el.classList.contains("auto"))).toBe(false);

        // The build: the four steps tick; the last one hands over to the page itself.
        const frame = await mainFrame(page);
        while (!(await frame.evaluate(() => document.documentElement.classList.contains("text")))) await page.clock.runFor(100);
        expect(await page.locator(".ask-steps li.now").textContent()).toBe("Besedila in postavitev");
        // Every transition of the last step done (real time); then, 50 ms at a time, the last frame with the
        // build stylesheet still on, and the first one without it: the same picture.
        await frame.waitForFunction(() => document.getAnimations().length === 0, undefined, { timeout: 10_000 });
        const screen = page.locator(".dev .screen");
        const building = () => frame.evaluate(() => document.documentElement.classList.contains("bld"));
        let before = await screen.screenshot({ animations: "disabled" });
        for (;;) {
          await page.clock.runFor(50);
          if (!(await building())) break;
          await frame.waitForFunction(() => document.getAnimations().length === 0, undefined, { timeout: 10_000 });
          before = await screen.screenshot({ animations: "disabled" });
        }
        expect(await frame.evaluate(() => document.querySelectorAll("sb-w, [data-plate], [data-bk]").length)).toBe(0);
        const after = await screen.screenshot({ animations: "disabled" });
        expect(after.equals(before)).toBe(true);

        await run(page, DEMO.buildEnd + 100);
        expect(await step(page)).toBe("site");
        await switched(page);
        expect(await page.locator(".cap").textContent()).toBe(tradeCaption(frizer));
        await page.waitForFunction(() => getComputedStyle(document.querySelector(".cap")!).opacity === "1");
        expect(await frameTitle(page)).toBe(tradeTitle(frizer));
        expect(await sideways(page)).toBeLessThanOrEqual(0);
        await cleanHtml(page);
        expect(problems).toEqual([]);
      } finally {
        await close();
      }
    }, 90_000);

    it(`at ${width} px: moves on by itself, by tab and by arrow key; pause stops it; the view switch resizes the device`, async () => {
      const { page, problems, close } = await open(width, { clock: true, path: "/?primer=frizer" });
      try {
        await page.locator(".devwrap").scrollIntoViewIfNeeded();
        expect(await step(page)).toBe("site");
        expect(await page.locator(".ask").count()).toBe(0);
        await switched(page);
        // After the dwell, the next trade.
        await run(page, DEMO.dwell - 200);
        expect(await selected(page)).toBe("frizer");
        await run(page, 300);
        expect(await selected(page)).toBe("gostilna");
        await switched(page);
        expect(await frameTitle(page)).toBe(tradeTitle(byId("gostilna")));
        expect(await (await mainFrame(page)).evaluate(() => location.pathname)).toBe(new URL(client[1]!.page, base).pathname);
        // Automatic switches aren't announced.
        expect(await page.locator("[data-demo-status]").textContent()).toBe("");

        // A tab click.
        await page.locator('.tab[data-id="avtoservis"]').click();
        expect(await selected(page)).toBe("avtoservis");
        await switched(page);
        expect(await frameTitle(page)).toBe(tradeTitle(byId("avtoservis")));
        expect(await page.locator("[data-demo-status]").textContent()).toBe(tradeCaption(byId("avtoservis")));
        expect(page.url()).toBe(`${base}/?primer=frizer`);

        // Arrow keys, Home and End: focus and selection move together (a roving tabindex).
        await page.locator('.tab[data-id="avtoservis"]').focus();
        for (const [key, id] of [["ArrowRight", "zobozdravnik"], ["ArrowLeft", "avtoservis"], ["End", "instalater"], ["ArrowRight", "frizer"], ["Home", "frizer"], ["ArrowLeft", "instalater"]] as const) {
          await page.keyboard.press(key);
          expect(await selected(page), key).toBe(id);
          expect(await page.evaluate(() => document.activeElement?.getAttribute("data-id"))).toBe(id);
          expect(await page.locator('.tab[tabindex="0"]').getAttribute("data-id")).toBe(id);
        }
        await switched(page);
        expect(await frameTitle(page)).toBe(tradeTitle(byId("instalater")));

        // Pause: the clock stops; play starts it again.
        const pause = page.locator(".pause");
        await pause.click();
        expect(await pause.getAttribute("aria-pressed")).toBe("true");
        expect(await pause.getAttribute("aria-label")).toBe("Predvajaj");
        expect(await page.locator(".tabs").evaluate((el) => el.classList.contains("auto"))).toBe(false);
        await run(page, DEMO.dwell * 3);
        expect(await selected(page)).toBe("instalater");
        await pause.click();
        expect(await pause.getAttribute("aria-label")).toBe("Ustavi");
        expect(await page.locator(".tabs").evaluate((el) => el.classList.contains("auto"))).toBe(true);

        // The view switch: the phone, then the computer again.
        const dev = page.locator(".dev");
        const col = await page.locator(".devwrap").evaluate((el) => el.clientWidth);
        const deskBox = await dev.boundingBox();
        expect(Math.round(deskBox!.width)).toBe(col);
        expect(Math.round(deskBox!.height)).toBe(Math.round(col * DEMO.desk.ratio) + DEMO.desk.chrome);
        await page.locator('.views [data-mode="phone"]').click();
        expect(await page.locator('.views [data-mode="phone"]').getAttribute("aria-checked")).toBe("true");
        await page.waitForTimeout(DEMO.resize + 300);
        await run(page, DEMO.resize + 200);
        const w = Math.min(DEMO.phone.width, col - 24);
        const phoneBox = await dev.boundingBox();
        expect(Math.round(phoneBox!.width)).toBe(w);
        expect(Math.round(phoneBox!.height)).toBe(Math.round(w * DEMO.phone.ratio));
        expect(await (await mainFrame(page)).evaluate(() => innerWidth)).toBe(DEMO.phone.site);
        await page.locator('.views [data-mode="desk"]').click();
        await page.waitForTimeout(DEMO.resize + 300);
        expect(Math.round((await dev.boundingBox())!.width)).toBe(col);

        expect(await sideways(page)).toBeLessThanOrEqual(0);
        await cleanHtml(page);
        expect(problems).toEqual([]);
      } finally {
        await close();
      }
    }, 90_000);

    it(`at ${width} px: Gostilna's label card stays above its photo while transforming, on the phone`, async () => {
      const { page, problems, close } = await open(width, { path: "/?primer=frizer" });
      try {
        await page.locator(".devwrap").scrollIntoViewIfNeeded();
        await page.locator(".pause").click();
        await page.locator('.views [data-mode="phone"]').click();
        await page.waitForTimeout(DEMO.resize + 300);
        const frame = await mainFrame(page);
        await page.locator('.tab[data-id="gostilna"]').click();
        // While the view transition runs: the stacking of the new card and photo in the generated rules.
        const z = await frame.waitForFunction(
          () => {
            const rig = document.querySelector("style[data-rig]");
            const card = document.querySelector<HTMLElement>(".label-card");
            const photo = document.querySelector<HTMLElement>("main > section picture.media");
            const name = (el: HTMLElement | null) => el?.style.getPropertyValue("view-transition-name");
            const zOf = (n: string | undefined) => (n ? Number(rig?.textContent?.match(new RegExp(`::view-transition-group\\(${n}\\)\\{z-index:(\\d+)`))?.[1]) : NaN);
            const c = zOf(name(card));
            const p = zOf(name(photo));
            return Number.isFinite(c) && Number.isFinite(p) ? { card: c, photo: p } : null;
          },
          undefined,
          { timeout: 10_000, polling: 20 },
        );
        const { card, photo } = (await z.jsonValue())!;
        expect(card).toBeGreaterThan(photo);
        expect(await selected(page)).toBe("gostilna");
        await frame.waitForFunction(() => !document.querySelector("style[data-rig]"), undefined, { timeout: 15_000 });
        expect(await frame.evaluate(() => document.querySelectorAll("[style*=view-transition-name]").length)).toBe(0);
        expect(problems).toEqual([]);
      } finally {
        await close();
      }
    }, 60_000);

    it(`at ${width} px: reduced motion plays the intro and the switches in fades, nothing moving; pause works`, async () => {
      const { page, problems, close } = await open(width, { reducedMotion: "reduce", clock: true });
      try {
        const frizer = byId("frizer");
        await page.locator(".devwrap").scrollIntoViewIfNeeded();
        await page.waitForFunction(() => document.querySelector(".ask")!.classList.contains("placed"));
        expect(await step(page)).toBe("type");
        const frame = await mainFrame(page);
        // Every animation and transition running on the landing and in the demo's frame, sampled as the
        // demo's clock advances: fades (opacity, colour, filter) only, never a change of place or size.
        const moved = new Set<string>();
        const watch = async () => {
          for (const m of await page.evaluate(movingAnimations)) moved.add(m);
          // The frame may be loading the next site (its document then has nothing running yet).
          for (const m of await frame.evaluate(movingAnimations).catch(() => [] as string[])) moved.add(m);
        };
        await run(page, 50, 10);
        const lengths: number[] = [];
        while ((await step(page)) === "type") {
          lengths.push(((await page.locator(".ask-text .typed").textContent()) ?? "").length);
          await watch();
          await page.clock.runFor(DEMO.typing.everyMs * 2);
        }
        // The description is typed: the text grows to the whole description.
        expect(lengths.length).toBeGreaterThan(5);
        expect(lengths.every((n, i) => i === 0 || n >= lengths[i - 1]!)).toBe(true);
        expect(lengths[0]).toBeLessThan(frizer.intro.length / 4);
        expect(new Set(lengths).size).toBeGreaterThan(5);
        expect(await page.locator(".ask-text .typed").textContent()).toBe(frizer.intro);
        // The card fades out over the device and back in under it; the page builds itself in fades.
        while ((await step(page)) !== "build") {
          await watch();
          await page.clock.runFor(50);
        }
        expect(await frame.evaluate(() => [...document.documentElement.classList].filter((c) => c === "bld" || c === "calm"))).toEqual(["bld", "calm"]);
        await page.waitForFunction(() => getComputedStyle(document.querySelector(".dev")!).opacity === "1", undefined, { timeout: 10_000 });
        while (!(await frame.evaluate(() => document.documentElement.classList.contains("text")))) {
          await watch();
          await page.clock.runFor(100);
        }
        expect(await page.locator(".ask-steps li.now").textContent()).toBe("Besedila in postavitev");
        await watch();
        // The handover: the build's last frame is the finished page (as without reduced motion).
        await frame.waitForFunction(() => document.getAnimations().length === 0, undefined, { timeout: 10_000 });
        const screen = page.locator(".dev .screen");
        const building = () => frame.evaluate(() => document.documentElement.classList.contains("bld"));
        let before = await screen.screenshot({ animations: "disabled" });
        for (;;) {
          await page.clock.runFor(50);
          if (!(await building())) break;
          await frame.waitForFunction(() => document.getAnimations().length === 0, undefined, { timeout: 10_000 });
          before = await screen.screenshot({ animations: "disabled" });
        }
        expect(await frame.evaluate(() => document.querySelectorAll("sb-w, [data-plate], [data-bk]").length)).toBe(0);
        expect((await screen.screenshot({ animations: "disabled" })).equals(before)).toBe(true);
        await run(page, DEMO.buildEnd + 100);
        expect(await step(page)).toBe("site");
        await switched(page);
        expect(await page.locator(".cap").textContent()).toBe(tradeCaption(frizer));

        // Pause stops the moving on; play starts it again.
        const pause = page.locator(".pause");
        await pause.click();
        expect(await pause.getAttribute("aria-pressed")).toBe("true");
        await run(page, DEMO.dwell * 2);
        expect(await selected(page)).toBe("frizer");
        await pause.click();
        expect(await page.locator(".tabs").evaluate((el) => el.classList.contains("auto"))).toBe(true);

        // It moves on by itself: a cross-fade (the frame fades out over the next site), no transformation.
        await run(page, DEMO.dwell + 100);
        expect(await selected(page)).toBe("gostilna");
        let faded = false;
        while (!(await page.locator(".tabs").evaluate((el) => el.classList.contains("auto")))) {
          faded ||= (await page.locator("iframe.main").evaluate((el) => (el as HTMLElement).style.opacity)) === "0";
          expect(await page.evaluate(() => document.querySelector("iframe.main")!.contentDocument?.querySelector("style[data-rig]") ?? null)).toBeNull();
          await watch();
          await page.clock.runFor(50);
        }
        expect(faded).toBe(true);
        expect(await page.locator("iframe.main").getAttribute("style")).toBeNull();
        expect(await frameTitle(page)).toBe(tradeTitle(byId("gostilna")));
        expect(await frame.evaluate(() => location.pathname)).toBe(new URL(client[1]!.page, base).pathname);
        // And by tab.
        await page.locator('.tab[data-id="zobozdravnik"]').click();
        while (!(await page.locator(".tabs").evaluate((el) => el.classList.contains("auto")))) {
          await watch();
          await page.clock.runFor(50);
        }
        expect(await frameTitle(page)).toBe(tradeTitle(byId("zobozdravnik")));
        expect(await frame.evaluate(() => location.pathname)).toBe(new URL(client[3]!.page, base).pathname);
        expect(await page.locator("[data-demo-status]").textContent()).toBe(tradeCaption(byId("zobozdravnik")));

        expect([...moved]).toEqual([]);
        expect(await sideways(page)).toBeLessThanOrEqual(0);
        await cleanHtml(page);
        expect(problems).toEqual([]);
      } finally {
        await close();
      }
    }, 120_000);

    it(`at ${width} px: reduced motion with ?primer= shows that trade at once`, async () => {
      const { page, problems, close } = await open(width, { reducedMotion: "reduce", path: "/?primer=gostilna", clock: true });
      try {
        await page.locator(".devwrap").scrollIntoViewIfNeeded();
        expect(await step(page)).toBe("site");
        expect(await page.locator(".ask").count()).toBe(0);
        expect(await page.locator(".dev").evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
        expect(await selected(page)).toBe("gostilna");
        const frame = await mainFrame(page);
        await frame.waitForLoadState("load");
        expect(await frame.evaluate(() => document.documentElement.classList.contains("bld"))).toBe(false);
        expect(problems).toEqual([]);
      } finally {
        await close();
      }
    }, 60_000);

    it(`at ${width} px: without JavaScript the tabs are links and ?primer= shows that trade`, async () => {
      const { page, problems, close } = await open(width, { javaScriptEnabled: false });
      try {
        const tabs = page.locator(".tab");
        expect(await tabs.evaluateAll((as) => as.map((a) => [a.tagName, a.getAttribute("href")]))).toEqual(trades.map((t) => ["A", `/?primer=${t.id}#zacni`]));
        expect(await page.locator(".demo-tools").isVisible()).toBe(false);
        expect(await page.locator(".dev").evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
        expect(await page.locator(".ask").isVisible()).toBe(false);
        expect(await page.locator(".cap").textContent()).toBe(tradeCaption(trades[0]!));
        await page.locator('.tab[data-id="gostilna"]').click();
        await page.waitForURL(/primer=gostilna/);
        expect(await selected(page)).toBe("gostilna");
        expect(await page.locator(".ask").count()).toBe(0);
        expect(await page.locator("iframe.main").getAttribute("src")).toBe(client[1]!.page);
        expect(await frameTitle(page)).toBe(tradeTitle(byId("gostilna")));
        expect(await page.locator(".cap").textContent()).toBe(tradeCaption(byId("gostilna")));
        expect(await page.locator(".dev").evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
        expect(await sideways(page)).toBeLessThanOrEqual(0);
        expect(problems).toEqual([]);
      } finally {
        await close();
      }
    }, 60_000);
  }
});
