/**
 * pnpm tsx tools/eval/src/hero-bar.ts [A,B,…]
 *
 * The hero bar (HQ sb-studio-quality-first, option hero-bar): eight first screens for the three composer fixtures, each a
 * different idea, built only from the composition language (a hero preset from the inventory, a palette, a pairing and a
 * wordmark, pinned in the preset composer; the rest of the page is the composer's). Renders each homepage at 1280 and
 * 360 px in Chromium, runs the page checks (axe, horizontal scroll, call buttons per screen) on both, and writes
 * eval/runs/hero-bar/: <letter>-desk.png, <letter>-phone.png (first screens), report.json and sheet.png (the eight
 * desktops in a grid with each phone beside it, labelled with the letter and the one-sentence idea), plus
 * docs/design/hero-bar/sheet.jpg (≤ 2 MB) for the owner. AI pictures are read from eval/runs/hero-bar/ai/<id>.jpg (made
 * by hero-bar-ai.ts); a design whose picture is missing is skipped. No model call.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp, { type OverlayOptions } from "sharp";
import { chromium, type Page } from "playwright";
import { loadConfig } from "@sb/config";
import { processPhoto, serveStatic } from "@sb/engine";
import { composeHomepageDetailed, type ComposeInput } from "@sb/inventory";
import type { ImageAsset, SiteSpec } from "@sb/spec";
import { checkPage, openPage, type PageChecks } from "./compose-sheet.ts";
import { writeSiteFiles } from "./kitchen-sink.ts";
import { specMedia } from "./okus-items.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, "../../..");
const OUT = path.join(REPO_ROOT, "eval/runs/hero-bar");
const SHEET_JPG = path.join(REPO_ROOT, "docs/design/hero-bar/sheet.jpg");

export interface HeroBarDesign {
  letter: string;
  fixture: "pekarna-kvas" | "avtoservis-mrak" | "instalacije-rebernik";
  /** What the business's first impression is, in one sentence. */
  idea: string;
  /** The imagery medium (photo, poster art, linocut, type, AI painting …). */
  medium: string;
  stance: string;
  pin: NonNullable<ComposeInput["pin"]> & { hero: string };
  /** AI pictures (eval/runs/hero-bar/ai/<id>.jpg). */
  pictures?: (Omit<ImageAsset, "src" | "width" | "height"> & { file: string })[];
}

export const DESIGNS: HeroBarDesign[] = [
  {
    letter: "A",
    fixture: "pekarna-kvas",
    idea: "The shop window: today's loaves on their shelf fill half the screen, the real prices hang over the photo as tags.",
    medium: "product photo + price tags",
    stance: "hang-tag",
    pin: { hero: "composition/hero/shop-window-tags", palette: "palette/skorja-poppy", pairing: "pairing/bitter-karla", drawing: null, imagery: "natural" },
  },
  {
    letter: "B",
    fixture: "pekarna-kvas",
    idea: "The craft: the baker's floured hands run the full height of the screen; beside them, on the dark, the headline and the week's hours.",
    medium: "full-height photo, dark ground",
    stance: "station-timetable",
    pin: { hero: "composition/hero/hands-and-hours", palette: "palette/warm-craft", pairing: "pairing/fraunces-source-sans", drawing: null },
  },
  {
    letter: "C",
    fixture: "pekarna-kvas",
    idea: "The bread that rises overnight, as a print: a two-colour linocut of the oven's glowing mouth under the moon, centred on a night-black screen.",
    medium: "linocut (drawn)",
    stance: "woodcut",
    pin: { hero: "composition/hero/night-print-centred", palette: "palette/linocut", pairing: "pairing/bitter-karla", drawing: null },
  },
  {
    letter: "D",
    fixture: "avtoservis-mrak",
    idea: "Through the open workshop door: the car on the lift is the whole screen, the headline in capitals and the phone as a plate on it.",
    medium: "immersive photo",
    stance: "registration-plate",
    pin: { hero: "composition/hero/workshop-door", palette: "palette/tablica-blue", pairing: "pairing/archivo-public-sans", drawing: null },
  },
  {
    letter: "E",
    fixture: "avtoservis-mrak",
    idea: "The price before you drive in: the garage's own four prices on a board are the first thing you read.",
    medium: "price board on a colour band",
    stance: "workshop-docket",
    pin: { hero: "composition/hero/price-board-band", palette: "palette/enamel-cobalt", pairing: "pairing/space-grotesk-public-sans", drawing: null },
  },
  {
    letter: "F",
    fixture: "avtoservis-mrak",
    idea: "A type poster: what the garage does, in red capitals across the whole width, the tyre wall as one strip under it.",
    medium: "type + photo strip",
    stance: "safety-signage",
    pin: { hero: "composition/hero/type-wall-strip", palette: "palette/swiss-red", pairing: "pairing/archivo-archivo", drawing: null },
  },
  {
    letter: "G",
    fixture: "instalacije-rebernik",
    idea: "Cold outside, warm inside: a printed poster of the heat pump in the snow, its hot and cold pipes through the wall to the radiator; the phone a red block.",
    medium: "poster art (drawn)",
    stance: "technical-drawing",
    pin: { hero: "composition/hero/poster-call-block", palette: "palette/cevi-hot-cold", pairing: "pairing/space-grotesk-public-sans", drawing: null },
  },
  {
    letter: "H",
    fixture: "instalacije-rebernik",
    idea: "What the client really buys is a warm home: a painted winter house glowing at dusk, hung in an arch on a deep night-blue ground.",
    medium: "AI painting",
    stance: "technical-drawing",
    pin: { hero: "composition/hero/painting-on-dark", palette: "palette/cevi-copper", pairing: "pairing/fraunces-nunito-sans", drawing: null },
    pictures: [{ id: "img_ai_warm_house", file: "warm-house.jpg", alt: "Naslikana hiša v snegu ob mraku, okna toplo svetijo, ob zidu toplotna črpalka" }],
  },
];

async function pictureAssets(d: HeroBarDesign): Promise<{ assets: ImageAsset[]; files: Map<string, string> } | null> {
  const assets: ImageAsset[] = [];
  const files = new Map<string, string>();
  for (const p of d.pictures ?? []) {
    const file = path.join(OUT, "ai", p.file);
    if (!existsSync(file)) return null;
    const meta = await sharp(file).metadata();
    const { file: _f, ...rest } = p;
    assets.push({ ...rest, src: `uploads/${p.file}`, width: meta.width!, height: meta.height!, origin: "generated" });
    files.set(p.id, file);
  }
  return { assets, files };
}

/** The design's homepage: the composer with the design's pins, the fixture's photos and the AI pictures processed as the pipeline does. */
async function writeDesign(d: HeroBarDesign, dir: string): Promise<{ home: string; spec: SiteSpec; used: string[] } | null> {
  const pics = await pictureAssets(d);
  if (!pics) return null;
  const r = composeHomepageDetailed({ fixtureId: d.fixture, stance: d.stance, seed: 1, catalogue: "drafts", pin: d.pin, pictures: pics.assets });
  const spec = structuredClone(r.spec);
  const widths = loadConfig().images.widths;
  const media = await specMedia(d.fixture, spec, widths);
  for (const img of spec.assets.images) {
    const file = pics.files.get(img.id);
    if (!file) continue;
    const processed = await processPhoto(img.id, new Uint8Array(await readFile(file)), [...widths], { avif: loadConfig().images.avifQuality, webp: loadConfig().images.webpQuality });
    for (const v of processed.variants) media.set(v.file, v.data);
    img.width = processed.width;
    img.height = processed.height;
  }
  await writeSiteFiles(spec, media, dir, widths);
  return { home: `${spec.slug}/index.html`, spec, used: r.used.presets };
}

/**
 * Call buttons on the first screen only (the page checks' callButtonsPerScreen walks the whole page, where the composer's
 * later sections add their own): visible tel: links in the first viewport that read as a button (a ground or a border of
 * their own, a call object inside, or a fixed or sticky layer), the same test as the engine's.
 */
async function firstScreenCalls(page: Page): Promise<string[]> {
  return page.evaluate(`(() => {
    const vh = innerHeight, vw = innerWidth;
    const opaque = (c) => c !== "transparent" && !/rgba\\([^)]*,\\s*0\\)$/.test(c);
    const shown = (el) => { const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return cs.display !== "none" && cs.visibility !== "hidden" && Number(cs.opacity) !== 0 && r.width > 1 && r.height > 1; };
    const ownBox = (el) => { const cs = getComputedStyle(el); if (opaque(cs.backgroundColor)) return true; return ["top","right","bottom","left"].every((x) => cs.getPropertyValue("border-" + x + "-style") !== "none" && parseFloat(cs.getPropertyValue("border-" + x + "-width")) >= 1 && opaque(cs.getPropertyValue("border-" + x + "-color"))); };
    const onLayer = (el) => { for (let a = el; a; a = a.parentElement) { const q = getComputedStyle(a).position; if (q === "fixed" || q === "sticky") return true; } return false; };
    const boxed = (el) => ownBox(el) || [...el.querySelectorAll(".cx-fact__obj, .plate")].some((o) => shown(o) && ownBox(o));
    return [...document.querySelectorAll('a[href^="tel:"]')].filter((el) => { if (!shown(el)) return false; const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw && (boxed(el) || onLayer(el)); }).map((el) => (el.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 30));
  })()`);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

/** Wraps a caption to lines of at most `n` characters. */
function wrap(s: string, n: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const w of s.split(" ")) {
    if ((line + " " + w).trim().length > n) {
      out.push(line);
      line = w;
    } else line = (line + " " + w).trim();
  }
  if (line) out.push(line);
  return out;
}

/** The sheet: two designs per row, each its desktop (scaled to 720 px) with its phone (scaled to 203 px) beside it, the letter and idea above. */
async function sheet(items: { d: HeroBarDesign; desk: Buffer; phone: Buffer }[]): Promise<Buffer> {
  const DW = 720;
  const DH = Math.round((800 / 1280) * DW);
  const PW = Math.round((360 / 800) * DH);
  const GAP = 14;
  const CELL = DW + GAP + PW;
  const HEAD = 64;
  const PAD = 28;
  const COLS = 2;
  const rows = Math.ceil(items.length / COLS);
  const width = PAD * 2 + COLS * CELL + (COLS - 1) * PAD * 2;
  const height = PAD + rows * (HEAD + DH + PAD);
  const layers: OverlayOptions[] = [];
  for (const [i, it] of items.entries()) {
    const x = PAD + (i % COLS) * (CELL + PAD * 2);
    const y = PAD + Math.floor(i / COLS) * (HEAD + DH + PAD);
    const lines = wrap(it.d.idea, 92);
    const cap = `<svg xmlns="http://www.w3.org/2000/svg" width="${CELL}" height="${HEAD}"><text x="0" y="26" font-family="Segoe UI, sans-serif" font-size="26" font-weight="800" fill="#111">${it.d.letter}</text><text x="34" y="18" font-family="Segoe UI, sans-serif" font-size="14" font-weight="600" fill="#222">${esc(lines[0] ?? "")}</text><text x="34" y="36" font-family="Segoe UI, sans-serif" font-size="14" font-weight="600" fill="#222">${esc(lines[1] ?? "")}</text><text x="34" y="56" font-family="Segoe UI, sans-serif" font-size="12" fill="#555">${esc(`${it.d.fixture} · ${it.d.medium} · ${it.d.pin.hero.replace("composition/hero/", "hero/")}`)}</text></svg>`;
    layers.push({ input: Buffer.from(cap), left: x, top: y });
    layers.push({ input: await sharp(it.desk).resize({ width: DW, height: DH, fit: "cover", position: "top" }).png().toBuffer(), left: x, top: y + HEAD });
    layers.push({ input: await sharp(it.phone).resize({ width: PW, height: DH, fit: "cover", position: "top" }).png().toBuffer(), left: x + DW + GAP, top: y + HEAD });
  }
  return sharp({ create: { width, height, channels: 3, background: "#d9dce1" } }).composite(layers).png().toBuffer();
}

async function main(): Promise<void> {
  const only = process.argv[2]?.split(",");
  const designs = DESIGNS.filter((d) => !only || only.includes(d.letter));
  await mkdir(OUT, { recursive: true });
  const work = path.join(OUT, "site");
  await rm(work, { recursive: true, force: true });
  const server = await serveStatic(work);
  const browser = await chromium.launch();
  const report: Record<string, { idea: string; presets: string[]; firstScreenCalls: Record<string, string[]>; checks: Record<string, PageChecks> }> = {};
  try {
    for (const d of designs) {
      const w = await writeDesign(d, path.join(work, d.letter));
      if (!w) {
        console.log(`${d.letter}: skipped (AI picture missing)`);
        continue;
      }
      const checks: Record<string, PageChecks> = {};
      const first: Record<string, string[]> = {};
      for (const [name, vp] of [
        ["desk", { width: 1280, height: 800 }],
        ["phone", { width: 360, height: 800 }],
      ] as const) {
        const { page, ctx } = await openPage(browser, vp, `${server.url}/${d.letter}/${w.home}`);
        await page.waitForTimeout(200);
        await writeFile(path.join(OUT, `${d.letter}-${name}.png`), await page.screenshot());
        first[name] = await firstScreenCalls(page);
        checks[name] = await checkPage(page);
        await ctx.close();
      }
      report[d.letter] = { idea: d.idea, presets: w.used, firstScreenCalls: first, checks };
      const c = (k: string) => checks[k]!;
      console.log(`${d.letter} ${d.fixture} ${d.pin.hero}: axe desk ${c("desk").axe.length} phone ${c("phone").axe.length}; hscroll ${c("desk").horizontalScroll || c("phone").horizontalScroll}; calls on the first screen ${first.desk!.length}/${first.phone!.length}, on any screen of the page ${c("desk").callButtons.max}/${c("phone").callButtons.max}${[...c("desk").axe, ...c("phone").axe].map((a) => `\n   ${a}`).join("")}`);
    }
  } finally {
    await browser.close();
    await server.close();
  }
  await writeFile(path.join(OUT, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  const all = DESIGNS.filter((d) => existsSync(path.join(OUT, `${d.letter}-desk.png`)));
  const png = await sheet(await Promise.all(all.map(async (d) => ({ d, desk: await readFile(path.join(OUT, `${d.letter}-desk.png`)), phone: await readFile(path.join(OUT, `${d.letter}-phone.png`)) }))));
  await writeFile(path.join(OUT, "sheet.png"), png);
  await mkdir(path.dirname(SHEET_JPG), { recursive: true });
  let q = 86;
  let jpg = await sharp(png).jpeg({ quality: q, mozjpeg: true }).toBuffer();
  while (jpg.length > 2 * 1024 * 1024 && q > 50) jpg = await sharp(png).jpeg({ quality: (q -= 6), mozjpeg: true }).toBuffer();
  await writeFile(SHEET_JPG, jpg);
  console.log(`sheet: ${path.relative(REPO_ROOT, path.join(OUT, "sheet.png"))}, ${path.relative(REPO_ROOT, SHEET_JPG)} (${(jpg.length / 1024).toFixed(0)} KB, q${q})`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
