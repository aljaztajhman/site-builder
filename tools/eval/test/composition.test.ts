import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "@sb/config";
import { checkSite, launchCheckBrowser, type CheckBrowser } from "@sb/engine";
import { siteFiles } from "@sb/render";
import { migrateSpec, type SiteSpec } from "@sb/spec";

const here = path.dirname(fileURLToPath(import.meta.url));
const config = loadConfig();
let browser: CheckBrowser;
beforeAll(async () => {
  browser = await launchCheckBrowser();
}, 60_000);
afterAll(async () => {
  await browser?.close();
});

const golden = async (id: string) => migrateSpec(JSON.parse(await readFile(path.join(here, `../golden/${id}.json`), "utf8"))) as SiteSpec;

describe("homepage composition, measured on the rendered page", () => {
  it("sees the photo, the buttons and the headline of a photo-led homepage at both widths (pekarna-kvas)", async () => {
    const spec = await golden("pekarna-kvas");
    const r = await checkSite(spec, siteFiles(spec, new Map(), { imageWidths: config.images.widths }), { config, corpus: "", lighthouse: false, browser, pages: ["index.html"] });
    const { mobile, desktop } = r.composition!;
    expect(mobile.viewport).toEqual({ width: 360, height: 800 });
    expect(desktop.viewport).toEqual({ width: 1280, height: 800 });
    for (const c of [mobile, desktop]) {
      expect(c.firstImageAt).not.toBeNull();
      expect(c.buttonsFirstScreen).toBeGreaterThan(0);
      expect(c.headlineLines).toBeGreaterThan(0);
      expect(c.largestGapPx).toBeGreaterThanOrEqual(0);
    }
    // hero-split puts the photo beside the text on desktop, so it is in the first screen there.
    expect(desktop.imageShare).toBeGreaterThan(0.1);
    expect(r.screenshots.desktopFirst.length).toBeGreaterThan(0);
  }, 120_000);

  it("reports no photo for a typography-only homepage (racunovodstvo-seliskar has none)", async () => {
    const spec = await golden("racunovodstvo-seliskar");
    const r = await checkSite(spec, siteFiles(spec, new Map(), { imageWidths: config.images.widths }), { config, corpus: "", lighthouse: false, browser, pages: ["index.html"] });
    expect(r.composition!.mobile.imageShare).toBe(0);
    expect(r.composition!.mobile.firstImageAt).toBeNull();
  }, 120_000);
});
