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

/**
 * The "Ustvarjeno z UI" label of a generated picture (EU AI Act Art. 50) is never cut by the picture's shape (review
 * 50: clipped on cvetlicarna-marjetica's round inset and round photo). For every labelled picture on the page, each
 * corner of the label's box (inset 1 px) hit-tests to the picture itself, at 1280 and 360 px: a corner the shape
 * clips (border-radius with overflow hidden, clip-path) hits what lies behind instead. The review's own page, then
 * every composed mask at a small and a wide span. No model call.
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

/** Labels whose box isn't wholly on the visible picture: where, and which corners fall off it. */
async function clippedLabels(page: Page): Promise<string[]> {
  const count = await page.evaluate(() => document.querySelectorAll(".media--ai").length);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const res = await page.evaluate((idx) => {
      const pic = document.querySelectorAll<HTMLElement>(".media--ai")[idx]!;
      pic.scrollIntoView({ block: "center", inline: "center" });
      const where = `${pic.closest("section")?.id ?? "?"} ${pic.parentElement?.className ?? ""} > ${pic.className}`;
      const cs = getComputedStyle(pic, "::after");
      if (cs.content === "none" || cs.display === "none") return { where, bad: ["no label"] };
      const r = pic.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return { where, bad: [] };
      // The label's box from its used position and size (absolutely positioned against the picture's padding box).
      const w = parseFloat(cs.width);
      const h = parseFloat(cs.height);
      const bl = parseFloat(getComputedStyle(pic).borderLeftWidth) || 0;
      const bt = parseFloat(getComputedStyle(pic).borderTopWidth) || 0;
      const padW = pic.clientWidth;
      const padH = pic.clientHeight;
      const left = cs.left !== "auto" ? parseFloat(cs.left) : padW - parseFloat(cs.right) - w;
      const top = cs.top !== "auto" ? parseFloat(cs.top) : padH - parseFloat(cs.bottom) - h;
      const [tx = "0", ty = "0"] = cs.translate === "none" ? [] : cs.translate.split(/\s+/);
      const shift = (v: string, size: number) => (v.endsWith("%") ? (parseFloat(v) / 100) * size : parseFloat(v));
      const x0 = r.left + bl + left + shift(tx, w);
      const y0 = r.top + bt + top + shift(ty, h);
      const corners: [string, number, number][] = [
        ["top left", x0 + 1, y0 + 1],
        ["top right", x0 + w - 1, y0 + 1],
        ["bottom left", x0 + 1, y0 + h - 1],
        ["bottom right", x0 + w - 1, y0 + h - 1],
      ];
      const bad = corners
        .filter(([, x, y]) => {
          const hit = document.elementFromPoint(x, y);
          return !hit || !(hit === pic || pic.contains(hit));
        })
        .map(([c, x, y]) => `${c} (${Math.round(x)}, ${Math.round(y)}) hits ${document.elementFromPoint(x, y)?.className || document.elementFromPoint(x, y)?.tagName}`);
      return { where, bad };
    }, i);
    if (res.bad.length) out.push(`${res.where}: ${res.bad.join("; ")}`);
  }
  return out;
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
