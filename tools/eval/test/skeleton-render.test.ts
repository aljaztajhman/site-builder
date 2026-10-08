import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, type Browser } from "playwright";
import { loadConfig } from "@sb/config";
import { callButtonsPerScreen, checkExportOffline, serveStatic } from "@sb/engine";
import { exportZip, siteFiles } from "@sb/render";
import { BUTTON_STYLES, CARD_STYLES, DIVIDERS, FOOTER_FAMILIES, HEADER_FAMILIES, PHONE_ACTIONS, PHOTO_RATIOS, SECTION_WIDTHS } from "@sb/spec";
import { fixtureMedia } from "../src/families-sheet.ts";
import { SKELETON_GOLDENS, renderSkeleton, skeletonVariants } from "../src/skeleton-sheet.ts";

/**
 * Every skeleton family (spec v15, design.skeleton) renders cleanly at 360 and 1280 px on three goldens, and the plate
 * hero under each phone action: a valid spec, no horizontal scroll, no banned pattern, axe WCAG 2.2 A/AA, one h1, 44 px
 * targets, call and directions in the phone's first screen, and never more than one call button on a screen (the new
 * banned pattern; docs/PRODUCT.md). One browser for all of it. (The contact sheet: pnpm variety:skeleton.)
 */
let browser: Browser;
let dir: string;
beforeAll(async () => {
  browser = await chromium.launch();
  dir = await mkdtemp(path.join(tmpdir(), "sb-skeleton-"));
}, 60_000);
afterAll(async () => {
  await browser?.close();
  await rm(dir, { recursive: true, force: true });
});

describe("skeleton families at 360 and 1280 px", () => {
  it("the sheet shows every value of every axis on every golden", async () => {
    const variants = await skeletonVariants();
    for (const g of SKELETON_GOLDENS) {
      const on = variants.filter((v) => v.site === g).map((v) => v.skeleton);
      expect(new Set(on.map((s) => s.header))).toEqual(new Set(HEADER_FAMILIES));
      expect(new Set(on.map((s) => s.actions))).toEqual(new Set(PHONE_ACTIONS));
      expect(new Set(on.map((s) => s.footer))).toEqual(new Set(FOOTER_FAMILIES));
      for (const [axis, values] of [["width", SECTION_WIDTHS], ["cards", CARD_STYLES], ["buttons", BUTTON_STYLES], ["dividers", DIVIDERS], ["photoRatio", PHOTO_RATIOS]] as const) {
        expect(new Set(on.map((s) => s[axis])), `${g} ${axis}`).toEqual(new Set(values));
      }
      // Alignment per section: looks with one centred section per page and looks without.
      expect(on.some((s) => s.centred?.length) && on.some((s) => !s.centred)).toBe(true);
    }
  });

  // "long-name": names of 24+ characters, with a logo and without, under every phone action (HQ it-skeleton-phone-header-wrap).
  for (const site of [...SKELETON_GOLDENS, "avtoservis-mrak+tablica", "long-name"]) {
    it(`${site}: every look passes the page checks, one call button per screen`, async () => {
      const variants = (await skeletonVariants()).filter((v) => v.site === site);
      for (const [n, v] of variants.entries()) {
        const media = await fixtureMedia(v.fixtureId, v.spec);
        const r = await renderSkeleton(browser, v, media, path.join(dir, `${site}-${n}`));
        for (const c of r.checks) {
          expect(c.problems, `${site} ${v.label} at ${c.width} px`).toEqual([]);
          expect(c.calls).toBeLessThanOrEqual(1);
        }
      }
    }, 480_000);
  }

  it("an export with full-width sections opens styled from file:// (the check read their max-width: none as unstyled)", async () => {
    const [v] = (await skeletonVariants(["avtoservis-mrak"])).filter((x) => x.site === "avtoservis-mrak" && x.skeleton.width === "full");
    expect(v).toBeDefined();
    const media = await fixtureMedia(v!.fixtureId, v!.spec);
    const zip = exportZip(v!.spec, media, { imageWidths: loadConfig().images.widths });
    const r = await checkExportOffline(zip, v!.spec.slug, browser);
    expect(r.problems).toEqual([]);
  }, 120_000);

  it("the check sees two call buttons on one screen (a golden without a skeleton, at 1280 px: the header's and the hero's)", async () => {
    const [v] = (await skeletonVariants(["avtoservis-mrak"])).filter((x) => x.site === "avtoservis-mrak");
    const spec = structuredClone(v!.spec);
    delete spec.design.skeleton;
    const media = await fixtureMedia(v!.fixtureId, spec);
    const out = path.join(dir, "no-skeleton");
    const { mkdir, writeFile } = await import("node:fs/promises");
    for (const [rel, data] of siteFiles(spec, media)) {
      await mkdir(path.dirname(path.join(out, rel)), { recursive: true });
      await writeFile(path.join(out, rel), data);
    }
    const server = await serveStatic(out);
    try {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
      const page = await ctx.newPage();
      await page.goto(`${server.url}/${spec.slug}/index.html`, { waitUntil: "networkidle" });
      const calls = await callButtonsPerScreen(page);
      expect(calls.max).toBe(2);
      expect(calls.buttons.join(" ")).toContain("site-header__cta");
      await ctx.close();
    } finally {
      await server.close();
    }
  }, 120_000);
});
