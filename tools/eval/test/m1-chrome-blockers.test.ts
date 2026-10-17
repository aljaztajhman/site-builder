// @module-tag slow
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { serveStatic, type StaticServer } from "@sb/engine";
import { FONT_PAIRS, mapsUrl, migrateSpec, type Address, type Skeleton, type SiteSpec } from "@sb/spec";
import { MARK_INK } from "@sb/render";
import { openPage, repoRoot } from "../src/compose-sheet.ts";
import { renderToDir } from "../src/lib/render-dir.ts";
import { headingFaces, measureMarkInk, type MarkInk } from "../src/lib/mark-metrics.ts";

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

/** At the top of the page: the first section's links and buttons that the visible phone bar covers, wholly or in part. */
function coveredByBar(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const bar = document.querySelector<HTMLElement>(".action-bar");
    if (!bar || !bar.checkVisibility({ visibilityProperty: true })) return [];
    const b = bar.getBoundingClientRect();
    if (b.top >= window.innerHeight) return [];
    const first = document.querySelector("main > :first-child");
    return [...(first?.querySelectorAll<HTMLElement>("a, button") ?? [])]
      .filter((el) => el.checkVisibility({ visibilityProperty: true, opacityProperty: true }))
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 1 && r.height > 1 && r.bottom > b.top && r.top < b.bottom && r.top < window.innerHeight;
      })
      .map((el) => `${el.className || el.tagName} "${(el.textContent ?? "").trim().slice(0, 30)}"`);
  });
}

describe("1. the phone bar over the first section", () => {
  const pages = [
    ["pivovarna-rov", () => studio("pivovarna-rov")],
    ["sirarna-pr-simnu", () => studio("sirarna-pr-simnu")],
    ["atelje-bergant", () => studio("atelje-bergant")],
    ["kolesarski-servis-ovinek", () => studio("kolesarski-servis-ovinek")],
    ["steklarstvo-vrhovnik", () => studio("steklarstvo-vrhovnik")],
  ] as const;
  for (const [id, spec] of pages) {
    it(`${id}: no link or button of the first section under the bar, at 360 px and phone heights 640 to 800`, async () => {
      const s = await spec();
      await renderToDir(s, dir);
      for (const height of [640, 700, 760, 800]) {
        const { page, ctx } = await openPage(browser, { width: 360, height }, `${server.url}/${s.slug}/index.html`);
        try {
          await shot(page, `bar-${id}-${height}`);
          expect(await coveredByBar(page), `360×${height}`).toEqual([]);
        } finally {
          await ctx.close();
        }
      }
    }, 120_000);
  }
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
    // The bar and the floating button wait for the hero (reveal.js): they count as shown.
    const pick = (all: Element[]) => all.filter((el) => (fixed(el) && !desk ? true : seen(el))).map(label);
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

const WORDMARK: Skeleton ={ header: "bar", actions: "bar", footer: "wordmark", footerTone: "alt", width: "contained", cards: "filled", buttons: "soft", dividers: "motif", photoRatio: "standard" };

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
 * lines or more: its lines are far enough apart for the tallest marked capital to clear the deepest descender of the line
 * above, with 0.03 em of air (the face's ink measured here, in this browser).
 */
function tightMarkedLines(page: Page, heading: string, ink: MarkInk): Promise<string[]> {
  return page.evaluate(
    ([family, ink]) => {
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
        const need = ink.mark + (upper ? ink.capsDesc : ink.desc) + 0.03;
        if (lh < need - 0.005) bad.push(`${el.tagName.toLowerCase()}.${el.className.split(" ")[0]} "${own.trim().slice(0, 24)}": ${lh.toFixed(3)} < ${need.toFixed(3)}`);
      }
      return bad;
    },
    [heading, ink] as const,
  );
}

describe("4. display lines with a marked capital clear it, in every heading face", () => {
  let ink: Record<string, MarkInk>;
  beforeAll(async () => {
    ink = await measureMarkInk(browser);
  }, 120_000);

  it("the table of mark room (packages/render) is the ink measured in Chromium, for every heading face", () => {
    for (const f of headingFaces()) {
      const m = ink[f.file]!;
      expect(MARK_INK[f.file], f.file).toBeDefined();
      expect(Math.abs(MARK_INK[f.file]!.mark - m.mark), `${f.file} mark`).toBeLessThan(0.002);
      expect(Math.abs(MARK_INK[f.file]!.desc - m.desc), `${f.file} desc`).toBeLessThan(0.002);
      expect(Math.abs(MARK_INK[f.file]!.capsDesc - m.capsDesc), `${f.file} capsDesc`).toBeLessThan(0.002);
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

describe("4. the footer wordmark's carons", () => {
  it("sirarna-pr-simnu: the Š of the second line clears the line above, at 360 and 1280 px", async () => {
    const s = await studio("sirarna-pr-simnu");
    s.design.skeleton = WORDMARK;
    await renderToDir(s, dir);
    for (const w of [{ width: 360, height: 800 }, { width: 1280, height: 800 }]) {
      const { page, ctx } = await openPage(browser, w, `${server.url}/${s.slug}/index.html`);
      try {
        await page.locator(".site-footer__wordmark").scrollIntoViewIfNeeded();
        if (process.env.SB_SHOTS) await page.locator(".site-footer__wordmark").screenshot({ path: path.join(process.env.SB_SHOTS, `m1-wordmark-${w.width}.png`) });
        const c = await caronClearance(page, ".site-footer__wordmark");
        expect(c.lines, `${w.width} px: the name wraps`).toBeGreaterThanOrEqual(2);
        // A hairline of air at least (0.03 em is 4 px at the 9rem desktop size).
        expect(c.worst, `${w.width} px: ${c.at}`).toBeGreaterThanOrEqual(0.03);
      } finally {
        await ctx.close();
      }
    }
  }, 120_000);
});
