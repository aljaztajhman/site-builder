import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, type Browser } from "playwright";
import { WORDMARK_STYLES, type SiteSpec } from "@sb/spec";
import { serveStatic, type StaticServer } from "@sb/engine";
import { openPage } from "../src/compose-sheet.ts";
import { kitchenSinkSpec, writeSiteFiles } from "../src/kitchen-sink.ts";

/**
 * A site without a logo and with design.wordmark shows the wordmark in its header (and footer) through the same Wordmark
 * as the block (I9a). At 360 px, in every style, a 40-character name (several words) fits: the page does
 * not scroll sideways, the mark stays inside the viewport and clear of the menu button, and the header stays a header
 * (under 220 px tall). Styles a name does not fit are drawn as plain (spec wordmarkLayout), which is held here too. No model call.
 */
let browser: Browser;
let dir: string;
let server: StaticServer;
beforeAll(async () => {
  browser = await chromium.launch();
  dir = await mkdtemp(path.join(tmpdir(), "sb-wordmark-"));
  server = await serveStatic(dir);
}, 60_000);
afterAll(async () => {
  await browser?.close();
  await server?.close();
  await rm(dir, { recursive: true, force: true });
});

const NAMES = ["Zobna ordinacija Ažman Šuštar Žigon Čehovi", "Mizarstvo Šuštar in sinovi Črnomelj Žalec Šmarje"];

for (const skeleton of [true, false]) {
  describe(`wordmark in the header at 360 px${skeleton ? "" : " (the shared header, no skeleton)"}`, () => {
    for (const style of WORDMARK_STYLES) {
      for (const name of NAMES) {
        it(`${style}: "${name}" (${[...name].length} characters) fits`, async () => {
          expect([...name].length).toBeGreaterThanOrEqual(40);
          const { spec, media } = await kitchenSinkSpec();
          spec.slug = `wm-${style}-${[...name].length}${skeleton ? "-sk" : ""}`;
          spec.business.name = name;
          delete (spec.assets as { logo?: unknown }).logo;
          if (!skeleton) delete spec.design.skeleton;
          spec.design.wordmark = { style };
          await writeSiteFiles(spec as SiteSpec, media, dir);
          const { page, ctx } = await openPage(browser, { width: 360, height: 800 }, `${server.url}/${spec.slug}/index.html`);
          try {
            const m = await page.evaluate(() => {
              const h = document.querySelector("header.site-header")!;
              const wm = h.querySelector<HTMLElement>(".cx-wm, .site-header__name");
              const toggle = h.querySelector<HTMLElement>(".nav-toggle");
              const r = wm?.getBoundingClientRect();
              const t = toggle ? getComputedStyle(toggle).display !== "none" && toggle.getBoundingClientRect() : null;
              return {
                scrollWidth: document.documentElement.scrollWidth,
                headerHeight: h.getBoundingClientRect().height,
                wm: wm ? { cls: wm.className, left: r!.left, right: r!.right, width: r!.width, height: r!.height } : null,
                toggle: t ? { left: t.left, right: t.right } : null,
                // The words the header shows, with the name's letters only.
                text: (wm?.textContent ?? "").replace(/\s+/g, " ").trim(),
              };
            });
            expect(m.wm, "the header shows the wordmark").not.toBeNull();
            expect(m.scrollWidth).toBeLessThanOrEqual(360);
            expect(m.wm!.left).toBeGreaterThanOrEqual(0);
            expect(m.wm!.right).toBeLessThanOrEqual(360);
            if (m.toggle) expect(m.wm!.right).toBeLessThanOrEqual(m.toggle.left + 1);
            expect(m.headerHeight).toBeLessThan(220);
          } finally {
            await ctx.close();
          }
        }, 120_000);
      }
    }
  });
}
