/**
 * pnpm review50:render [--only <id>,...] [--out <dir>] [--specs <dir>] [--concurrency <n>]
 * pnpm review50:render --sheet --before <run dir> [--out <dir>] [--only <id>,...]
 *
 * A free re-render of the saved Review 50 pages: for each eval/outside-review/review50-specs/<id>/, spec-generated.json
 * becomes home-*.png and spec-regenerated.json regenerated-*.png in <out>/<id>/ (default eval/runs-review50-after), the
 * run directory `pnpm outside-review --run-dir` reads (the trade comes from the fixture's brief by directory name).
 *
 * No model call and no key: the site's original pictures are read from the saved storage/, turned into the media variants
 * with the engine's own processPhoto/processLogo, rendered with @sb/render and photographed with the engine's checkSite
 * (the same four shots as `pnpm eval`: first screens as a visitor sees them, whole pages with fixed bars hidden).
 *
 * --sheet writes <out>/before-after.jpg: per page, the first screen at 1280 and 360 px from --before and from <out>.
 * Render the "before" with the code you want to compare against (a checkout of the earlier commit) into its own --out.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import sharp from "sharp";
import { loadConfig, repoRoot, type AppConfig } from "@sb/config";
import { createFsStorage, type Storage } from "@sb/platform";
import { mediaFiles, siteFiles } from "@sb/render";
import { migrateSpec, type SiteSpec } from "@sb/spec";
import { checkSite, launchCheckBrowser, processLogo, processPhoto, type CheckBrowser } from "@sb/engine";

export const DEFAULT_SPECS_DIR = path.join(repoRoot, "eval/outside-review/review50-specs");
export const DEFAULT_OUT_DIR = path.join(repoRoot, "eval/runs-review50-after");

/** The two specs each page was saved with, and the file prefix `loadRunDirItems` reads for each. */
export const KINDS = [
  { spec: "spec-generated.json", prefix: "home" },
  { spec: "spec-regenerated.json", prefix: "regenerated" },
] as const;

export type ShotKey = "mobile" | "mobileFull" | "desktopFirst" | "desktop";

/** checkSite's screenshots → the file names outside-review reads (see RUN_FILES in outside-review.ts). */
export function shotFileNames(prefix: string): Record<ShotKey, string> {
  return { mobile: `${prefix}-360-first.png`, mobileFull: `${prefix}-360.png`, desktopFirst: `${prefix}-1280-first.png`, desktop: `${prefix}-1280.png` };
}

/** Page ids: every subdirectory of the specs directory that holds a generated spec; `only` narrows (an unknown id throws). */
export function pageIds(specsDir: string, only?: readonly string[]): string[] {
  const all = readdirSync(specsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(path.join(specsDir, e.name, KINDS[0].spec)))
    .map((e) => e.name)
    .sort();
  if (!only?.length) return all;
  const unknown = only.filter((id) => !all.includes(id));
  if (unknown.length) throw new Error(`Unknown page id: ${unknown.join(", ")}`);
  return all.filter((id) => only.includes(id));
}

/** What a saved page needs to be rendered: each spec file that exists and the file prefix it writes. */
export function plannedSpecs(specsDir: string, id: string): { specFile: string; prefix: string }[] {
  return KINDS.filter((k) => existsSync(path.join(specsDir, id, k.spec))).map((k) => ({ specFile: path.join(specsDir, id, k.spec), prefix: k.prefix }));
}

/** The logo's type from its upload's name (the spec doesn't keep the mime): SVG is rasterised, the rest are read by sharp. */
export function logoMime(src: string): string {
  const ext = path.extname(src).toLowerCase();
  return ext === ".svg" ? "image/svg+xml" : ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
}

type Processed = Awaited<ReturnType<typeof processPhoto>>;
/** Processed pictures by `<asset id>:<storage key>`: a page's two specs share their uploads and generated pictures. */
export type MediaCache = Map<string, Promise<Processed>>;

/**
 * The media files a spec references, rebuilt from the originals in `storage` the way the pipeline stores them
 * (processPhoto per picture, processLogo for the logo). A reference with no original throws, naming it.
 */
export async function rebuildMedia(spec: SiteSpec, storage: Storage, config: AppConfig, cache: MediaCache = new Map()): Promise<Map<string, Uint8Array>> {
  const media = new Map<string, Uint8Array>();
  const quality = { avif: config.images.avifQuality, webp: config.images.webpQuality };
  for (const img of spec.assets.images) {
    const key = `${img.id}:${img.src}`;
    if (!cache.has(key)) {
      cache.set(
        key,
        (async () => {
          const original = await storage.get(img.src);
          if (!original) throw new Error(`Original picture ${img.src} (${img.id}) is not in the saved storage`);
          return processPhoto(img.id, original, config.images.widths, quality);
        })(),
      );
    }
    for (const v of (await cache.get(key)!).variants) media.set(v.file, v.data);
  }
  const logo = spec.assets.logo;
  if (logo) {
    const original = await storage.get(logo.src);
    if (!original) throw new Error(`Logo ${logo.src} is not in the saved storage`);
    const l = await processLogo(original, logoMime(logo.src));
    media.set(l.file, l.data);
  }
  return media;
}

export interface RenderedPage {
  id: string;
  files: string[];
  ms: number;
  /** Media files the spec references that could not be rebuilt (empty when all are there). */
  missingMedia: string[];
}

/** Renders the saved specs of one page into <outDir>/<id>/ and returns what was written. */
export async function renderPage(o: { specsDir: string; id: string; outDir: string; config: AppConfig; browser: CheckBrowser }): Promise<RenderedPage> {
  const t0 = Date.now();
  const storage = createFsStorage(path.join(o.specsDir, o.id, "storage"));
  const cache: MediaCache = new Map();
  const dir = path.join(o.outDir, o.id);
  mkdirSync(dir, { recursive: true });
  const written: string[] = [];
  const missingMedia: string[] = [];
  for (const { specFile, prefix } of plannedSpecs(o.specsDir, o.id)) {
    const spec = migrateSpec(JSON.parse(readFileSync(specFile, "utf8")));
    const media = await rebuildMedia(spec, storage, o.config, cache);
    missingMedia.push(...mediaFiles(spec, o.config.images.widths).filter((f) => !media.has(f)));
    const files = siteFiles(spec, media, { imageWidths: o.config.images.widths });
    // The homepage only, no Lighthouse and no fact check: just the four shots, taken by the engine's own capture.
    const report = await checkSite(spec, files, { config: o.config, corpus: "", lighthouse: false, browser: o.browser, pages: ["index.html"] });
    const names = shotFileNames(prefix);
    for (const k of Object.keys(names) as ShotKey[]) {
      const shot = report.screenshots[k];
      if (!shot.length) throw new Error(`${o.id}: no ${k} screenshot (the homepage did not render)`);
      writeFileSync(path.join(dir, names[k]), shot);
      written.push(names[k]);
    }
  }
  return { id: o.id, files: written, ms: Date.now() - t0, missingMedia };
}

// ---------------------------------------------------------------------------------------------------------------
// Before/after contact sheet

const SHEET_PHONE_W = 200;
const SHEET_DESK_W = 520;

/** Per page that has first screens in both run directories: before and after at 1280 px, then at 360 px. */
export function sheetRows(beforeDir: string, afterDir: string, only?: readonly string[]): { label: string; files: [string, string, string, string] }[] {
  const rows: { label: string; files: [string, string, string, string] }[] = [];
  const ids = existsSync(afterDir) ? readdirSync(afterDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort() : [];
  for (const id of ids) {
    if (only?.length && !only.includes(id)) continue;
    for (const { prefix } of KINDS) {
      const n = shotFileNames(prefix);
      const f = (d: string, k: ShotKey) => path.join(d, id, n[k]);
      const files: [string, string, string, string] = [f(beforeDir, "desktopFirst"), f(afterDir, "desktopFirst"), f(beforeDir, "mobile"), f(afterDir, "mobile")];
      if (files.every((x) => existsSync(x))) rows.push({ label: prefix === "home" ? id : `${id}-regenerated`, files });
    }
  }
  return rows;
}

export async function writeSheet(rows: ReturnType<typeof sheetRows>, file: string): Promise<void> {
  if (!rows.length) throw new Error("No page has first screens in both run directories");
  const deskH = Math.round((SHEET_DESK_W * 800) / 1280);
  const phoneH = 420;
  const rowH = Math.max(deskH, phoneH) + 34;
  const cells = [SHEET_DESK_W, SHEET_DESK_W, SHEET_PHONE_W, SHEET_PHONE_W];
  const width = 20 + cells.reduce((a, w) => a + w + 10, 0);
  const label = (t: string, w: number) =>
    Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="26"><text x="2" y="19" font-family="sans-serif" font-size="15" font-weight="700" fill="#1a1a1a">${t.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</text></svg>`);
  const composites: { input: Buffer; top: number; left: number }[] = [];
  for (const [r, row] of rows.entries()) {
    const top = 10 + r * rowH;
    composites.push({ input: label(`${row.label}   (before | after at 1280, before | after at 360)`, width - 20), top, left: 20 });
    let left = 20;
    for (const [i, f] of row.files.entries()) {
      const w = cells[i]!;
      const h = w === SHEET_DESK_W ? deskH : phoneH;
      composites.push({ input: await sharp(f).resize(w, h, { fit: "cover", position: "top" }).png().toBuffer(), top: top + 28, left });
      left += w + 10;
    }
  }
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, await sharp({ create: { width, height: rows.length * rowH + 20, channels: 3, background: "#e9e9e9" } }).composite(composites).jpeg({ quality: 78 }).toBuffer());
}

// ---------------------------------------------------------------------------------------------------------------
// CLI

const USAGE = "Usage: pnpm review50:render [--only <id>,...] [--out <dir>] [--specs <dir>] [--concurrency <n>]\n       pnpm review50:render --sheet --before <run dir> [--out <dir>] [--only <id>,...]";

export async function main(argv: string[], print: (line: string) => void = console.log): Promise<number> {
  let v;
  try {
    v = parseArgs({ args: argv, options: { only: { type: "string" }, out: { type: "string" }, specs: { type: "string" }, concurrency: { type: "string" }, sheet: { type: "boolean" }, before: { type: "string" } } }).values;
  } catch (e) {
    print(`${e instanceof Error ? e.message : String(e)}\n${USAGE}`);
    return 2;
  }
  const outDir = path.resolve(v.out ?? DEFAULT_OUT_DIR);
  const only = v.only?.split(",").map((s) => s.trim()).filter(Boolean);
  if (v.sheet) {
    if (!v.before) {
      print(`--sheet needs --before <run dir>.\n${USAGE}`);
      return 2;
    }
    const rows = sheetRows(path.resolve(v.before), outDir, only);
    const file = path.join(outDir, "before-after.jpg");
    await writeSheet(rows, file);
    print(`${rows.length} rows -> ${file}`);
    return 0;
  }
  const concurrency = v.concurrency === undefined ? 2 : Number(v.concurrency);
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    print(`--concurrency needs a whole number above 0, got "${v.concurrency}".\n${USAGE}`);
    return 2;
  }
  const specsDir = path.resolve(v.specs ?? DEFAULT_SPECS_DIR);
  let ids: string[];
  try {
    ids = pageIds(specsDir, only);
  } catch (e) {
    print(`${(e as Error).message}\n${USAGE}`);
    return 2;
  }
  if (!ids.length) {
    print(`No saved page in ${specsDir}.`);
    return 2;
  }
  const config = loadConfig();
  const browser = await launchCheckBrowser();
  const t0 = Date.now();
  let failed = 0;
  const queue = [...ids];
  try {
    await Promise.all(
      Array.from({ length: Math.min(concurrency, ids.length) }, async () => {
        for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
          try {
            const r = await renderPage({ specsDir, id, outDir, config, browser });
            print(`${id}: ${r.files.length} shots in ${(r.ms / 1000).toFixed(1)} s${r.missingMedia.length ? ` (media missing: ${r.missingMedia.slice(0, 3).join(", ")})` : ""}`);
          } catch (e) {
            failed++;
            print(`${id}: FAILED ${(e as Error).message}`);
          }
        }
      }),
    );
  } finally {
    await browser.close();
  }
  const secs = (Date.now() - t0) / 1000;
  print(`${ids.length - failed} of ${ids.length} pages rendered into ${outDir} in ${secs.toFixed(0)} s (${(secs / ids.length).toFixed(1)} s per page). No model call.`);
  return failed ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (e: unknown) => {
    console.error(e);
    process.exit(1);
  });
}
