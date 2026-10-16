// @module-tag slow
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import { chromium, type Browser } from "playwright";
import { hideFixedForFullPage, loadLazyImages } from "../src/check/page-checks.ts";

/**
 * Full-page screenshots (the eval's home-*.png and the critique's input) drew a sticky header in the middle of the
 * hero: the site scrolls smoothly, so loadLazyImages' scroll back to the top was still under way when the shot was
 * taken, and the sticky header was drawn where the scroll had got to. The capture must show the header once, at the top.
 */
let browser: Browser;
beforeAll(async () => {
  browser = await chromium.launch();
}, 60_000);
afterAll(async () => {
  await browser?.close();
});

const lazy = (n: number) =>
  `<img loading="lazy" alt="" width="300" height="200" src="data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='300' height='200'><rect width='300' height='200' fill='${n % 2 ? "teal" : "olive"}'/></svg>`)}">`;

const PAGE = `<!doctype html><html lang="sl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
html { scroll-behavior: smooth; }
body { margin: 0; background: #fff; font: 17px/1.5 sans-serif; }
.site-header--sticky { position: sticky; top: 0; z-index: 40; height: 60px; background: rgb(255, 0, 0); }
.bar { position: fixed; bottom: 0; left: 0; right: 0; height: 50px; background: rgb(0, 0, 255); }
section { min-height: 700px; padding: 20px; }
</style></head><body>
<header class="site-header site-header--sticky">Glava</header>
<main>${Array.from({ length: 8 }, (_, i) => `<section><h2>Razdelek ${i + 1}</h2>${lazy(i)}</section>`).join("")}</main>
<div class="bar">Pokliči</div>
</body></html>`;

/** Rows (y) of the screenshot whose middle pixel is the header's pure red. */
async function redRows(png: Buffer): Promise<number[]> {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const rows: number[] = [];
  const x = Math.floor(info.width / 2);
  for (let y = 0; y < info.height; y++) {
    const i = (y * info.width + x) * info.channels;
    if (data[i] === 255 && data[i + 1] === 0 && data[i + 2] === 0) rows.push(y);
  }
  return rows;
}

describe("full-page capture", () => {
  for (const viewport of [
    { width: 360, height: 740 },
    { width: 1280, height: 800 },
  ]) {
    it(`draws a sticky header once, at the top, and no fixed bar (${viewport.width} px)`, async () => {
      const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
      try {
        const page = await ctx.newPage();
        await page.setContent(PAGE, { waitUntil: "load" });
        await loadLazyImages(page);
        await hideFixedForFullPage(page);
        const png = await page.screenshot({ type: "png", fullPage: true });
        const rows = await redRows(png);
        expect(rows.length).toBeGreaterThan(50);
        expect(Math.min(...rows)).toBe(0);
        expect(Math.max(...rows), `header rows end at ${Math.max(...rows)}`).toBeLessThan(60);
        // Every lazy image loaded.
        expect(await page.evaluate(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0))).toBe(true);
        // The fixed bar stays hidden.
        const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
        let blue = 0;
        for (let p = 0; p < info.width * info.height; p++) if (data[p * 3] === 0 && data[p * 3 + 1] === 0 && data[p * 3 + 2] === 255) blue++;
        expect(blue).toBe(0);
      } finally {
        await ctx.close();
      }
    });
  }
});

/** A header over the opener (composed-v2 data-hdr="over"): the opener is pulled up under it and positioned. */
const OVER = `<!doctype html><html lang="sl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
body { margin: 0; background: #fff; }
.site-header--sticky { position: sticky; top: 0; z-index: 40; height: 60px; background: rgb(255, 0, 0); }
.opener { position: relative; margin-top: -60px; min-height: 600px; background: rgb(0, 128, 0); }
section { min-height: 700px; }
</style></head><body>
<header class="site-header site-header--sticky">Glava</header>
<main><div class="opener"></div><section></section><section></section></main>
</body></html>`;

describe("full-page capture, header over the opener", () => {
  it("keeps the header painted above the opener pulled up under it", async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    try {
      const page = await ctx.newPage();
      await page.setContent(OVER, { waitUntil: "load" });
      await hideFixedForFullPage(page);
      const rows = await redRows(await page.screenshot({ type: "png", fullPage: true }));
      expect(rows.length).toBeGreaterThan(50);
      expect(Math.min(...rows)).toBe(0);
      expect(Math.max(...rows)).toBeLessThan(60);
    } finally {
      await ctx.close();
    }
  });
});
