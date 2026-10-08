import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { chromium, type Browser, type Page } from "playwright";
import { root } from "../scripts/bundle.ts";
import type * as Morph from "../src/index.ts";

/**
 * The engine in Chromium, through the example page (examples/index.html, which loads dist/morph.js the way
 * another project would): a switch morphs part by part on a view transition and leaves exactly the new
 * screen, with nothing of the engine left behind; a newer switch skips a running one; the build takes the
 * screen apart and gives back the same text, also for an iframe's document (another realm, as on the
 * landing); reduced motion cross-fades without keyframes.
 */
let server: Server;
let base: string;
let browser: Browser;

beforeAll(async () => {
  server = createServer(async (req, res) => {
    const file = path.join(root, new URL(req.url ?? "/", "http://x").pathname);
    try {
      const body = await readFile(file);
      res.writeHead(200, { "content-type": file.endsWith(".js") ? "text/javascript" : "text/html" }).end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  browser = await chromium.launch();
}, 60_000);

afterAll(async () => {
  await browser?.close();
  server?.close();
});

async function open(opts: { reducedMotion?: "reduce" | "no-preference"; width?: number } = {}) {
  const context = await browser.newContext({ viewport: { width: opts.width ?? 1280, height: 900 }, reducedMotion: opts.reducedMotion ?? "no-preference" });
  const page = await context.newPage();
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`console: ${m.text()}`);
  });
  await page.goto(`${base}/examples/index.html`);
  await page.waitForFunction(() => "morphDemo" in window);
  await page.evaluate(() => (window as unknown as { morphDemo: { stop(): void } }).morphDemo.stop());
  return { page, problems, close: () => context.close() };
}

const show = (page: Page, id: string) => page.evaluate((i) => (window as unknown as { morphDemo: { show(id: string): Promise<void> } }).morphDemo.show(i), id);
const screenHtml = (page: Page) => page.evaluate(() => document.querySelector(".screen")!.outerHTML);

describe.each([1280, 360])("@sb/morph example at %i px", (width) => {
  it("morphs part by part and leaves exactly the new screen", async () => {
    const { page, problems, close } = await open({ width });
    try {
      const done = show(page, "bikes");
      // While it runs: one keyframed group per moving part, the old screen's parts named.
      const during = await page.waitForFunction(
        () => {
          const css = document.querySelector("style[data-morph]")?.textContent ?? "";
          const groups = css.match(/::view-transition-group\(([\w-]+)\)\{/g) ?? [];
          const anims = document.getAnimations().filter((a) => /view-transition/.test((a.effect as KeyframeEffect | null)?.pseudoElement ?? ""));
          return groups.length > 5 && anims.length > 5 ? { groups: groups.length, anims: anims.length } : null;
        },
        undefined,
        { timeout: 5000, polling: 10 },
      );
      const d = (await during.jsonValue())!;
      expect(d.groups).toBeGreaterThan(5);
      await done;
      // Nothing of the engine left: no stylesheet, no names, no filled panels, the headline's exact text.
      expect(await page.evaluate(() => document.querySelector("style[data-morph]"))).toBeNull();
      expect(await page.evaluate(() => document.querySelectorAll("[style*=view-transition-name], [style*=background-color]").length)).toBe(0);
      expect(await page.evaluate(() => document.querySelector("h1")!.textContent)).toBe("Ride further, fix less");
      expect(await page.evaluate(() => document.querySelector(".screen")!.className)).toBe("screen bikes");
      expect(problems).toEqual([]);
    } finally {
      await close();
    }
  }, 60_000);

  it("a newer switch skips the running one and ends on the newest screen", async () => {
    const { page, problems, close } = await open({ width });
    try {
      const first = show(page, "bikes");
      await page.waitForFunction(() => document.querySelector("style[data-morph]"), undefined, { timeout: 5000, polling: 10 });
      await Promise.all([first, show(page, "studio")]);
      await page.waitForFunction(() => !document.querySelector("style[data-morph]"), undefined, { timeout: 15_000 });
      expect(await page.evaluate(() => document.querySelector(".screen")!.className)).toBe("screen studio");
      expect(await page.evaluate(() => document.querySelectorAll("[style*=view-transition-name]").length)).toBe(0);
      expect(problems).toEqual([]);
    } finally {
      await close();
    }
  }, 60_000);

  it("builds the screen in four steps and gives back the same markup", async () => {
    const { page, problems, close } = await open({ width });
    try {
      const before = await screenHtml(page);
      const built = page.evaluate(() => (window as unknown as { morphDemo: { build(): Promise<void> } }).morphDemo.build());
      await page.waitForFunction(() => document.querySelector(".screen")!.classList.contains("mb-bld") && document.querySelectorAll("mb-w").length > 10, undefined, { timeout: 5000 });
      await built;
      expect(await screenHtml(page)).toBe(before);
      expect(await page.evaluate(() => document.querySelectorAll("mb-w, [data-mb-panel], [data-mb-box]").length)).toBe(0);
      expect(problems).toEqual([]);
    } finally {
      await close();
    }
  }, 60_000);

  it("builds a document in an iframe (another realm) and gives back the same markup", async () => {
    const { page, problems, close } = await open({ width });
    try {
      // The engine as another project loads it (a page evaluate can't import: the test runner rewrites import()).
      await page.addScriptTag({ type: "module", content: "import * as m from '/dist/morph.js'; window.morphLib = m;" });
      await page.waitForFunction(() => "morphLib" in window);
      const r = await page.evaluate(async () => {
        const m = (window as unknown as { morphLib: typeof Morph }).morphLib;
        const f = document.createElement("iframe");
        f.srcdoc = "<!doctype html><body><header><h1>Hello there</h1></header><section><p>Some words <b>here</b></p><button>Go</button></section></body>";
        const loaded = new Promise((ok) => f.addEventListener("load", ok, { once: true }));
        document.body.append(f);
        await loaded;
        const doc = f.contentDocument!;
        const before = doc.body.outerHTML;
        const b = m.prepareBuild(doc, { panels: "header, section" });
        const during = { root: doc.documentElement.classList.contains("mb-bld"), words: doc.querySelectorAll("mb-w").length };
        await m.runBuild(b, () => {}, { structure: { spread: 10, total: 20 }, colours: { apart: 5, after: 10 }, photos: { apart: 5, after: 10 }, text: { perWord: 5, total: 20, after: 650 } });
        return { during, same: doc.body.outerHTML === before, left: doc.documentElement.className };
      });
      expect(r).toEqual({ during: { root: true, words: 4 }, same: true, left: "" });
      expect(problems).toEqual([]);
    } finally {
      await close();
    }
  }, 60_000);

  it("reduced motion: a plain cross-fade, no part keyframes", async () => {
    const { page, problems, close } = await open({ width, reducedMotion: "reduce" });
    try {
      const done = show(page, "studio");
      const css = await page.waitForFunction(() => document.querySelector("style[data-morph]")?.textContent ?? null, undefined, { timeout: 5000, polling: 10 });
      expect(await css.jsonValue()).not.toContain("@keyframes");
      await done;
      expect(await page.evaluate(() => document.querySelector(".screen")!.className)).toBe("screen studio");
      expect(problems).toEqual([]);
    } finally {
      await close();
    }
  }, 60_000);
});
