/**
 * pnpm approval:build: the owner's approval round (docs/plans/studio-phase2-design.md P4b).
 *
 *   pnpm approval:build [--count 30] [--out tools/approval/round]
 *
 * Composes the approval set (approvalPlan, no model call), writes each page's published site (`<out>/site/<slug>/…`),
 * a whole-page picture at 1280 px and one at 360 px, and one crop per section (`<out>/img/pNN-desk.jpg`, `-phone.jpg`,
 * `-sN.jpg`), and `<out>/items.json` (the pages with their tappable parts and the asset ids each part shows). The
 * pictures stay under 15 MiB in all, stepping the JPEG quality and widths down until they fit. tools/approval/index.html
 * is the page that shows them; `pnpm approval:export` turns the owner's taps into inventory decisions.
 */
import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { chromium, type Browser, type Page } from "playwright";
import { loadLazyImages, serveStatic } from "@sb/engine";
import { approvalPlan, inventory, shownAssets, type ApprovalItemPage, type ApprovalItems, type ApprovalPart, type ApprovalPlan } from "@sb/inventory";
import { writeComposedSite } from "./studio-compose.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, "../../..");
export const APPROVAL_OUT = path.join(REPO_ROOT, "tools/approval/round");
/** The pictures of the round stay under this (the artifact's asset limits are 15 MB per file, 64 MB per publish). */
export const APPROVAL_BUDGET_BYTES = 15 * 1024 * 1024;

/** JPEG settings, richest first; the round steps down until the pictures fit the budget. */
const STEPS = [
  { quality: 72, deskWidth: 900, phoneWidth: 360, cropWidth: 700 },
  { quality: 62, deskWidth: 800, phoneWidth: 360, cropWidth: 620 },
  { quality: 54, deskWidth: 720, phoneWidth: 320, cropWidth: 540 },
  { quality: 46, deskWidth: 640, phoneWidth: 300, cropWidth: 460 },
] as const;
/** JPEG's hard limit is 65 535 px; a taller picture is cut there. */
const JPEG_MAX = 65_000;

const pageId = (i: number) => `p${String(i + 1).padStart(2, "0")}`;

/** Chromium draws fixed elements once, where they sit in the first viewport; hide them (and sticky bars) before whole-page and crop shots. */
async function hideBars(page: Page): Promise<void> {
  await page.evaluate(`(() => {
    for (const el of document.querySelectorAll("body *")) {
      const p = getComputedStyle(el).position;
      if ((p === "fixed" || p === "sticky") && el.tagName !== "SECTION") el.style.setProperty("visibility", "hidden", "important");
    }
  })()`);
}

interface Raw {
  id: string;
  /** PNG files (full page at 1280, full page at 360, one per cropped part). */
  desk: string;
  phone: string;
  crops: Map<string, string>;
}

async function shootPage(browser: Browser, url: string, sectionIds: readonly string[], dir: string, id: string): Promise<Raw> {
  const raw: Raw = { id, desk: path.join(dir, `${id}-desk.png`), phone: path.join(dir, `${id}-phone.png`), crops: new Map() };
  for (const phone of [false, true]) {
    const ctx = await browser.newContext({
      viewport: { width: phone ? 360 : 1280, height: phone ? 800 : 900 },
      deviceScaleFactor: 1,
      reducedMotion: "reduce",
      ...(phone ? { isMobile: true, hasTouch: true } : {}),
    });
    try {
      const page = await ctx.newPage();
      await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
      await page.evaluate(() => document.fonts.ready);
      await loadLazyImages(page);
      await page.waitForTimeout(200);
      if (!phone) {
        // The header first (the name lettering), while it is still visible; then the sections.
        const header = page.locator("header").first();
        if (await header.count()) {
          const file = path.join(dir, `${id}-lettering.png`);
          await header.screenshot({ path: file });
          raw.crops.set("lettering", file);
        }
      }
      await hideBars(page);
      await page.waitForTimeout(100);
      if (!phone) {
        for (const [i, sid] of sectionIds.entries()) {
          const el = page.locator(`[id="${sid}"]`).first();
          if (!(await el.count())) continue;
          const box = await el.boundingBox();
          if (!box || box.height < 4) continue;
          const file = path.join(dir, `${id}-s${i + 1}.png`);
          await el.screenshot({ path: file });
          raw.crops.set(`s${i + 1}`, file);
        }
      }
      await page.screenshot({ path: phone ? raw.phone : raw.desk, fullPage: true });
    } finally {
      await ctx.close();
    }
  }
  return raw;
}

async function toJpeg(png: string, out: string, width: number, quality: number): Promise<number> {
  const { data, info } = await sharp(png, { limitInputPixels: false }).resize({ width, withoutEnlargement: true }).raw().toBuffer({ resolveWithObject: true });
  let img = sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels }, limitInputPixels: false });
  if (info.height > JPEG_MAX) img = img.extract({ left: 0, top: 0, width: info.width, height: JPEG_MAX });
  const jpg = await img.flatten({ background: "#ffffff" }).jpeg({ quality, mozjpeg: true }).toBuffer();
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, jpg);
  return jpg.length;
}

export async function dirBytes(dir: string): Promise<number> {
  let n = 0;
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    n += e.isDirectory() ? await dirBytes(p) : (await stat(p)).size;
  }
  return n;
}

const SWATCHES = ["background", "surface", "text", "primary", "accent", "band"] as const;

export interface ApprovalBuild {
  items: ApprovalItems;
  imageBytes: number;
  step: number;
}

/** Builds the round into `out`. Exported for tests of the tool; the CLI below calls it. */
export async function buildApproval(plan: ApprovalPlan, out: string, opts: { log?: (l: string) => void } = {}): Promise<ApprovalBuild> {
  const log = opts.log ?? (() => {});
  const reg = inventory();
  const work = await mkdtemp(path.join(tmpdir(), "sb-approval-"));
  const pngDir = path.join(work, "png");
  const siteRoot = path.join(out, "site");
  await mkdir(pngDir, { recursive: true });
  await rm(path.join(out, "img"), { recursive: true, force: true });
  await rm(siteRoot, { recursive: true, force: true });
  await mkdir(siteRoot, { recursive: true });
  const server = await serveStatic(siteRoot);
  const browser = await chromium.launch();
  const pages: ApprovalItemPage[] = [];
  const raws: Raw[] = [];
  try {
    for (const [i, r] of plan.results.entries()) {
      const id = pageId(i);
      const slug = r.spec.slug;
      const dir = path.join(siteRoot, slug);
      const home = await writeComposedSite(r.used.fixtureId, structuredClone(r.spec), dir);
      const shown = shownAssets(r.spec, r.used, reg);
      const sectionIds = r.spec.pages[0]!.sections.map((s) => s.id);
      const raw = await shootPage(browser, `${server.url}/${slug}/${home}`, sectionIds, pngDir, id);
      raws.push(raw);
      const colors = r.spec.design.colors as Record<string, string>;
      const parts: ApprovalPart[] = shown.parts.map((p) => ({
        ...p,
        image: null,
        ...(p.id === "colours" ? { swatches: SWATCHES.map((k) => colors[k]).filter((c): c is string => !!c) } : {}),
      }));
      const plan_ = plan.pages[i]!;
      pages.push({
        id,
        title: `${r.spec.business.name} — ${plan_.stance.replace(/-/g, " ")}`,
        fixtureId: plan_.fixtureId,
        stance: plan_.stance,
        seed: plan_.seed,
        kind: plan_.kind,
        desktop: `img/${id}-desk.jpg`,
        phone: `img/${id}-phone.jpg`,
        parts,
      });
      log(`${id} ${plan_.kind.padEnd(5)} ${plan_.fixtureId} / ${plan_.stance} / seed ${plan_.seed}: ${raw.crops.size} crops`);
    }
  } finally {
    await browser.close();
    await server.close();
  }
  // Encode, stepping down until the pictures fit the budget.
  let used = 0;
  let step = 0;
  for (; step < STEPS.length; step++) {
    const s = STEPS[step]!;
    let bytes = 0;
    await rm(path.join(out, "img"), { recursive: true, force: true });
    for (const [i, raw] of raws.entries()) {
      const page = pages[i]!;
      bytes += await toJpeg(raw.desk, path.join(out, page.desktop), s.deskWidth, s.quality);
      bytes += await toJpeg(raw.phone, path.join(out, page.phone), s.phoneWidth, s.quality);
      const crop = new Map<string, string>();
      for (const [key, file] of raw.crops) {
        const rel = `img/${raw.id}-${key}.jpg`;
        bytes += await toJpeg(file, path.join(out, rel), s.cropWidth, s.quality);
        crop.set(key, rel);
      }
      for (const part of page.parts) {
        // Fonts show the opening section (the headline and the text are set in the pairing); the lettering is the header.
        part.image = part.id === "fonts" ? (crop.get("s1") ?? null) : (crop.get(part.id) ?? null);
      }
    }
    used = bytes;
    if (bytes <= APPROVAL_BUDGET_BYTES) break;
  }
  await rm(work, { recursive: true, force: true });
  if (used > APPROVAL_BUDGET_BYTES) throw new Error(`The round's pictures are ${(used / 1048576).toFixed(1)} MiB, over the ${APPROVAL_BUDGET_BYTES / 1048576} MiB budget even at the lowest step.`);
  const items: ApprovalItems = { pages };
  await writeFile(path.join(out, "items.json"), `${JSON.stringify(items, null, 2)}\n`);
  return { items, imageBytes: used, step };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const val = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const out = path.resolve(val("--out") ?? APPROVAL_OUT);
  const count = Number(val("--count") ?? 30);
  const started = Date.now();
  const plan = approvalPlan({ count });
  const r = await buildApproval(plan, out, { log: (l) => console.log(l) });
  for (const [k, v] of Object.entries(plan.coverage)) console.log(`${k.padEnd(13)} ${v.covered}/${v.total}`);
  const img = await dirBytes(path.join(out, "img"));
  console.log(`${r.items.pages.length} pages, pictures ${(img / 1048576).toFixed(2)} MiB (step ${r.step + 1} of ${STEPS.length}), ${Math.round((Date.now() - started) / 1000)} s -> ${path.relative(REPO_ROOT, out)}`);
}
