/**
 * pnpm variety:skeleton [<golden>[,<golden>]]
 *
 * The skeleton families (spec v15, packages/spec/src/skeleton.ts; docs/plans/variety-engine.md Step 4) rendered on three
 * goldens: every header family once per golden, the other axes (phone actions, footer family and tone, width, cards,
 * buttons, dividers, photo ratio) rotating through their values so each one shows on every golden, plus the trade
 * template whose hero is the phone (the plate) under each phone action; every other look centres one section per page. Each look at 360 and 1280 px with the page checks
 * the eval uses (a valid spec, no horizontal scroll, banned patterns, axe WCAG 2.2 A/AA, one h1, 44 px targets, call and
 * directions in one tap on the phone, the phone header's brand row: name on one line, logo not squeezed) and the new
 * one: never more than one call button on a screen. Looks with long business names ("long-name") cover every header
 * family. Writes
 * eval/look/skeleton-<golden>.jpg (one row per look: phone first screen, phone footer, desktop first screen, desktop
 * footer) and eval/look/skeleton-checks.json. No model call. Exits 1 when a check fails.
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { chromium, type Browser, type Page } from "playwright";
import { loadConfig } from "@sb/config";
import { callButtonsPerScreen, heroEyebrow, measurePage, runAxe, serveStatic } from "@sb/engine";
import { siteFiles } from "@sb/render";
import {
  BUTTON_STYLES,
  CARD_STYLES,
  DIRECTIONS,
  DIVIDERS,
  FAMILIES,
  FOOTER_FAMILIES,
  HEADER_FAMILIES,
  PHONE_ACTIONS,
  PHOTO_RATIOS,
  SECTION_WIDTHS,
  canCentre,
  enforceDesign,
  migrateSpec,
  validateSite,
  type SiteSpec,
  type Skeleton,
} from "@sb/spec";
import { fixtureMedia, heroAs } from "./families-sheet.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");

/** A template with a photo hero (kmetija), a non-template site with a logo (pekarna), a call-first one (avtoservis). */
export const SKELETON_GOLDENS = ["kmetija-grabnar", "pekarna-kvas", "avtoservis-mrak"] as const;
const TONES: Skeleton["footerTone"][] = ["default", "alt", "inverse", "band"];

export interface SkeletonVariant {
  /** Golden id, "<golden>+tablica" for the plate hero, or "long-name". */
  site: string;
  label: string;
  skeleton: Skeleton;
  spec: SiteSpec;
  fixtureId: string;
  /** Rendered without the fixture's logo (fixtureMedia puts the fixture's assets back). */
  noLogo?: true;
}

/** The golden as the generator leaves it with the skeleton on: its hero's address eyebrow gone (heroEyebrow). */
async function golden(id: string): Promise<SiteSpec> {
  const spec = migrateSpec(JSON.parse(await readFile(path.join(repoRoot, "tools/eval/golden", `${id}.json`), "utf8")));
  const hero = spec.pages.find((p) => p.kind === "home")!.sections[0]!;
  const props = hero.props as { eyebrow?: string };
  if (props.eyebrow !== undefined && heroEyebrow(props.eyebrow, spec.business.address, false) === undefined) delete props.eyebrow;
  return spec;
}

const pick = <T>(list: readonly T[], i: number): T => list[i % list.length]!;

/** The skeleton for look `i` on golden `g`: header family i, every other axis rotated so each value shows. */
export function rotation(i: number, g: number): Skeleton {
  return {
    header: HEADER_FAMILIES[i]!,
    actions: pick(PHONE_ACTIONS, i + g),
    footer: pick(FOOTER_FAMILIES, i + g),
    footerTone: pick(TONES, i + 2 * g),
    width: pick(SECTION_WIDTHS, i + g),
    cards: pick(CARD_STYLES, i + 2 * g),
    buttons: pick(BUTTON_STYLES, i + g + 1),
    dividers: pick(DIVIDERS, i + g),
    photoRatio: pick(PHOTO_RATIOS, i + 3 * g),
  };
}

const short = (s: Skeleton) =>
  `${s.header} · ${s.actions} · ${s.footer}/${s.footerTone} · ${s.width} · ${s.cards} · ${s.buttons} · ${s.dividers} · ${s.photoRatio}${s.centred?.length ? ` · centred ${s.centred.length}` : ""}`;

/**
 * Alignment per section on look `i`: every other look centres one section per page (below the first), a different one
 * each time, among those that may be (canCentre); the others start every section at the left edge.
 */
export function centredFor(spec: SiteSpec, i: number): string[] {
  if (i % 2 === 1) return [];
  return spec.pages.flatMap((p) => {
    const motif = DIRECTIONS.find((d) => d.id === spec.design.direction)?.template?.motif;
    const candidates = p.kind === "home" || p.kind === "standard" ? p.sections.slice(1).filter((s) => canCentre(s, motif)) : [];
    return candidates.length ? [candidates[(i / 2) % candidates.length]!.id] : [];
  });
}

/** Every look of the sheet (or of the goldens named). */
export async function skeletonVariants(only?: string[]): Promise<SkeletonVariant[]> {
  const out: SkeletonVariant[] = [];
  for (const [g, id] of SKELETON_GOLDENS.entries()) {
    if (only && !only.includes(id)) continue;
    const base = await golden(id);
    for (const i of HEADER_FAMILIES.keys()) {
      const spec = structuredClone(base);
      const centred = centredFor(spec, i);
      const skeleton: Skeleton = { ...rotation(i, g), ...(centred.length ? { centred } : {}) };
      spec.design = { ...spec.design, skeleton };
      out.push({ site: id, label: short(skeleton), skeleton, spec, fixtureId: id });
    }
  }
  // The plate: the hero's object is the call, so the bar's, the floating button's or the header's call waits for it.
  if (!only || only.includes("avtoservis-mrak")) {
    const base = await golden("avtoservis-mrak");
    const dir = DIRECTIONS.find((d) => d.id === "tablica")!;
    for (const [i, actions] of PHONE_ACTIONS.entries()) {
      const spec = structuredClone(base);
      const skeleton: Skeleton = { ...rotation(i + 3, 1), header: (["phone", "compact", "word"] as const)[i]!, actions };
      spec.design = { ...enforceDesign({ ...spec.design, direction: dir.id, fontPair: FAMILIES.tablica!.fontPairs[0]! }, dir), skeleton };
      const home = spec.pages.find((p) => p.kind === "home")!;
      home.sections[0] = heroAs(home.sections[0]!, "hero-signature:photo", spec.assets.images[0]?.id ?? null);
      // And the plate again at the end (contact call-out, the template's closing call): the bar's, the floating
      // button's or the header's call steps aside while it is on screen too.
      for (const s of home.sections) if (s.type === "contact") s.variant = "call-out";
      out.push({ site: "avtoservis-mrak+tablica", label: short(skeleton), skeleton, spec, fixtureId: "avtoservis-mrak" });
    }
  }
  // A long business name (HQ it-skeleton-phone-header-wrap): the phone family's number beside it wrapped the name at
  // 360 px. Under each phone action, with the logo and with the name alone, on the bakery and in the plate template
  // (heavy uppercase); the other families once each with the name alone.
  if (!only || only.includes("long-name")) {
    // The bakery has a logo: with it and with the name alone; the plate template (avtoservis has no logo) the name alone.
    for (const [g, id] of [[1, "pekarna-kvas"], [2, "avtoservis-mrak"]] as const) {
      const base = await golden(id);
      base.business.name = LONG_NAMES[g - 1]!;
      if (id === "avtoservis-mrak") {
        const dir = DIRECTIONS.find((d) => d.id === "tablica")!;
        base.design = enforceDesign({ ...base.design, direction: dir.id, fontPair: FAMILIES.tablica!.fontPairs[0]! }, dir);
        // As a tablica site is made: the plate hero and the closing call-out.
        const home = base.pages.find((p) => p.kind === "home")!;
        home.sections[0] = heroAs(home.sections[0]!, "hero-signature:photo", base.assets.images[0]?.id ?? null);
        for (const s of home.sections) if (s.type === "contact") s.variant = "call-out";
      }
      for (const [i, actions] of PHONE_ACTIONS.entries()) {
        for (const logo of base.assets.logo ? [true, false] : [false]) {
          const spec = structuredClone(base);
          if (!logo) delete spec.assets.logo;
          const skeleton: Skeleton = { ...rotation(i, g), header: "phone", actions };
          spec.design = { ...spec.design, skeleton };
          out.push({ site: "long-name", label: `${spec.business.name}${logo ? " + logo" : ""} · ${short(skeleton)}`, skeleton, spec, fixtureId: id, ...(logo ? {} : { noLogo: true as const }) });
        }
      }
      if (id !== "pekarna-kvas") continue;
      for (const [i, header] of HEADER_FAMILIES.filter((h) => h !== "phone").entries()) {
        const spec = structuredClone(base);
        delete spec.assets.logo;
        const skeleton: Skeleton = { ...rotation(i, g), header };
        spec.design = { ...spec.design, skeleton };
        out.push({ site: "long-name", label: `${spec.business.name} · ${short(skeleton)}`, skeleton, spec, fixtureId: id, noLogo: true });
      }
    }
  }
  return out;
}

/** Business names of 24 characters and more (Slovene, with č, š, ž). */
export const LONG_NAMES = ["Pekarna in slaščičarna Kvas", "Avtoservis Mrak in sinovi"] as const;

export interface SkeletonCheck {
  site: string;
  label: string;
  width: number;
  problems: string[];
  /** Most call buttons on one screen. */
  calls: number;
}

/** Renders a look and checks its homepage at 360 and 1280 px; returns first screens, footers and the problems. */
export async function renderSkeleton(browser: Browser, v: SkeletonVariant, media: Map<string, Uint8Array>, dir: string): Promise<{ shots: Buffer[]; checks: SkeletonCheck[] }> {
  const config = loadConfig();
  if (v.noLogo) delete v.spec.assets.logo;
  const valid = validateSite(v.spec);
  const invalid = valid.ok ? [] : valid.issues.map((i) => `invalid: ${i.path} ${i.message}`);
  await rm(dir, { recursive: true, force: true });
  for (const [rel, data] of siteFiles(v.spec, media, { imageWidths: config.images.widths })) {
    const file = path.join(dir, rel);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, data);
  }
  const server = await serveStatic(dir);
  const shots: Buffer[] = [];
  const checks: SkeletonCheck[] = [];
  try {
    for (const w of [{ width: 360, height: 800 }, { width: 1280, height: 800 }]) {
      const phone = w.width < 768;
      const ctx = await browser.newContext({ viewport: w, deviceScaleFactor: 1, reducedMotion: "reduce", ...(phone ? { isMobile: true, hasTouch: true } : {}) });
      const page = await ctx.newPage();
      await page.goto(`${server.url}/${v.spec.slug}/index.html`, { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      const t = config.checks.tapTarget;
      const m = await measurePage(page, { primaryMin: t.primaryMin, primaryGap: t.primaryGap, absoluteMin: t.absoluteMin });
      const h1 = await page.evaluate(() => document.querySelectorAll("h1").length);
      const found = [...invalid];
      for (const a of await runAxe(page)) found.push(`axe ${a.id} (${a.nodes}): ${a.targets.slice(0, 2).join(", ")}`);
      if (m.horizontalScroll) found.push(`horizontal scroll (${m.scrollWidth} px)`);
      for (const b of m.banned) found.push(`banned: ${b}`);
      for (const s of m.smallPrimaryTargets) found.push(`tap target below ${t.primaryMin} px: ${s}`);
      // The generation's own page checks (check/index.ts) also refuse crowded and tiny targets on phones.
      if (phone) for (const s of m.crowdedTargets) found.push(`targets < ${t.primaryGap} px apart: ${s}`);
      if (phone) for (const s of m.tinyTargets) found.push(`target below ${t.absoluteMin} px: ${s}`);
      if (h1 !== 1) found.push(`${h1} h1 elements`);
      if (phone) found.push(...(await headerRow(page)));
      if (phone && !m.callInViewport) found.push("click-to-call not in the first screen");
      if (phone && !m.directionsInViewport) found.push("directions not in the first screen");
      const calls = await callButtonsPerScreen(page);
      if (calls.max > 1) found.push(`${calls.max} call buttons on one screen (at ${calls.at} px): ${calls.buttons.join(", ")}`);
      shots.push(await page.screenshot());
      await page.evaluate("window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' })");
      await page.waitForTimeout(80);
      shots.push(await page.screenshot());
      checks.push({ site: v.site, label: v.label, width: w.width, problems: found, calls: calls.max });
      await ctx.close();
    }
  } finally {
    await server.close();
  }
  return { shots, checks };
}

/**
 * The phone header's first row on a site with a skeleton (HQ it-skeleton-phone-header-wrap): the business name on one line (the centred family's
 * wordmark: two balanced lines at most, its menu icon takes room on both sides), the logo at its full height (not
 * squeezed by what shares its row), the menu button on the brand's row, the phone number on one line. A string, not a
 * function: the bundler's helpers don't exist in the page.
 */
const HEADER_ROW = `(() => {
  const out = [];
  // Only the skeleton's header families fit the name to their row; today's header wraps a long name by design.
  if (!document.body.hasAttribute("data-skeleton")) return out;
  // Line boxes of an element's visible text (its text nodes only, not the inline elements' own boxes).
  const lines = (el) => {
    const tops = new Set();
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let t = walk.nextNode(); t; t = walk.nextNode()) {
      if (t.parentElement.closest(".visually-hidden")) continue;
      const range = document.createRange();
      range.selectNodeContents(t);
      for (const r of range.getClientRects()) if (r.width > 0) tops.add(Math.round(r.top / 4));
    }
    return tops.size;
  };
  const name = document.querySelector(".site-header__name");
  if (name) {
    const most = document.querySelector(".site-header--centred") ? 2 : 1;
    const n = lines(name);
    if (n > most) out.push("header name on " + n + " lines: " + name.textContent.trim());
  }
  const logo = document.querySelector(".site-header__logo");
  if (logo) {
    const maxH = parseFloat(getComputedStyle(logo).maxHeight);
    const h = Number(logo.getAttribute("height"));
    const w = Number(logo.getAttribute("width"));
    const want = Math.min(maxH || h, h) * (w / h);
    const got = logo.getBoundingClientRect().width;
    if (got < want - 1) out.push("header logo squeezed to " + Math.round(got) + " px (of " + Math.round(want) + ")");
  }
  const brand = document.querySelector(".site-header__brand");
  const toggle = document.querySelector(".site-header .nav-toggle");
  if (brand && toggle && getComputedStyle(toggle).display !== "none") {
    const b = brand.getBoundingClientRect();
    const t = toggle.getBoundingClientRect();
    if (t.top >= b.bottom || t.bottom <= b.top) out.push("menu button not on the brand's row");
    if (lines(toggle) > 1) out.push("menu label wraps");
  }
  const phone = document.querySelector(".site-header__phone");
  if (phone && phone.getClientRects().length && lines(phone) > 1) out.push("header phone number wraps");
  return out;
})()`;

async function headerRow(page: Page): Promise<string[]> {
  return (await page.evaluate(HEADER_ROW)) as string[];
}

/** One row per look: phone top, phone footer, desktop top, desktop footer. */
export async function sheet(rows: { label: string; shots: Buffer[] }[]): Promise<Buffer> {
  const phoneW = 180;
  const deskW = 448;
  const h = 400;
  const width = 20 + 2 * (phoneW + 10) + 2 * (deskW + 10) + 10;
  const rowH = h + 34;
  const composites: { input: Buffer; top: number; left: number }[] = [];
  const text = (t: string, w: number) =>
    Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="26"><text x="2" y="19" font-family="sans-serif" font-size="15" font-weight="700" fill="#1a1a1a">${t.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</text></svg>`);
  for (const [r, row] of rows.entries()) {
    const top = 10 + r * rowH;
    composites.push({ input: text(row.label, width - 20), top, left: 20 });
    const [pTop, pFoot, dTop, dFoot] = row.shots;
    const cells: [Buffer, number, number][] = [
      [pTop!, phoneW, 20],
      [pFoot!, phoneW, 20 + phoneW + 10],
      [dTop!, deskW, 20 + 2 * (phoneW + 10)],
      [dFoot!, deskW, 20 + 2 * (phoneW + 10) + deskW + 10],
    ];
    for (const [img, w, left] of cells) {
      const ch = w === phoneW ? h : Math.round((w * 800) / 1280);
      composites.push({ input: await sharp(img).resize(w, ch, { fit: "cover", position: "top" }).png().toBuffer(), top: top + 28, left });
    }
  }
  return sharp({ create: { width, height: rows.length * rowH + 20, channels: 3, background: "#e9e9e9" } }).composite(composites).jpeg({ quality: 76 }).toBuffer();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const only = process.argv[2]?.split(",");
  const lookDir = path.join(repoRoot, "eval/look");
  await mkdir(lookDir, { recursive: true });
  const browser = await chromium.launch();
  const all: SkeletonCheck[] = [];
  try {
    const variants = await skeletonVariants(only);
    const bySite = new Map<string, { label: string; shots: Buffer[] }[]>();
    for (const [n, v] of variants.entries()) {
      const media = await fixtureMedia(v.fixtureId, v.spec);
      const r = await renderSkeleton(browser, v, media, path.join(repoRoot, "eval/runs/skeleton", `${v.site}-${n}`));
      all.push(...r.checks);
      const rows = bySite.get(v.site) ?? [];
      rows.push({ label: v.label, shots: [r.shots[0]!, r.shots[1]!, r.shots[2]!, r.shots[3]!] });
      bySite.set(v.site, rows);
      const bad = r.checks.filter((c) => c.problems.length);
      console.log(`${v.site} ${v.label}: ${bad.length ? bad.map((c) => `${c.width} px: ${c.problems.join("; ")}`).join(" | ") : "ok"}`);
    }
    for (const [site, rows] of bySite) await writeFile(path.join(lookDir, `skeleton-${site.replace("+", "-")}.jpg`), await sheet(rows));
  } finally {
    await browser.close();
  }
  await writeFile(path.join(lookDir, "skeleton-checks.json"), JSON.stringify(all, null, 1));
  const failing = all.filter((c) => c.problems.length);
  console.log(`\n${all.length} renders, ${failing.length} with problems. Sheets in eval/look/skeleton-*.jpg.`);
  process.exit(failing.length ? 1 : 0);
}
