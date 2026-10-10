/**
 * pnpm inventory:sheet [--kind <kind>] [--status draft|approved|rejected]
 *
 * Contact sheets of the design inventory (design-studio.md §4.2): every asset of a kind photographed at 360 and 1280 px
 * into eval/runs/inventory/ (gitignored). Components (sections, motifs, treatments, shapes, fact objects, header and
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
import { ASSET_KINDS, AssetStatus, assetSlug, inventory, writeInventoryJson, type Asset, type AssetKind } from "../src/index.ts";
import { fixturesDir, pagesFor, paletteOverviewHtml, repoRoot, type SheetPage } from "./pages.ts";

const SHEET_KINDS: AssetKind[] = ["font", "pairing", "palette", "motif", "submotif", "treatment", "shape", "factObject", "header", "footer", "section"];
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

interface Shot {
  asset: string;
  variant: string;
  label: string;
  width: number;
  file: string;
  problems: string[];
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

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function sheetHtml(kind: AssetKind, assets: Asset[], shots: Shot[], part?: { n: number; of: number }): string {
  const rows = assets
    .map((a) => {
      const mine = shots.filter((s) => s.asset === a.id);
      const variants = [...new Set(mine.map((s) => s.variant))];
      const problems = [...new Set(mine.flatMap((s) => s.problems))];
      const cells = variants
        .map((v) => {
          const vs = mine.filter((s) => s.variant === v);
          return `<div class="v"><div class="vl">${esc(vs[0]!.label)}</div><div class="pair">${vs.filter((s) => s.file).map((s) => `<div class="w${s.width}"><img src="${esc(path.relative(outDir, s.file).replace(/\\/g, "/"))}" loading="eager"></div>`).join("")}</div></div>`;
        })
        .join("");
      const tags = Object.entries(a.tags)
        .filter(([, v]) => (v as string[]).length)
        .map(([k, v]) => `<div><b>${k}</b> ${esc((v as string[]).join(", "))}</div>`)
        .join("");
      return `<section class="row"><div class="meta"><h2>${esc(a.id)}</h2><div>${a.status} · ${(a.bytes / 1024).toFixed(1)} KB · ${a.license} · phone ${a.phone}${a.pickable === false ? " · not pickable" : ""}</div>${a.note ? `<div class="note">${esc(a.note)}</div>` : ""}${tags}${problems.length ? `<ul class="prob">${problems.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>` : ""}</div><div class="vs">${cells}</div></section>`;
    })
    .join("");
  const title = `${kind} · ${assets.length} assets${part ? ` · part ${part.n}/${part.of}` : ""}`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Inventory: ${esc(title)}</title><style>
body{margin:0;padding:16px;background:#e9e9ea;font:13px/1.4 system-ui,sans-serif;color:#1a1a1a}
h1{font-size:20px;margin:0 0 12px}.row{display:flex;gap:12px;background:#fff;border-radius:6px;padding:10px;margin-bottom:12px;align-items:flex-start}
.meta{width:220px;flex:none}.meta h2{font-size:14px;margin:0 0 4px;word-break:break-all}.meta div{margin-bottom:2px;color:#444}.note{font-style:italic}
.prob{color:#b00020;padding-left:16px;margin:6px 0 0;font-weight:600}.vs{display:flex;gap:14px;flex-wrap:wrap}.vl{font-weight:600;margin-bottom:4px}
.pair{display:flex;gap:8px;align-items:flex-start}.pair div{overflow:hidden;border:1px solid #ccc;background:#fff}
.w360{width:180px;max-height:900px}.w1280{width:560px;max-height:900px}.pair img{width:100%;display:block}
</style></head><body><h1>${esc(title)}</h1>${rows}</body></html>`;
}

async function main(): Promise<void> {
  const only = arg("kind");
  if (only && !(ASSET_KINDS as readonly string[]).includes(only)) throw new Error(`Unknown kind ${only}; one of ${ASSET_KINDS.join(", ")}`);
  const kinds = only ? [only as AssetKind] : SHEET_KINDS;
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
  const shared = { done: false };
  const allShots: Shot[] = [];
  try {
    for (const kind of kinds) {
      const assets = registry.byKind(kind).filter((a) => !status || a.status === status);
      if (!assets.length) continue;
      const kindDir = path.join(outDir, kind);
      rmSync(kindDir, { recursive: true, force: true });
      mkdirSync(kindDir, { recursive: true });
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
            const file = path.join(kindDir, `${assetSlug(a.id)}-${p.variant}-${w}.jpg`);
            const found = await photograph(pages[i]!, url, pageUrl, w, p.kind === "site" && !p.showChrome, file);
            shots.push({ asset: a.id, variant: p.variant, label: p.label, width: w, file, problems: [...problems, ...found] });
          }
        }
      }
      allShots.push(...shots);
      writeFileSync(path.join(outDir, `${kind}.html`), sheetHtml(kind, assets, shots));
      const parts = Math.ceil(assets.length / ROWS_PER_PNG);
      for (let n = 0; n < parts; n++) {
        const html = path.join(outDir, `_${kind}-${n + 1}.html`);
        writeFileSync(html, sheetHtml(kind, assets.slice(n * ROWS_PER_PNG, (n + 1) * ROWS_PER_PNG), shots, parts > 1 ? { n: n + 1, of: parts } : undefined));
        const sheetPage = await browser.newPage({ viewport: { width: 1700, height: 900 } });
        await sheetPage.goto(`${url}/_${kind}-${n + 1}.html`, { waitUntil: "load" });
        await sheetPage.screenshot({ path: path.join(outDir, `${kind}-${n + 1}.png`), fullPage: true });
        await sheetPage.close();
        rmSync(html);
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
      console.log(`${kind}: ${assets.length} assets, ${shots.length} pictures, ${parts} sheet PNG(s)${bad.length ? `, ${new Set(bad.map((s) => s.asset)).size} with problems` : ""}`);
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
