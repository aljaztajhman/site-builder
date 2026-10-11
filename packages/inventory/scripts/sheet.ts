/**
 * pnpm inventory:sheet [--kind <kind>] [--status draft|approved|rejected] [--ids <id,id,...>]
 *
 * Kinds without assets get an empty sheet (<kind>.html) with a note. `--ids` also photographs ids that are not
 * registered yet, as draft assets (an asset maker's preview before registering). Drawings, compositions (one sheet per
 * intent), motion presets (three frames: start, mid, end), practical-fact icons, wordmarks (20 Slovene names), dividers
 * (the edge between two sections) and textures (behind text on the three grounds) are rendered by pages-v2.ts.
 *
 * Contact sheets of the design inventory (design-studio.md §4.2): every asset of a kind photographed at 360 and 1280 px
 * into eval/runs/inventory/ (gitignored). Components (sections, motifs, treatments, masks, fact objects, header and
 * footer families) are rendered by @sb/render from a small spec in two palettes, on the default, alternate and inverse
 * grounds; fonts as specimens with the Slovene letters; palettes as swatches with their contrast numbers.
 *
 * Writes per kind <kind>/<asset>-<palette>-<width>.jpg, <kind>.html (the sheet) and <kind>-<n>.png (the sheet
 * photographed, a chunk of rows each), checks.json (per page: invalid spec, horizontal scroll at 360) and
 * inventory.json (the approval gallery's data, thumbnails relative to it). No model call, no network.
 */
import { createServer, type Server } from "node:http";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Page } from "playwright";
import { FONTS_DIR, sharedBundle, siteFiles } from "@sb/render";
import { validateSite } from "@sb/spec";
import { ASSET_KINDS, AssetStatus, KIND_PREFIX, Asset as AssetSchema, assetSlug, inventory, writeInventoryJson, type Asset, type AssetKind } from "../src/index.ts";
import { fixturesDir, paletteOverviewHtml, repoRoot, type SheetPage } from "./pages.ts";
import { pagesFor } from "./pages-v2.ts";
import { emptySheetHtml, sheetGroups, sheetHtml, type Shot } from "./sheet-html.ts";

const SHEET_KINDS: AssetKind[] = ["font", "pairing", "palette", "motif", "submotif", "treatment", "mask", "typeTreatment", "factObject", "header", "footer", "section", "ornament", "divider", "texture", "composition", "icon", "motion", "wordmark"];
const WIDTHS = [360, 1280] as const;
/** The tallest part of a page a thumbnail keeps, per width. */
const MAX_HEIGHT: Record<(typeof WIDTHS)[number], number> = { 360: 3600, 1280: 2400 };
const ROWS_PER_PNG = 8;

const outDir = path.join(repoRoot, "eval/runs/inventory");
const siteDir = path.join(outDir, "_site");
const htmlDir = path.join(outDir, "_pages");

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".png": "image/png", ".json": "application/json", ".xml": "application/xml", ".txt": "text/plain" };

/** Which fixture's photos each rendered site uses, by slug, and its image ids in order. */
const siteMedia = new Map<string, { fixture: string; images: string[] }>();

/** Serves eval/runs/inventory, the font files, and every site's media/ from its fixture's photos (the original JPEGs). */
function serve(): Promise<{ server: Server; url: string }> {
  const server = createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
    let file: string | undefined;
    const media = /^\/_site\/([^/]+)\/media\/(.+)$/.exec(url);
    if (url.startsWith("/_fonts/")) file = path.join(FONTS_DIR, path.basename(url));
    else if (media) {
      const m = siteMedia.get(media[1]!);
      const name = media[2]!;
      if (m && name.startsWith("logo")) file = path.join(fixturesDir, m.fixture, "logo.svg");
      else if (m) {
        const photos = readdirSync(path.join(fixturesDir, m.fixture, "photos")).sort();
        const i = Math.max(0, m.images.findIndex((id) => name.startsWith(`${id}-`) || name.startsWith(`${id}.`)));
        file = path.join(fixturesDir, m.fixture, "photos", photos[i % photos.length]!);
      }
    } else file = path.join(outDir, url);
    const inside = file !== undefined && [FONTS_DIR, fixturesDir, outDir].some((root) => !path.relative(root, path.resolve(file)).startsWith(".."));
    if (!file || !inside || !existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    // Photos are served as the fixture's JPEG whatever the requested format: the browser sniffs the bytes.
    const type = media && !file.endsWith(".svg") ? "image/jpeg" : (TYPES[path.extname(file)] ?? "application/octet-stream");
    res.writeHead(200, { "content-type": type, "cache-control": "max-age=3600" }).end(readFileSync(file));
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, url: `http://127.0.0.1:${(server.address() as { port: number }).port}` })));
}

/** Writes a page's files and returns its URL path. */
function writePage(p: SheetPage, sharedWritten: { done: boolean }): { url: string; problems: string[] } {
  const slug = `${assetSlug(p.asset)}-${p.variant}`;
  if (p.kind === "html") {
    const file = path.join(htmlDir, `${slug}.html`);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, p.html);
    return { url: `/_pages/${slug}.html`, problems: [] };
  }
  const valid = validateSite(p.spec);
  const problems = valid.ok ? [] : valid.issues.slice(0, 4).map((i) => `invalid spec: ${i.path} ${i.message}`);
  siteMedia.set(p.spec.slug, { fixture: p.fixture, images: p.spec.assets.images.map((i) => i.id) });
  for (const [rel, data] of siteFiles(p.spec, new Map())) {
    if (rel.startsWith("_shared/") && sharedWritten.done) continue;
    const file = path.join(siteDir, rel);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, data);
  }
  sharedWritten.done = true;
  return { url: `/_site/${p.spec.slug}/index.html`, problems };
}

async function photograph(page: Page, base: string, url: string, width: number, hideChrome: boolean, file: string): Promise<string[]> {
  await page.goto(`${base}${url}`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: `.action-bar{display:none!important}${hideChrome ? ".site-header,.site-footer,.skip-link{display:none!important}" : ""}` });
  const problems: string[] = [];
  const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, h: document.documentElement.scrollHeight }));
  if (m.sw > m.iw + 1) problems.push(`horizontal scroll at ${width} px (${m.sw} px)`);
  const broken = await page.evaluate(() => [...document.images].filter((i) => i.complete && i.naturalWidth === 0).length);
  if (broken) problems.push(`${broken} image(s) failed to load`);
  await page.screenshot({ path: file, type: "jpeg", quality: 72, fullPage: true, clip: { x: 0, y: 0, width, height: Math.min(m.h, MAX_HEIGHT[width as 360 | 1280]) } });
  return problems;
}

const FRAMES = [
  { name: "start", at: 0 },
  { name: "mid", at: 0.5 },
  { name: "end", at: 1 },
] as const;

/**
 * Three frames (start, mid, end) of the section a motion preset runs on. The preset's scroll-driven animations
 * (animation-timeline: view()) are moved onto the document timeline, paused and set to 0, 50 and 100 % of their span,
 * so each frame is exact whatever the scroll position. Needs a context without reduced motion.
 */
async function photographMotion(page: Page, base: string, url: string, width: number, motion: string, files: string[]): Promise<{ problems: string[] }> {
  await page.goto(`${base}${url}`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: ".action-bar,.site-header,.site-footer,.skip-link{display:none!important}" });
  const problems: string[] = [];
  const count = await page.evaluate(() => {
    let n = 0;
    for (const a of document.getAnimations()) {
      if (!(a instanceof CSSAnimation) || !a.animationName.startsWith("cx-mo-")) continue;
      a.timeline = document.timeline;
      (a.effect as KeyframeEffect).updateTiming({ duration: 1000, delay: 0, endDelay: 0, iterations: 1, fill: "both", easing: "linear" });
      a.pause();
      n++;
    }
    return n;
  });
  // sticky-stack is desktop only: on a phone it is a static section (three equal frames).
  if (!count && !(motion === "sticky-stack" && width < 1024)) problems.push(`no cx-mo animation found for ${motion} (is animation-timeline supported?)`);
  const section = page.locator(`.cx-mo-${motion}`).first();
  for (const [i, f] of FRAMES.entries()) {
    await page.evaluate((at) => {
      for (const a of document.getAnimations()) if (a instanceof CSSAnimation && a.animationName.startsWith("cx-mo-")) a.currentTime = at * 1000;
    }, f.at);
    await section.screenshot({ path: files[i]!, type: "jpeg", quality: 72 });
  }
  const sw = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  if (sw.sw > sw.iw + 1) problems.push(`horizontal scroll at ${width} px (${sw.sw} px)`);
  return { problems };
}

/** Assets named by `--ids` that the registry doesn't have: drafts with no tags, for previewing before registering. */
function previewAsset(id: string, kind: AssetKind): Asset {
  return AssetSchema.parse({ id, kind, tags: { trades: [], stances: [], intents: [], mood: [], ground: [], density: [] }, phone: "ok", bytes: 0, license: "own", status: "draft", note: "Preview: not registered." });
}

async function main(): Promise<void> {
  const only = arg("kind");
  if (only && !(ASSET_KINDS as readonly string[]).includes(only)) throw new Error(`Unknown kind ${only}; one of ${ASSET_KINDS.join(", ")}`);
  const ids = (arg("ids") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  const kindOfId = (id: string): AssetKind => {
    const k = ASSET_KINDS.find((x) => id.startsWith(`${KIND_PREFIX[x]}/`));
    if (!k) throw new Error(`No kind for id ${id}`);
    return k;
  };
  const kinds = only ? [only as AssetKind] : ids.length ? [...new Set(ids.map(kindOfId))] : SHEET_KINDS;
  const status = arg("status");
  if (status && !(AssetStatus.options as readonly string[]).includes(status)) throw new Error(`Unknown status ${status}; one of ${AssetStatus.options.join(", ")}`);
  const registry = inventory();
  mkdirSync(outDir, { recursive: true });
  rmSync(siteDir, { recursive: true, force: true });
  sharedBundle();

  const { server, url } = await serve();
  const browser = await chromium.launch();
  const contexts = await Promise.all(WIDTHS.map((w) => browser.newContext({ viewport: { width: w, height: 800 }, deviceScaleFactor: 1, reducedMotion: "reduce" })));
  const pages = await Promise.all(contexts.map((c) => c.newPage()));
  // Motion frames need animations on (the sheet's other pages run with reduced motion, the still state).
  const motionContexts = await Promise.all(WIDTHS.map((w) => browser.newContext({ viewport: { width: w, height: 800 }, deviceScaleFactor: 1, reducedMotion: "no-preference" })));
  const motionPages = await Promise.all(motionContexts.map((c) => c.newPage()));
  const shared = { done: false };
  const allShots: Shot[] = [];
  try {
    for (const kind of kinds) {
      const assets = [
        // `--ids` narrows a kind to those ids (with or without `--kind`); without it, every asset of the kind.
        ...registry.byKind(kind).filter((a) => (!status || a.status === status) && (!ids.length || ids.includes(a.id))),
        ...ids.filter((id) => kindOfId(id) === kind && !registry.byId(id)).map((id) => previewAsset(id, kind)),
      ];
      // A status filter that leaves a kind empty skips it (its sheet stays as it was); otherwise an empty kind gets a note.
      if (!assets.length && status) continue;
      const kindDir = path.join(outDir, kind);
      rmSync(kindDir, { recursive: true, force: true });
      mkdirSync(kindDir, { recursive: true });
      if (!assets.length) {
        writeFileSync(path.join(outDir, `${kind}.html`), emptySheetHtml(kind));
        console.log(`${kind}: no assets registered; wrote an empty sheet with a note`);
        continue;
      }
      const shots: Shot[] = [];
      for (const a of assets) {
        const sheetPages = pagesFor(a);
        if (!sheetPages.length) console.log(`  ${a.id}: no sheet page for kind ${a.kind}`);
        for (const p of sheetPages) {
          let written: { url: string; problems: string[] };
          try {
            written = writePage(p, shared);
          } catch (e) {
            console.log(`  ${a.id} ${p.variant}: render failed: ${(e as Error).message}`);
            shots.push(...WIDTHS.map((w) => ({ asset: a.id, variant: p.variant, label: p.label, width: w, file: "", problems: [`render failed: ${(e as Error).message}`] })));
            continue;
          }
          const { url: pageUrl, problems } = written;
          for (const [i, w] of WIDTHS.entries()) {
            if (p.kind === "site" && p.motion) {
              const files = FRAMES.map((f) => path.join(kindDir, `${assetSlug(a.id)}-${p.variant}-${f.name}-${w}.jpg`));
              const { problems: found } = await photographMotion(motionPages[i]!, url, pageUrl, w, p.motion, files);
              for (const [k, f] of FRAMES.entries()) shots.push({ asset: a.id, variant: `${p.variant}-${f.name}`, label: `${p.label} · ${f.name}`, width: w, file: files[k]!, problems: k === 0 ? [...problems, ...found] : [] });
              continue;
            }
            const file = path.join(kindDir, `${assetSlug(a.id)}-${p.variant}-${w}.jpg`);
            const found = await photograph(pages[i]!, url, pageUrl, w, p.kind === "site" && !p.showChrome, file);
            shots.push({ asset: a.id, variant: p.variant, label: p.label, width: w, file, problems: [...problems, ...found] });
          }
        }
      }
      allShots.push(...shots);
      let sheets = 0;
      for (const group of sheetGroups(kind, assets)) {
        const stem = group.name ? `${kind}-${group.name}` : kind;
        writeFileSync(path.join(outDir, `${stem}.html`), sheetHtml(kind, group.assets, shots, outDir, undefined, group.name || undefined));
        const parts = Math.ceil(group.assets.length / ROWS_PER_PNG);
        for (let n = 0; n < parts; n++) {
          const html = path.join(outDir, `_${stem}-${n + 1}.html`);
          writeFileSync(html, sheetHtml(kind, group.assets.slice(n * ROWS_PER_PNG, (n + 1) * ROWS_PER_PNG), shots, outDir, parts > 1 ? { n: n + 1, of: parts } : undefined, group.name || undefined));
          const sheetPage = await browser.newPage({ viewport: { width: 1700, height: 900 } });
          await sheetPage.goto(`${url}/_${stem}-${n + 1}.html`, { waitUntil: "load" });
          await sheetPage.screenshot({ path: path.join(outDir, `${stem}-${n + 1}.png`), fullPage: true });
          await sheetPage.close();
          rmSync(html);
          sheets++;
        }
      }
      if (kind === "palette") {
        // Every palette side by side, 48 a picture (eight rows of six).
        for (let n = 0; n * 48 < assets.length; n++) {
          const html = path.join(outDir, `palette-overview-${n + 1}.html`);
          writeFileSync(html, paletteOverviewHtml(assets.slice(n * 48, (n + 1) * 48), `palettes${status ? ` (${status})` : ""} ${n * 48 + 1}–${Math.min(assets.length, (n + 1) * 48)} of ${assets.length}`));
          const sheetPage = await browser.newPage({ viewport: { width: 1700, height: 900 } });
          await sheetPage.goto(`${url}/palette-overview-${n + 1}.html`, { waitUntil: "load" });
          await sheetPage.screenshot({ path: path.join(outDir, `palette-overview-${n + 1}.png`), fullPage: true });
          await sheetPage.close();
        }
      }
      const bad = shots.filter((s) => s.problems.length);
      console.log(`${kind}: ${assets.length} assets, ${shots.length} pictures, ${sheets} sheet PNG(s)${bad.length ? `, ${new Set(bad.map((s) => s.asset)).size} with problems` : ""}`);
      for (const s of bad) console.log(`  ${s.asset} ${s.variant} ${s.width}: ${s.problems.join("; ")}`);
    }
  } finally {
    await browser.close();
    server.close();
  }

  // Thumbnails: the first 1280 px picture of each asset, from this run or an earlier one.
  const thumb = (id: string): string | null => {
    const a = registry.byId(id)!;
    const dir = path.join(outDir, a.kind);
    if (!existsSync(dir)) return null;
    const f = readdirSync(dir)
      .filter((n) => n.startsWith(`${assetSlug(id)}-`) && n.endsWith("-1280.jpg"))
      .sort()[0];
    return f ? `${a.kind}/${f}` : null;
  };
  const json = writeInventoryJson(path.join(outDir, "inventory.json"), registry, thumb);
  writeFileSync(path.join(outDir, "checks.json"), `${JSON.stringify(allShots.filter((s) => s.problems.length).map(({ asset, variant, width, problems }) => ({ asset, variant, width, problems })), null, 1)}\n`);
  console.log(`inventory.json: ${json.assets.length} assets (${json.assets.filter((a) => a.thumbnail).length} with a thumbnail) → ${path.relative(repoRoot, outDir)}`);
}

await main();
