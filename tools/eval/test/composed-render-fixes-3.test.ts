// @module-tag slow
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { serveStatic, type StaticServer } from "@sb/engine";
import { ComposedProps, type Section } from "@sb/spec";
import { COMPOSED, WIDTHS, loadComposed, openPage, writeComposedSite, checkPage } from "../src/compose-sheet.ts";

/**
 * Five composition-language gaps found making presets (HQ it-studio-lang-gaps-i3b), each held in a browser at 1280 and
 * 360 px: fact objects and display numerals grow with `size` like headings do, a photo strip is named by the section's
 * heading, elements on a colour block keep their inner padding on phones (decor height: HQ it-studio-css-budget). No model call.
 */
let browser: Browser;
let dir: string;
let server: StaticServer;
beforeAll(async () => {
  browser = await chromium.launch();
  dir = await mkdtemp(path.join(tmpdir(), "sb-composed-fixes3-"));
  server = await serveStatic(dir);
}, 60_000);
afterAll(async () => {
  await browser?.close();
  await server?.close();
  await rm(dir, { recursive: true, force: true });
});

const T = COMPOSED[0]!;
type W = (typeof WIDTHS)[number];

async function open(sections: Section[], w: W) {
  const spec = await loadComposed(T);
  spec.pages.find((p) => p.kind === "home")!.sections = sections;
  const file = await writeComposedSite(T, spec, dir);
  return openPage(browser, w, `${server.url}/${file}`);
}

const shot = async (page: Page, name: string, w: number) => {
  if (process.env.SB_SHOTS) await page.screenshot({ path: path.join(process.env.SB_SHOTS, `${name}-${w}.png`), fullPage: true });
};

function composed(id: string, rows: number, elements: unknown[], extra: Record<string, unknown> = {}): Section {
  return { id, type: "composed", variant: "free", props: ComposedProps.parse({ intent: "story", width: "contained", rows, elements, ...extra }) } as Section;
}

const fact = (id: string, treatment: string, value: string, size: number, span = 12) => ({
  id: `e_${id}`,
  kind: "fact",
  treatment,
  value,
  label: "Odprto vsak dan",
  size,
  desk: { col: 1, span, row: 1 },
  phone: { order: 0, span: "full" },
});

const OBJECTS = ["plate", "seal", "ticket", "tag", "stamp"] as const;

describe("composed language gaps, round 3", () => {
  it("fact objects grow with size like headings: size 8 is a wall-sized object and still fits a phone", async () => {
    for (const w of WIDTHS) {
      for (const t of OBJECTS) {
        const heights: Record<number, number> = {};
        for (const size of [4, 8]) {
          const { page, ctx } = await open([composed("s_f", 1, [fact("f", t, t === "plate" ? "KR 12-345" : "1987", size)])], w);
          try {
            if (size === 8) await shot(page, `fact-${t}`, w.width);
            const m = await page.evaluate(() => {
              const obj = document.querySelector<HTMLElement>("#s_f .cx-fact__obj")!;
              const r = obj.getBoundingClientRect();
              const container = document.querySelector("#s_f .cx")!.getBoundingClientRect();
              return { width: r.width, height: r.height, container: container.width, scroll: document.documentElement.scrollWidth, vw: innerWidth };
            });
            heights[size] = m.height;
            expect(m.scroll, `${t} ${size} at ${w.width} px scrolls sideways`).toBeLessThanOrEqual(m.vw);
            if (size === 8 && t === "plate") expect(m.width / m.container, `plate at size 8 at ${w.width} px is wide`).toBeGreaterThanOrEqual(w.width >= 1280 ? 0.4 : 0.7);
          } finally {
            await ctx.close();
          }
        }
        // Size 8 is clearly bigger than size 4 (about 2x on desktop; on a phone the cell caps it, so a smaller factor).
        expect(heights[8]! / heights[4]!, `${t} at ${w.width} px: size 8 over size 4 (height)`).toBeGreaterThanOrEqual(w.width >= 1280 ? 1.6 : 1.1);
      }
    }
  }, 240_000);

  it("a display numeral follows the display ramp and shrinks to fit a phone", async () => {
    const cases = [
      { value: "1987", min: { 1280: 160, 360: 100 } },
      { value: "041 123 456", min: { 1280: 80, 360: 40 } },
    ];
    for (const c of cases) {
      for (const w of WIDTHS) {
        const { page, ctx } = await open([composed("s_n", 1, [fact("n", "numeral", c.value, 8)])], w);
        try {
          await shot(page, `numeral-${c.value.length}`, w.width);
          const m = await page.evaluate(() => {
            const v = document.querySelector<HTMLElement>("#s_n .cx-fact__value")!;
            const box = document.querySelector("#s_n .cx")!.getBoundingClientRect();
            return { fs: parseFloat(getComputedStyle(v).fontSize), right: v.getBoundingClientRect().right, boxRight: box.right, scroll: document.documentElement.scrollWidth, vw: innerWidth };
          });
          expect(m.fs, `"${c.value}" at ${w.width} px font-size`).toBeGreaterThanOrEqual(c.min[w.width as 1280 | 360]);
          expect(m.scroll, `"${c.value}" at ${w.width} px scrolls sideways`).toBeLessThanOrEqual(m.vw);
          expect(m.right, `"${c.value}" at ${w.width} px runs past the content`).toBeLessThanOrEqual(m.boxRight + 1);
        } finally {
          await ctx.close();
        }
      }
    }
  }, 240_000);

  it("a photo strip is named by the section heading when there is one, else Fotografije", async () => {
    const strip = { id: "e_p", kind: "photos", images: ["img_01", "img_02", "img_03"], arrangement: "strip", desk: { col: 1, span: 12, row: 2 }, phone: { order: 1, span: "full" } };
    const heading = { id: "e_h", kind: "heading", text: "Fotografije", level: 2, size: 3, desk: { col: 1, span: 12, row: 1 }, phone: { order: 0, span: "full" } };
    for (const w of WIDTHS) {
      const withHeading = await open([composed("s_p", 2, [heading, strip])], w);
      try {
        const m = await withHeading.page.evaluate(() => {
          const row = document.querySelector<HTMLElement>("#s_p .cx-ph__row")!;
          const h = document.querySelector("#s_p h2")!;
          return { by: row.getAttribute("aria-labelledby"), label: row.getAttribute("aria-label"), hid: h.id, tab: row.tabIndex };
        });
        expect(m.hid).not.toBe("");
        expect(m.by, `${w.width} px`).toBe(m.hid);
        expect(m.label).toBeNull();
        expect(m.tab).toBe(0);
        expect((await checkPage(withHeading.page)).axe.filter((a) => a.startsWith("landmark-unique")), `${w.width} px`).toEqual([]);
      } finally {
        await withHeading.ctx.close();
      }
      const without = await open([composed("s_q", 1, [{ ...strip, desk: { col: 1, span: 12, row: 1 }, phone: { order: 0, span: "full" } }])], w);
      try {
        const label = await without.page.evaluate(() => document.querySelector("#s_q .cx-ph__row")!.getAttribute("aria-label"));
        expect(label).toBe("Fotografije");
      } finally {
        await without.ctx.close();
      }
    }
  }, 120_000);


  it("a colour block keeps its inner padding on phones and does not touch the next element", async () => {
    const el = (id: string, kind: string, row: number, order: number, col: number, span: number, extra: object) => ({ id, kind, desk: { col, span, row }, phone: { order, span: "full" }, ...extra });
    const s = composed(
      "s_c",
      3,
      [
        el("e_a", "heading", 1, 0, 1, 12, { text: "Zgoraj", level: 2, size: 3 }),
        el("e_b", "heading", 2, 1, 3, 8, { text: "Na ploskvi", level: 2, size: 3 }),
        el("e_c", "text", 3, 2, 1, 12, { paragraphs: ["Spodaj brez ploskve."] }),
      ],
      { background: [{ kind: "field", role: "inverse", cols: { from: 3, to: 10 }, rows: { from: 2, to: 2 } }] },
    );
    for (const w of WIDTHS) {
      const { page, ctx } = await open([s], w);
      try {
        await shot(page, "pad", w.width);
        const g = await page.evaluate(() => {
          const text = (e: Element) => {
            const r = document.createRange();
            r.selectNodeContents(e);
            return r.getBoundingClientRect();
          };
          const f = [...document.querySelectorAll<HTMLElement>("#s_c .cx-field")].find((x) => getComputedStyle(x).display !== "none")!.getBoundingClientRect();
          const on = text(document.querySelector("#s_c .cx-on .cx-el")!);
          const above = text(document.querySelector("#s_c .cx-el--heading")!);
          const below = text(document.querySelector("#s_c .cx-el--text")!);
          return { top: on.top - f.top, bottom: f.bottom - on.bottom, left: on.left - Math.max(f.left, 0), right: Math.min(f.right, innerWidth) - on.right, clearAbove: f.top - above.bottom, clearBelow: below.top - f.bottom };
        });
        const msg = `${w.width} px: ${JSON.stringify(g)}`;
        for (const side of ["top", "bottom", "left"] as const) expect(g[side], `${side}, ${msg}`).toBeGreaterThanOrEqual(12);
        expect(g.clearAbove, `above, ${msg}`).toBeGreaterThanOrEqual(8);
        expect(g.clearBelow, `below, ${msg}`).toBeGreaterThanOrEqual(8);
      } finally {
        await ctx.close();
      }
    }
  }, 120_000);

  it("a tall thin decor drawing does not make its section very tall", async () => {
    const tall = { id: "e_d", kind: "decor", svg: { width: 40, height: 400, paths: [{ d: "M20 0 L20 400", fill: "none", stroke: "primary", width: 2 }] }, desk: { col: 1, span: 4, row: 1 }, phone: { order: 1, span: "full" } };
    const head = { id: "e_h", kind: "heading", text: "Naša zgodba", level: 2, size: 3, desk: { col: 5, span: 8, row: 1 }, phone: { order: 0, span: "full" } };
    for (const w of WIDTHS) {
      const { page, ctx } = await open([composed("s_t", 1, [head, tall])], w);
      try {
        await shot(page, "decor", w.width);
        const m = await page.evaluate(() => {
          const d = document.querySelector("#s_t .cx-decor")!.getBoundingClientRect();
          return { h: d.height, vh: innerHeight };
        });
        expect(m.h, `${w.width} px decor height`).toBeLessThanOrEqual(m.vh * (w.width >= 1280 ? 0.6 : 0.4) + 1);
        expect((await checkPage(page)).horizontalScroll).toBe(false);
      } finally {
        await ctx.close();
      }
    }
  }, 120_000);
});
