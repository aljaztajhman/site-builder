// @module-tag slow
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";
import { repeatedContact } from "../src/check/page-checks.ts";

/**
 * Banned pattern (docs/PRODUCT.md): the address or the opening hours rendered in full more than once on a page. The
 * outside review's most common blocker (a contact section, the footer's "Obiščite nas" and sometimes a strip under
 * the hero, each with the address and the hours). The footer's legal row (the provider's address ZEPT requires) is
 * not a contact block.
 */
let browser: Browser;
beforeAll(async () => {
  browser = await chromium.launch();
}, 60_000);
afterAll(async () => {
  await browser?.close();
});

const ADDRESS = { street: "Glavni trg 3", place: "4000 Kranj" };
const addressBlock = `<address>Glavni trg 3<br>4000 Kranj</address>`;
const hoursBlock = `<div class="hours"><dl class="hours__list"><div class="hours__row"><dt>pon–pet</dt><dd>8.00–16.00</dd></div><div class="hours__row"><dt>sob</dt><dd>8.00–12.00</dd></div></dl></div>`;
const weekChart = `<div class="week"><dl class="week__days"><div class="week__day"><dt>pon</dt><dd>8.00–16.00</dd></div></dl></div>`;
const legalRow = `<div class="site-footer__grid"><div class="site-footer__block site-footer__contact"><p>Frizerstvo Ana</p>${addressBlock}</div></div>`;

async function check(body: string): Promise<string[]> {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  try {
    const page = await ctx.newPage();
    await page.setContent(`<!doctype html><html lang="sl"><head><meta charset="utf-8"></head><body>${body}</body></html>`);
    return await repeatedContact(page, ADDRESS);
  } finally {
    await ctx.close();
  }
}

describe("repeated contact details", () => {
  it("flags an address shown twice (a section and the footer's visit block)", async () => {
    const r = await check(`<main><section><h2>Kontakt</h2>${addressBlock}</section></main><footer><div class="site-footer__visit"><h2>Obiščite nas</h2>${addressBlock}</div></footer>`);
    expect(r.join("\n")).toMatch(/address shown in full 2 times/);
  });

  it("flags the address as one line of text and as an address block", async () => {
    const r = await check(`<main><section><p class="contact-strip__value">Glavni trg 3, 4000 Kranj</p></section><section>${addressBlock}</section></main>`);
    expect(r.join("\n")).toMatch(/address shown in full 2 times/);
  });

  it("flags opening hours shown twice, a list and a week chart", async () => {
    const r = await check(`<main><section>${weekChart}</section></main><footer><div class="site-footer__visit-hours">${hoursBlock}</div></footer>`);
    expect(r.join("\n")).toMatch(/opening hours shown in full 2 times/);
  });

  it("passes each shown once, and a nested hours wrapper counts once", async () => {
    expect(await check(`<main><section>${addressBlock}<div class="cx-hours">${hoursBlock}</div></section></main>`)).toEqual([]);
  });

  it("does not count the footer's legal row, nor a street alone or hidden copies", async () => {
    expect(
      await check(
        `<main><section>${addressBlock}${hoursBlock}<p>Parkirišče je za hišo na Glavni trg 3.</p><div hidden>${addressBlock}${hoursBlock}</div></section></main><footer>${legalRow}<div class="site-footer__bottom"><p>Glavni trg 3, 4000 Kranj</p></div></footer>`,
      ),
    ).toEqual([]);
  });

  it("without an address (a placeholder) only the hours are counted", async () => {
    const ctx = await browser.newContext();
    try {
      const page = await ctx.newPage();
      await page.setContent(`<main>${addressBlock}${addressBlock}${hoursBlock}</main>`);
      expect(await repeatedContact(page)).toEqual([]);
    } finally {
      await ctx.close();
    }
  });
});
