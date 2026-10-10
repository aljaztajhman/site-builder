/**
 * pnpm designer:compose-sheet [M,S,J]
 *
 * Proof of expressiveness for the composition language (spec v19, docs/plans/ai-designer-spec.md §2.5). Three
 * hand-made templates (docs/design/templates: M Tablica, S Cevi, J Skorja) re-expressed as composed sections in
 * tools/eval/composed/<letter>.json: each is the fixture's golden spec with its homepage rebuilt from composed sections
 * (facts and photos only from the fixture). Renders each composed homepage and the hand-made page at 360 and 1280 px
 * in Chromium and writes eval/runs/compose-sheet/ (gitignored): a side-by-side contact sheet per template
 * (<letter>.png: hand-made and composed, whole pages, 1280 and 360 px), one combined sheet (sheet.png), the screenshots
 * one by one and report.json. Reported per composed page and width: pixel difference against the hand-made page,
 * axe violations, horizontal scroll, call buttons per screen, and the spec's guard and fact issues. Numbers are
 * reported, not enforced (the test, tools/eval/test/compose-sheet.test.ts, holds the page checks). No model call.
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp, { type OverlayOptions } from "sharp";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { loadConfig } from "@sb/config";
import { callButtonsPerScreen, checkFacts, loadLazyImages, measurePage, runAxe, serveStatic } from "@sb/engine";
import { siteFiles } from "@sb/render";
import { FONTS, migrateSpec, validateSite, type SiteSpec } from "@sb/spec";
import { fixtureMedia } from "./families-sheet.ts";
import { loadFixture } from "./fixtures/load.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, "../../..");
export const COMPOSED_DIR = path.join(repoRoot, "tools/eval/composed");
const OUT = path.join(repoRoot, "eval/runs/compose-sheet");

/** The re-expressed templates: letter, its composed spec, the hand-made page and the fixture both use. */
export const COMPOSED = [
  { id: "M", name: "Tablica", spec: "m.json", hand: "m-tablica.html", fixture: "avtoservis-mrak" },
  { id: "S", name: "Cevi", spec: "s.json", hand: "s-cevi.html", fixture: "instalacije-rebernik" },
  { id: "J", name: "Skorja", spec: "j.json", hand: "j-skorja.html", fixture: "pekarna-kvas" },
] as const;
export type ComposedEntry = (typeof COMPOSED)[number];

export const WIDTHS = [
  { width: 1280, height: 800 },
  { width: 360, height: 800 },
] as const;

/** A composed spec as the renderer gets it (migrated to the current version). */
export async function loadComposed(t: ComposedEntry): Promise<SiteSpec> {
  return migrateSpec(JSON.parse(await readFile(path.join(COMPOSED_DIR, t.spec), "utf8")));
}

/** What the spec's checks say: validateSite (schema, references, banned list, the composed guards) and facts not in the client's text. */
export function specIssues(t: ComposedEntry, spec: SiteSpec): { guards: string[]; facts: string[] } {
  const v = validateSite(spec);
  const guards = v.ok ? [] : v.issues.map((i) => `${i.path}: ${i.message}`);
  const facts = checkFacts(spec, loadFixture(t.fixture).brief.description).map((f) => `${f.path}: ${f.kind} ${f.value}`);
  return { guards, facts };
}

/** Writes the static site of a composed spec, with the fixture's own photos, into `dir`. Returns the homepage's path under it. */
export async function writeComposedSite(t: ComposedEntry, spec: SiteSpec, dir: string): Promise<string> {
  const media = await fixtureMedia(t.fixture, spec);
  for (const [rel, data] of siteFiles(spec, media, { imageWidths: loadConfig().images.widths })) {
    await mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
    await writeFile(path.join(dir, rel), data);
  }
  return `${spec.slug}/index.html`;
}

/** A browser context at a width; phones as a touch phone (as the engine's own page checks). */
export async function openPage(browser: Browser, w: { width: number; height: number }, url: string, fontsCss?: string): Promise<{ page: Page; ctx: BrowserContext }> {
  const phone = w.width < 768;
  const ctx = await browser.newContext({ viewport: w, deviceScaleFactor: 1, reducedMotion: "reduce", ...(phone ? { isMobile: true, hasTouch: true } : {}) });
  if (fontsCss !== undefined) {
    // The hand-made templates load Google Fonts; offline, the same families come from the repo's subset files.
    await ctx.route(/fonts\.googleapis\.com/, (r) => r.fulfill({ status: 200, contentType: "text/css", body: fontsCss }));
    await ctx.route(/fonts\.gstatic\.com/, (r) => r.abort());
  }
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  return { page, ctx };
}

export interface PageChecks {
  axe: string[];
  horizontalScroll: boolean;
  scrollWidth: number;
  /** The most call buttons on one screen (banned: more than one), and where. */
  callButtons: { max: number; at: number; buttons: string[] };
  h1: number;
}

/** The page checks the composed homepage is held to at one width. */
export async function checkPage(page: Page): Promise<PageChecks> {
  const t = loadConfig().checks.tapTarget;
  const m = await measurePage(page, { primaryMin: t.primaryMin, primaryGap: t.primaryGap, absoluteMin: t.absoluteMin });
  const axe = (await runAxe(page)).map((a) => `${a.id} (${a.nodes}): ${a.targets.slice(0, 3).join(", ")}`);
  const callButtons = await callButtonsPerScreen(page);
  const h1 = await page.evaluate(() => document.querySelectorAll("h1").length);
  return { axe, horizontalScroll: m.horizontalScroll, scrollWidth: m.scrollWidth, callButtons, h1 };
}

function localFontsCss(base: string): string {
  return Object.values(FONTS)
    .map((f) => `@font-face{font-family:"${f.family}";src:url("${base}/packages/render/assets/fonts/${f.file}.woff2") format("woff2");font-weight:${f.weights[0]} ${f.weights[1]};font-display:block}`)
    .join("\n");
}

/**
 * Pixel difference of two screenshots, 0 (same) to 100: both resized to the same small grid (fill, so a longer page is
 * squeezed to the other's proportions), then the mean absolute difference of the RGB channels and the share of grid
 * cells whose colour differs by more than 15 %. A coarse measure of layout and colour, not of type.
 */
export async function pixelDiff(a: Buffer, b: Buffer, grid = { width: 96, height: 160 }): Promise<{ mean: number; changed: number }> {
  const raw = (img: Buffer) => sharp(img).resize(grid.width, grid.height, { fit: "fill" }).removeAlpha().raw().toBuffer();
  const [x, y] = await Promise.all([raw(a), raw(b)]);
  let sum = 0;
  let changed = 0;
  for (let i = 0; i < x.length; i += 3) {
    const d = (Math.abs(x[i]! - y[i]!) + Math.abs(x[i + 1]! - y[i + 1]!) + Math.abs(x[i + 2]! - y[i + 2]!)) / 3;
    sum += d;
    if (d > 255 * 0.15) changed++;
  }
  const cells = x.length / 3;
  return { mean: Math.round((sum / cells / 255) * 1000) / 10, changed: Math.round((changed / cells) * 1000) / 10 };
}

const label = (width: number, height: number, lines: string[]) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${lines.map((l, i) => `<text x="6" y="${22 + i * 20}" font-family="sans-serif" font-size="${i === 0 ? 17 : 14}" font-weight="${i === 0 ? 700 : 400}" fill="#1a1a1a">${l.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</text>`).join("")}</svg>`,
  );

/** Images side by side, each under its caption, on a grey ground. */
async function sideBySide(items: { png: Buffer; caption: string[]; width: number }[], gap = 24): Promise<Buffer> {
  const head = 70;
  const scaled = await Promise.all(items.map(async (it) => ({ ...it, png: await sharp(it.png).resize({ width: it.width }).png().toBuffer() })));
  const metas = await Promise.all(scaled.map((s) => sharp(s.png).metadata()));
  const width = scaled.reduce((n, s) => n + s.width, 0) + gap * (scaled.length - 1);
  const height = head + Math.max(...metas.map((m) => m.height!));
  let x = 0;
  const layers: OverlayOptions[] = [];
  for (const s of scaled) {
    layers.push({ input: label(s.width, head, s.caption), top: 0, left: x }, { input: s.png, top: head, left: x });
    x += s.width + gap;
  }
  return sharp({ create: { width, height, channels: 3, background: "#e4e4e4" } }).composite(layers).png().toBuffer();
}

/** Sheets stacked, each scaled to `width`. */
async function stackSheets(sheets: Buffer[], width: number, gap = 48): Promise<Buffer> {
  const scaled = await Promise.all(sheets.map((s) => sharp(s).resize({ width }).png().toBuffer()));
  const metas = await Promise.all(scaled.map((s) => sharp(s).metadata()));
  const height = metas.reduce((n, m) => n + m.height!, 0) + gap * (scaled.length - 1);
  let y = 0;
  const layers = scaled.map((input, i) => {
    const l = { input, top: y, left: 0 };
    y += metas[i]!.height! + gap;
    return l;
  });
  return sharp({ create: { width, height, channels: 3, background: "#ffffff" } }).composite(layers).png().toBuffer();
}

export interface WidthReport extends PageChecks {
  width: number;
  /** Against the hand-made page: the first screen, and the whole page squeezed to the same proportions. */
  diff: { firstScreen: { mean: number; changed: number }; wholePage: { mean: number; changed: number } };
  height: { hand: number; composed: number };
}

export interface TemplateReport {
  id: string;
  name: string;
  fixture: string;
  guards: string[];
  facts: string[];
  widths: WidthReport[];
}

async function sheetFor(t: ComposedEntry, browser: Browser, handBase: string, fontsCss: string, siteBase: string, dir: string): Promise<{ report: TemplateReport; sheet: Buffer }> {
  const spec = await loadComposed(t);
  const { guards, facts } = specIssues(t, spec);
  const home = await writeComposedSite(t, spec, dir);
  const widths: WidthReport[] = [];
  const full = new Map<string, Buffer>();
  for (const w of WIDTHS) {
    const hand = await openPage(browser, w, `${handBase}/docs/design/templates/${t.hand}`, fontsCss);
    const comp = await openPage(browser, w, `${siteBase}/${home}`);
    try {
      const checks = await checkPage(comp.page);
      const [handScreen, compScreen] = [await hand.page.screenshot(), await comp.page.screenshot()];
      await loadLazyImages(hand.page);
      await loadLazyImages(comp.page);
      const [handFull, compFull] = [await hand.page.screenshot({ fullPage: true }), await comp.page.screenshot({ fullPage: true })];
      const tag = `${t.id.toLowerCase()}-${w.width}`;
      await writeFile(path.join(OUT, `${tag}-hand.png`), handFull);
      await writeFile(path.join(OUT, `${tag}-composed.png`), compFull);
      await writeFile(path.join(OUT, `${tag}-hand-screen.png`), handScreen);
      await writeFile(path.join(OUT, `${tag}-composed-screen.png`), compScreen);
      full.set(`${w.width}-hand`, handFull);
      full.set(`${w.width}-composed`, compFull);
      const [hm, cm] = await Promise.all([sharp(handFull).metadata(), sharp(compFull).metadata()]);
      widths.push({
        width: w.width,
        ...checks,
        diff: { firstScreen: await pixelDiff(handScreen, compScreen), wholePage: await pixelDiff(handFull, compFull) },
        height: { hand: hm.height!, composed: cm.height! },
      });
    } finally {
      await hand.ctx.close();
      await comp.ctx.close();
    }
  }
  const at = (wd: number) => widths.find((x) => x.width === wd)!;
  const cap = (wd: number, who: "hand" | "composed") =>
    who === "hand"
      ? [`${t.id} ${t.name}, hand-made, ${wd} px`, `${at(wd).height.hand} px tall`]
      : [`Composed (spec v19), ${wd} px`, `diff ${at(wd).diff.wholePage.mean} % mean, ${at(wd).diff.wholePage.changed} % cells; axe ${at(wd).axe.length}, calls/screen ${at(wd).callButtons.max}`];
  const sheet = await sideBySide([
    { png: full.get("1280-hand")!, caption: cap(1280, "hand"), width: 640 },
    { png: full.get("1280-composed")!, caption: cap(1280, "composed"), width: 640 },
    { png: full.get("360-hand")!, caption: cap(360, "hand"), width: 360 },
    { png: full.get("360-composed")!, caption: cap(360, "composed"), width: 360 },
  ]);
  return { report: { id: t.id, name: t.name, fixture: t.fixture, guards, facts, widths }, sheet };
}

/** Renders the chosen templates, writes the sheets and report.json, returns the reports. */
export async function composeSheet(letters: readonly string[] = COMPOSED.map((t) => t.id)): Promise<TemplateReport[]> {
  const chosen = COMPOSED.filter((t) => letters.includes(t.id));
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  const dir = await mkdtemp(path.join(tmpdir(), "sb-compose-sheet-"));
  const repoServer = await serveStatic(repoRoot);
  const siteServer = await serveStatic(dir);
  const browser = await chromium.launch();
  try {
    const reports: TemplateReport[] = [];
    const sheets: Buffer[] = [];
    for (const t of chosen) {
      const { report, sheet } = await sheetFor(t, browser, repoServer.url, localFontsCss(repoServer.url), siteServer.url, dir);
      await writeFile(path.join(OUT, `${t.id.toLowerCase()}.png`), sheet);
      reports.push(report);
      sheets.push(sheet);
    }
    await writeFile(path.join(OUT, "sheet.png"), await stackSheets(sheets, 2048));
    await writeFile(path.join(OUT, "report.json"), `${JSON.stringify(reports, null, 2)}\n`);
    return reports;
  } finally {
    await browser.close();
    await repoServer.close();
    await siteServer.close();
    await rm(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = process.argv[2];
  const letters = arg ? arg.split(",").map((s) => s.trim().toUpperCase()) : COMPOSED.map((t) => t.id);
  const reports = await composeSheet(letters);
  for (const r of reports) {
    console.log(`\n${r.id} ${r.name} (${r.fixture}): eval/runs/compose-sheet/${r.id.toLowerCase()}.png`);
    console.log(`  guards ${r.guards.length}${r.guards.length ? `: ${r.guards.join("; ")}` : ""}`);
    console.log(`  facts not in the brief ${r.facts.length}${r.facts.length ? `: ${r.facts.join("; ")}` : ""}`);
    for (const w of r.widths) {
      console.log(
        `  ${w.width}px  diff first screen ${w.diff.firstScreen.mean}% (${w.diff.firstScreen.changed}% cells)  whole page ${w.diff.wholePage.mean}% (${w.diff.wholePage.changed}% cells)  height ${w.height.hand}/${w.height.composed}  axe ${w.axe.length}  scroll ${w.horizontalScroll ? `YES ${w.scrollWidth}` : "no"}  calls/screen ${w.callButtons.max}  h1 ${w.h1}`,
      );
      for (const a of w.axe) console.log(`    axe ${a}`);
      if (w.callButtons.max > 1) console.log(`    calls at ${w.callButtons.at}: ${w.callButtons.buttons.join(", ")}`);
    }
  }
  console.log("\nCombined sheet: eval/runs/compose-sheet/sheet.png");
}
