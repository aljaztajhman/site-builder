// @module-tag slow
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "@sb/config";
import type { SiteSpec } from "@sb/spec";
import { siteFiles } from "@sb/render";
import { checkSite, launchCheckBrowser, lowestAllowedScale, repairPhoneOverflow, type CheckBrowser, type SiteCheckReport } from "../src/index.ts";

/**
 * A page that scrolls sideways at 360 px must not ship silently. The outside review's case: elektro-zupan's
 * regenerated homepage was 434 px wide at a 360 px viewport, and the check passed it, because mobile emulation widens
 * the layout viewport to the content (innerWidth 434). The check now measures against the viewport it opened and
 * names what overflows; when headings cause it, the type scale comes down within the design's range and the site is
 * checked again; what can't be fixed that way stays a failure.
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
function elektroZupan(change?: (spec: SiteSpec) => void): SiteSpec {
  const spec = JSON.parse(readFileSync(path.join(specs, "elektro-zupan/spec-regenerated.json"), "utf8")) as SiteSpec;
  change?.(spec);
  return spec;
}
const setHeadings = (hero: string, cta: string) => (spec: SiteSpec) => {
  (spec.pages[0]!.sections[0]!.props as { headline: string }).headline = hero;
  (spec.pages[0]!.sections.find((s) => s.type === "cta")!.props as { heading: string }).heading = cta;
};

const check = (spec: SiteSpec): Promise<SiteCheckReport> => checkSite(spec, siteFiles(spec, new Map()), { config, corpus: "", lighthouse: false, browser: cb, pages: ["index.html"] });

describe("horizontal scroll at 360 px", () => {
  it("the real case is caught and names the headings; no allowed scale fits ELEKTROINŠTALACIJE, so it stays a failure", async () => {
    const spec = elektroZupan();
    const report = await check(spec);
    const home = report.pages[0]!;
    expect(home.mobile.horizontalScroll).toBe(true);
    expect(home.mobile.scrollWidth).toBeGreaterThan(400);
    expect(home.mobile.overflowing).toEqual([
      expect.objectContaining({ heading: true, what: expect.stringMatching(/^h1.*Elektroinštalacije/) }),
      expect.objectContaining({ heading: true, what: expect.stringMatching(/^h2.*Potrebujete elektroinštalaterj/) }),
    ]);
    expect(report.failures).toContainEqual(expect.stringMatching(/^index\.html: horizontal scroll at 360 px \(\d+\): h1.*Elektroinštalacije.* \+\d+px/));

    let rechecks = 0;
    const fix = await repairPhoneOverflow(spec, report, async (s) => {
      rechecks++;
      return check(s);
    });
    expect(rechecks).toBe(2);
    expect(fix.changed).toBe(false);
    expect(fix.spec).toBe(spec);
    expect(fix.report.failures).toContainEqual(expect.stringMatching(/horizontal scroll at 360 px/));
    expect(fix.log.at(-1)).toMatch(/not repaired: the lowest type scale the design allows \(1\.25\) still overflows/);
  }, 180_000);

  it("lowers the type scale when that clears the scroll (VODOINŠTALACIJE), touching nothing else", async () => {
    const spec = elektroZupan(setHeadings("VODOINŠTALACIJE", "Pokličite nas"));
    expect(lowestAllowedScale(spec)).toBe(1.25);
    const report = await check(spec);
    expect(report.pages[0]!.mobile.horizontalScroll).toBe(true);
    const fix = await repairPhoneOverflow(spec, report, check);
    expect(fix.log.at(-1)).toMatch(/^horizontal scroll at 360 px repaired: type scale 1\.28 → 1\.2\d+ \(index\.html h1/);
    expect(fix.changed).toBe(true);
    expect(fix.spec.design.scale).toBeLessThan(1.28);
    expect(fix.spec.design.scale).toBeGreaterThanOrEqual(1.25);
    expect(fix.report.pages[0]!.mobile.horizontalScroll).toBe(false);
    expect(fix.report.failures.join("\n")).not.toMatch(/horizontal scroll/);
    expect({ ...fix.spec, design: { ...fix.spec.design, scale: 1.28 } }).toEqual(spec);
  }, 180_000);

  it("does not touch the type when something other than a heading overflows", async () => {
    const spec = elektroZupan(setHeadings("Za hiše in stanovanja", "Pokličite nas"));
    const report = await check(spec);
    expect(report.pages[0]!.mobile.horizontalScroll).toBe(false);
    // As if a wide picture, not a heading, made the page scroll.
    report.pages[0]!.mobile.horizontalScroll = true;
    report.pages[0]!.mobile.overflowing = [{ what: 'img.hero__img ""', heading: false, by: 40 }];
    let rechecks = 0;
    const fix = await repairPhoneOverflow(spec, report, async (s) => {
      rechecks++;
      return check(s);
    });
    expect(rechecks).toBe(0);
    expect(fix.changed).toBe(false);
    expect(fix.log[0]).toMatch(/not repaired: not only heading text overflows/);
  }, 120_000);
});
