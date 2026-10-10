/**
 * pnpm okus:items --round 1 [--only <id>,<id>] [--local-fonts]
 *
 * Builds a round of Okus (docs/plans/design-studio.md §8) into tools/okus/rounds/<round>/: per item a first screen
 * and a whole page at 1280 px and at 360 px (phones at 2× pixel density, so they stay sharp on a phone), as JPEG at
 * most 1600 px wide, plus items.json and pairs.json (okus-round.ts), and tools/okus/rounds/index.json. The whole
 * round is kept under 15 MB (artifact upload limit) by lowering the whole pages' quality, then width, until it fits.
 * Hand-made references load their Google Fonts from the network unless --local-fonts (the repo's subset files, as the
 * offline sheets do). No model call, € 0.
 */
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { chromium, type Browser, type Page } from "playwright";
import { loadConfig } from "@sb/config";
import { loadLazyImages, processLogo, processPhoto, serveStatic } from "@sb/engine";
import { siteFiles } from "@sb/render";
import { FONTS, migrateSpec, type SiteSpec } from "@sb/spec";
import { loadFixture } from "./fixtures/load.ts";
import {
  OKUS_DIR,
  REPO_ROOT,
  RoundsIndex,
  buildPairs,
  itemsJson,
  pairsJson,
  roundSources,
  toItem,
  type ItemSource,
  type OkusItem,
  type OkusPair,
} from "./okus-round.ts";

/** The artifact asset limit is 15 MB per file and 64 MB per publish; the round as a whole stays under 15 MB. */
export const ROUND_BUDGET_BYTES = 15 * 1024 * 1024;

export const SHOTS = {
  desk: { width: 1280, height: 800, scale: 1 },
  phone: { width: 360, height: 800, scale: 2 },
} as const;

/** JPEG settings per picture; whole pages step down through `fullSteps` until the round fits the budget. */
const FIRST_SCREEN = { quality: 80 };
const FULL_STEPS = [
  { quality: 76, deskWidth: 1280, phoneWidth: 720 },
  { quality: 68, deskWidth: 1280, phoneWidth: 720 },
  { quality: 62, deskWidth: 1024, phoneWidth: 600 },
  { quality: 56, deskWidth: 960, phoneWidth: 540 },
  { quality: 50, deskWidth: 800, phoneWidth: 480 },
] as const;
/** JPEG's hard limit is 65 535 px; a very long phone page is cut there (with a note in the result). */
const JPEG_MAX = 65_000;

function localFontsCss(base: string): string {
  return Object.values(FONTS)
    .map((f) => `@font-face{font-family:"${f.family}";src:url("${base}/packages/render/assets/fonts/${f.file}.woff2") format("woff2");font-weight:${f.weights[0]} ${f.weights[1]};font-display:block}`)
    .join("\n");
}

/** The fixture's photos and logo, processed as the pipeline does, for a spec that uses them (no shared cache). */
async function specMedia(fixtureId: string, spec: SiteSpec): Promise<Map<string, Uint8Array>> {
  const config = loadConfig();
  const fixture = loadFixture(fixtureId);
  const media = new Map<string, Uint8Array>();
  for (const [i, img] of spec.assets.images.entries()) {
    const photo = fixture.photos[i];
    if (!photo) continue;
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
  return media;
}

/** Writes a spec's static site under `dir/<id>/` and returns its homepage path relative to `dir`. */
async function writeSpecSite(s: Extract<ItemSource, { render: "spec" }>, dir: string): Promise<string> {
  const spec = migrateSpec(JSON.parse(await readFile(path.join(REPO_ROOT, s.specFile), "utf8")));
  const media = await specMedia(s.fixture, spec);
  for (const [rel, data] of siteFiles(spec, media, { imageWidths: loadConfig().images.widths })) {
    const file = path.join(dir, s.id, rel);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, data);
  }
  return `${s.id}/${spec.slug}/index.html`;
}

/**
 * Before a whole-page screenshot: hides fixed elements that aren't a header at the top (a phone call bar, a cookie
 * box). Chromium draws fixed elements once, where they sit in the first viewport, so a bottom bar would land in the
 * middle of a long page. Only the screenshot changes.
 */
async function hideFixedBars(page: Page): Promise<void> {
  await page.evaluate(`(() => {
    for (const el of document.querySelectorAll("body *")) {
      if (getComputedStyle(el).position === "fixed" && el.getBoundingClientRect().top > 1) el.style.setProperty("visibility", "hidden", "important");
    }
  })()`);
}

type Shot = "desk" | "deskFull" | "phone" | "phoneFull";

/** Renders one page at both widths into four PNGs in `pngDir` (`<id>-<shot>.png`). */
async function shoot(browser: Browser, id: string, url: string, pngDir: string, fontsCss: string | null): Promise<void> {
  for (const [name, s] of Object.entries(SHOTS) as [keyof typeof SHOTS, (typeof SHOTS)[keyof typeof SHOTS]][]) {
    const phone = name === "phone";
    const ctx = await browser.newContext({
      viewport: { width: s.width, height: s.height },
      deviceScaleFactor: s.scale,
      reducedMotion: "reduce",
      ...(phone ? { isMobile: true, hasTouch: true } : {}),
    });
    try {
      if (fontsCss !== null) {
        await ctx.route(/fonts\.googleapis\.com/, (r) => r.fulfill({ status: 200, contentType: "text/css", body: fontsCss }));
        await ctx.route(/fonts\.gstatic\.com/, (r) => r.abort());
      }
      const page = await ctx.newPage();
      await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(250);
      await writeFile(path.join(pngDir, `${id}-${name}.png`), await page.screenshot());
      await loadLazyImages(page);
      await hideFixedBars(page);
      await page.waitForTimeout(100);
      await writeFile(path.join(pngDir, `${id}-${name}Full.png`), await page.screenshot({ fullPage: true }));
    } finally {
      await ctx.close();
    }
  }
}

/** Encodes one round's PNGs to JPEG at one whole-page step; returns the bytes written per file. */
async function encode(items: readonly OkusItem[], pngDir: string, outDir: string, step: (typeof FULL_STEPS)[number]): Promise<{ bytes: number; cut: string[] }> {
  let bytes = 0;
  const cut: string[] = [];
  for (const item of items) {
    for (const shot of ["desk", "deskFull", "phone", "phoneFull"] as Shot[]) {
      const png = await readFile(path.join(pngDir, `${item.id}-${shot}.png`));
      const full = shot.endsWith("Full");
      const width = shot === "desk" ? SHOTS.desk.width : shot === "phone" ? SHOTS.phone.width * SHOTS.phone.scale : shot === "deskFull" ? step.deskWidth : step.phoneWidth;
      const { data, info } = await sharp(png, { limitInputPixels: false }).resize({ width, withoutEnlargement: true }).raw().toBuffer({ resolveWithObject: true });
      let img = sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels }, limitInputPixels: false });
      if (info.height > JPEG_MAX) {
        img = img.extract({ left: 0, top: 0, width: info.width, height: JPEG_MAX });
        cut.push(`${item.id} ${shot}`);
      }
      const jpg = await img.flatten({ background: "#ffffff" }).jpeg({ quality: full ? step.quality : FIRST_SCREEN.quality, mozjpeg: true }).toBuffer();
      const rel = item.images[shot];
      await mkdir(path.dirname(path.join(outDir, rel)), { recursive: true });
      await writeFile(path.join(outDir, rel), jpg);
      bytes += jpg.length;
    }
  }
  return { bytes, cut };
}

export interface BuildOptions {
  round: number;
  /** Only these item ids (a subset, for tests and quick looks). */
  only?: readonly string[];
  /** tools/okus by default; the round goes to `<okusDir>/rounds/<round>/`. */
  okusDir?: string;
  /** Serve the hand-made pages' Google Fonts from the repo's subset files (offline). */
  localFonts?: boolean;
  budgetBytes?: number;
  log?: (line: string) => void;
}

export interface BuildResult {
  dir: string;
  items: OkusItem[];
  pairs: OkusPair[];
  /** Bytes of everything in the round's directory (pictures and JSON). */
  bytes: number;
  /** The whole-page JPEG step that fit the budget. */
  step: (typeof FULL_STEPS)[number];
  cut: string[];
}

/** Renders a round's items and writes its directory. */
export async function buildRound(opts: BuildOptions): Promise<BuildResult> {
  const log = opts.log ?? (() => {});
  const okusDir = opts.okusDir ?? OKUS_DIR;
  const dir = path.join(okusDir, "rounds", String(opts.round));
  const budget = opts.budgetBytes ?? ROUND_BUDGET_BYTES;
  let sources = roundSources(opts.round);
  if (opts.only?.length) {
    const unknown = opts.only.filter((id) => !sources.some((s) => s.id === id));
    if (unknown.length) throw new Error(`Unknown item ids: ${unknown.join(", ")}`);
    sources = sources.filter((s) => opts.only!.includes(s.id));
  }
  const items = sources.map(toItem);
  const pairs = buildPairs(items, `okus-round-${opts.round}`);

  const work = await mkdtemp(path.join(tmpdir(), "sb-okus-"));
  const pngDir = path.join(work, "png");
  const siteDir = path.join(work, "site");
  await mkdir(pngDir, { recursive: true });
  await mkdir(siteDir, { recursive: true });
  const repoServer = await serveStatic(REPO_ROOT);
  const siteServer = await serveStatic(siteDir);
  const browser = await chromium.launch();
  try {
    const fontsCss = opts.localFonts ? localFontsCss(repoServer.url) : null;
    for (const [i, s] of sources.entries()) {
      log(`[${i + 1}/${sources.length}] ${s.id}`);
      if (s.render === "html") await shoot(browser, s.id, `${repoServer.url}/${s.file}`, pngDir, fontsCss);
      else await shoot(browser, s.id, `${siteServer.url}/${await writeSpecSite(s, siteDir)}`, pngDir, null);
    }
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });
    const json = itemsJson(opts.round, items) + pairsJson(opts.round, pairs);
    let chosen: BuildResult["step"] = FULL_STEPS[0];
    let cut: string[] = [];
    for (const step of FULL_STEPS) {
      await rm(path.join(dir, "img"), { recursive: true, force: true });
      const r = await encode(items, pngDir, dir, step);
      chosen = step;
      cut = r.cut;
      log(`  whole pages at q${step.quality}, ${step.deskWidth}/${step.phoneWidth} px: ${(r.bytes / 1024 / 1024).toFixed(2)} MB`);
      if (r.bytes + json.length <= budget) break;
    }
    await writeFile(path.join(dir, "items.json"), itemsJson(opts.round, items));
    await writeFile(path.join(dir, "pairs.json"), pairsJson(opts.round, pairs));
    await writeRoundsIndex(okusDir, opts.round);
    const bytes = await dirBytes(dir);
    if (bytes > budget) throw new Error(`Round ${opts.round} is ${(bytes / 1024 / 1024).toFixed(2)} MB, over the ${(budget / 1024 / 1024).toFixed(0)} MB budget even at the smallest step`);
    return { dir, items, pairs, bytes, step: chosen, cut };
  } finally {
    await browser.close();
    await repoServer.close();
    await siteServer.close();
    await rm(work, { recursive: true, force: true });
  }
}

async function writeRoundsIndex(okusDir: string, round: number): Promise<void> {
  const file = path.join(okusDir, "rounds", "index.json");
  const existing = await readFile(file, "utf8").then((t) => RoundsIndex.parse(JSON.parse(t)).rounds, () => [] as number[]);
  const rounds = [...new Set([...existing, round])].sort((a, b) => a - b);
  await writeFile(file, `${JSON.stringify({ rounds }, null, 2)}\n`);
}

export async function dirBytes(dir: string): Promise<number> {
  let n = 0;
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    n += e.isDirectory() ? await dirBytes(p) : (await stat(p)).size;
  }
  return n;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const val = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const round = Number(val("--round") ?? "1");
  const only = val("--only")?.split(",").map((s) => s.trim()).filter(Boolean);
  const started = Date.now();
  const r = await buildRound({ round, ...(only ? { only } : {}), localFonts: args.includes("--local-fonts"), log: (l) => console.log(l) });
  const count = (k: string) => r.items.filter((i) => i.kind === k).length;
  console.log(`\nRound ${round}: ${path.relative(REPO_ROOT, r.dir)}`);
  console.log(`  items ${r.items.length} (references ${count("reference")}, goldens ${count("golden")}, composed ${count("composed")}, sketches ${count("sketch")}), pairs ${r.pairs.length}`);
  console.log(`  pictures ${r.items.length * 4}, total ${(r.bytes / 1024 / 1024).toFixed(2)} MB (budget ${ROUND_BUDGET_BYTES / 1024 / 1024} MB); whole pages q${r.step.quality} at ${r.step.deskWidth}/${r.step.phoneWidth} px`);
  if (r.cut.length) console.log(`  cut at ${JPEG_MAX} px: ${r.cut.join(", ")}`);
  console.log(`  ${Math.round((Date.now() - started) / 1000)} s`);
}
