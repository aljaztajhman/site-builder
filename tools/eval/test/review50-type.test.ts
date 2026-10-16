// @module-tag slow
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { serveStatic, type StaticServer } from "@sb/engine";
import { migrateSpec, type Section, type SiteSpec } from "@sb/spec";
import { WIDTHS, openPage, repoRoot } from "../src/compose-sheet.ts";
import { renderToDir } from "../src/lib/render-dir.ts";

/**
 * Type faults from the 50-page outside review (eval/outside-review/review50-three/report.md), held in Chromium at 1280
 * and 360 px on the review's own saved specs (eval/outside-review/review50-specs) and on made-up text: no automatic
 * hyphenation (Chromium's Slovene patterns gave "Polnoz-rnate", "Gre-gor"); carons of Č Š Ž in capitals clear the
 * line above ("HITRO / POŠTENO"); a founding year's numeral clears its label ("Kuhamo od leta / 1968"); a long word in
 * a heading fits the phone whole ("ELEKTROINŠTALACIJE" made a 360 px page 434 px wide). No model call.
 */
let browser: Browser;
let dir: string;
let server: StaticServer;
beforeAll(async () => {
  browser = await chromium.launch();
  dir = await mkdtemp(path.join(tmpdir(), "sb-review50-type-"));
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
/** Renders the spec (its homepage's sections replaced when given) under a fresh slug and opens the homepage. */
async function open(spec: SiteSpec, w: (typeof WIDTHS)[number], sections?: Section[]) {
  const s = structuredClone(spec);
  s.slug = `${s.slug}-${++n}`;
  if (sections) s.pages.find((p) => p.kind === "home")!.sections = sections as never;
  await renderToDir(s, dir);
  return openPage(browser, w, `${server.url}/${s.slug}/index.html`);
}

const shot = async (page: Page, name: string, w: number, selector?: string) => {
  if (!process.env.SB_SHOTS) return;
  const file = path.join(process.env.SB_SHOTS, `review50-${name}-${w}.png`);
  if (selector) await page.locator(selector).first().screenshot({ path: file });
  else await page.screenshot({ path: file, fullPage: true });
};

/**
 * The ink of each line of an element's text: the line's baseline from its inline box (Range rects are the font's
 * content area, top = baseline - font ascent) and the glyphs' ink above and below it from canvas TextMetrics in the
 * element's own computed font, so a caron above a capital counts. Lines in reading order.
 */
async function inkLines(page: Page, selector: string): Promise<{ text: string; inkTop: number; inkBottom: number; baseline: number; size: number }[]> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel)!;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const canvas = document.createElement("canvas").getContext("2d")!;
    const lines: { text: string; inkTop: number; inkBottom: number; baseline: number; size: number }[] = [];
    for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
      const host = node.parentElement!;
      const cs = getComputedStyle(host);
      canvas.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const upper = cs.textTransform === "uppercase";
      const range = document.createRange();
      for (let i = 0; i < node.length; i++) {
        const ch = node.data[i]!;
        if (/\s/.test(ch)) continue;
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        const r = range.getClientRects()[0];
        if (!r) continue;
        const glyph = upper ? ch.toUpperCase() : ch;
        const m = canvas.measureText(glyph);
        const baseline = r.top + m.fontBoundingBoxAscent;
        let line = lines.find((l) => Math.abs(l.baseline - baseline) < 2);
        if (!line) {
          line = { text: "", inkTop: Infinity, inkBottom: -Infinity, baseline, size: parseFloat(cs.fontSize) };
          lines.push(line);
        }
        line.text += glyph;
        line.inkTop = Math.min(line.inkTop, baseline - m.actualBoundingBoxAscent);
        line.inkBottom = Math.max(line.inkBottom, baseline + m.actualBoundingBoxDescent);
      }
    }
    return lines.sort((a, b) => a.baseline - b.baseline);
  }, selector);
}

describe("review 50: type", () => {
  it("nothing on the page hyphenates automatically: names, prices and text break between words", async () => {
    const spec = await reviewSpec("pekarna-kvas", "regenerated");
    const sections = [
      { id: "s_text", type: "text", variant: "narrow", props: { heading: "Polnozrnate žemlje", paragraphs: ["Ob ponedeljkih in torkih samo za zaključene družbe. Rezervacija je obvezna, parkirišče je za hišo, za lastne goste."] } },
      { id: "s_team", type: "team", variant: "grid", props: { title: "Kdo vas sprejme", members: [{ name: "Gregor Kovač", role: "fizioterapevtka in vodja" }, { name: "Polnozrnate Žemlje", role: "Strokovne listine" }] } },
      { id: "s_menu", type: "menu", variant: "classic", props: { title: "Kaj pečemo", categories: [{ name: "Kruh", dishes: [{ name: "Polnozrnate žemlje", price: { amount: 0.9 }, description: "Pečemo vsak dan." }] }] } },
    ] as unknown as Section[];
    for (const w of WIDTHS) {
      const { page, ctx } = await open(spec, w, sections);
      try {
        await shot(page, "hyphens", w.width);
        const auto = await page.evaluate(() =>
          [...document.querySelectorAll("body, body *")].filter((el) => getComputedStyle(el).hyphens === "auto").map((el) => `${el.tagName.toLowerCase()}.${el.className}`),
        );
        expect(auto, `${w.width} px: elements with hyphens: auto`).toEqual([]);
        // Layout: no word of these is split over two lines (one line box per word).
        const split = await page.evaluate((words) => {
          const out: string[] = [];
          const walker = document.createTreeWalker(document.querySelector("main")!, NodeFilter.SHOW_TEXT);
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            for (const m of (node.textContent ?? "").matchAll(/\S+/g)) {
              if (!words.some((w) => m[0].includes(w))) continue;
              const r = document.createRange();
              r.setStart(node, m.index);
              r.setEnd(node, m.index + m[0].length);
              if (new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size > 1) out.push(m[0]);
            }
          }
          return out;
        }, ["Gregor", "Polnozrnate", "zaključene", "Rezervacija", "lastne", "fizioterapevtka", "Strokovne"]);
        expect(split, `${w.width} px: words split over lines`).toEqual([]);
      } finally {
        await ctx.close();
      }
    }
  }, 180_000);

  it("carons of capitals clear the line above (vulkanizer-zorman: GUME MENJAMO / HITRO IN / POŠTENO)", async () => {
    const spec = await reviewSpec("vulkanizer-zorman", "generated");
    expect(spec.design.headingCase).toBe("uppercase");
    for (const w of WIDTHS) {
      const { page, ctx } = await open(spec, w);
      try {
        await shot(page, "carons", w.width, "#s_hero");
        const lines = await inkLines(page, "#s_hero h1");
        expect(lines.length, `${w.width} px: lines`).toBeGreaterThan(1);
        expect(lines.some((l) => /[ČŠŽ]/.test(l.text)), `${w.width} px: a line with a caron`).toBe(true);
        for (let i = 1; i < lines.length; i++) {
          const gap = lines[i]!.inkTop - lines[i - 1]!.inkBottom;
          // Clear by at least 3 % of the size: a caron that touches (the review's case) leaves about 0.
          expect(gap, `${w.width} px: "${lines[i - 1]!.text}" / "${lines[i]!.text}" ink gap ${gap.toFixed(1)} px at ${lines[i]!.size} px`).toBeGreaterThanOrEqual(lines[i]!.size * 0.03);
        }
      } finally {
        await ctx.close();
      }
    }
  }, 120_000);

  it("a year's numeral clears its label (Kuhamo od leta / 1968, Delavnica od leta / 1979)", async () => {
    for (const [business, which, id] of [
      ["gostilna-pri-mostu", "generated", "s_about"],
      ["mizarstvo-lesnik", "regenerated", "s_about"],
    ] as const) {
      const spec = await reviewSpec(business, which);
      for (const w of WIDTHS) {
        const { page, ctx } = await open(spec, w);
        try {
          await shot(page, `figure-${business}`, w.width, `#${id}`);
          const label = await inkLines(page, `#${id} .figure__label`);
          const value = await inkLines(page, `#${id} .figure__value`);
          expect(label.length && value.length).toBeTruthy();
          const gap = value[0]!.inkTop - label.at(-1)!.inkBottom;
          // At least a quarter of the label's size between the label's ink and the numeral's (the review's pages overlap).
          expect(gap, `${business} ${w.width} px: label to numeral ${gap.toFixed(1)} px`).toBeGreaterThanOrEqual(label.at(-1)!.size * 0.25);
        } finally {
          await ctx.close();
        }
      }
    }
  }, 180_000);

  it("a heading's long word fits a 360 px phone whole (elektro-zupan: ELEKTROINŠTALACIJE)", async () => {
    const spec = await reviewSpec("elektro-zupan", "regenerated");
    const long = { id: "s_long", type: "text", variant: "narrow", props: { heading: "Elektroinštalacije in strelovodi", paragraphs: ["Delamo v novogradnjah in pri obnovah."] } } as unknown as Section;
    const home = spec.pages.find((p) => p.kind === "home")!;
    const sections = [...home.sections, long] as Section[];
    for (const w of WIDTHS) {
      const { page, ctx } = await open(spec, w, sections);
      try {
        await shot(page, "fit", w.width, "#s_hero");
        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        expect(scrollWidth, `${w.width} px: page width`).toBe(w.width);
        for (const sel of ["#s_hero h1", "#s_long h2"]) {
          const lines = await inkLines(page, sel);
          const word = lines.find((l) => l.text.toUpperCase().includes("ELEKTROINŠTALACIJE"));
          expect(word, `${w.width} px: ${sel} sets ELEKTROINŠTALACIJE on one line (lines: ${lines.map((l) => l.text).join(" / ")})`).toBeDefined();
          const box = await page.evaluate((s) => {
            const r = document.querySelector(s)!.getBoundingClientRect();
            return { left: r.left, right: r.right };
          }, sel);
          expect(box.right, `${w.width} px: ${sel} inside the screen`).toBeLessThanOrEqual(w.width);
        }
      } finally {
        await ctx.close();
      }
    }
  }, 120_000);
  it("a price name keeps its words whole beside a wide price (pekarna-kvas: Polnozrnate žemlje beside [Vnesite ceno], 360 px)", async () => {
    const spec = await reviewSpec("pekarna-kvas", "generated");
    for (const w of WIDTHS) {
      const { page, ctx } = await open(spec, w);
      try {
        await shot(page, "prices", w.width, ".prices");
        const words = await page.evaluate(() =>
          [...document.querySelectorAll(".prices__name")].flatMap((el) => {
            const text = el.textContent ?? "";
            const node = el.firstChild!;
            const out: { word: string; rects: number }[] = [];
            let at = 0;
            for (const word of text.split(" ")) {
              const r = document.createRange();
              r.setStart(node, at);
              r.setEnd(node, at + word.length);
              out.push({ word, rects: new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size });
              at += word.length + 1;
            }
            return out;
          }),
        );
        expect(words.length).toBeGreaterThan(3);
        expect(words.filter((x) => x.rects > 1), `${w.width} px: words split across lines`).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(w.width);
      } finally {
        await ctx.close();
      }
    }
  }, 120_000);
});
