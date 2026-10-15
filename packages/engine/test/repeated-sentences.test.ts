// @module-tag slow
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";
import { repeatedSentences } from "../src/check/page-checks.ts";

/**
 * Banned pattern (docs/PRODUCT.md): the same sentence visible twice on a page. The outside review held pages for an
 * opening-hours note printed under the hours and again as the section's note, and for a hero sentence repeated in a
 * later section.
 */
let browser: Browser;
beforeAll(async () => {
  browser = await chromium.launch();
}, 60_000);
afterAll(async () => {
  await browser?.close();
});

const NOTE = "Brez naročila težko pridete na vrsto, zato raje pokličite.";

async function check(body: string): Promise<string[]> {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  try {
    const page = await ctx.newPage();
    await page.setContent(`<!doctype html><html lang="sl"><head><meta charset="utf-8"></head><body>${body}</body></html>`);
    return await repeatedSentences(page);
  } finally {
    await ctx.close();
  }
}

describe("repeated sentences", () => {
  it("flags the hours note printed twice in the hours section", async () => {
    const r = await check(`<section><h2>Kdaj smo odprti</h2><div class="hours"><p class="hours__note">${NOTE}</p></div><p class="oh__note">${NOTE}</p></section>`);
    expect(r).toEqual([`sentence shown 2 times: „${NOTE}“ (p.hours__note, p.oh__note)`]);
  });

  it("flags a sentence of a longer text repeated elsewhere, ignoring case, quotes, spacing and the stop", async () => {
    const r = await check(`<p class="lead">Pečemo ročno, brez aditivov. Moko kupujemo pri mlinu v bližini.</p><section><p>Vse je ročno <strong>delo</strong>. „Moko  kupujemo pri MLINU v bližini“</p></section>`);
    expect(r.join("\n")).toMatch(/sentence shown 2 times: .Moko kupujemo pri mlinu v bližini/);
  });

  it("a sentence with an inline bold word is one sentence", async () => {
    const r = await check(`<p>Odpiramo vrata brez <strong>poškodb</strong>, kadar se le da.</p><p>Odpiramo vrata brez poškodb, kadar se le da.</p>`);
    expect(r).toHaveLength(1);
  });

  it("does not count short lines, links and buttons, hidden or aria-hidden copies, or the legal row", async () => {
    const r = await check(
      [
        `<p>Pokličite nas še danes.</p><p>Pokličite nas še danes.</p>`,
        `<a href="tel:1">Naročite se po telefonu ali SMS danes</a><p>Naročite se po telefonu ali SMS danes.</p>`,
        `<button>Pošljite povpraševanje in odgovorimo še danes</button><p>Pošljite povpraševanje in odgovorimo še danes.</p>`,
        `<p>${NOTE}</p><p style="display:none">${NOTE}</p><div class="ticker" aria-hidden="true"><span>${NOTE}</span></div>`,
        `<p>Upravljavec osebnih podatkov je Frizerstvo Lana s.p. iz Celja.</p><footer><div class="site-footer__bottom"><p>Upravljavec osebnih podatkov je Frizerstvo Lana s.p. iz Celja.</p></div></footer>`,
      ].join(""),
    );
    expect(r).toEqual([]);
  });

  it("a fact two items of one list share is not a repeat; the same fact again outside the list is", async () => {
    const list = `<section><ul><li><h3>Potica</h3><p>Na voljo ob petkih in sobotah. Tudi za praznike.</p></li><li><h3>Krofi</h3><p>Na voljo ob petkih in sobotah.</p></li></ul></section>`;
    expect(await check(list)).toEqual([]);
    expect(await check(`<section><p class="lead">Na voljo ob petkih in sobotah.</p></section>${list}`)).toHaveLength(1);
  });

  it("two different sentences that share words are not a repeat", async () => {
    const r = await check(`<p>Barve brez amoniaka, primerne tudi za občutljivo lasišče.</p><p>Uporabljamo barve brez amoniaka, primerne tudi za občutljivo lasišče.</p>`);
    expect(r).toEqual([]);
  });
});
