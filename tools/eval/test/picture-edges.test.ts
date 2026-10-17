// @module-tag slow
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, type Browser } from "playwright";
import { serveStatic, type StaticServer } from "@sb/engine";
import { openPage } from "../src/compose-sheet.ts";
import { renderToDir } from "../src/lib/render-dir.ts";
import { IMAGERIES, everyPhotoSection, freshPage, picturesPastEdge, savedPages, type ShapePage } from "./picture-shapes.ts";

/**
 * No picture runs off a phone's edge (review 50 and fresh 10: "the arched photo is cut off at the right edge" on
 * frizerstvo-lana's mirrors, zobozdravstvo-lebar's team arch, cvetlicarna-marjetica's and sirarna-pr-simnu's label
 * hero). At 360 px every picture box (a `.media` or an `img` in main) lies inside the viewport and inside every
 * ancestor that clips its overflow sideways: the four reviewed pages, plesna-sola-takt and every photo section the
 * saved specs use in every imagery treatment. No model call.
 *
 * Measured 2026-10-17 on every golden and Review 50 page too: no picture box ran past 360 px. What the reviewers saw is
 * an arch set against the right content edge (16 px in), whose bottom the first screen and the phone bar cut off.
 */
let browser: Browser;
let dir: string;
let server: StaticServer;
beforeAll(async () => {
  browser = await chromium.launch();
  dir = await mkdtemp(path.join(tmpdir(), "sb-picture-edges-"));
  server = await serveStatic(dir);
}, 60_000);
afterAll(async () => {
  await browser?.close();
  await server?.close();
  await rm(dir, { recursive: true, force: true });
});

const PHONE = { width: 360, height: 800 };

async function cutAt360(pages: ShapePage[]): Promise<{ pictures: number; cut: string[] }> {
  let pictures = 0;
  const cut: string[] = [];
  for (const p of pages) {
    await renderToDir(p.spec, dir);
    const { page, ctx } = await openPage(browser, PHONE, `${server.url}/${p.spec.slug}/index.html`);
    try {
      pictures += await page.evaluate(() => document.querySelectorAll("main .media").length);
      cut.push(...(await picturesPastEdge(page)).map((c) => `${p.name}: ${c}`));
    } finally {
      await ctx.close();
      await rm(path.join(dir, p.spec.slug), { recursive: true, force: true });
    }
  }
  return { pictures, cut };
}

describe("pictures stay inside a 360 px phone", () => {
  it("the reviewed pages: frizerstvo-lana, zobozdravstvo-lebar, cvetlicarna-marjetica, sirarna-pr-simnu", async () => {
    const named = ["review50 frizerstvo-lana", "review50 zobozdravstvo-lebar", "review50 cvetlicarna-marjetica"];
    const pages = [...savedPages({ labelled: false }).filter((p) => named.includes(p.name)), freshPage("sirarna-pr-simnu")];
    expect(pages).toHaveLength(4);
    const { pictures, cut } = await cutAt360(pages);
    expect(pictures).toBeGreaterThanOrEqual(12);
    expect(cut).toEqual([]);
  }, 240_000);

  it("plesna-sola-takt and every photo section in every imagery treatment", async () => {
    const pages = [freshPage("plesna-sola-takt"), ...IMAGERIES.flatMap((i) => everyPhotoSection(i, { labelled: false }))];
    const { cut } = await cutAt360(pages);
    expect(cut).toEqual([]);
  }, 900_000);
});
