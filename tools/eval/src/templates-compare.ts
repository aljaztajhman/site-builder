/**
 * pnpm templates:compare <letter>[,<letter>] (e.g. R,T)
 *
 * Renders a hand-made design template (docs/design/templates) and the engine's version of it (the fixture's
 * golden spec in tools/eval/golden, rendered by the shared component library with the fixture's own photos)
 * in Chromium at 1440, 1280, 390 and 360 px, and checks the engine's homepage at each width: no horizontal
 * scroll, no broken images, primary tap targets ≥ 44 px, exactly one h1, exactly one primary action in the
 * hero, and the page checks' banned patterns. Writes eval/runs/templates-<letter>/: first-screen pairs
 * (desktop.jpg at 1440 and 1280, phone.jpg at 390 and 360; hand-made left, engine right), checks.json, and
 * whole pages side by side at 1280 and 390 px (full-desktop.jpg, full-phone.jpg) for the sections below.
 * No model calls. Exits 1 when a check fails.
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { chromium, type Browser, type Page } from "playwright";
import { loadConfig } from "@sb/config";
import { loadLazyImages, measurePage, processLogo, processPhoto, serveStatic } from "@sb/engine";
import { siteFiles } from "@sb/render";
import { FONTS, migrateSpec, validateSite, type SiteSpec } from "@sb/spec";
import { loadFixture } from "./fixtures/load.ts";

type Image = ReturnType<typeof sharp>;

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const WIDTHS = [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
  { width: 360, height: 800 },
] as const;

interface TemplateEntry {
  id: string;
  name: string;
  file: string;
  fixture: string | null;
}

export interface WidthCheck {
  width: number;
  scrollWidth: number;
  horizontalScroll: boolean;
  brokenImages: string[];
  smallPrimaryTargets: string[];
  tinyTargets: string[];
  h1: number;
  heroPrimaryActions: string[];
  banned: string[];
}

/** The problems in one width's check, as lines; empty when it passes. */
export function failures(c: WidthCheck): string[] {
  const out: string[] = [];
  if (c.horizontalScroll) out.push(`horizontal scroll (${c.scrollWidth} px)`);
  for (const b of c.brokenImages) out.push(`broken image ${b}`);
  for (const t of c.smallPrimaryTargets) out.push(`tap target below 44 px: ${t}`);
  for (const t of c.tinyTargets) out.push(`tap target below 24 px: ${t}`);
  if (c.h1 !== 1) out.push(`${c.h1} h1 elements`);
  if (c.heroPrimaryActions.length !== 1) out.push(`${c.heroPrimaryActions.length} primary actions in the hero: ${c.heroPrimaryActions.join(", ")}`);
  for (const b of c.banned) out.push(`banned: ${b}`);
  return out;
}

/** The hand-made templates load Google Fonts; offline, the same families come from the repo's subset files. */
function localFontsCss(base: string): string {
  return Object.values(FONTS)
    .map((f) => `@font-face{font-family:"${f.family}";src:url("${base}/packages/render/assets/fonts/${f.file}.woff2") format("woff2");font-weight:${f.weights[0]} ${f.weights[1]};font-display:block}`)
    .join("\n");
}

async function engineSite(fixtureId: string, outDir: string): Promise<SiteSpec> {
  const fixture = loadFixture(fixtureId);
  const config = loadConfig();
  const raw = JSON.parse(await readFile(path.join(repoRoot, "tools/eval/golden", `${fixtureId}.json`), "utf8")) as unknown;
  const spec = migrateSpec(raw);
  const valid = validateSite(spec);
  if (!valid.ok) throw new Error(`${fixtureId}: golden spec is invalid\n${valid.issues.map((i) => `  ${i.path}: ${i.message}`).join("\n")}`);
  const media = new Map<string, Uint8Array>();
  for (const [i, img] of spec.assets.images.entries()) {
    const photo = fixture.photos[i];
    if (!photo) throw new Error(`${fixtureId}: golden spec has more images than the fixture has photos`);
    const processed = await processPhoto(img.id, new Uint8Array(await readFile(photo.path)), config.images.widths, { avif: config.images.avifQuality, webp: config.images.webpQuality });
    for (const v of processed.variants) media.set(v.file, v.data);
    img.width = processed.width;
    img.height = processed.height;
  }
  if (spec.assets.logo && fixture.logoPath) {
    const logo = await processLogo(new Uint8Array(await readFile(fixture.logoPath)), "image/svg+xml");
    media.set(logo.file, logo.data);
    spec.assets.logo = { ...spec.assets.logo, file: logo.file, width: logo.width, height: logo.height };
  }
  for (const [rel, data] of siteFiles(spec, media, { imageWidths: config.images.widths })) {
    const file = path.join(outDir, rel);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, data);
  }
  return spec;
}

async function settle(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
}

async function checkEngine(page: Page): Promise<Omit<WidthCheck, "width">> {
  const t = loadConfig().checks.tapTarget;
  const m = await measurePage(page, { primaryMin: t.primaryMin, primaryGap: t.primaryGap, absoluteMin: t.absoluteMin });
  await loadLazyImages(page);
  const extra = await page.evaluate(() => {
    const brokenImages = [...document.images].filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.currentSrc || i.src);
    const hero = document.querySelector("main > section");
    // The hero's primary action: a primary button or the motif's call object (plate, call block, poster number).
    const heroPrimaryActions = hero
      ? [...hero.querySelectorAll(".btn--primary, a.plate, a.callblock, a.bignum")]
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
          })
          .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join(".")} "${(el.textContent ?? "").trim().slice(0, 30)}"`)
      : [];
    // On a phone the engine hides the hero's call button when the sticky call bar shows it from the start
    // (body.bar-covers-hero-call): the bar's call is then the hero's one primary action.
    if (heroPrimaryActions.length === 0 && document.body.classList.contains("bar-covers-hero-call")) {
      const call = document.querySelector('.action-bar a[href^="tel:"]');
      if (call && call.getBoundingClientRect().height > 0) heroPrimaryActions.push(`action bar call "${(call.textContent ?? "").trim()}"`);
    }
    return { brokenImages, heroPrimaryActions, h1: document.querySelectorAll("h1").length };
  });
  return {
    scrollWidth: m.scrollWidth,
    horizontalScroll: m.horizontalScroll,
    smallPrimaryTargets: m.smallPrimaryTargets,
    tinyTargets: m.tinyTargets,
    banned: m.banned,
    ...extra,
  };
}

async function firstScreen(browser: Browser, url: string, w: { width: number; height: number }, fonts: string | null): Promise<{ png: Buffer; page: Page; close: () => Promise<void> }> {
  const ctx = await browser.newContext({ viewport: w, deviceScaleFactor: 1, reducedMotion: "reduce" });
  if (fonts !== null) {
    await ctx.route(/fonts\.googleapis\.com/, (r) => r.fulfill({ status: 200, contentType: "text/css", body: fonts }));
    await ctx.route(/fonts\.gstatic\.com/, (r) => r.abort());
  }
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "networkidle" });
  await settle(page);
  const png = await page.screenshot();
  return { png, page, close: () => ctx.close() };
}

async function pair(left: Buffer, right: Buffer, labels: [string, string]): Promise<Image> {
  const [a, b] = await Promise.all([sharp(left).metadata(), sharp(right).metadata()]);
  const gap = 24;
  const head = 36;
  const width = a.width! + gap + b.width!;
  const height = head + Math.max(a.height!, b.height!);
  const label = (x: number, text: string) => `<text x="${x}" y="25" font-family="sans-serif" font-size="18" font-weight="700" fill="#1a1a1a">${text}</text>`;
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${head}">${label(4, labels[0])}${label(a.width! + gap + 4, labels[1])}</svg>`);
  return sharp({ create: { width, height, channels: 3, background: "#e9e9e9" } }).composite([
    { input: svg, top: 0, left: 0 },
    { input: left, top: head, left: 0 },
    { input: right, top: head, left: a.width! + gap },
  ]);
}

/** Two pairs stacked (e.g. 1440 above 1280). */
async function stack(top: Image, bottom: Image): Promise<Buffer> {
  const [t, b] = await Promise.all([top.png().toBuffer(), bottom.png().toBuffer()]);
  const [tm, bm] = await Promise.all([sharp(t).metadata(), sharp(b).metadata()]);
  const width = Math.max(tm.width!, bm.width!);
  return sharp({ create: { width, height: tm.height! + bm.height! + 24, channels: 3, background: "#e9e9e9" } })
    .composite([
      { input: t, top: 0, left: 0 },
      { input: b, top: tm.height! + 24, left: 0 },
    ])
    .jpeg({ quality: 78 })
    .toBuffer();
}

async function compare(t: TemplateEntry, browser: Browser): Promise<{ checks: WidthCheck[]; problems: string[] }> {
  if (!t.fixture) throw new Error(`${t.id} has no fixture`);
  const outDir = path.join(repoRoot, "eval/runs", `templates-${t.id.toLowerCase()}`);
  // The rendered engine site stays next to the pictures (eval/runs is not committed) for a closer look.
  const siteDir = path.join(outDir, "site");
  await rm(siteDir, { recursive: true, force: true });
  await mkdir(siteDir, { recursive: true });
  const repoServer = await serveStatic(repoRoot);
  const siteServer = await serveStatic(siteDir);
  const fonts = localFontsCss(repoServer.url);
  try {
    const spec = await engineSite(t.fixture, siteDir);
    const handUrl = `${repoServer.url}/docs/design/templates/${t.file}`;
    const engineUrl = `${siteServer.url}/${spec.slug}/index.html`;
    const checks: WidthCheck[] = [];
    const shots = new Map<number, Image>();
    for (const w of WIDTHS) {
      const hand = await firstScreen(browser, handUrl, w, fonts);
      const engine = await firstScreen(browser, engineUrl, w, null);
      checks.push({ width: w.width, ...(await checkEngine(engine.page)) });
      // Whole pages at one desktop and one phone width, for reviewing the sections below the first screen.
      if (w.width === 1280 || w.width === 390) {
        await loadLazyImages(hand.page);
        const [handFull, engineFull] = [await hand.page.screenshot({ fullPage: true }), await engine.page.screenshot({ fullPage: true })];
        await writeFile(path.join(outDir, `hand-full-${w.width}.png`), handFull);
        await writeFile(path.join(outDir, `engine-full-${w.width}.png`), engineFull);
        const whole = await (await pair(handFull, engineFull, [`${t.id} hand-made, whole page, ${w.width} px`, `Engine, whole page, ${w.width} px`])).png().toBuffer();
        await writeFile(path.join(outDir, `full-${w.width < 1000 ? "phone" : "desktop"}.jpg`), await sharp(whole).resize({ width: w.width < 1000 ? 820 : 1600 }).jpeg({ quality: 72 }).toBuffer());
      }
      shots.set(w.width, await pair(hand.png, engine.png, [`${t.id} ${t.name}, hand-made, ${w.width} px`, `Engine, ${w.width} px`]));
      await writeFile(path.join(outDir, `engine-${w.width}.png`), engine.png);
      await writeFile(path.join(outDir, `hand-${w.width}.png`), hand.png);
      await hand.close();
      await engine.close();
    }
    await writeFile(path.join(outDir, "desktop.jpg"), await stack(shots.get(1440)!, shots.get(1280)!));
    await writeFile(path.join(outDir, "phone.jpg"), await stack(shots.get(390)!, shots.get(360)!));
    await writeFile(path.join(outDir, "checks.json"), `${JSON.stringify(checks, null, 2)}\n`);
    const problems = checks.flatMap((c) => failures(c).map((f) => `${c.width}px: ${f}`));
    return { checks, problems };
  } finally {
    await repoServer.close();
    await siteServer.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const letters = (process.argv[2] ?? "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  const all = (JSON.parse(await readFile(path.join(repoRoot, "docs/design/templates/templates.json"), "utf8")) as { templates: TemplateEntry[] }).templates;
  const chosen = all.filter((t) => letters.includes(t.id));
  if (!chosen.length) {
    console.error("Usage: pnpm templates:compare <letter>[,<letter>]  (templates with a fixture: J to T)");
    process.exit(2);
  }
  const browser = await chromium.launch();
  let failed = false;
  try {
    for (const t of chosen) {
      const { checks, problems } = await compare(t, browser);
      console.log(`\n${t.id} ${t.name} (${t.fixture}): eval/runs/templates-${t.id.toLowerCase()}/`);
      for (const c of checks) console.log(`  ${c.width}px  scroll ${c.scrollWidth}  h1 ${c.h1}  hero actions ${c.heroPrimaryActions.length}  broken ${c.brokenImages.length}  small targets ${c.smallPrimaryTargets.length}  banned ${c.banned.length}`);
      for (const p of problems) console.log(`  FAIL ${p}`);
      if (problems.length) failed = true;
    }
  } finally {
    await browser.close();
  }
  process.exit(failed ? 1 : 0);
}
