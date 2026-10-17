// @module-tag slow
import { mkdtemp, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateSpec, type SiteSpec } from "@sb/spec";
// The eval's renderer (the real site files, stand-in pictures) and static server, as composed-structures-browser.test.ts.
import { renderToDir } from "../../../tools/eval/src/lib/render-dir.ts";
import { serveStatic, type StaticServer } from "../../../tools/eval/src/lib/static-server.ts";

/**
 * The wordmark footer family, measured in Chromium at 1280 and 360 px (M1 final check, Fable on tapetnistvo-lesjak and
 * slascicarna-pri-zofki; review 50 item 11 "caps on ... the footer wordmark"):
 *
 * 1. The wordmark has a ceiling: at 1280 it is at most 6rem and one line where the name fits (it was ~141 px, two lines,
 *    about 260 px tall for "Tapetništvo Lesjak"); at 360 it never breaks inside a word, never overflows, and stays a
 *    band of the footer rather than the screen.
 * 2. The name is printed at most twice in the footer outside the legal rows: the wordmark and the © line (it was three
 *    times: the wordmark, a bold name line and the ©).
 *
 * The two final-check pages' saved specs (fixtures/footer-*.json), each with its own name, the other's, a 51-character
 * one and a 5-character one. Screenshots of the footers go to $FOOTER_SHOTS when it is set.
 */
interface PageLike {
  goto(url: string, o?: object): Promise<unknown>;
  evaluate<T, A>(fn: (a: A) => T, arg: A): Promise<T>;
  locator(sel: string): { screenshot(o: object): Promise<unknown> };
}
interface ContextLike {
  newPage(): Promise<PageLike>;
  close(): Promise<void>;
}
interface BrowserLike {
  newContext(o: object): Promise<ContextLike>;
  close(): Promise<void>;
}
const requireEval = createRequire(new URL("../../../tools/eval/package.json", import.meta.url));
const { chromium } = requireEval("playwright") as { chromium: { launch(): Promise<BrowserLike> } };

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (id: string) => migrateSpec(JSON.parse(readFileSync(path.join(here, "fixtures", `footer-${id}.json`), "utf8"))) as SiteSpec;
const BASES = ["tapetnistvo-lesjak", "slascicarna-pri-zofki"] as const;
const LONG = "Tapetništvo in oblazinjenje pohištva Lesjak Sevnica";
const NAMES = ["Tapetništvo Lesjak", "Slaščičarna Pri Zofki", LONG, "Zofka"] as const;
/** A name this short sets on one line at 1280. */
const ONE_LINE_AT_DESKTOP = 24;

const CASES = BASES.flatMap((base) => NAMES.map((name, i) => ({ base, name, slug: `${base}-n${i}` })));

let browser: BrowserLike;
let server: StaticServer;
let outDir: string;
const shotsDir = process.env.FOOTER_SHOTS;

beforeAll(async () => {
  expect(LONG.length).toBe(51);
  outDir = await mkdtemp(path.join(os.tmpdir(), "sb-footer-"));
  for (const c of CASES) {
    const s = structuredClone(fixture(c.base));
    s.slug = c.slug;
    s.business.name = c.name;
    expect(s.design.skeleton?.footer).toBe("wordmark");
    await renderToDir(s, outDir);
  }
  server = await serveStatic(outDir);
  browser = await chromium.launch();
}, 180_000);
afterAll(async () => {
  await browser?.close();
  await server?.close();
  if (outDir) await rm(outDir, { recursive: true, force: true });
});

interface Measures {
  vw: number;
  scrollWidth: number;
  fontSize: number;
  height: number;
  lines: number;
  overflow: boolean;
  /** Words the browser set across two lines (getClientRects of the word's range > 1). */
  splitWords: string[];
  /** Visible copies of the name in the footer, outside the legal rows (dl). */
  visibleNames: number;
}

async function measure(slug: string, name: string, width: number): Promise<Measures> {
  const ctx = await browser.newContext({ viewport: { width, height: 800 }, deviceScaleFactor: 1, ...(width < 768 ? { isMobile: true, hasTouch: true } : {}) });
  try {
    const page = await ctx.newPage();
    await page.goto(`${server.url}/${slug}/index.html`, { waitUntil: "networkidle" });
    if (shotsDir) await page.locator(".site-footer").screenshot({ path: path.join(shotsDir, `footer-${slug}-${width}.png`) });
    return await page.evaluate((n: string) => {
      const wm = document.querySelector<HTMLElement>(".site-footer__wordmark")!;
      const text = wm.firstChild as Text;
      const box = wm.getBoundingClientRect();
      // Line count from the text's own line boxes: distinct tops of its client rects.
      const range = document.createRange();
      range.selectNodeContents(wm);
      const tops = new Set([...range.getClientRects()].map((r) => Math.round(r.top)));
      const splitWords: string[] = [];
      let at = 0;
      for (const word of text.data.split(" ")) {
        const r = document.createRange();
        r.setStart(text, at);
        r.setEnd(text, at + word.length);
        if (new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size > 1) splitWords.push(word);
        at += word.length + 1;
      }
      const footer = document.querySelector(".site-footer")!;
      const walker = document.createTreeWalker(footer, NodeFilter.SHOW_TEXT);
      let visibleNames = 0;
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const el = node.parentElement!;
        if (!node.textContent!.includes(n) || el.closest(".site-footer__dl")) continue;
        const r = el.getBoundingClientRect();
        if (r.width > 2 && r.height > 2 && getComputedStyle(el).visibility !== "hidden") visibleNames++;
      }
      return {
        vw: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        fontSize: parseFloat(getComputedStyle(wm).fontSize),
        height: box.height,
        lines: tops.size,
        overflow: wm.scrollWidth > wm.clientWidth + 1,
        splitWords,
        visibleNames,
      };
    }, name);
  } finally {
    await ctx.close();
  }
}

describe("footer wordmark family (M1 final check)", () => {
  for (const c of CASES)
    describe(`${c.base} named "${c.name}"`, () => {
      it("1280: at most 6rem, one line when the name fits, no taller than a display line", async () => {
        const m = await measure(c.slug, c.name, 1280);
        console.log(`${c.slug} 1280`, JSON.stringify(m));
        expect(m.fontSize).toBeLessThanOrEqual(96);
        expect(m.height).toBeLessThanOrEqual(120);
        if (c.name.length <= ONE_LINE_AT_DESKTOP) expect(m.lines).toBe(1);
        expect(m.splitWords).toEqual([]);
        expect(m.overflow).toBe(false);
        expect(m.scrollWidth).toBeLessThanOrEqual(m.vw);
      });

      it("360: no word broken or overflowing, and a band of the footer, not the screen", async () => {
        const m = await measure(c.slug, c.name, 360);
        console.log(`${c.slug} 360`, JSON.stringify(m));
        expect(m.splitWords).toEqual([]);
        expect(m.overflow).toBe(false);
        expect(m.scrollWidth).toBeLessThanOrEqual(m.vw);
        // At most three lines and 15 % of an 800 px screen (the 51-character name took four lines, 136 px).
        expect(m.lines).toBeLessThanOrEqual(3);
        expect(m.height).toBeLessThanOrEqual(120);
      });

      it("prints the name at most twice outside the legal rows: the wordmark and the © line", async () => {
        for (const width of [1280, 360]) expect((await measure(c.slug, c.name, width)).visibleNames, `${width}`).toBeLessThanOrEqual(2);
      });
    });
});
