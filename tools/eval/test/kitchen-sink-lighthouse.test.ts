import { describe, expect, it } from "vitest";
import { loadConfig } from "@sb/config";
import { checkSite, launchCheckBrowser } from "@sb/engine";
import { pageFile, siteFiles } from "@sb/render";
import { kitchenSinkSpec } from "../src/kitchen-sink.ts";

/**
 * The composed kitchen-sink home through Lighthouse (mobile profile, the same run the eval's site check makes): LCP at
 * most 2.5 s (docs/PRODUCT.md mobile checklist; docs/plans/studio-phase1-review.md 6.1). It needs a Chromium debugging
 * port and takes about 20 s, so it runs only with SB_LIGHTHOUSE=1. No model call.
 */
const LCP_MS = 2500;

describe.skipIf(process.env.SB_LIGHTHOUSE !== "1")("the kitchen sink in Lighthouse (mobile)", () => {
  it(`has LCP <= ${LCP_MS} ms`, async () => {
    const config = loadConfig();
    const { spec, media } = await kitchenSinkSpec();
    const files = siteFiles(spec, media, { imageWidths: [...config.images.widths] });
    const cb = await launchCheckBrowser();
    try {
      const home = spec.pages.find((p) => p.kind === "home")!;
      const report = await checkSite(spec, files, { config, corpus: "", lighthouse: true, browser: cb, pages: [pageFile(home)] });
      const lh = report.lighthouse;
      expect(lh, "lighthouse ran").not.toBeNull();
      console.log(`kitchen sink: LCP ${lh!.lcpMs} ms, performance ${lh!.performance}`);
      expect(lh!.lcpMs).toBeLessThanOrEqual(LCP_MS);
    } finally {
      await cb.close();
    }
  }, 180_000);
});
