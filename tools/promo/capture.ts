/**
 * tsx tools/promo/capture.ts reel|site --primer <id> --out <dir> [--seconds 11] [--fps 30]
 *
 * Real product footage for the promo, captured frame by frame (no screen recording, so nothing drops or stutters):
 *
 *   reel  The postavi.si homepage's phone reel (infra/coming-soon/site: describe, build, live) with another trade
 *         swapped in: its description is typed, its own example page (apps/web/src/ui/examples/primer-<id>) is built.
 *         The page copy is made in <out>/site/; the reel's scroll smoothing is switched off there, so each frame is
 *         the exact state for its scroll position.
 *   site  The trade's example page itself at phone size, scrolled top to bottom with an ease-in-out.
 *
 * Frames: <out>/frames/00001.jpg … at 1080×1920 (360×640 CSS px at 3×), for `pnpm promo:cut` to play at --fps.
 * Free: no model calls. Never touches the real site; the copies live under <out>.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { chromium, type Page } from "playwright";
import { repoRoot } from "@sb/config";

const VIEW = { width: 360, height: 640, scale: 3 };
const SITE_DIR = path.join(repoRoot, "infra/coming-soon/site");
const EXAMPLES = path.join(repoRoot, "apps/web/src/ui/examples");
/** The reel's page strip is 390 CSS px wide and 2000 tall, drawn at 1000 px wide (as kvas-reel-phone.webp). */
const STRIP = { cssWidth: 390, cssHeight: 2000, pxWidth: 1000 };
const KVAS_SLUG = "pekarna-kvas";

interface Showcase {
  id: string;
  name: string;
  page: string;
  intro: string;
}

/** What each section of a page covers within the strip's first 2000 CSS px, as the reel's --tm/--hm/--ym (%). */
export function sectionVars(boxes: { top: number; height: number }[], stripHeight = STRIP.cssHeight): { tm: number; hm: number; ym: number }[] {
  return boxes
    .filter((b) => b.top < stripHeight && b.height > 0)
    .map((b) => {
      const h = Math.min(b.height, stripHeight - b.top);
      const ym = stripHeight - h > 0 ? (100 * b.top) / (stripHeight - h) : 0;
      return { tm: (100 * b.top) / stripHeight, hm: (100 * h) / stripHeight, ym: Math.min(100, ym) };
    });
}

/** The reel's progress p (0..1, as its apply() uses it) → its scroll fraction q0 (the inverse of its mapping). */
export function reelScrollFraction(p: number): number {
  const E = 0.405;
  return p < 0.29 ? (p / 0.29) * E : E + ((p - 0.29) / 0.71) * (1 - E);
}

/** Reel progress at frame i: the description typed, the page built, live; each leg's share of the time. */
export function reelProgress(t: number, seconds: number): number {
  const legs: [number, number, number][] = [
    // [from p, to p, share of the time]
    [0.11, 0.275, 0.33],
    [0.275, 0.53, 0.5],
    [0.53, 0.555, 0.09],
    [0.555, 0.555, 0.08],
  ];
  let at = t / seconds;
  for (const [a, b, share] of legs) {
    if (at <= share) return a + (b - a) * (share ? at / share : 1);
    at -= share;
  }
  return legs[legs.length - 1]![1];
}

export function easeInOut(x: number): number {
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
}

function replaceOnce(html: string, from: string, to: string, what: string): string {
  if (!html.includes(from)) throw new Error(`Reel copy: ${what} not found in infra/coming-soon/site/index.html; the homepage changed, update capture.ts`);
  return html.split(from).join(to);
}

function slugOf(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function settle(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
}

async function pageStrip(browser: Awaited<ReturnType<typeof chromium.launch>>, file: string, out: string): Promise<{ tm: number; hm: number; ym: number }[]> {
  const ctx = await browser.newContext({ viewport: { width: STRIP.cssWidth, height: 900 }, deviceScaleFactor: STRIP.pxWidth / STRIP.cssWidth });
  const page = await ctx.newPage();
  await page.goto(pathToFileURL(file).href, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  const boxes = await page.evaluate(() =>
    [...document.querySelectorAll("body > header, main > section, body > section, body > footer, main > footer")].map((el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top + scrollY, height: r.height };
    }),
  );
  const png = await page.screenshot({ fullPage: true, clip: { x: 0, y: 0, width: STRIP.cssWidth, height: STRIP.cssHeight } });
  await sharp(png).resize(STRIP.pxWidth).webp({ quality: 88 }).toFile(out);
  await ctx.close();
  return sectionVars(boxes);
}

async function reelSite(browser: Awaited<ReturnType<typeof chromium.launch>>, show: Showcase, outDir: string): Promise<string> {
  const copy = path.join(outDir, "site");
  rmSync(copy, { recursive: true, force: true });
  cpSync(SITE_DIR, copy, { recursive: true });
  const vars = await pageStrip(browser, path.join(EXAMPLES, show.page), path.join(copy, "primeri/kvas-reel-phone.webp"));
  let html = readFileSync(path.join(copy, "index.html"), "utf8");
  const typed = /<span id="reel-typed">([^<]*)<\/span>/.exec(html)?.[1];
  if (!typed) throw new Error("Reel copy: #reel-typed not found");
  const description = show.intro.replace(/\s*…$/, ".");
  html = replaceOnce(html, typed, description, "the reel's description");
  // The chat bubble shows the same description (possibly shortened); replace its paragraph whole.
  html = html.replace(/(<div class="rc-you"><small>Vi<\/small><p>)[^<]*(<\/p>)/, `$1${description}$2`);
  const reelStart = html.indexOf('<section class="reel"');
  const reelEnd = html.indexOf("</section>", reelStart);
  const reel = html.slice(reelStart, reelEnd);
  const strip = vars.map((v) => `<i style="--t:${v.tm.toFixed(2)};--h:${v.hm.toFixed(2)};--y:${v.ym.toFixed(3)};--tm:${v.tm.toFixed(2)};--hm:${v.hm.toFixed(2)};--ym:${v.ym.toFixed(3)}"><b></b></i>`).join("");
  const newReel = reel.split(`<span class="host">${KVAS_SLUG}</span>`).join(`<span class="host">${slugOf(show.name)}</span>`).replace(/<div class="reel-pg">(?:<i [^>]*><b><\/b><\/i>)+<\/div>/, `<div class="reel-pg">${strip}</div>`);
  if (newReel === reel) throw new Error("Reel copy: slug or page strip not replaced");
  html = html.slice(0, reelStart) + newReel + html.slice(reelEnd);
  // Exact frames: no easing between the scroll position and what is drawn.
  html = replaceOnce(html, "shown=shown===null?t:shown+(t-shown)*.14;", "shown=t;", "the reel's scroll smoothing");
  writeFileSync(path.join(copy, "index.html"), html);
  return path.join(copy, "index.html");
}

function arg(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main() {
  const [mode, ...args] = process.argv.slice(2);
  const primer = arg(args, "--primer");
  const out = arg(args, "--out");
  if ((mode !== "reel" && mode !== "site") || !primer || !out) throw new Error("usage: capture.ts reel|site --primer <id> --out <dir> [--seconds N] [--fps 30]");
  const seconds = Number(arg(args, "--seconds") ?? (mode === "reel" ? 11 : 5));
  const fps = Number(arg(args, "--fps") ?? 30);
  const showcase = JSON.parse(readFileSync(path.join(EXAMPLES, "showcase.json"), "utf8")) as Showcase[];
  const show = showcase.find((s) => s.id === primer);
  if (!show) throw new Error(`No showcase trade "${primer}"; have ${showcase.map((s) => s.id).join(", ")}`);
  const outDir = path.resolve(out);
  const frames = path.join(outDir, "frames");
  rmSync(frames, { recursive: true, force: true });
  mkdirSync(frames, { recursive: true });
  const browser = await chromium.launch();
  try {
    const file = mode === "reel" ? await reelSite(browser, show, outDir) : path.join(EXAMPLES, show.page);
    if (!existsSync(file)) throw new Error(`missing ${file}`);
    const ctx = await browser.newContext({ viewport: { width: VIEW.width, height: VIEW.height }, deviceScaleFactor: VIEW.scale, reducedMotion: "no-preference" });
    const page = await ctx.newPage();
    await page.goto(pathToFileURL(file).href, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    if (mode === "reel") await page.addStyleTag({ content: "body header:not(.section-head), nav[aria-label=\"Na tej strani\"]{visibility:hidden!important} .reel-cue{display:none!important}" });
    const n = Math.round(seconds * fps);
    const geo = await page.evaluate(() => {
      const reel = document.getElementById("reel");
      return { reelTop: reel ? reel.getBoundingClientRect().top + scrollY : 0, reelLen: reel ? reel.offsetHeight - innerHeight : 0, docLen: document.documentElement.scrollHeight - innerHeight };
    });
    for (let i = 0; i < n; i++) {
      const t = i / fps;
      const y = mode === "reel" ? geo.reelTop + reelScrollFraction(reelProgress(t, seconds)) * geo.reelLen : easeInOut(Math.min(1, t / seconds)) * geo.docLen;
      await page.evaluate((v) => window.scrollTo(0, v), y);
      await settle(page);
      await page.screenshot({ path: path.join(frames, `${String(i + 1).padStart(5, "0")}.jpg`), type: "jpeg", quality: 92 });
      if (i % fps === 0) process.stdout.write(`\r${mode} ${show.id}: frame ${i + 1}/${n}`);
    }
    console.log(`\nWrote ${n} frames (${seconds} s at ${fps} fps, ${VIEW.width * VIEW.scale}×${VIEW.height * VIEW.scale}) to ${frames}`);
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
