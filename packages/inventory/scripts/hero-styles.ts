/**
 * The same bakery hero in four richer picture styles, for the owner to pick a direction (HQ it-studio-drawing-pilot):
 * 1 a printed-poster illustration, 2 a linocut, 3 an AI-made painting treated in the palette, 4 bold shapes with
 * oversized type. Each is a composed hero in the Pekarna Kvas golden (warm-craft), rendered by the real component library
 * at 1280 and 360 px; the art for 1, 2 and 4 is an inventory drawing (draft) placed as a full-strength decor element.
 * Output: eval/runs/hero-styles/style-N.png (the desktop shot with the phone shot beside it).
 *   pnpm tsx packages/inventory/scripts/hero-styles.ts   (style 3 needs eval/runs/hero-styles/ai/treated.jpg from
 *   tools/eval/src/hero-ai-picture.ts; without it style 3 is skipped)
 */
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { FONTS_DIR, sharedBundle, siteFiles } from "@sb/render";
import { ComposedProps, validateSite, type Section, type SiteSpec } from "@sb/spec";
import { fixturesDir, golden, repairSpec, repoRoot, withHome } from "./pages.ts";
// @sb/inventory doesn't depend on @sb/engine; the axe run is the engine's own (as pilot sheets elsewhere do by path).
import { runAxe } from "../../engine/src/check/page-checks.ts";

type Props = Record<string, unknown>;

const FIXTURE = "pekarna-kvas";
const HEADLINE = "Domač kruh, vsak dan svež";
const LEAD = "Zamesimo zvečer, spečemo zgodaj zjutraj.";
const AI_IMAGE = { id: "img_ai_still_life", width: 1220, height: 813, alt: "Naslikano tihožitje: okrogel hlebec kruha in narezana orehova potica na laneni krpi" };
const outDir = path.join(repoRoot, "eval/runs/hero-styles");
const aiTreated = path.join(outDir, "ai/treated.jpg");

const el = (id: string, props: Props, desk: Props, phone: Props): Props => ({ id: `e_${id}`, ...props, desk, phone });

function hero(props: Props & { elements: Props[] }): Section {
  const parsed = ComposedProps.parse({ intent: "hero", width: "wide", minHeight: "l", rows: 3, ...props });
  return { id: "s_hero", type: "composed", variant: "free", props: parsed } as Section;
}

/** The headline, lead and call button in the left columns; the art takes the right and bleeds to the page edge. */
function textBlock(size: number, span: number, phoneFrom: number, measure: "s" | "m" | "l" = "m"): Props[] {
  return [
    el("h", { kind: "heading", text: HEADLINE, level: 1, size, weight: 650, measure }, { col: 1, span, row: 1, alignY: "end" }, { order: phoneFrom, span: "full" }),
    el("t", { kind: "text", paragraphs: [LEAD], size: 1 }, { col: 1, span: Math.min(span, 5), row: 2 }, { order: phoneFrom + 1, span: "full" }),
    el("a", { kind: "action", action: "call", label: "Pokličite nas", style: "primary" }, { col: 1, span: 3, row: 3, alignY: "start" }, { order: phoneFrom + 2, span: "full" }),
  ];
}

const art = (drawing: string, desk: Props, phone: Props): Props => el("art", { kind: "decor", drawing, fit: "cell" }, desk, phone);

export const STYLES: { n: number; name: string; section: () => Section | null }[] = [
  {
    n: 1,
    name: "poster",
    section: () =>
      hero({
        elements: [
          ...textBlock(7, 6, 1),
          art("motif/bakery/loaf-potica-scene-solid", { col: 7, span: 6, row: 1, rowSpan: 3, alignY: "end", bleedX: "end", bleedY: "bottom" }, { order: 0, span: "bleed" }),
        ],
      }),
  },
  {
    n: 2,
    name: "linocut",
    section: () =>
      hero({
        elements: [
          ...textBlock(7, 6, 1),
          art("motif/bakery/boule-linocut-solid", { col: 7, span: 6, row: 1, rowSpan: 3, alignY: "end", bleedX: "end", bleedY: "bottom" }, { order: 0, span: "bleed" }),
        ],
      }),
  },
  {
    n: 3,
    name: "ai-painting",
    section: () =>
      existsSync(aiTreated)
        ? hero({
            elements: [
              ...textBlock(7, 5, 1),
              el("img", { kind: "image", image: AI_IMAGE.id, ratio: "4:3" }, { col: 6, span: 7, row: 1, rowSpan: 3, alignY: "center", bleedX: "end" }, { order: 0, span: "bleed" }),
            ],
          })
        : null,
  },
  {
    n: 4,
    name: "shapes",
    section: () =>
      hero({
        elements: [
          ...textBlock(8, 7, 1, "s"),
          // Phones: the oversized type first, the shapes after it.
          art("motif/bakery/sun-loaf-shapes-cut", { col: 8, span: 5, row: 1, rowSpan: 3, alignY: "end", bleedX: "end", bleedY: "bottom" }, { order: 4, span: "bleed" }),
        ],
      }),
  },
];

function styleSpec(section: Section, slug: string): SiteSpec {
  const s = withHome(structuredClone(golden(FIXTURE).spec), [section], slug);
  s.assets.images.push({ id: AI_IMAGE.id, src: "uploads/ai-still-life.jpg", width: AI_IMAGE.width, height: AI_IMAGE.height, alt: AI_IMAGE.alt, origin: "generated" });
  return repairSpec(s);
}

const TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".json": "application/json" };

async function main(): Promise<void> {
  const siteDir = path.join(outDir, "_site");
  const sceneDir = path.join(outDir, "_scenes");
  rmSync(siteDir, { recursive: true, force: true });
  rmSync(sceneDir, { recursive: true, force: true });
  mkdirSync(sceneDir, { recursive: true });
  sharedBundle();

  // Media: the AI picture for its id, the fixture's logo for the header; the fixture's photos are not used.
  const server = createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
    const media = /^\/_site\/[^/]+\/media\/(.+)$/.exec(url);
    let file: string;
    if (url.startsWith("/_fonts/")) file = path.join(FONTS_DIR, path.basename(url));
    else if (media) file = media[1]!.startsWith("logo") ? path.join(fixturesDir, FIXTURE, "logo.svg") : aiTreated;
    else file = path.join(outDir, url);
    if (!existsSync(file) || !statSync(file).isFile()) return void res.writeHead(404).end();
    const type = media && !file.endsWith(".svg") ? "image/jpeg" : (TYPES[path.extname(file)] ?? "application/octet-stream");
    res.writeHead(200, { "content-type": type }).end(readFileSync(file));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const browser = await chromium.launch();
  try {
    const pages = {
      360: await (await browser.newContext({ viewport: { width: 360, height: 800 }, deviceScaleFactor: 1, reducedMotion: "reduce" })).newPage(),
      1280: await (await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, reducedMotion: "reduce" })).newPage(),
    };
    const compose = await browser.newPage({ viewport: { width: 1700, height: 900 } });
    for (const style of STYLES) {
      const section = style.section();
      if (!section) {
        console.log(`style-${style.n} (${style.name}): skipped, no AI picture at ${path.relative(repoRoot, aiTreated)}`);
        continue;
      }
      const shots: { width: number; height: number; file: string }[] = [];
      for (const width of [1280, 360] as const) {
        const spec = styleSpec(section, `hero-style-${style.n}-${width}`);
        const v = validateSite(spec);
        if (!v.ok) console.warn(`style-${style.n} ${width}: ${v.issues.map((i) => `${i.path} ${i.message}`).join("; ")}`);
        for (const [rel, data] of siteFiles(spec, new Map())) {
          const f = path.join(siteDir, rel);
          mkdirSync(path.dirname(f), { recursive: true });
          writeFileSync(f, data);
        }
        const page = pages[width];
        await page.goto(`${base}/_site/${spec.slug}/index.html`, { waitUntil: "networkidle" });
        await page.evaluate(() => document.fonts.ready);
        // The phone's sticky call bar and the footer are not part of the hero.
        await page.addStyleTag({ content: ".action-bar,.site-footer,.skip-link{display:none!important}" });
        const h = await page.evaluate(() => Math.ceil(Math.max(...[...document.querySelectorAll("main section")].map((s) => s.getBoundingClientRect().bottom + scrollY))));
        const sw = await page.evaluate(() => document.documentElement.scrollWidth);
        if (sw > width + 1) console.warn(`style-${style.n} ${width}: horizontal scroll (${sw} px)`);
        const axe = await runAxe(page);
        console.log(`style-${style.n} ${width}: axe ${axe.length ? axe.map((v) => `${v.id} (${v.impact})`).join(", ") : "clean"}`);
        const file = path.join(sceneDir, `style-${style.n}-${width}.png`);
        await page.screenshot({ path: file, clip: { x: 0, y: 0, width, height: h }, fullPage: true });
        shots.push({ width, height: h, file });
      }
      const img = (s: (typeof shots)[number]) => `<img src="${base}/_scenes/${path.basename(s.file)}" width="${s.width}" height="${s.height}" style="display:block;box-shadow:0 0 0 1px #0002">`;
      await compose.setContent(`<body style="margin:0;background:#8a8a8a"><div style="display:flex;gap:24px;padding:12px;align-items:flex-start">${shots.map(img).join("")}</div>`, { waitUntil: "load" });
      const out = path.join(outDir, `style-${style.n}.png`);
      await compose.screenshot({ path: out, fullPage: true });
      console.log(`style-${style.n}.png (${style.name})  ${(statSync(out).size / 1024).toFixed(0)} KB`);
    }
  } finally {
    await browser.close();
    server.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
