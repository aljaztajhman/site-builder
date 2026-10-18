// @module-tag slow
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { serveStatic, type StaticServer } from "@sb/engine";
import { ComposedProps, MASKS, migrateSpec, type Section, type SiteSpec } from "@sb/spec";
import { COMPOSED, WIDTHS, loadComposed, openPage, repoRoot, writeComposedSite } from "../src/compose-sheet.ts";
import { renderToDir } from "../src/lib/render-dir.ts";
import { IMAGERIES, clippedLabels, everyPhotoSection, freshPage, savedPages, type ShapePage } from "./picture-shapes.ts";

/**
 * The "Ustvarjeno z UI" label of a generated picture (EU AI Act Art. 50) is never cut by the picture's shape nor
 * covered (review 50: clipped on cvetlicarna-marjetica's round inset and round photo; fresh 10: clipped by the arched
 * photos of plesna-sola-takt). For every labelled picture on the page, each corner of the label's box hit-tests to the
 * picture, at 1280 and 360 px (picture-shapes.ts clippedLabels). The review's own pages, every composed mask at a small
 * and a wide span, every photo section in every imagery treatment, and every saved page that shows a new combination
 * of direction, imagery, header and labelled section. No model call.
 */
let browser: Browser;
let dir: string;
let server: StaticServer;
beforeAll(async () => {
  browser = await chromium.launch();
  dir = await mkdtemp(path.join(tmpdir(), "sb-review50-labels-"));
  server = await serveStatic(dir);
}, 60_000);
afterAll(async () => {
  await browser?.close();
  await server?.close();
  await rm(dir, { recursive: true, force: true });
});

const shot = async (page: Page, name: string, w: number) => {
  if (process.env.SB_SHOTS) await page.screenshot({ path: path.join(process.env.SB_SHOTS, `review50-${name}-${w}.png`), fullPage: true });
};

/** Renders each page and lists its clipped labels at both widths ("page @width: where: corners"). */
async function labelsOf(pages: ShapePage[]): Promise<{ labels: number; clipped: string[] }> {
  let labels = 0;
  const clipped: string[] = [];
  for (const p of pages) {
    await renderToDir(p.spec, dir);
    for (const w of WIDTHS) {
      const { page, ctx } = await openPage(browser, w, `${server.url}/${p.spec.slug}/index.html`);
      try {
        await shot(page, p.spec.slug, w.width);
        labels += await page.evaluate(() => document.querySelectorAll(".media--ai").length);
        clipped.push(...(await clippedLabels(page)).map((c) => `${p.name} @${w.width}: ${c}`));
      } finally {
        await ctx.close();
      }
    }
    await rm(path.join(dir, p.spec.slug), { recursive: true, force: true });
  }
  return { labels, clipped };
}

/** The labelled section kinds of a page: its direction, imagery and header with each section that has a labelled picture. */
function combos(spec: SiteSpec): string[] {
  const generated = new Set(spec.assets.images.filter((i) => i.origin === "generated").map((i) => i.id));
  const look = `${spec.design.direction}|${spec.design.imagery}|${spec.design.skeleton?.header ?? spec.chrome.header.variant}`;
  return spec.pages
    .flatMap((p) => p.sections)
    .filter((s) => [...JSON.stringify(s.props).matchAll(/"(img_\w+)"/g)].some((m) => generated.has(m[1]!)))
    .map((s) => `${look}|${s.type}:${s.variant}`);
}

describe("review 50: AI labels inside the picture's shape", () => {
  it("cvetlicarna-marjetica: the round inset and the round photo show the whole label", async () => {
    const spec = migrateSpec(JSON.parse(await readFile(path.join(repoRoot, "eval/outside-review/review50-specs/cvetlicarna-marjetica/spec-generated.json"), "utf8"))) as SiteSpec;
    spec.slug = "cvet-labels";
    await renderToDir(spec, dir);
    for (const w of WIDTHS) {
      const { page, ctx } = await openPage(browser, w, `${server.url}/${spec.slug}/index.html`);
      try {
        await shot(page, "labels-cvet", w.width);
        expect(await page.evaluate(() => document.querySelectorAll(".disc .media--ai, .media--ai.disc").length), "round pictures on the page").toBeGreaterThanOrEqual(2);
        expect(await clippedLabels(page), `${w.width} px`).toEqual([]);
      } finally {
        await ctx.close();
      }
    }
  }, 120_000);

  it("every composed mask shows the whole label, at a small and a wide span", async () => {
    const T = COMPOSED[0]!;
    const spec = await loadComposed(T);
    for (const img of spec.assets.images) img.origin = "generated";
    const image = spec.assets.images[0]!.id;
    const masks = MASKS.filter((m) => m !== "none");
    const sections = masks.map(
      (mask, i) =>
        ({
          id: `s_m${i}`,
          type: "composed",
          variant: "free",
          props: ComposedProps.parse({
            intent: "story",
            width: "contained",
            rows: 1,
            elements: [
              { id: "e_s", kind: "image", image, ratio: "1:1", mask, desk: { col: 1, span: 3, row: 1 }, phone: { order: 0, span: "full" } },
              { id: "e_w", kind: "image", image, ratio: "4:3", mask, desk: { col: 5, span: 8, row: 1 }, phone: { order: 1, span: "full" } },
            ],
          }),
        }) as Section,
    );
    spec.pages.find((p) => p.kind === "home")!.sections = sections as never;
    const file = await writeComposedSite(T, spec, dir);
    for (const w of WIDTHS) {
      const { page, ctx } = await openPage(browser, w, `${server.url}/${file}`);
      try {
        await shot(page, "labels-masks", w.width);
        expect(await page.evaluate(() => document.querySelectorAll(".media--ai").length)).toBe(masks.length * 2);
        expect(await clippedLabels(page), `${w.width} px`).toEqual([]);
      } finally {
        await ctx.close();
      }
    }
  }, 240_000);
});

describe("fresh 10 and every shape: AI labels inside the picture's shape", () => {
  it("plesna-sola-takt and sirarna-pr-simnu (arched photos, an arch hero with a round inset) show every label whole", async () => {
    const { labels, clipped } = await labelsOf([freshPage("plesna-sola-takt"), freshPage("sirarna-pr-simnu")]);
    expect(labels, "labelled pictures, both widths").toBeGreaterThanOrEqual(8);
    expect(clipped).toEqual([]);
  }, 180_000);

  it("every photo section a generated picture may be in, in every imagery treatment", async () => {
    const pages = IMAGERIES.flatMap((imagery) => everyPhotoSection(imagery, { labelled: true }));
    expect(new Set(pages.map((p) => p.spec.design.imagery))).toEqual(new Set(IMAGERIES));
    const natural = pages.filter((p) => p.spec.design.imagery === "natural");
    const kinds = new Set(natural.flatMap((p) => p.spec.pages.find((x) => x.kind === "home")!.sections.map((s) => s.type)));
    expect([...kinds].sort(), (pages[0]!.dropped ?? []).join("\n")).toEqual(["hero-image", "hero-signature", "hero-split", "image-text", "page-header"]);
    const { clipped } = await labelsOf(pages);
    expect(clipped).toEqual([]);
  }, 600_000);

  it("every saved page (goldens, Review 50) that adds a combination of look, header and labelled section", async () => {
    const seen = new Set<string>();
    const pages = savedPages({ labelled: true }).filter((p) => {
      const fresh = combos(p.spec).filter((c) => !seen.has(c));
      for (const c of fresh) seen.add(c);
      return fresh.length > 0;
    });
    expect(pages.length, "pages with a labelled picture in a new combination").toBeGreaterThanOrEqual(15);
    const { clipped } = await labelsOf(pages);
    expect(clipped).toEqual([]);
  }, 900_000);
});
