// @module-tag slow
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ComposedProps, migrateSpec, type Section, type SiteSpec } from "@sb/spec";
// The renderer by path: @sb/render depends on this package, not the other way round.
import { mediaFiles, siteFiles } from "../../render/src/index.ts";
// The eval's static server and the engine's call check: read-only, so this package needs no browser dependency of its
// own. Playwright and sharp resolve from the eval package, which depends on them.
import { serveStatic, type StaticServer } from "../../../tools/eval/src/lib/static-server.ts";
import { callButtonsPerScreen } from "../../engine/src/check/page-checks.ts";

/**
 * M1 type and details proof, piece A (docs/plans/m1-type-details.md): the five details switches on real pages (shared
 * sheet, composed sheets, the inlined details sheet, stand-in pictures) in Chromium at 360 and 1280 px. A poster-like
 * opener (an intro row above a size-7 headline across the grid) with "Računovodstvo" and "Ključavničarstvo", a stacked
 * header on a site whose menu has one page, generated pictures.
 *
 * Screenshots go to $DETAILS_SHOTS when it is set.
 */
interface PageLike {
  goto(url: string, o?: object): Promise<unknown>;
  evaluate<T>(fn: string): Promise<T>;
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
type Sharp = (o: object) => { webp(o: object): { toBuffer(): Promise<Buffer> }; avif(o: object): { toBuffer(): Promise<Buffer> } };
const sharp = requireEval("sharp") as Sharp;

const golden = migrateSpec(JSON.parse(readFileSync(new URL("../../../tools/eval/golden/pekarna-kvas.json", import.meta.url), "utf8"))) as SiteSpec;
const ALL = { cta: true, header: true, aiCaption: true, fit: true, scale: true };
const WIDTHS = [360, 720, 1280];

const el = (id: string, more: object, desk: object, order: number) => ({ id, desk, phone: { order, span: "full" }, ...more });
const sec = (id: string, props: object): Section => ({ id, type: "composed", variant: "free", props: ComposedProps.parse({ intent: "story", width: "wide", ...props }) }) as Section;

function poster(slug: string, headline: string, hours: boolean): SiteSpec {
  const s = structuredClone(golden);
  s.slug = slug;
  s.business = { ...s.business, ...(hours ? {} : { hours: undefined }) } as SiteSpec["business"];
  s.assets.images = s.assets.images.map((i) => ({ ...i, origin: "generated" as const }));
  s.design = {
    ...s.design,
    skeleton: { header: "stacked", actions: "bar", footer: "visit", footerTone: "default", width: "contained", cards: "bordered", buttons: "underline", dividers: "none", photoRatio: "standard" },
  };
  s.chrome = { ...s.chrome, mobileActionBar: true };
  s.pages = s.pages.map((p, i) => (i === 0 ? p : { ...p, nav: { ...p.nav, show: false } }));
  const rest = s.pages[0]!.sections.slice(1);
  s.pages[0]!.sections = [
    sec("s_hero", {
      intent: "hero",
      width: "wide",
      minHeight: "tall",
      rows: 3,
      elements: [
        el("e_t", { kind: "text", paragraphs: ["Vodimo knjige, plače in DDV za podjetnike in društva po vsej regiji."] }, { col: 8, span: 5, row: 1 }, 1),
        el("e_a", { kind: "action", action: "call", label: "Pokličite", style: "text" }, { col: 8, span: 3, row: 2 }, 2),
        el("e_h", { kind: "heading", text: headline, level: 1, size: 7, case: "uppercase", weight: 800 }, { col: 1, span: 12, row: 3 }, 0),
      ],
    }),
    sec("s_story", {
      rows: 1,
      elements: [
        el("e_h", { kind: "heading", text: "Iz naše peči", level: 2, size: 4 }, { col: 1, span: 6, row: 1 }, 0),
        el("e_i", { kind: "image", image: "img_01", ratio: "1:1", mask: "circle" }, { col: 7, span: 6, row: 1 }, 1),
      ],
    }),
    sec("s_more", {
      rows: 1,
      elements: [
        el("e_h", { kind: "heading", text: "Naša zgodba", level: 2, size: 4 }, { col: 1, span: 6, row: 1 }, 0),
        el("e_i", { kind: "image", image: "img_02", ratio: "4:5", mask: "arch" }, { col: 7, span: 6, row: 1 }, 1),
      ],
    }),
    ...rest,
  ] as never;
  return s;
}

async function render(spec: SiteSpec, dir: string) {
  const media = new Map<string, Uint8Array>();
  for (const file of mediaFiles(spec, WIDTHS)) {
    const m = /^(img_[a-z0-9_-]+)-(\d+)\.(avif|webp)$/.exec(file);
    const asset = m && spec.assets.images.find((i) => i.id === m[1]);
    if (!m || !asset) continue;
    const w = Number(m[2]);
    const img = sharp({ create: { width: w, height: Math.round((asset.height * w) / asset.width), channels: 3, background: "#7d8e6b" } });
    media.set(file, await (m[3] === "avif" ? img.avif({ quality: 40 }) : img.webp({ quality: 60 })).toBuffer());
  }
  for (const [rel, data] of siteFiles(spec, media, { imageWidths: WIDTHS, details: ALL })) {
    const file = path.join(dir, rel);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, data);
  }
}

const SITES = [
  { slug: "poster-racunovodstvo", headline: "Računovodstvo za Pomurje", hours: true },
  { slug: "poster-kljucavnicar", headline: "Ključavničarstvo v Celju", hours: false },
];

let browser: BrowserLike;
let server: StaticServer;
let outDir: string;
const shotsDir = process.env.DETAILS_SHOTS;

beforeAll(async () => {
  outDir = await mkdtemp(path.join(os.tmpdir(), "sb-details-"));
  for (const s of SITES) await render(poster(s.slug, s.headline, s.hours), outDir);
  server = await serveStatic(outDir);
  browser = await chromium.launch();
}, 180_000);
afterAll(async () => {
  await browser?.close();
  await server?.close();
  if (outDir) await rm(outDir, { recursive: true, force: true });
});

interface Measures {
  vw: number;
  vh: number;
  scrollWidth: number;
  calls: { height: number; visible: boolean }[];
  chips: string[];
  aiMarked: number;
  captions: { text: string; top: number; bottom: number; visible: boolean }[];
  imageRects: { top: number; bottom: number; left: number; right: number }[];
  captionRect: { top: number; bottom: number; left: number; right: number } | null;
  navLinks: string[];
  toggle: boolean;
  facts: string;
  hoursFact: boolean;
  headline: { bottom: number; brokenWords: string[]; fontSize: number };
}

const MEASURE = `(() => {
  const visible = (e) => { const cs = getComputedStyle(e); const r = e.getBoundingClientRect(); return cs.display !== "none" && cs.visibility !== "hidden" && r.width > 1 && r.height > 1; };
  const box = (e) => { const r = e.getBoundingClientRect(); return { top: r.top + scrollY, bottom: r.bottom + scrollY, left: r.left, right: r.right }; };
  const h = document.querySelector("#s_hero h1");
  const text = h.querySelector(".cx-fit").firstChild;
  const broken = [];
  const re = /\\S+/g;
  let m;
  while ((m = re.exec(text.textContent))) {
    const range = document.createRange();
    range.setStart(text, m.index);
    range.setEnd(text, m.index + m[0].length);
    const tops = new Set([...range.getClientRects()].map((r) => Math.round(r.top)));
    if (tops.size > 1) broken.push(m[0]);
  }
  const caption = document.querySelector(".ai-caption");
  return {
    vw: document.documentElement.clientWidth,
    vh: innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    calls: [...document.querySelectorAll(".btn--call")].map((e) => ({ height: e.getBoundingClientRect().height, visible: visible(e) })),
    chips: [...document.querySelectorAll("picture")].map((p) => getComputedStyle(p, "::after").content).filter((c) => c && c !== "none" && c !== "normal"),
    aiMarked: document.querySelectorAll('picture[data-ai="generated"]').length,
    captions: [...document.querySelectorAll(".ai-caption")].map((e) => ({ text: e.textContent, ...box(e), visible: visible(e) })),
    imageRects: [...document.querySelectorAll("main picture")].filter(visible).map(box),
    captionRect: caption ? box(caption) : null,
    navLinks: [...document.querySelectorAll(".site-header .site-nav__list > li > a")].map((a) => a.textContent),
    toggle: !!document.querySelector(".site-header .nav-toggle"),
    facts: (document.querySelector(".site-header__facts") || { textContent: "" }).textContent,
    hoursFact: !!document.querySelector(".site-header__fact--hours"),
    headline: { bottom: h.querySelector(".cx-fit").getBoundingClientRect().bottom, brokenWords: broken, fontSize: parseFloat(getComputedStyle(h.querySelector(".cx-fit")).fontSize) },
  };
})()`;

async function measure(slug: string, width: number): Promise<{ m: Measures; calls: { max: number } }> {
  const ctx = await browser.newContext({ viewport: { width, height: 800 }, deviceScaleFactor: 1, ...(width < 768 ? { isMobile: true, hasTouch: true } : {}) });
  try {
    const page = await ctx.newPage();
    await page.goto(`${server.url}/${slug}/index.html`, { waitUntil: "networkidle" });
    if (shotsDir) {
      await mkdir(shotsDir, { recursive: true });
      await page.screenshot({ path: path.join(shotsDir, `${slug}-${width}-first.png`) });
      await page.screenshot({ path: path.join(shotsDir, `${slug}-${width}.png`), fullPage: true });
    }
    const m = await page.evaluate<Measures>(MEASURE);
    const calls = await callButtonsPerScreen(page as never);
    return { m, calls };
  } finally {
    await ctx.close();
  }
}

for (const site of SITES) {
  for (const width of [360, 1280]) {
    describe(`${site.slug} at ${width} px`, () => {
      let m: Measures;
      let calls: { max: number };
      beforeAll(async () => {
        ({ m, calls } = await measure(site.slug, width));
      }, 60_000);

      it("never scrolls sideways", () => {
        expect(m.scrollWidth).toBeLessThanOrEqual(m.vw);
      });

      it("draws every visible call button at least 44 px tall, and never two call buttons on one screen", () => {
        const shown = m.calls.filter((c) => c.visible);
        expect(shown.length).toBeGreaterThan(0);
        for (const c of shown) expect(c.height).toBeGreaterThanOrEqual(44);
        expect(calls.max).toBeLessThanOrEqual(1);
      });

      it("draws no AI chip on any picture, marks them, and shows one caption that covers none", () => {
        expect(m.chips).toEqual([]);
        expect(m.aiMarked).toBeGreaterThan(0);
        expect(m.captions).toHaveLength(1);
        expect(m.captions[0]!.visible).toBe(true);
        expect(m.captions[0]!.text).toBe("Slike na tej strani so ustvarjene z umetno inteligenco.");
        const c = m.captionRect!;
        for (const r of m.imageRects) expect(c.bottom <= r.top || c.top >= r.bottom || c.right <= r.left || c.left >= r.right, JSON.stringify(r)).toBe(true);
      });

      it("has no lone Domov: the menu lists the page's sections", () => {
        expect(m.navLinks).not.toContain("Domov");
        expect(m.navLinks.length).toBeGreaterThanOrEqual(2);
        expect(m.toggle).toBe(true);
      });

      it("shows only the spec's facts in the masthead", () => {
        expect(m.facts).toContain("Kamnik");
        expect(m.facts).toContain("041 555 906");
        // The hours on wide screens only, and only when the spec has them.
        expect(m.hoursFact).toBe(site.hours);
        if (!site.hours) expect(m.facts).not.toMatch(/\d\.\d\d–/);
      });

      it("keeps the headline's words whole, inside the first screen", () => {
        expect(m.headline.brokenWords).toEqual([]);
        if (width === 1280) expect(m.headline.bottom).toBeLessThanOrEqual(m.vh);
        expect(m.headline.fontSize).toBeGreaterThan(width === 1280 ? 48 : 24);
      });
    });
  }
}
