// @module-tag slow
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { serveStatic, type StaticServer } from "@sb/engine";
import { migrateSpec, type SiteSpec } from "@sb/spec";
import { WIDTHS, openPage, repoRoot } from "../src/compose-sheet.ts";
import { renderToDir } from "../src/lib/render-dir.ts";

/**
 * Content-aware sections from the 50-page outside review: a section with little in it doesn't leave a half-empty
 * desktop band. Held at 1280 px (and 360 px for overflow) on the review's own saved specs: a lone place beside a
 * service area's head ("Gorenjska"), a lone link at a band's far edge ("Pišite nam"), an apartment card stretched to
 * its photo neighbour's height ("Apartma za 4 osebe"). Boxes measured, no model call.
 */
let browser: Browser;
let dir: string;
let server: StaticServer;
beforeAll(async () => {
  browser = await chromium.launch();
  dir = await mkdtemp(path.join(tmpdir(), "sb-review50-layout-"));
  server = await serveStatic(dir);
}, 60_000);
afterAll(async () => {
  await browser?.close();
  await server?.close();
  await rm(dir, { recursive: true, force: true });
});

const REVIEW = path.join(repoRoot, "eval/outside-review/review50-specs");
const reviewSpec = async (business: string, which: "generated" | "regenerated"): Promise<SiteSpec> =>
  migrateSpec(JSON.parse(await readFile(path.join(REVIEW, business, `spec-${which}.json`), "utf8")));

let n = 0;
async function open(spec: SiteSpec, w: (typeof WIDTHS)[number]) {
  const s = structuredClone(spec);
  s.slug = `${s.slug}-${++n}`;
  await renderToDir(s, dir);
  return openPage(browser, w, `${server.url}/${s.slug}/index.html`);
}

const shot = async (page: Page, name: string, w: number, selector: string) => {
  if (process.env.SB_SHOTS) await page.locator(selector).first().screenshot({ path: path.join(process.env.SB_SHOTS, `review50-${name}-${w}.png`) });
};

type Box = { left: number; right: number; top: number; bottom: number; width: number; height: number };
const box = (page: Page, selector: string): Promise<Box> =>
  page.evaluate((sel) => {
    const r = document.querySelector(sel)!.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
  }, selector);

const DESK = WIDTHS[0];
const PHONE = WIDTHS[1];

describe("review 50: content-aware sections", () => {
  it("a service area with one place is one narrow column: the place under the head, not alone beside it (avtoservis-mrak)", async () => {
    const spec = await reviewSpec("avtoservis-mrak", "generated");
    expect(spec.business.serviceArea).toEqual(["Gorenjska"]);
    const { page, ctx } = await open(spec, DESK);
    try {
      await shot(page, "area", DESK.width, "#s_area");
      const head = await box(page, "#s_area .section-head");
      const list = await box(page, "#s_area .area__list");
      const container = await box(page, "#s_area .container");
      expect(list.top, "the place sits below the head").toBeGreaterThanOrEqual(head.bottom - 1);
      expect(Math.abs(list.left - head.left), "the place starts at the head's left edge").toBeLessThan(2);
      // No empty half: nothing of the section reaches past the middle of the container except a full-width head.
      expect(list.right, "the list stays in the narrow column").toBeLessThanOrEqual(container.left + container.width * 0.6);
    } finally {
      await ctx.close();
    }
  }, 120_000);

  it("a band's lone link sits under its text, not at the band's far edge (gostilna-zlata-zlica)", async () => {
    const spec = await reviewSpec("gostilna-zlata-zlica", "generated");
    expect(spec.design.skeleton?.buttons).toBe("underline");
    const { page, ctx } = await open(spec, DESK);
    try {
      await shot(page, "cta", DESK.width, "#s_cta");
      const text = await box(page, "#s_cta .cta__text");
      const actions = await box(page, "#s_cta .actions");
      const link = await box(page, "#s_cta .actions a");
      expect(actions.top, "the link sits below the text").toBeGreaterThanOrEqual(text.bottom - 1);
      expect(Math.abs(link.left - text.left), "the link starts at the text's left edge").toBeLessThan(2);
    } finally {
      await ctx.close();
    }
  }, 120_000);

  it("a band's buttons keep their place beside the text (the same page with soft buttons)", async () => {
    const spec = await reviewSpec("gostilna-zlata-zlica", "generated");
    spec.design.skeleton = { ...spec.design.skeleton!, buttons: "soft" };
    const { page, ctx } = await open(spec, DESK);
    try {
      const text = await box(page, "#s_cta .cta__text");
      const actions = await box(page, "#s_cta .actions");
      expect(actions.left, "buttons beside the text").toBeGreaterThan(text.right);
    } finally {
      await ctx.close();
    }
  }, 120_000);

  it("a room card without a photo keeps its own height beside one with a photo (kmetija-grabnar)", async () => {
    const spec = await reviewSpec("kmetija-grabnar", "regenerated");
    const { page, ctx } = await open(spec, DESK);
    try {
      await shot(page, "rooms", DESK.width, "#s_rooms");
      const photo = await box(page, "#s_rooms .room:not(.room--text)");
      const text = await box(page, "#s_rooms .room--text");
      const body = await box(page, "#s_rooms .room--text .room__body > :last-child");
      expect(text.top, "side by side").toBeCloseTo(photo.top, 0);
      // The card ends at its content (the body's padding below the last line), not at its neighbour's bottom.
      expect(text.bottom - body.bottom, "empty space under the text card's content").toBeLessThan(48);
      expect(text.height).toBeLessThan(photo.height * 0.7);
    } finally {
      await ctx.close();
    }
  }, 120_000);

  it("the same sections fit a phone", async () => {
    for (const [business, which] of [
      ["avtoservis-mrak", "generated"],
      ["gostilna-zlata-zlica", "generated"],
      ["kmetija-grabnar", "regenerated"],
    ] as const) {
      const { page, ctx } = await open(await reviewSpec(business, which), PHONE);
      try {
        expect(await page.evaluate(() => document.documentElement.scrollWidth), business).toBe(PHONE.width);
      } finally {
        await ctx.close();
      }
    }
  }, 120_000);
});
