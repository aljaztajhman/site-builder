/**
 * tsx packages/inventory/scripts/side-by-side.ts [--out <dir>] [--intent <intent>] [--ids <id,id,...>]
 *
 * The I3a sheet (docs/plans/studio-phase1-design.md §5): each composition preset that re-expresses a section variant
 * (its note names the variant as `type:variant`) beside that variant, the same fixture and palette, at 1280 and 360 px.
 * The variant is the section sheet's sample (pages.ts sampleSection: the fixture's own section when its golden has the
 * type, else borrowed props); the preset is fillPreset from the fixture it fills best (pekarna-kvas first). Each preset
 * page is checked with axe (the WCAG 2.2 AA tags the engine's page checks use) and for horizontal scroll at 360 px.
 *
 * Writes <out>/<intent>.html and <out>/<intent>-<n>.png (rows of eight), the pictures under <out>/shots/ and
 * <out>/checks.json (per preset: fixture, dropped elements, axe violations, scroll). No model call, no network.
 */
import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Page } from "playwright";
import { FONTS_DIR, sharedBundle, siteFiles } from "@sb/render";
import { SECTION_DEFS, direction, fillPreset, parsePresetId, presetSection, validateSite, type CompositionPreset, type Section, type SiteSpec } from "@sb/spec";
import { COMPOSITION_PRESETS } from "../src/index.ts";
import { fixturesDir, golden, inDirection, repairSpec, repoRoot, sampleSection, withHome } from "./pages.ts";
import { PRESET_FIXTURES, presetFixtureSources } from "./pages-v2.ts";
import { esc } from "./sheet-html.ts";

const WIDTHS = [1280, 360] as const;
const MAX_HEIGHT: Record<(typeof WIDTHS)[number], number> = { 1280: 1800, 360: 3200 };
const ROWS_PER_PNG = 8;
const PALETTE = "clean-swiss";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const outDir = path.resolve(arg("out") ?? path.join(repoRoot, "eval/runs/inventory/side-by-side"));
const siteDir = path.join(outDir, "_site");
const shotDir = path.join(outDir, "shots");

/** The section variant a preset re-expresses: the first `type:variant` in its note that names a real one. */
export function variantOf(preset: CompositionPreset): string | undefined {
  for (const m of (preset.note ?? "").matchAll(/\b([a-z]+(?:-[a-z]+)*):([a-z]+(?:-[a-z]+)*)\b/g)) {
    const def = SECTION_DEFS.find((d) => d.type === m[1]);
    if (def?.variants.includes(m[2]!)) return `${m[1]}:${m[2]}`;
  }
  return undefined;
}

/** The fixture a preset fills best: filled, fewest dropped elements, in PRESET_FIXTURES order. */
function bestFill(preset: CompositionPreset) {
  const intent = parsePresetId(preset.id)!.intent;
  const fills = PRESET_FIXTURES.flatMap((fixture) => {
    const src = presetFixtureSources(fixture, intent);
    const r = src ? fillPreset(preset, src) : undefined;
    return r?.ok ? [{ fixture, r }] : [];
  });
  return fills.sort((a, b) => a.r.dropped.length - b.r.dropped.length)[0];
}

const TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".png": "image/png" };
const siteMedia = new Map<string, { fixture: string; images: string[] }>();

/** Serves the out dir, the fonts, and each site's media from its fixture's photos (as sheet.ts does). */
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
        const dir = path.join(fixturesDir, m.fixture, "photos");
        const photos = existsSync(dir) ? readdirSync(dir).sort() : [];
        const i = Math.max(0, m.images.findIndex((id) => name.startsWith(`${id}-`) || name.startsWith(`${id}.`)));
        if (photos.length) file = path.join(dir, photos[i % photos.length]!);
      }
    } else file = path.join(outDir, url);
    const inside = file !== undefined && [FONTS_DIR, fixturesDir, outDir].some((root) => !path.relative(root, path.resolve(file)).startsWith(".."));
    if (!file || !inside || !existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    const type = media && !file.endsWith(".svg") ? "image/jpeg" : (TYPES[path.extname(file)] ?? "application/octet-stream");
    res.writeHead(200, { "content-type": type }).end(readFileSync(file));
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, url: `http://127.0.0.1:${(server.address() as { port: number }).port}` })));
}

function writeSite(spec: SiteSpec, fixture: string, shared: { done: boolean }): { url: string; problems: string[] } {
  const valid = validateSite(spec);
  const problems = valid.ok ? [] : valid.issues.slice(0, 3).map((i) => `invalid spec: ${i.path} ${i.message}`);
  siteMedia.set(spec.slug, { fixture, images: spec.assets.images.map((i) => i.id) });
  for (const [rel, data] of siteFiles(spec, new Map())) {
    if (rel.startsWith("_shared/") && shared.done) continue;
    const file = path.join(siteDir, rel);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, data);
  }
  shared.done = true;
  return { url: `/_site/${spec.slug}/index.html`, problems };
}

interface AxeViolation {
  id: string;
  impact: string | null;
  nodes: number;
  targets: string[];
}
type AxeModule = { AxeBuilder: new (o: { page: Page }) => { withTags(t: string[]): { include(s: string): { analyze(): Promise<{ violations: { id: string; impact?: string | null; nodes: { target: string[] }[] }[] }> } } } };
// @axe-core/playwright is the engine's dependency (its page checks); this script borrows it from there.
const axe = createRequire(path.join(repoRoot, "packages/engine/package.json"))("@axe-core/playwright") as AxeModule;

async function photograph(page: Page, base: string, url: string, width: number, file: string, check: boolean): Promise<{ problems: string[]; axe: AxeViolation[] }> {
  await page.goto(`${base}${url}`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: ".action-bar,.site-header,.site-footer,.skip-link{display:none!important}" });
  const problems: string[] = [];
  const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, h: document.documentElement.scrollHeight }));
  if (m.sw > m.iw + 1) problems.push(`horizontal scroll at ${width} px (${m.sw} px)`);
  let violations: AxeViolation[] = [];
  if (check) {
    const r = await new axe.AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"]).include("main").analyze();
    violations = r.violations.map((v) => ({ id: v.id, impact: v.impact ?? null, nodes: v.nodes.length, targets: v.nodes.slice(0, 3).map((n) => n.target.join(" ")) }));
  }
  await page.screenshot({ path: file, type: "jpeg", quality: 70, clip: { x: 0, y: 0, width, height: Math.min(m.h, MAX_HEIGHT[width as 1280 | 360]) } });
  return { problems, axe: violations };
}

interface Row {
  id: string;
  intent: string;
  variant: string;
  fixture: string;
  dropped: string[];
  shots: Record<string, string>;
  problems: string[];
  axe: AxeViolation[];
}

const CSS = `body{margin:0;padding:16px;background:#e9e9ea;font:13px/1.4 system-ui,sans-serif;color:#1a1a1a}h1{font-size:20px;margin:0 0 12px}
.row{background:#fff;border-radius:6px;padding:10px;margin-bottom:12px}.meta{margin-bottom:8px}.meta b{font-size:14px}.meta span{color:#555;margin-left:10px}
.prob{color:#b00020;font-weight:600}.g{display:grid;grid-template-columns:520px 520px 170px 170px;gap:10px;align-items:start}
.g figure{margin:0}.g figcaption{font-weight:600;margin-bottom:4px}.g div{border:1px solid #ccc;max-height:760px;overflow:hidden}.g img{width:100%;display:block}`;

function sheet(title: string, rows: Row[]): string {
  const cell = (r: Row, key: string, cap: string) => `<figure><figcaption>${cap}</figcaption><div>${r.shots[key] ? `<img src="${esc(r.shots[key]!)}" loading="lazy">` : "<p>missing</p>"}</div></figure>`;
  const body = rows
    .map((r) => {
      const probs = [...r.problems, ...r.axe.map((v) => `axe ${v.id} (${v.impact}) ×${v.nodes}: ${v.targets.join(", ")}`)];
      return `<div class="row"><div class="meta"><b>${esc(r.id)}</b><span>variant ${esc(r.variant)}</span><span>fixture ${esc(r.fixture)}</span>${r.dropped.length ? `<span>dropped ${esc(r.dropped.join(", "))}</span>` : ""}${probs.length ? `<div class="prob">${probs.map(esc).join("<br>")}</div>` : ""}</div><div class="g">${cell(r, "v1280", "variant 1280")}${cell(r, "p1280", "preset 1280")}${cell(r, "v360", "variant 360")}${cell(r, "p360", "preset 360")}</div></div>`;
    })
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${CSS}</style></head><body><h1>${esc(title)}</h1>${body}</body></html>`;
}

async function main(): Promise<void> {
  const intent = arg("intent");
  const ids = new Set((arg("ids") ?? "").split(",").filter(Boolean));
  const presets = COMPOSITION_PRESETS.filter((p) => variantOf(p) && (!intent || parsePresetId(p.id)?.intent === intent) && (!ids.size || ids.has(p.id)));
  if (!presets.length) throw new Error("no preset names a variant in its note");
  mkdirSync(outDir, { recursive: true });
  rmSync(siteDir, { recursive: true, force: true });
  mkdirSync(shotDir, { recursive: true });
  sharedBundle();
  const { server, url } = await serve();
  const browser = await chromium.launch();
  const pages = await Promise.all(WIDTHS.map((w) => browser.newContext({ viewport: { width: w, height: 800 }, deviceScaleFactor: 1, reducedMotion: "reduce" }).then((c) => c.newPage())));
  const shared = { done: false };
  const rows: Row[] = [];
  try {
    for (const preset of presets) {
      const variant = variantOf(preset)!;
      const best = bestFill(preset);
      const slug = preset.id.replace(/^composition\//, "").replace(/\//g, "-");
      const row: Row = { id: preset.id, intent: parsePresetId(preset.id)!.intent, variant, fixture: best?.fixture ?? "-", dropped: best?.r.dropped.map((d) => d.id) ?? [], shots: {}, problems: [], axe: [] };
      rows.push(row);
      if (!best) {
        row.problems.push("fills from no fixture");
        continue;
      }
      const base = inDirection(golden(best.fixture).spec, direction(PALETTE));
      const original = sampleSection(base, variant, "s_g_default");
      const specs: [string, Section | null][] = [
        ["v", original],
        ["p", presetSection(preset, best.r.props, "s_g_default")],
      ];
      for (const [k, section] of specs) {
        if (!section) {
          row.problems.push(`${k === "v" ? "variant" : "preset"}: no sample`);
          continue;
        }
        const spec = repairSpec(withHome(structuredClone(base), [section], `sbs-${slug}-${k}`));
        const { url: pageUrl, problems } = writeSite(spec, best.fixture, shared);
        if (k === "p") row.problems.push(...problems);
        for (const [i, w] of WIDTHS.entries()) {
          const file = path.join(shotDir, `${slug}-${k}-${w}.jpg`);
          const got = await photograph(pages[i]!, url, pageUrl, w, file, k === "p");
          row.shots[`${k}${w}`] = path.relative(outDir, file).replace(/\\/g, "/");
          if (k === "p") {
            row.problems.push(...got.problems);
            row.axe.push(...got.axe.map((v) => ({ ...v, id: `${v.id}@${w}` })));
          }
        }
      }
      console.log(`${preset.id} ← ${variant} (${best.fixture})${row.problems.length || row.axe.length ? `: ${[...row.problems, ...row.axe.map((v) => v.id)].join("; ")}` : ""}`);
    }
    const intents = [...new Set(rows.map((r) => r.intent))].sort();
    for (const name of intents) {
      const mine = rows.filter((r) => r.intent === name);
      writeFileSync(path.join(outDir, `${name}.html`), sheet(`I3a side by side · ${name} · ${mine.length}`, mine));
      for (let n = 0; n * ROWS_PER_PNG < mine.length; n++) {
        const html = path.join(outDir, `_${name}-${n + 1}.html`);
        writeFileSync(html, sheet(`I3a side by side · ${name} · ${n * ROWS_PER_PNG + 1}–${Math.min(mine.length, (n + 1) * ROWS_PER_PNG)} of ${mine.length}`, mine.slice(n * ROWS_PER_PNG, (n + 1) * ROWS_PER_PNG)));
        const p = await browser.newPage({ viewport: { width: 1460, height: 900 } });
        await p.goto(`${url}/_${name}-${n + 1}.html`, { waitUntil: "load" });
        await p.screenshot({ path: path.join(outDir, `${name}-${n + 1}.png`), fullPage: true });
        await p.close();
        rmSync(html);
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
  writeFileSync(path.join(outDir, "checks.json"), `${JSON.stringify(rows.map(({ shots: _s, ...r }) => r), null, 1)}\n`);
  const bad = rows.filter((r) => r.problems.length || r.axe.length);
  console.log(`${rows.length} presets side by side → ${outDir}${bad.length ? `; ${bad.length} with problems` : "; no problems"}`);
  if (bad.length) process.exitCode = 1;
}

await main();
