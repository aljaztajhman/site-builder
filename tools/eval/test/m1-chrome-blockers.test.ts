// @module-tag slow
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { serveStatic, type StaticServer } from "@sb/engine";
import { FONT_PAIRS, mapsUrl, migrateSpec, type Address, type Skeleton, type SiteSpec } from "@sb/spec";
import { MARK_INK, MARK_ROOM_CAP } from "@sb/render";
import { openPage, repoRoot } from "../src/compose-sheet.ts";
import { renderToDir } from "../src/lib/render-dir.ts";
import { headingFaces, measureMarkInk, type MarkInk } from "../src/lib/mark-metrics.ts";
import { skeletonVariants } from "../src/skeleton-sheet.ts";

/**
 * M1 reviewer blockers in the chrome, in a real browser (no model call):
 * 1. the phone bar never covers a link or button of the page's first section on the first phone screen (fresh 10,
 *    pivovarna-rov: the hero's directions link sat under the bar);
 * 2. on phones a page shows the call and the directions at most twice each: the bar (the floating button, the header
 *    that carries them) and once in the page (review 50: "Navodila za pot" three times, the call three times);
 * 4. the footer wordmark's carons don't touch the line above (fresh 10, sirarna-pr-simnu: "Sirarna Pr' / Šimnu").
 */
let browser: Browser;
let dir: string;
let server: StaticServer;
beforeAll(async () => {
  browser = await chromium.launch();
  dir = await mkdtemp(path.join(tmpdir(), "sb-m1-chrome-"));
  server = await serveStatic(dir);
}, 60_000);
afterAll(async () => {
  await browser?.close();
  await server?.close();
  await rm(dir, { recursive: true, force: true });
});

const load = async (rel: string, slug: string): Promise<SiteSpec> => {
  const spec = migrateSpec(JSON.parse(await readFile(path.join(repoRoot, rel), "utf8"))) as SiteSpec;
  spec.slug = slug;
  return spec;
};
const studio = (id: string) => load(`packages/engine/test/fixtures/studio-pages/${id}.json`, `m1-${id}`);
const review = (id: string) => load(`eval/outside-review/review50-specs/${id}/spec-generated.json`, `m1-${id}`);

const shot = async (page: Page, name: string) => {
  if (process.env.SB_SHOTS) await page.screenshot({ path: path.join(process.env.SB_SHOTS, `m1-${name}.png`) });
};

/**
 * At the top of the page: what the first section shows on the first screen that the visible phone bar or floating call
 * button covers, wholly or in part: its links and buttons, and its objects with words (a badge, a seal, a captioned
 * figure: anything with its own ground or border) that end on the first screen. Running text, containers and bare
 * photos don't count.
 */
function coveredByBar(page: Page, objects = true): Promise<string[]> {
  return page.evaluate((withObjects) => {
    const fixedEls = [...document.querySelectorAll<HTMLElement>(".action-bar, .call-float")].filter((el) => el.checkVisibility({ visibilityProperty: true }));
    const first = document.querySelector("main > :first-child");
    if (!first) return [];
    const out: string[] = [];
    for (const f of fixedEls) {
      const b = f.getBoundingClientRect();
      if (b.top >= window.innerHeight || b.height < 1) continue;
      for (const el of first.querySelectorAll<HTMLElement>("*")) {
        if (!el.checkVisibility({ visibilityProperty: true, opacityProperty: true })) continue;
        const cs = getComputedStyle(el);
        const object =
          /^(A|BUTTON|IMG|PICTURE|FIGURE|SVG|svg)$/.test(el.tagName) ||
          (cs.backgroundColor !== "rgba(0, 0, 0, 0)" && cs.backgroundColor !== "transparent") ||
          parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth) > 0 ||
          cs.backgroundImage !== "none";
        if (!object || (!withObjects && !/^(A|BUTTON)$/.test(el.tagName))) continue;
        const r = el.getBoundingClientRect();
        // Larger than half the screen: the section's own ground or photo, not something set on the first screen.
        if (r.width < 2 || r.height < 2 || r.height > window.innerHeight / 2 || r.top >= window.innerHeight) continue;
        // An object that runs on below the screen is the page going on (a photo past the fold); one that ends on the
        // first screen was set there, and the bar must not cover it. Links and buttons count either way.
        if (!/^(A|BUTTON)$/.test(el.tagName) && r.bottom > window.innerHeight + 1) continue;
        // A bare photo or drawing (no words): at some phone height the bottom of a flowing hero's photo always meets the
        // bar's strip; what must never be cut is what says something (a badge, a seal, a caption) and what is tapped.
        if (!/^(A|BUTTON)$/.test(el.tagName) && !(el.textContent ?? "").trim()) continue;
        if (r.bottom > b.top && r.top < b.bottom && r.right > b.left && r.left < b.right) {
          out.push(`${String(el.className || el.tagName).split(" ")[0]} "${(el.textContent ?? "").trim().slice(0, 24)}" (${Math.round(r.top)}–${Math.round(r.bottom)} under ${Math.round(b.top)})`);
        }
      }
    }
    return out;
  }, objects);
}

describe("1. the phone bar over the first section", () => {
  const pages = [
    ["pivovarna-rov", () => studio("pivovarna-rov")],
    ["sirarna-pr-simnu", () => studio("sirarna-pr-simnu")],
    ["atelje-bergant", () => studio("atelje-bergant")],
    ["kolesarski-servis-ovinek", () => studio("kolesarski-servis-ovinek")],
    ["steklarstvo-vrhovnik", () => studio("steklarstvo-vrhovnik")],
    // final10: the arch hero's round hours badge under the floating call button; review 50: pekarna's "6.30" badge under the bar.
    ["slascicarna-pri-zofki", () => load("tools/eval/test/fixtures/m1/slascicarna-pri-zofki.json", "m1-slascicarna-pri-zofki")],
    ["review 50 pekarna-kvas", () => load("eval/outside-review/review50-specs/pekarna-kvas/spec-generated.json", "m1-review-pekarna-kvas")],
  ] as const;
  const screens = [
    { width: 360, height: 640 },
    { width: 360, height: 700 },
    { width: 360, height: 740 },
    { width: 360, height: 800 },
    { width: 390, height: 844 },
  ];
  // The fixed element must be on the first screen here (nothing else there calls): at 390 × 844 the composed hero's
  // list (kolesarski) and the arch's hours seal (slascicarna) end in its strip. A flowing hero meets that strip at some
  // phone height whatever its layout; open for the director (M1). Their links and buttons are held below.
  const open = new Set(["kolesarski-servis-ovinek", "slascicarna-pri-zofki"]);
  for (const [id, spec] of pages) {
    it(`${id}: no ${open.has(id) ? "link or button" : "link, button or worded object"} of the first section under the bar or the floating button on the first phone screen`, async () => {
      const s = await spec();
      await renderToDir(s, dir);
      for (const w of screens) {
        const { page, ctx } = await openPage(browser, w, `${server.url}/${s.slug}/index.html`);
        try {
          await shot(page, `bar-${id}-${w.width}x${w.height}`);
          expect(await coveredByBar(page, !open.has(id)), `${w.width}×${w.height}`).toEqual([]);
        } finally {
          await ctx.close();
        }
      }
    }, 120_000);
  }
  for (const id of open) it.todo(`${id}: no worded object of the first section under the fixed element at 390 × 844 (director: the fixed element is needed on the first screen there)`);
});

/**
 * On the whole page: the call and directions controls a visitor sees. On a phone the bar's and the floating button's
 * count whether or not they have slid in yet; at desktop width only what is visible.
 */
function actionsShown(page: Page, directions: string, wide = false): Promise<{ call: string[]; directions: string[] }> {
  return page.evaluate(([dirHref, desk]) => {
    const seen = (el: Element) => el.checkVisibility({ visibilityProperty: true, opacityProperty: true });
    const fixed = (el: Element) => el.closest(".action-bar, .call-float") !== null;
    const label = (el: Element) => `${el.closest(".action-bar, .call-float, header, footer, section")?.className.split(" ").slice(0, 2).join(".")} "${(el.textContent ?? "").trim().slice(0, 24)}"`;
    // The bar and the floating button wait for the hero (reveal.js): they count as shown. A later section with a call
    // object (plate, call block, big number) makes them step aside while it is on screen: its own links stand in for
    // them there, so they don't count as a third (site.tsx markRepeatedActions keeps them).
    const hero = document.querySelector("main > :first-child");
    const standIn = (el: Element) => {
      const s = el.closest("main > section");
      return !desk && s !== null && s !== hero && s.querySelector("a.plate, a.callblock, a.bignum") !== null && document.querySelector("[data-after-hero]") !== null;
    };
    const pick = (all: Element[]) => all.filter((el) => !standIn(el) && (fixed(el) && !desk ? true : seen(el))).map(label);
    const call = [...document.querySelectorAll('a[data-action="call"], .action-bar a[href^="tel:"], .call-float a[href^="tel:"], .site-header a[href^="tel:"]')];
    const dirs = [...document.querySelectorAll("a")].filter(
      (a) => a.href === dirHref && (fixed(a) || a.closest(".site-header") !== null || /\b(btn|text-link|contact-strip__action)\b/.test(a.className)),
    );
    return { call: pick([...new Set(call)]), directions: pick(dirs) };
  }, [directions, wide] as const);
}

const directionsHref = (s: SiteSpec) => mapsUrl(s.business.address as Address);

describe("2. the call and the directions at most twice on a phone", () => {
  const pages = [
    ...["avtoservis-mrak", "prevajanje-kolar", "frizerstvo-lana", "elektro-zupan", "avto-kovac", "zobozdravstvo-lebar", "instalacije-rebernik"].map((id) => [`review 50 ${id}`, () => review(id)] as const),
    // Hand-made goldens without a skeleton: a hero call, call buttons in later sections and the bar.
    ...["instalacije-rebernik", "zobozdravstvo-lebar", "avtoservis-mrak", "pekarna-kvas"].map((id) => [`golden ${id}`, () => load(`tools/eval/golden/${id}.json`, `m1-golden-${id}`)] as const),
  ];
  for (const [name, spec] of pages) {
    it(`${name}: the carrier and at most one in the page, for each`, async () => {
      const s = await spec();
      await renderToDir(s, dir);
      const { page, ctx } = await openPage(browser, { width: 360, height: 760 }, `${server.url}/${s.slug}/index.html`);
      try {
        await shot(page, `twice-${s.slug}`);
        const shown = await actionsShown(page, directionsHref(s));
        expect(shown.call.length, `call: ${shown.call.join(" | ")}`).toBeLessThanOrEqual(2);
        expect(shown.directions.length, `directions: ${shown.directions.join(" | ")}`).toBeLessThanOrEqual(2);
      } finally {
        await ctx.close();
      }
    }, 120_000);
  }
});

describe("2. the directions stay in the first phone screen however tall the opener (CI, Linux fonts)", () => {
  // The phone header family with the bar: the bar waits for an opener that offers call and directions, so the header's
  // own directions row must stay (the opener's link fell below the first screen on Linux, merge b6da3fd6).
  it("avtoservis-mrak, every phone-header look: a directions link in view at 360 × 560", async () => {
    const looks = (await skeletonVariants(["avtoservis-mrak"])).filter((v) => v.site === "avtoservis-mrak" && v.skeleton.header === "phone");
    expect(looks.length).toBeGreaterThan(0);
    for (const v of looks) {
      const s = structuredClone(v.spec);
      s.slug = `m1-dir-${looks.indexOf(v)}`;
      await renderToDir(s, dir);
      const { page, ctx } = await openPage(browser, { width: 360, height: 560 }, `${server.url}/${s.slug}/index.html`);
      try {
        const inView = await page.evaluate(() =>
          [...document.querySelectorAll<HTMLElement>('a[href*="google.com/maps"]')].some((a) => {
            const r = a.getBoundingClientRect();
            return a.checkVisibility({ visibilityProperty: true, opacityProperty: true }) && r.height > 0 && r.top >= 0 && r.bottom <= window.innerHeight;
          }),
        );
        expect(inView, v.label).toBe(true);
        const shown = await actionsShown(page, directionsHref(s));
        expect(shown.directions.length, `${v.label}: ${shown.directions.join(" | ")}`).toBeLessThanOrEqual(2);
      } finally {
        await ctx.close();
      }
    }
  }, 240_000);
});

describe("2. the call and the directions at most twice at 1280 px too", () => {
  // Review 50 at desktop width: the header's "Navodila za pot", the hero's and a later section's (avto-kovac, elektro-zupan).
  const pages = ["avto-kovac", "elektro-zupan", "avtoservis-mrak", "prevajanje-kolar", "frizerstvo-lana", "zobozdravstvo-lebar", "instalacije-rebernik"];
  for (const id of pages) {
    it(`review 50 ${id}: the header and at most one in the page, for each`, async () => {
      const s = await review(id);
      s.slug = `m1-desk-${id}`;
      await renderToDir(s, dir);
      const { page, ctx } = await openPage(browser, { width: 1280, height: 800 }, `${server.url}/${s.slug}/index.html`);
      try {
        await shot(page, `twice-1280-${id}`);
        const shown = await actionsShown(page, directionsHref(s), true);
        expect(shown.call.length, `call: ${shown.call.join(" | ")}`).toBeLessThanOrEqual(2);
        expect(shown.directions.length, `directions: ${shown.directions.join(" | ")}`).toBeLessThanOrEqual(2);
      } finally {
        await ctx.close();
      }
    }, 120_000);
  }
});

/**
 * Every call or directions link the page hides as a repeat (data-repeat): with its section on screen, the visitor still
 * has one there to tap: in that section, or in an element that stays on screen (the bar, the floating button, a sticky
 * header). Review: instalacije-rebernik's closing band lost its call at 1280 px behind a header that had scrolled away.
 */
async function strandedRepeats(page: Page, directions: string): Promise<string[]> {
  const n = await page.evaluate(() => document.querySelectorAll("main a[data-repeat], .site-footer a[data-repeat]").length);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    await page.evaluate((k) => {
      const a = document.querySelectorAll("main a[data-repeat], .site-footer a[data-repeat]")[k]!;
      (a.closest("section, .site-footer") ?? a).scrollIntoView({ block: "center", behavior: "instant" });
    }, i);
    await page.waitForTimeout(250);
    const lost = await page.evaluate(
      ([k, dirHref]) => {
        const a = document.querySelectorAll<HTMLAnchorElement>("main a[data-repeat], .site-footer a[data-repeat]")[k]!;
        const call = a.dataset.action === "call";
        const same = (el: HTMLAnchorElement) => (call ? el.dataset.action === "call" || el.href.startsWith("tel:") : el.href === dirHref);
        const tappable = (el: HTMLAnchorElement) => {
          if (!el.checkVisibility({ visibilityProperty: true, opacityProperty: true })) return false;
          const r = el.getBoundingClientRect();
          return r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
        };
        const block = a.closest("section, .site-footer")!;
        const near = [...block.querySelectorAll<HTMLAnchorElement>("a")].some((el) => same(el) && tappable(el));
        const fixed = [...document.querySelectorAll<HTMLAnchorElement>(".action-bar a, .call-float a, .site-header--sticky a")].some((el) => same(el) && tappable(el));
        return near || fixed ? null : `${block.className.split(" ").slice(0, 2).join(".")}: ${call ? "call" : "directions"} "${(a.textContent ?? "").trim().slice(0, 24)}"`;
      },
      [i, directions] as const,
    );
    if (lost) out.push(lost);
  }
  return out;
}

describe("2. a hidden repeat never leaves its section without the action (review: sticky headers only)", () => {
  const pages = [
    ...["avtoservis-mrak", "prevajanje-kolar", "frizerstvo-lana", "elektro-zupan", "avto-kovac", "zobozdravstvo-lebar", "instalacije-rebernik"].map((id) => [`review 50 ${id}`, () => review(id)] as const),
    ...["instalacije-rebernik", "zobozdravstvo-lebar", "avtoservis-mrak", "pekarna-kvas", "trgovina-oljka-in-sol"].map((id) => [`golden ${id}`, () => load(`tools/eval/golden/${id}.json`, `m1-golden-${id}`)] as const),
  ];
  for (const [name, spec] of pages) {
    it(`${name}: at 360 and 1280 px`, async () => {
      const s = await spec();
      s.slug = `m1-strand-${s.slug}`;
      await renderToDir(s, dir);
      for (const w of [{ width: 360, height: 760 }, { width: 1280, height: 800 }]) {
        const { page, ctx } = await openPage(browser, w, `${server.url}/${s.slug}/index.html`);
        try {
          expect(await strandedRepeats(page, directionsHref(s)), `${w.width} px`).toEqual([]);
        } finally {
          await ctx.close();
        }
      }
    }, 180_000);
  }

  it("golden instalacije-rebernik at 1280 px: the closing band keeps its call", async () => {
    const s = await load("tools/eval/golden/instalacije-rebernik.json", "m1-band-instalacije");
    await renderToDir(s, dir);
    const { page, ctx } = await openPage(browser, { width: 1280, height: 800 }, `${server.url}/${s.slug}/index.html`);
    try {
      const band = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>("section.s-cta a")].filter((a) => a.checkVisibility() && (a.dataset.action === "call" || a.getAttribute("href")?.startsWith("tel:"))).length,
      );
      expect(band).toBeGreaterThan(0);
    } finally {
      await ctx.close();
    }
  }, 60_000);
});

const WORDMARK: Skeleton = { header: "bar", actions: "bar", footer: "wordmark", footerTone: "alt", width: "contained", cards: "filled", buttons: "soft", dividers: "motif", photoRatio: "standard" };

/**
 * Each capital with a mark above it (as set) on a line after the first, against the glyphs of the line above that share
 * its width: the clearance between the mark's ink top and their ink bottom, in em (canvas ink metrics of the same face).
 */
function caronClearance(page: Page, selector: string): Promise<{ lines: number; worst: number; at: string }> {
  return page.evaluate((sel) => {
    const el = document.querySelector<HTMLElement>(sel)!;
    const cs = getComputedStyle(el);
    const size = parseFloat(cs.fontSize);
    const canvas = document.createElement("canvas").getContext("2d")!;
    canvas.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const upper = cs.textTransform === "uppercase";
    const text = el.firstChild as Text;
    const glyphs: { ch: string; left: number; right: number; base: number }[] = [];
    const range = document.createRange();
    for (let i = 0; i < text.data.length; i++) {
      const ch = upper ? text.data[i]!.toLocaleUpperCase("sl") : text.data[i]!;
      if (/\s/.test(ch)) continue;
      range.setStart(text, i);
      range.setEnd(text, i + 1);
      const r = range.getBoundingClientRect();
      const m = canvas.measureText(ch);
      glyphs.push({ ch, left: r.left, right: r.right, base: r.top + m.fontBoundingBoxAscent });
    }
    const bases = [...new Set(glyphs.map((g) => Math.round(g.base)))].sort((a, b) => a - b);
    let worst = Infinity;
    let at = "";
    for (const g of glyphs) {
      const line = bases.indexOf(Math.round(g.base));
      const parts = g.ch.normalize("NFD");
      if (line === 0 || parts.length < 2 || parts[0] === parts[0]!.toLowerCase()) continue;
      const top = g.base - canvas.measureText(g.ch).actualBoundingBoxAscent;
      for (const o of glyphs) {
        if (Math.round(o.base) !== bases[line - 1] || o.right <= g.left || o.left >= g.right) continue;
        const clear = (top - (o.base + canvas.measureText(o.ch).actualBoundingBoxDescent)) / size;
        if (clear < worst) [worst, at] = [clear, `${g.ch} under ${o.ch}`];
      }
    }
    return { lines: bases.length, worst, at };
  }, selector);
}

/**
 * Every element set in the heading face whose own text has a capital with a mark above it (as set) and that wraps to two
 * lines or more: its lines are far enough apart for the tallest marked capital to clear the line above's capitals, and
 * its deepest descender up to MARK_ROOM_CAP, with 0.03 em of air (the face's ink measured here, in this browser).
 */
function tightMarkedLines(page: Page, heading: string, ink: MarkInk): Promise<string[]> {
  return page.evaluate(
    ([family, ink, cap]) => {
      const marked = (s: string) =>
        [...s].some((ch) => {
          const p = ch.normalize("NFD");
          return p.length > 1 && /\p{Lu}/u.test(p[0]!) && /[̀-̽̕̚-̈́͆͊-͌]/u.test(p.slice(1));
        });
      const bad: string[] = [];
      for (const el of document.querySelectorAll<HTMLElement>("body *")) {
        const cs = getComputedStyle(el);
        if (!cs.fontFamily.startsWith(`"${family}"`) && !cs.fontFamily.startsWith(family)) continue;
        if (!el.checkVisibility()) continue;
        const upper = cs.textTransform === "uppercase";
        const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent ?? "").join("");
        if (!marked(upper ? own.toLocaleUpperCase("sl") : own)) continue;
        const range = document.createRange();
        range.selectNodeContents(el);
        const tops = new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top)));
        if (tops.size < 2) continue;
        const size = parseFloat(cs.fontSize);
        const lh = cs.lineHeight === "normal" ? Infinity : parseFloat(cs.lineHeight) / size;
        // The mark always clears the line above's capitals; its deepest descender as far as the cap allows (director, M1).
        const need = Math.max(ink.mark + 0.03, Math.min(cap, ink.mark + (upper ? ink.capsDesc : ink.desc) + 0.03));
        if (lh < need - 0.005) bad.push(`${el.tagName.toLowerCase()}.${el.className.split(" ")[0]} "${own.trim().slice(0, 24)}": ${lh.toFixed(3)} < ${need.toFixed(3)}`);
      }
      return bad;
    },
    [heading, ink, MARK_ROOM_CAP] as const,
  );
}

describe("4. display lines with a marked capital clear it, in every heading face", () => {
  let ink: Record<string, MarkInk>;
  beforeAll(async () => {
    ink = await measureMarkInk(browser);
  }, 120_000);

  // Never under the ink this browser measures, and not much over it. Chromium measures in 1/64-em steps and Windows and
  // Linux differ by up to one step either way, so the table holds Windows' measurement plus one step (0.016): never under
  // either platform, at most two steps over the lower one.
  it("the table of mark room (packages/render) covers the ink measured in Chromium, for every heading face", () => {
    for (const f of headingFaces()) {
      const m = ink[f.file]!;
      const t = MARK_INK[f.file];
      expect(t, f.file).toBeDefined();
      for (const k of ["mark", "desc", "capsDesc"] as const) {
        expect(t![k], `${f.file} ${k}`).toBeGreaterThanOrEqual(m[k] - 0.002);
        expect(t![k], `${f.file} ${k}`).toBeLessThanOrEqual(m[k] + 0.035);
      }
    }
  });

  const pairs = [...new Map(FONT_PAIRS.map((p) => [p.heading.file, p])).values()];
  for (const pair of pairs) {
    for (const headingCase of ["normal", "uppercase"] as const) {
      it(`${pair.heading.family}, ${headingCase}: footer wordmark, hero and section titles at 360 and 1280 px`, async () => {
        const s = await load("tools/eval/golden/pekarna-kvas.json", `m1-marks-${pair.heading.file}-${headingCase}`);
        s.design.fontPair = pair.id;
        s.design.headingCase = headingCase;
        s.design.skeleton = WORDMARK;
        s.business.name = "Pekarna Šimnu Žagar";
        const hero = s.pages[0]!.sections[0]! as { props: Record<string, unknown> };
        hero.props = { ...hero.props, headline: "Kruh, ki ga pečemo že od jutra. Čas, Škofja Loka, Žiri" };
        await renderToDir(s, dir);
        for (const w of [{ width: 360, height: 800 }, { width: 1280, height: 800 }]) {
          const { page, ctx } = await openPage(browser, w, `${server.url}/${s.slug}/index.html`);
          try {
            expect(await tightMarkedLines(page, pair.heading.family, ink[pair.heading.file]!), `${w.width} px`).toEqual([]);
          } finally {
            await ctx.close();
          }
        }
      }, 120_000);
    }
  }
});

describe("4. the room for marks keeps the hero's button on the first phone screen (director: at most 1.25)", () => {
  const heroes = [
    ["golden pekarna-kvas", () => load("tools/eval/golden/pekarna-kvas.json", "m1-room-pekarna")],
    ["review 50 avtoservis-mrak", () => review("avtoservis-mrak")],
    ["review 50 elektro-zupan", () => review("elektro-zupan")],
  ] as const;
  /** The page's h1: a composed opener's level-1 heading element, or the hero's headline. */
  const setHeadline = (s: SiteSpec, text: string) => {
    const hero = s.pages[0]!.sections[0]! as { type: string; props: { elements?: { kind: string; level?: number; text?: string }[] } & Record<string, unknown> };
    const h1 = hero.props.elements?.find((e) => e.kind === "heading" && e.level === 1);
    if (h1) h1.text = text;
    else hero.props = { ...hero.props, headline: text };
  };
  /** The opener's first visible button or link and how far down it ends, against the top of the fixed element. */
  const firstAction = async (s: SiteSpec) => {
    await renderToDir(s, dir);
    const { page, ctx } = await openPage(browser, { width: 360, height: 640 }, `${server.url}/${s.slug}/index.html`);
    try {
      await shot(page, `room-${s.slug}`);
      return await page.evaluate(() => {
          const first = document.querySelector("main > :first-child")!;
          const btn = [...first.querySelectorAll<HTMLElement>("a")].find((a) => a.checkVisibility({ visibilityProperty: true, opacityProperty: true }));
          const fixedTop = Math.min(
            window.innerHeight,
            ...[...document.querySelectorAll<HTMLElement>(".action-bar, .call-float")].filter((el) => el.checkVisibility({ visibilityProperty: true })).map((el) => el.getBoundingClientRect().top),
          );
          const h1 = first.querySelector("h1")!;
          return { text: btn?.textContent?.trim(), bottom: btn?.getBoundingClientRect().bottom ?? Infinity, fixedTop, lh: getComputedStyle(h1).lineHeight, size: getComputedStyle(h1).fontSize, marks: h1.querySelector("[data-marks]") !== null || h1.hasAttribute("data-marks") };
      });
    } finally {
      await ctx.close();
    }
  };
  for (const [name, spec] of heroes) {
    it(`${name}: a three-line headline with Č Š Ž at 360 × 640: the button fits as it does without the marks`, async () => {
      const plain = await spec();
      plain.slug = `m1-room-plain-${plain.slug}`;
      setHeadline(plain, "Solske torte, Cokoladni kruh in Zepni piskoti");
      const marked = await spec();
      marked.slug = `m1-room-marked-${marked.slug}`;
      setHeadline(marked, "Šolske torte, Čokoladni kruh in Žepni piškoti");
      const a = await firstAction(plain);
      const b = await firstAction(marked);
      expect(b.marks, name).toBe(true);
      const msg = `${name}: "${b.text}" ends at ${Math.round(b.bottom)} (plain ${Math.round(a.bottom)}), fixed element at ${Math.round(b.fixedTop)}; h1 ${b.lh} / ${b.size} (plain ${a.lh})`;
      if (process.env.SB_SHOTS) console.log(msg);
      if (a.bottom <= a.fixedTop) expect(b.bottom, msg).toBeLessThanOrEqual(b.fixedTop);
    }, 90_000);
  }
});

describe("4. the footer wordmark's carons", () => {
  // The footer wordmark now fits a short name on one line (min(6rem, 2 × h2)), so the name is lengthened until it wraps
  // on a phone; at 1280 px it may fit one line, and a wordmark on one line has no line above to touch.
  it("sirarna-pr-simnu: the Š of a wrapped line clears the line above, at 360 px (and at 1280 px when it wraps)", async () => {
    const s = await studio("sirarna-pr-simnu");
    s.design.skeleton = WORDMARK;
    s.business.name = "Sirarna in mlekarna Pr' Šimnu";
    await renderToDir(s, dir);
    for (const w of [{ width: 360, height: 800 }, { width: 1280, height: 800 }]) {
      const { page, ctx } = await openPage(browser, w, `${server.url}/${s.slug}/index.html`);
      try {
        await page.locator(".site-footer__wordmark").scrollIntoViewIfNeeded();
        if (process.env.SB_SHOTS) await page.locator(".site-footer__wordmark").screenshot({ path: path.join(process.env.SB_SHOTS, `m1-wordmark-${w.width}.png`) });
        const c = await caronClearance(page, ".site-footer__wordmark");
        if (w.width === 360) expect(c.lines, `${w.width} px: the name wraps`).toBeGreaterThanOrEqual(2);
        else if (c.lines < 2) continue;
        // A hairline of air at least (0.03 em is 4 px at the 9rem desktop size).
        expect(c.worst, `${w.width} px: ${c.at}`).toBeGreaterThanOrEqual(0.03);
      } finally {
        await ctx.close();
      }
    }
  }, 120_000);
});
