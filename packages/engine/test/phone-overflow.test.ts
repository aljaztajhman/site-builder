// @module-tag slow
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "@sb/config";
import type { SiteSpec } from "@sb/spec";
import { siteFiles } from "@sb/render";
import { checkSite, launchCheckBrowser, lowestAllowedScale, measurePage, repairPhoneOverflow, type CheckBrowser, type MobileReport, type SiteCheckReport } from "../src/index.ts";

/**
 * A page that scrolls sideways at 360 px must not ship silently. The outside review's case: elektro-zupan's
 * regenerated homepage was 434 px wide at a 360 px viewport ("ELEKTROINŠTALACIJE" at the hero's size), and the check
 * passed it, because mobile emulation widens the layout viewport to the content (innerWidth 434). The check now
 * measures against the viewport it opened and names what overflows. Since the components fit a heading's longest word
 * to the phone (FitText), that page no longer scrolls; no preset section was found that still overflows in a way a
 * lower type scale fixes (probed: long and wide hero words, card and step titles, the about figure), so the repair is
 * held with reports made here and a re-check that answers by the type scale.
 */
const specs = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../eval/outside-review/review50-specs");
const config = loadConfig();
let cb: CheckBrowser;
beforeAll(async () => {
  cb = await launchCheckBrowser();
}, 60_000);
afterAll(async () => {
  await cb?.close();
});

/** elektro-zupan's regenerated spec (bold-local, uppercase headings, type scale 1.28 in 1.25–1.333). */
const elektroZupan = (): SiteSpec => JSON.parse(readFileSync(path.join(specs, "elektro-zupan/spec-regenerated.json"), "utf8")) as SiteSpec;

describe("horizontal scroll at 360 px: the check", () => {
  it("elektro-zupan-regenerated no longer scrolls at 360 px", async () => {
    const spec = elektroZupan();
    const report = await checkSite(spec, siteFiles(spec, new Map()), { config, corpus: "", lighthouse: false, browser: cb, pages: ["index.html"] });
    const home = report.pages[0]!;
    expect(home.mobile.width).toBe(360);
    expect(home.mobile.horizontalScroll).toBe(false);
    expect(home.mobile.scrollWidth).toBeLessThanOrEqual(360);
    expect(home.mobile.overflowing).toEqual([]);
    expect(report.failures.join("\n")).not.toMatch(/horizontal scroll/);
  }, 120_000);

  it("catches a page wider than the phone in mobile emulation and blames the heading, not its column's neighbours", async () => {
    const ctx = await cb.browser.newContext({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    try {
      const page = await ctx.newPage();
      // A grid column takes its widest word: the heading's long word widens the column and the paragraph beside it.
      await page.setContent(`<!doctype html><html lang="sl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
        <style>body{margin:0;font:17px/1.5 sans-serif} main section{display:grid;grid-template-columns:auto;padding:0 16px} h1{font:800 48px/1.1 sans-serif;text-transform:uppercase;margin:0}</style></head>
        <body><main><section><h1>Elektroinštalacije</h1><p>Delamo v novogradnjah in pri obnovah.</p></section></main></body></html>`);
      const m: MobileReport = await measurePage(page, { primaryMin: 44, primaryGap: 8, absoluteMin: 24 });
      expect(m.width).toBe(360);
      expect(m.scrollWidth).toBeGreaterThan(360);
      expect(m.horizontalScroll).toBe(true);
      expect(m.overflowing).toEqual([expect.objectContaining({ heading: true, what: expect.stringMatching(/^h1 "Elektroinštalacije"$/) })]);
    } finally {
      await ctx.close();
    }
  }, 60_000);
});

/** A check report for one page, scrolling or not at 360 px. */
function report(scrolls: boolean, overflowing: MobileReport["overflowing"] = [{ what: 'h1#s_hero-title.hero-title "ELEKTROINŠTALACIJE"', heading: true, by: 30 }]): SiteCheckReport {
  const mobile: MobileReport = {
    width: 360,
    scrollWidth: scrolls ? 390 : 360,
    horizontalScroll: scrolls,
    tinyTargets: [],
    smallPrimaryTargets: [],
    crowdedTargets: [],
    smallText: [],
    callInViewport: true,
    directionsInViewport: true,
    lang: "sl",
    lcpPreload: true,
    lineLengths: [],
    banned: [],
    overflowing: scrolls ? overflowing : [],
  };
  const r: SiteCheckReport = {
    validation: [],
    facts: [],
    placeholders: 0,
    pages: [{ file: "index.html", axe: [], mobile, desktop: { horizontalScroll: false, scrollWidth: 1280, lineLengths: [], banned: [] } }],
    lighthouse: null,
    lighthousePages: [],
    pageShots: [],
    screenshots: { mobile: new Uint8Array(), mobileFull: new Uint8Array(), desktop: new Uint8Array(), desktopFirst: new Uint8Array() },
    composition: null,
    failures: scrolls ? ["index.html: horizontal scroll at 360 px (390)"] : [],
  };
  return r;
}

/** A re-check that scrolls while the type scale is above `fitsAt` (the heading's word fits from there down). */
function recheckFitting(fitsAt: number) {
  const scales: number[] = [];
  return {
    scales,
    recheck: async (s: SiteSpec) => {
      scales.push(s.design.scale);
      return report(s.design.scale > fitsAt + 1e-9);
    },
  };
}

describe("horizontal scroll at 360 px: the repair", () => {
  it("the lowest scale the design allows is the direction's floor (bold-local 1.25)", () => {
    expect(lowestAllowedScale(elektroZupan())).toBe(1.25);
  });

  it("keeps the first lower scale that clears the scroll (halfway down), touching nothing else", async () => {
    const spec = elektroZupan();
    const { scales, recheck } = recheckFitting(1.27);
    const fix = await repairPhoneOverflow(spec, report(true), recheck);
    expect(scales).toEqual([1.265]);
    expect(fix.changed).toBe(true);
    expect(fix.spec.design.scale).toBe(1.265);
    expect(fix.report.pages[0]!.mobile.horizontalScroll).toBe(false);
    expect(fix.log).toEqual([expect.stringMatching(/^horizontal scroll at 360 px repaired: type scale 1\.28 → 1\.265 \(index\.html h1/)]);
    expect({ ...fix.spec, design: { ...fix.spec.design, scale: 1.28 } }).toEqual(spec);
    expect(spec.design.scale).toBe(1.28);
  });

  it("goes down to the lowest allowed scale when halfway isn't enough", async () => {
    const { scales, recheck } = recheckFitting(1.25);
    const fix = await repairPhoneOverflow(elektroZupan(), report(true), recheck);
    expect(scales).toEqual([1.265, 1.25]);
    expect(fix.changed).toBe(true);
    expect(fix.spec.design.scale).toBe(1.25);
    expect(fix.log.at(-1)).toMatch(/repaired: type scale 1\.28 → 1\.25 /);
  });

  it("a word too long for any allowed scale stays a failure, the spec as it was (at most two re-checks)", async () => {
    const spec = elektroZupan();
    const first = report(true);
    const { scales, recheck } = recheckFitting(1.2);
    const fix = await repairPhoneOverflow(spec, first, recheck);
    expect(scales).toEqual([1.265, 1.25]);
    expect(fix.changed).toBe(false);
    expect(fix.spec).toBe(spec);
    expect(fix.report).toBe(first);
    expect(fix.report.failures).toContainEqual(expect.stringMatching(/horizontal scroll at 360 px/));
    expect(fix.log.at(-1)).toMatch(/not repaired: the lowest type scale the design allows \(1\.25\) still overflows/);
  });

  it("does not touch the type when something other than a heading overflows, nor when nothing scrolls", async () => {
    const { scales, recheck } = recheckFitting(1.27);
    const picture = await repairPhoneOverflow(elektroZupan(), report(true, [{ what: 'img.hero__img ""', heading: false, by: 40 }]), recheck);
    expect(picture.changed).toBe(false);
    expect(picture.log[0]).toMatch(/not repaired: not only heading text overflows/);
    const clean = await repairPhoneOverflow(elektroZupan(), report(false), recheck);
    expect(clean).toMatchObject({ changed: false, log: [] });
    expect(scales).toEqual([]);
  });

  it("at the floor already, says so without a re-check", async () => {
    const spec = elektroZupan();
    spec.design.scale = 1.25;
    const { scales, recheck } = recheckFitting(1.2);
    const fix = await repairPhoneOverflow(spec, report(true), recheck);
    expect(scales).toEqual([]);
    expect(fix.log[0]).toMatch(/already the lowest the design allows/);
  });
});
