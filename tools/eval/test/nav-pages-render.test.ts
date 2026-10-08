import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type Page as PwPage } from "playwright";
import { loadConfig } from "@sb/config";
import { defaultSection, heroEyebrow, measurePage, runAxe, serveStatic } from "@sb/engine";
import { siteFiles } from "@sb/render";
import { HEADER_FAMILIES, Page, migrateSpec, validateSite, type HeaderFamily, type PhoneActions, type SiteSpec } from "@sb/spec";
import { fixtureMedia } from "../src/families-sheet.ts";
import { rotation } from "../src/skeleton-sheet.ts";

/**
 * Plus sells up to config plans.premium.site.maxPages home and standard pages (it-plan-limits). Every header family
 * renders with that many menu entries (labels up to the spec's nav-label limit) at 360 and 1280 px: no horizontal
 * scroll, axe WCAG 2.2 A/AA, 44 px targets at least 8 px apart, every entry reachable by keyboard and visible when
 * focused (on phones the open menu scrolls when it is taller than the screen; on wide screens what doesn't fit in the
 * row sits under "Več"), and a wide header that stays one tidy row (two for the families whose nav has its own row).
 * Screenshots: set SB_NAV_SHOTS to a folder.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const config = loadConfig();
const MAX_PAGES = config.plans.premium.site.maxPages;
const MAX_LABEL = Page.shape.nav.shape.label.maxLength!;

/** Realistic Slovene menu labels, several at the spec's limit. */
const LABELS = [
  "O nas",
  "Ponudba",
  "Cenik",
  "Sezonski izdelki",
  "Torte za vse priložnosti",
  "Kruh in pecivo",
  "Darilni paketi",
  "Naročila za podjetja",
  "Dostava na dom",
  "Galerija",
  "Novice",
  "Dogodki",
  "Pogosta vprašanja",
  "Zaposlitev",
  "Naša zgodba in ekipa",
  "Partnerji in dobavitelji",
  "Sobe in apartmaji",
  "Izleti v okolici Pohorja",
  "Kontakt",
];

const slugOf = (label: string) =>
  label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** The golden with the plan's most home and standard pages, all in the menu. */
async function withMaxPages(id: string): Promise<SiteSpec> {
  const spec = migrateSpec(JSON.parse(await readFile(path.join(here, `../golden/${id}.json`), "utf8"))) as SiteSpec;
  // As the generator leaves a skeleton site: no street address as the hero's eyebrow.
  const props = spec.pages.find((p) => p.kind === "home")!.sections[0]!.props as { eyebrow?: string };
  if (props.eyebrow !== undefined && heroEyebrow(props.eyebrow, spec.business.address, false) === undefined) delete props.eyebrow;
  const main = spec.pages.filter((p) => p.kind === "home" || p.kind === "standard");
  const system = spec.pages.filter((p) => p.kind !== "home" && p.kind !== "standard");
  const taken = new Set(main.map((p) => p.nav.label));
  const extra = LABELS.filter((l) => !taken.has(l))
    .slice(0, MAX_PAGES - main.length)
    .map((label, i) => {
      const slug = slugOf(label);
      const header = defaultSection(spec, "page-header", `s_nav_${i}_head`) as unknown as SiteSpec["pages"][number]["sections"][number];
      (header.props as { title: string }).title = label;
      return { id: `p_nav_${i}`, kind: "standard" as const, slug, nav: { label, show: true }, seo: { title: label, description: label }, sections: [header] };
    });
  spec.pages = [...main, ...extra, ...system];
  return spec;
}

interface Look {
  site: string;
  family: HeaderFamily;
  /** A skeleton's phone actions; none: the chrome's own header variant (bar, split-cta, stacked) without a skeleton. */
  actions?: PhoneActions;
}

/** Every header family once: the three chrome variants without a skeleton, the five skeleton families with one. */
const LOOKS: Look[] = [
  { site: "kmetija-grabnar", family: "bar" },
  { site: "pekarna-kvas", family: "split-cta" },
  { site: "kmetija-grabnar", family: "stacked" },
  { site: "pekarna-kvas", family: "centred", actions: "header" },
  { site: "pekarna-kvas", family: "phone", actions: "bar" },
  { site: "pekarna-kvas", family: "compact", actions: "float" },
  { site: "kmetija-grabnar", family: "overlay", actions: "bar" },
  { site: "kmetija-grabnar", family: "word", actions: "header" },
];

async function lookSpec(look: Look): Promise<SiteSpec> {
  const spec = await withMaxPages(look.site);
  if (look.actions) spec.design = { ...spec.design, skeleton: { ...rotation(HEADER_FAMILIES.indexOf(look.family), 0), header: look.family, actions: look.actions } };
  else {
    delete spec.design.skeleton;
    spec.chrome.header.variant = look.family as "bar" | "split-cta" | "stacked";
  }
  return spec;
}

let browser: Browser;
let dir: string;
const shots = process.env.SB_NAV_SHOTS;
beforeAll(async () => {
  browser = await chromium.launch();
  dir = await mkdtemp(path.join(tmpdir(), "sb-nav-pages-"));
  if (shots) await mkdir(shots, { recursive: true });
}, 60_000);
afterAll(async () => {
  await browser?.close();
  await rm(dir, { recursive: true, force: true });
});

const t = config.checks.tapTarget;

/**
 * The page checks (measurePage, axe) in the page's current state. `axeOn`: axe on that part only. With "Več" open its
 * panel lies over the page like any dropdown, and axe's target-size rule counts a page link it half covers as too small
 * to tap; that link can't be tapped until the panel closes anyway, so the open state's axe run covers the header (the
 * panel's own names, contrast and target sizes) and the closed states cover the whole page.
 */
async function pageProblems(page: PwPage, state: string, axeOn?: string): Promise<string[]> {
  const m = await measurePage(page, { primaryMin: t.primaryMin, primaryGap: t.primaryGap, absoluteMin: t.absoluteMin });
  const found: string[] = [];
  if (m.horizontalScroll) found.push(`${state}: horizontal scroll (${m.scrollWidth} px)`);
  for (const s of m.smallPrimaryTargets) found.push(`${state}: tap target below ${t.primaryMin} px: ${s}`);
  for (const s of m.crowdedTargets) found.push(`${state}: targets < ${t.primaryGap} px apart: ${s}`);
  for (const s of m.tinyTargets) found.push(`${state}: target below ${t.absoluteMin} px: ${s}`);
  for (const a of await runAxe(page, axeOn)) found.push(`${state}: axe ${a.id} (${a.nodes}): ${a.targets.slice(0, 2).join(", ")}`);
  return found;
}

/** Whether the focused element is fully on screen and on top (not under the action bar or another layer). */
const focusedShown = (page: PwPage) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return "nothing focused";
    const r = el.getBoundingClientRect();
    const desc = `${el.tagName.toLowerCase()} "${(el.textContent ?? "").trim()}"`;
    if (r.top < 0 || r.left < 0 || r.bottom > window.innerHeight + 0.5 || r.right > window.innerWidth + 0.5) return `${desc} off screen (${Math.round(r.top)}..${Math.round(r.bottom)})`;
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (!hit || !(hit === el || el.contains(hit))) return `${desc} covered by ${hit ? `${hit.tagName.toLowerCase()}.${hit.className}` : "nothing"}`;
    return null;
  });

/**
 * Walks the menu by keyboard from the first nav target: every entry gets focus, in order, and is on screen when it
 * has it. "Več" opens with Enter. Returns the problems and the hrefs focused.
 */
async function keyboardWalk(page: PwPage, start: string, total: number): Promise<{ problems: string[]; hrefs: string[] }> {
  const problems: string[] = [];
  const hrefs: string[] = [];
  await page.focus(start);
  for (let i = 0; i < total * 2 + 4 && hrefs.length < total; i++) {
    if (i > 0) await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return {
        inNav: !!el?.closest("#site-nav"),
        href: el?.getAttribute("href") ?? null,
        more: el?.hasAttribute("data-nav-more") ?? false,
        open: (el?.parentElement as HTMLDetailsElement | null)?.open ?? false,
      };
    });
    if (!info.inNav) {
      if (i > 0) break;
      continue;
    }
    const off = await focusedShown(page);
    if (off) problems.push(`keyboard: ${off}`);
    if (info.more && !info.open) {
      await page.keyboard.press("Enter");
      if (!(await moreOpen(page))) problems.push("keyboard: Enter doesn't open Več");
    }
    if (info.href) hrefs.push(info.href);
  }
  return { problems, hrefs };
}

const moreOpen = (page: PwPage) => page.evaluate(() => document.querySelector<HTMLDetailsElement>(".site-nav__more details")?.open ?? false);

async function checkLook(look: Look, spec: SiteSpec, media: Map<string, Uint8Array>, out: string): Promise<string[]> {
  const found: string[] = [];
  const valid = validateSite(spec);
  if (!valid.ok) found.push(...valid.issues.map((i) => `invalid: ${i.path} ${i.message}`));
  for (const [rel, data] of siteFiles(spec, media, { imageWidths: config.images.widths })) {
    const file = path.join(out, rel);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, data);
  }
  const navHrefs = spec.pages.filter((p) => p.nav.show).length;
  const server = await serveStatic(out);
  const name = `${look.site}-${look.family}`;
  try {
    for (const w of [{ width: 360, height: 800 }, { width: 1280, height: 800 }]) {
      const phone = w.width < 768;
      const ctx = await browser.newContext({ viewport: w, deviceScaleFactor: 1, reducedMotion: "reduce", ...(phone ? { isMobile: true, hasTouch: true } : {}) });
      await ctx.addInitScript("globalThis.__name = globalThis.__name || ((f) => f)");
      const page = await ctx.newPage();
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(`${server.url}/${spec.slug}/index.html`, { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      const at = `${w.width} px`;
      found.push(...(await pageProblems(page, `${at} closed`)));
      if (shots) await page.screenshot({ path: path.join(shots, `${name}-${w.width}.png`) });
      const count = await page.locator("#site-nav .site-nav__list > li > a[href]").count();
      if (count !== navHrefs) found.push(`${at}: ${count} menu links, expected ${navHrefs}`);
      if (phone) {
        const toggle = page.locator("[data-nav-toggle]");
        await toggle.click();
        if ((await toggle.getAttribute("aria-expanded")) !== "true") found.push(`${at}: the menu doesn't open`);
        found.push(...(await pageProblems(page, `${at} open`)));
        if (shots) await page.screenshot({ path: path.join(shots, `${name}-${w.width}-open.png`) });
        const walk = await keyboardWalk(page, "[data-nav-toggle]", count);
        found.push(...walk.problems.map((p) => `${at} ${p}`));
        if (walk.hrefs.length !== count) found.push(`${at}: keyboard reached ${walk.hrefs.length} of ${count} links`);
        if (shots) await page.screenshot({ path: path.join(shots, `${name}-${w.width}-open-end.png`) });
        // The focus trap: Tab past the last link wraps to the menu button; Escape closes.
        await page.keyboard.press("Tab");
        if (!(await page.evaluate(() => document.activeElement?.hasAttribute("data-nav-toggle")))) found.push(`${at}: Tab after the last link leaves the menu`);
        await page.keyboard.press("Escape");
        if ((await toggle.getAttribute("aria-expanded")) !== "false") found.push(`${at}: Escape doesn't close the menu`);
      } else {
        // The wide header: one tidy row of links (two where the nav has its own row), nothing overlapping.
        const geo = await page.evaluate(() => {
          const header = document.querySelector(".site-header")!.getBoundingClientRect();
          const items = [...document.querySelectorAll<HTMLElement>("#site-nav a[href], #site-nav [data-nav-more]")].filter((el) => el.checkVisibility());
          const boxes = items.map((el) => ({ text: (el.textContent ?? "").trim(), r: el.getBoundingClientRect() }));
          // The brand's name or logo (the centred family pads its link to keep it clear of the absolute actions).
          const others = [...document.querySelectorAll<HTMLElement>(".site-header__name, .site-header__logo, .site-header__actions a, .site-header__cta, .site-header__phone")]
            .filter((el) => el.getBoundingClientRect().width > 0)
            .map((el) => ({ text: (el.textContent ?? "").trim() || el.className, r: el.getBoundingClientRect() }));
          const overlaps: string[] = [];
          const all = [...boxes, ...others];
          for (let i = 0; i < all.length; i++)
            for (let j = i + 1; j < all.length; j++) {
              const a = all[i]!.r;
              const b = all[j]!.r;
              if (a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5) overlaps.push(`${all[i]!.text} × ${all[j]!.text}`);
            }
          return { height: header.height, rows: new Set(boxes.map((b) => Math.round(b.r.top))).size, overlaps, shown: boxes.length };
        });
        const ownRow = ["stacked", "centred"].includes(look.family);
        if (geo.rows > (ownRow ? 2 : 1)) found.push(`${at}: the menu wraps into ${geo.rows} rows`);
        for (const o of geo.overlaps) found.push(`${at}: overlap ${o}`);
        if (geo.height > (ownRow ? 220 : 120)) found.push(`${at}: header ${Math.round(geo.height)} px tall`);
        const walk = await keyboardWalk(page, "#site-nav a[href]", count);
        found.push(...walk.problems.map((p) => `${at} ${p}`));
        if (walk.hrefs.length !== count) found.push(`${at}: keyboard reached ${walk.hrefs.length} of ${count} links`);
        if (new Set(walk.hrefs).size !== walk.hrefs.length) found.push(`${at}: keyboard reached a link twice`);
        if (await page.locator("[data-nav-more]").count()) {
          if (await moreOpen(page)) {
            found.push(...(await pageProblems(page, `${at} Več open`, ".site-header")));
            if (shots) await page.screenshot({ path: path.join(shots, `${name}-${w.width}-more.png`) });            await page.keyboard.press("Escape");
            if (await moreOpen(page)) found.push(`${at}: Escape doesn't close Več`);
            if (!(await page.evaluate(() => document.activeElement?.hasAttribute("data-nav-more")))) found.push(`${at}: Escape doesn't return focus to Več`);
            // A tap outside closes it too.
            await page.keyboard.press("Enter");
            if (!(await moreOpen(page))) found.push(`${at}: Enter doesn't open Več`);
            await page.mouse.click(w.width / 2, w.height - 20);
            if (await moreOpen(page)) found.push(`${at}: a tap outside doesn't close Več`);
          } else found.push(`${at}: Več never opened`);
        }
      }
      if (errors.length) found.push(`${at}: page errors ${errors.join("; ")}`);
      await ctx.close();
    }
  } finally {
    await server.close();
  }
  return found;
}

describe(`the header with Plus's ${MAX_PAGES} pages at 360 and 1280 px`, () => {
  it("builds valid specs with the plan's most pages and labels at the spec's limit", async () => {
    const spec = await lookSpec(LOOKS[0]!);
    expect(spec.pages.filter((p) => p.kind === "home" || p.kind === "standard")).toHaveLength(MAX_PAGES);
    expect(spec.pages.filter((p) => p.nav.show)).toHaveLength(MAX_PAGES);
    expect(Math.max(...spec.pages.map((p) => p.nav.label.length))).toBe(MAX_LABEL);
    expect(validateSite(spec).ok).toBe(true);
  });

  for (const look of LOOKS) {
    it(`${look.family} (${look.site}${look.actions ? `, skeleton, actions ${look.actions}` : ""})`, async () => {
      const spec = await lookSpec(look);
      const media = await fixtureMedia(look.site, spec);
      expect(await checkLook(look, spec, media, path.join(dir, `${look.site}-${look.family}`))).toEqual([]);
    }, 180_000);
  }
});
