// @module-tag slow
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ComposedProps, migrateSpec, type Section, type SiteSpec } from "@sb/spec";
import { thirdsPosition } from "../src/groups/composed/layout.ts";
// The eval's renderer (the real site files, stand-in pictures) and static server: read-only, so this package needs no
// browser dependency of its own. Playwright resolves from the eval package, which depends on it.
import { renderToDir } from "../../../tools/eval/src/lib/render-dir.ts";
import { serveStatic, type StaticServer } from "../../../tools/eval/src/lib/static-server.ts";

/**
 * Design 5 Wave P, unit P1 (docs/plans/phase-layout-variety.md "Wave P"): one composed section per renderer gap, rendered
 * as a real site (shared sheet, composed sheets, stand-in pictures) and measured in Chromium at 360 and 1280 px:
 *
 * 1. minHeight tall: the grid is 80 % of the viewport's height on desktop, 55 % on a phone.
 * 2. crop thirds: the image's object-position puts the focal point on the nearest third line of its frame.
 * 3. tile: a 2-column phone mosaic runs to both screen edges at 360, with no seam between tiles or rows.
 * 4. bleedY on an image: it reaches the section's top (and bottom) edge on desktop.
 * 5. shiftX 3: the split headline overlaps the photo's edge by at least 48 px, on a backing panel.
 * 6. the phone photo ribbon scrolls inside itself; the page never scrolls sideways at 360.
 *
 * Screenshots go to $STRUCTURES_SHOTS when it is set (else a temp folder that is removed).
 */
type Rect = { left: number; right: number; top: number; bottom: number; width: number; height: number };
interface PageLike {
  goto(url: string, o?: object): Promise<unknown>;
  evaluate<T, A>(fn: (a: A) => T, arg: A): Promise<T>;
  screenshot(o: object): Promise<unknown>;
}
interface ContextLike {
  newPage(): Promise<PageLike>;
  close(): Promise<void>;
}
interface BrowserLike {
  newContext(o: object): Promise<ContextLike>;
  close(): Promise<void>;
}
const requireEval = createRequire(new URL("../../../tools/eval/package.json", import.meta.url));
const { chromium } = requireEval("playwright") as { chromium: { launch(): Promise<BrowserLike> } };

const here = path.dirname(fileURLToPath(import.meta.url));
const golden = migrateSpec(JSON.parse(readFileSync(path.join(here, "../../../tools/eval/golden/pekarna-kvas.json"), "utf8"))) as SiteSpec;
const FOCAL = { x: 0.62, y: 0.5 };

const h = (id: string, text: string, desk: object, phone: object, more: object = {}) => ({ id, kind: "heading", text, level: 2, size: 4, desk, phone, ...more });
const p = (id: string, desk: object, phone: object) => ({ id, kind: "text", paragraphs: ["Kruh pečemo vsako jutro iz domače moke in drožja."], desk, phone });
const img = (id: string, image: string, ratio: string, desk: object, phone: object, more: object = {}) => ({ id, kind: "image", image, ratio, desk, phone, ...more });
const sec = (id: string, props: object): Section => ({ id, type: "composed", variant: "free", props: ComposedProps.parse({ intent: "story", width: "wide", ...props }) });
const full = (order: number) => ({ order, span: "full" });
const tile = (order: number) => ({ order, span: "tile" });

const SECTIONS = [
  sec("s_tall", { intent: "hero", width: "full", minHeight: "tall", rows: 2, elements: [h("e_h", "Kruh vsak dan", { col: 1, span: 7, row: 1 }, full(0), { level: 1, size: 6 }), p("e_t", { col: 1, span: 6, row: 2 }, full(1))] }),
  sec("s_crop", { rows: 1, elements: [h("e_h", "Peč na drva", { col: 1, span: 5, row: 1 }, full(0)), img("e_i", "img_01", "1:1", { col: 7, span: 6, row: 1 }, full(1), { crop: "thirds" })] }),
  sec("s_mosaic", {
    rows: 2,
    gap: 2,
    elements: [
      h("e_h", "Iz naše peči", { col: 1, span: 6, row: 1 }, tile(0), { fill: "primary", color: "onPrimary" }),
      img("e_a", "img_01", "1:1", { col: 7, span: 6, row: 1, rowSpan: 2 }, tile(1), { mask: "none" }),
      img("e_b", "img_02", "1:1", { col: 1, span: 3, row: 2 }, tile(2)),
      img("e_c", "img_03", "1:1", { col: 4, span: 3, row: 2 }, tile(3)),
    ],
  }),
  sec("s_bleed", {
    rows: 2,
    elements: [
      h("e_h", "Na robu", { col: 1, span: 5, row: 1 }, full(0)),
      img("e_top", "img_02", "fill", { col: 7, span: 6, row: 1, rowSpan: 2, bleedY: "top" }, full(1)),
      img("e_bottom", "img_03", "3:2", { col: 1, span: 5, row: 2, bleedY: "bottom", alignY: "end" }, full(2)),
    ],
  }),
  sec("s_split", {
    rows: 2,
    gap: 1,
    elements: [
      h("e_h", "Testo počiva vso noč", { col: 1, span: 6, row: 1, rowSpan: 2, shiftX: 3, layer: 1, alignY: "center" }, full(0), { size: 6 }),
      img("e_p", "img_01", "fill", { col: 7, span: 6, row: 1, rowSpan: 2, bleedX: "end" }, full(1)),
    ],
  }),
  sec("s_strip", {
    rows: 2,
    elements: [h("e_h", "Naši hlebci", { col: 1, span: 6, row: 1 }, full(0)), { id: "e_s", kind: "photos", images: ["img_01", "img_02", "img_03"], arrangement: "strip", desk: { col: 1, span: 12, row: 2 }, phone: full(1) }],
  }),
];

function spec(): SiteSpec {
  const s = structuredClone(golden);
  s.assets.images = s.assets.images.map((i) => (i.id === "img_01" ? { ...i, focal: FOCAL } : i));
  s.pages[0]!.sections = SECTIONS;
  return s;
}

let browser: BrowserLike;
let server: StaticServer;
let outDir: string;
const shotsDir = process.env.STRUCTURES_SHOTS;

beforeAll(async () => {
  outDir = await mkdtemp(path.join(os.tmpdir(), "sb-structures-"));
  const s = spec();
  await renderToDir(s, outDir);
  server = await serveStatic(outDir);
  browser = await chromium.launch();
}, 120_000);
afterAll(async () => {
  await browser?.close();
  await server?.close();
  if (outDir) await rm(outDir, { recursive: true, force: true });
});

interface Measures {
  vw: number;
  vh: number;
  scrollWidth: number;
  tallGrid: Rect;
  crop: { box: Rect; objectPosition: string; naturalWidth: number; naturalHeight: number; objectFit: string };
  tiles: Rect[];
  tileSection: Rect;
  bleed: { section: Rect; top: Rect; bottom: Rect };
  split: { heading: Rect; photo: Rect; over: boolean };
  strip: { scrollWidth: number; clientWidth: number; element: Rect };
}

async function measure(width: number): Promise<Measures> {
  const ctx = await browser.newContext({ viewport: { width, height: 800 }, deviceScaleFactor: 1, ...(width < 768 ? { isMobile: true, hasTouch: true } : {}) });
  try {
    const page = await ctx.newPage();
    await page.goto(`${server.url}/${golden.slug}/index.html`, { waitUntil: "networkidle" });
    if (shotsDir) {
      // Scroll through once so the page's on-view reveals have run before the full-page shot.
      await page.evaluate(async () => {
        for (let y = 0; y < document.documentElement.scrollHeight; y += 400) {
          scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 50));
        }
        scrollTo(0, 0);
      }, undefined);
      await mkdir(shotsDir, { recursive: true });
      await page.screenshot({ path: path.join(shotsDir, `structures-${width}.png`), fullPage: true });
    }
    return await page.evaluate(() => {
      const r = (el: Element | null): Rect => {
        if (!el) throw new Error("missing element");
        const b = el.getBoundingClientRect();
        return { left: b.left, right: b.right, top: b.top + scrollY, bottom: b.bottom + scrollY, width: b.width, height: b.height };
      };
      const q = (sel: string) => document.querySelector(sel);
      const cropImg = q("#s_crop .cx-img img") as HTMLImageElement;
      const cs = getComputedStyle(cropImg);
      const tiles = [...document.querySelectorAll("#s_mosaic .cx-ps-tile")].map(r);
      const row = q("#s_strip .cx-ph__row") as HTMLElement;
      return {
        vw: document.documentElement.clientWidth,
        vh: innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
        tallGrid: r(q("#s_tall .cx")),
        crop: { box: r(cropImg), objectPosition: cs.objectPosition, naturalWidth: cropImg.naturalWidth, naturalHeight: cropImg.naturalHeight, objectFit: cs.objectFit },
        tiles,
        tileSection: r(q("#s_mosaic")),
        bleed: { section: r(q("#s_bleed")), top: r(q("#s_bleed .cx-by-top")), bottom: r(q("#s_bleed .cx-by-bottom")) },
        split: { heading: r(q("#s_split h2")), photo: r(q("#s_split .cx-img")), over: q("#s_split h2")!.classList.contains("cx-over") },
        strip: { scrollWidth: row.scrollWidth, clientWidth: row.clientWidth, element: r(row) },
      };
    }, undefined);
  } finally {
    await ctx.close();
  }
}

/** Where the focal point lands in the frame (0–1 of its width), for object-fit cover at object-position `pos`. */
function focalInFrame(m: Measures["crop"], focalX: number): number {
  const s = Math.max(m.box.width / m.naturalWidth, m.box.height / m.naturalHeight);
  const sw = m.naturalWidth * s;
  const px = Number.parseFloat(m.objectPosition.split(" ")[0]!) / 100;
  return ((m.box.width - sw) * px + focalX * sw) / m.box.width;
}

describe("Design 5 renderer gaps in the browser", () => {
  let phone: Measures;
  let desk: Measures;
  beforeAll(async () => {
    phone = await measure(360);
    desk = await measure(1280);
  }, 120_000);

  it("6. no page scrolls sideways at 360 (tiles, bleeds, the ribbon and the shifted headline included)", () => {
    expect(phone.vw).toBe(360);
    expect(phone.scrollWidth).toBeLessThanOrEqual(360);
    expect(desk.scrollWidth).toBeLessThanOrEqual(1280);
  });

  it("6. the phone photo ribbon scrolls inside itself and stays within the screen", () => {
    expect(phone.strip.scrollWidth).toBeGreaterThan(phone.strip.clientWidth);
    expect(phone.strip.element.left).toBeGreaterThanOrEqual(0);
    expect(phone.strip.element.right).toBeLessThanOrEqual(360);
  });

  it("1. tall: 80 % of the viewport's height on desktop, 55 % on a phone", () => {
    expect(desk.tallGrid.height).toBeGreaterThanOrEqual(0.8 * desk.vh - 1);
    expect(desk.tallGrid.height).toBeLessThanOrEqual(0.8 * desk.vh + 1);
    expect(phone.tallGrid.height).toBeGreaterThanOrEqual(0.55 * phone.vh - 1);
    expect(phone.tallGrid.height).toBeLessThanOrEqual(0.55 * phone.vh + 1);
  });

  it("2. crop thirds: the object-position is the renderer's and puts the focal point on the right third line", () => {
    for (const m of [phone, desk]) {
      expect(m.crop.objectFit).toBe("cover");
      expect(m.crop.objectPosition).toBe(thirdsPosition(FOCAL, { width: m.crop.naturalWidth, height: m.crop.naturalHeight }, 1));
      expect(focalInFrame(m.crop, FOCAL.x)).toBeCloseTo(2 / 3, 1);
    }
  });

  it("3. tile: the phone mosaic touches both screen edges at 360, with no seam between tiles or rows", () => {
    const t = [...phone.tiles].sort((a, b) => a.top - b.top || a.left - b.left);
    expect(t).toHaveLength(4);
    const [h, a, b, c] = t as [Rect, Rect, Rect, Rect];
    for (const left of [h, b]) expect(left.left).toBeCloseTo(0, 0);
    for (const right of [a, c]) expect(right.right).toBeCloseTo(360, 0);
    expect(h.right).toBeCloseTo(a.left, 0);
    expect(b.right).toBeCloseTo(c.left, 0);
    expect(b.top).toBeCloseTo(Math.max(h.bottom, a.bottom), 0);
    // The headline tile stretches to its row: the pair ends level.
    expect(h.bottom).toBeCloseTo(a.bottom, 0);
  });

  it("4. bleedY: an image reaches the section's top and bottom edge on desktop", () => {
    expect(desk.bleed.top.top).toBeCloseTo(desk.bleed.section.top, 0);
    expect(desk.bleed.bottom.bottom).toBeCloseTo(desk.bleed.section.bottom, 0);
  });

  it("5. split: the shifted headline overlaps the photo's edge by at least 48 px, on its backing panel", () => {
    const overlap = desk.split.heading.right - desk.split.photo.left;
    console.log(`split overlap at 1280: ${overlap.toFixed(1)} px`);
    expect(overlap).toBeGreaterThanOrEqual(48);
    expect(desk.split.over).toBe(true);
    // Phones keep the stack: no shift, so nothing overlaps.
    expect(phone.split.heading.bottom).toBeLessThanOrEqual(phone.split.photo.top + 0.5);
  });
});
