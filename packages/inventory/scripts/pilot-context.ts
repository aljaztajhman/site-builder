/**
 * In-context renders of the drawing and icon pilots for the owner's rating page (HQ it-studio-drawing-pilot):
 * each of the 18 pilot drawings as a hero background layer / top edge, and as a 32 px decor beside a heading on an
 * alt and an inverse section; each of the 40 icons at real size (24 px) in iconFacts on a light and a dark ground.
 * Every scene is a small site spec the real component library renders. Output: eval/runs/pilot-context/ (PNG, one per
 * drawing and per group of 8 icons: the 1280 px scenes stacked, the 360 px phone shot beside them).
 *   pnpm inventory:pilot-context
 */
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { FONTS_DIR, sharedBundle, siteFiles } from "@sb/render";
import { ComposedProps, PRACTICAL_FACTS, REPEATABLE, direction, type Section, type SiteSpec } from "@sb/spec";
import { BASE_GOLDEN, golden, inDirection, repoRoot, repairSpec, withHome } from "./pages.ts";

type Props = Record<string, unknown>;
type Tone = "default" | "alt" | "inverse";

/** The 18 pilot drawings, in the order of the rating page, with the light direction that fits the trade. */
export const PILOT_DRAWINGS: { id: string; direction: string; headline: string; lead: string }[] = [
  { id: "motif/bakery/peel-loaf-line", direction: "warm-craft", headline: "Domač kruh, vsak dan svež", lead: "Zamesimo zvečer, spečemo zgodaj zjutraj." },
  { id: "motif/car-repair/torque-wrench-line", direction: "clean-swiss", headline: "Vaš avto v dobrih rokah", lead: "Pregled, popravilo in svetovanje na enem mestu." },
  { id: "motif/plumbing/ball-valve-line", direction: "clean-swiss", headline: "Voda teče, kjer mora", lead: "Instalacije, popravila in menjave." },
  { id: "motif/hairdresser/shears-comb-line", direction: "dark-elegant", headline: "Frizura, ki vam pristaja", lead: "Striženje, barvanje in nega las." },
  { id: "motif/dental/mirror-probe-line", direction: "clinical-calm", headline: "Skrbimo za vaš nasmeh", lead: "Pregledi, čiščenje in zdravljenje zob." },
  { id: "motif/physio/spine-model-line", direction: "clinical-calm", headline: "Gibanje brez bolečine", lead: "Fizioterapija po meri vašega telesa." },
  { id: "motif/tourist-farm/milk-can-line", direction: "warm-craft", headline: "Doma na kmetiji", lead: "Domači izdelki in mirne počitnice na podeželju." },
  { id: "motif/restaurant/ladle-pot-line", direction: "warm-craft", headline: "Kuhamo, kot se spodobi", lead: "Domače jedi iz sezonskih sestavin." },
  { id: "motif/accountant/ledger-pen-line", direction: "clean-swiss", headline: "Urejena knjigovodstva", lead: "Računovodstvo, ki vam prihrani čas." },
  { id: "motif/florist/secateurs-stem-line", direction: "warm-craft", headline: "Šopki za vsako priložnost", lead: "Sveže rože in aranžmaji po dogovoru." },
  { id: "motif/deli/olive-salt-line", direction: "warm-craft", headline: "Okusi z domačega kraja", lead: "Oljke, sol in delikatese za vašo mizo." },
  { id: "motif/electrical/cable-coil-line", direction: "clean-swiss", headline: "Elektrika brez skrbi", lead: "Napeljave, popravila in pregledi." },
  { id: "ornament/beehive-panel-line", direction: "warm-craft", headline: "Med iz domačega čebelnjaka", lead: "Čebelarstvo z dolgo tradicijo." },
  { id: "ornament/idrija-lace-line", direction: "warm-craft", headline: "Ročno delo z Idrije", lead: "Čipke, ki jih nosimo že rodove." },
  { id: "ornament/gorenjska-rosette-line", direction: "warm-craft", headline: "Doma pod Triglavom", lead: "Gorenjska gostoljubnost na vašem pragu." },
  { id: "ornament/trail-blaze-line", direction: "warm-craft", headline: "Po poti do nas", lead: "Označena pot vas pelje do domačije." },
  { id: "ornament/pisanica-band-line", direction: "warm-craft", headline: "Pisanice za veliko noč", lead: "Ročno poslikana jajca po starem običaju." },
  { id: "ornament/prekmurje-pottery-band-line", direction: "warm-craft", headline: "Lončarstvo iz Prekmurja", lead: "Posoda, ki jo naredijo roke." },
];

export interface Scene {
  name: string;
  width: 360 | 1280;
  spec: SiteSpec;
}
export interface PilotPage {
  kind: "drawing" | "icons";
  file: string;
  /** Drawing entries: the drawing id. */
  drawing?: string;
  scenes: Scene[];
}

const el = (id: string, props: Props, col: number, span: number, row: number, order: number): Props => ({ id: `e_${id}`, ...props, desk: { col, span, row }, phone: { order, span: "full" } });

function section(tone: Tone, props: Props & { elements: Props[] }, id: string): Section {
  const rows = Math.max(1, ...props.elements.map((e) => (e.desk as { row: number }).row));
  const parsed = ComposedProps.parse({ intent: "story", width: "contained", rows, ...props });
  return { id, type: "composed", variant: "free", ...(tone !== "default" ? { tone } : {}), props: parsed } as Section;
}

/** The base golden in a direction, holding only the given sections on its home page. */
function spec(dirId: string, sections: Section[], slug: string, amenities?: readonly string[]): SiteSpec {
  const s = withHome(inDirection(golden(BASE_GOLDEN).spec, direction(dirId)), sections, slug);
  if (amenities) (s.business as { amenities?: string[] }).amenities = [...amenities];
  return repairSpec(s);
}

const heroSection = (d: (typeof PILOT_DRAWINGS)[number]): Section[] => {
  const strip = (REPEATABLE as readonly string[]).includes(d.id);
  const hero = section(
    "default",
    {
      minHeight: "l",
      width: "wide",
      background: [{ kind: "drawing", drawing: d.id, scale: 3, anchor: "end" }],
      ...(strip ? { top: { edge: "drawing", drawing: d.id } } : {}),
      elements: [
        el("h", { kind: "heading", text: d.headline, level: strip ? 2 : 1, size: 7, weight: 800, measure: "l" }, 1, 8, 1, 0),
        el("t", { kind: "text", paragraphs: [d.lead], size: 1 }, 1, 6, 2, 1),
        el("a", { kind: "action", action: "call", label: "Pokličite nas", style: "primary" }, 1, 3, 3, 2),
      ],
    },
    "s_hero",
  );
  // A drawn top edge borders the section above it, so a repeatable ornament gets a quiet alt section to border.
  return strip ? [section("alt", { minHeight: "s", elements: [el("h", { kind: "heading", text: "Vaša domača stran", level: 1, size: 2 }, 1, 6, 1, 0)] }, "s_above"), hero] : [hero];
};

const factsSection = (id: string, tone: Tone, drawing: string, color?: string): Section =>
  section(
    tone,
    {
      elements: [
        el("d", { kind: "decor", drawing, fit: "fixed", size: 1, ...(color ? { color } : {}) }, 1, 1, 1, 0),
        el("h", { kind: "heading", text: "Delamo po dogovoru", level: 2, size: 3 }, 2, 8, 1, 1),
        el("t", { kind: "text", paragraphs: ["Pokličite nas in skupaj poiščemo termin, ki vam ustreza."] }, 2, 8, 2, 2),
      ],
    },
    id,
  );

const iconSection = (id: string, tone: Tone, facts: readonly string[]): Section =>
  section(tone, { elements: [el("h", { kind: "heading", text: "Praktične informacije", level: 2, size: 3 }, 1, 8, 1, 0), el("i", { kind: "iconFacts", items: facts.map((fact) => ({ fact })), icons: "line" }, 1, 12, 2, 1)] }, id);

/** The 23 images' scenes, no browser needed. */
export function pilotContextPages(): PilotPage[] {
  const drawings: PilotPage[] = PILOT_DRAWINGS.map((d, i) => {
    const slug = `pilot-d${i + 1}`;
    return {
      kind: "drawing",
      file: `drawing-${String(i + 1).padStart(2, "0")}.png`,
      drawing: d.id,
      scenes: [
        { name: "A", width: 1280, spec: spec(d.direction, heroSection(d), `${slug}-a`) },
        { name: "B", width: 1280, spec: spec(d.direction, [factsSection("s_alt", "alt", d.id)], `${slug}-b`) },
        { name: "C", width: 1280, spec: spec(d.direction, [factsSection("s_dark", "inverse", d.id, "onInverse")], `${slug}-c`) },
        { name: "A-phone", width: 360, spec: spec(d.direction, heroSection(d), `${slug}-ap`) },
      ],
    };
  });
  const icons: PilotPage[] = [0, 1, 2, 3, 4].map((g) => {
    const facts = PRACTICAL_FACTS.slice(g * 8, g * 8 + 8);
    const slug = `pilot-i${g + 1}`;
    return {
      kind: "icons",
      file: `icons-${g + 1}.png`,
      scenes: [
        { name: "light", width: 1280, spec: spec("warm-craft", [iconSection("s_light", "default", facts)], `${slug}-l`, facts) },
        { name: "dark", width: 1280, spec: spec("warm-craft", [iconSection("s_dark", "inverse", facts)], `${slug}-d`, facts) },
        { name: "light-phone", width: 360, spec: spec("warm-craft", [iconSection("s_light", "default", facts)], `${slug}-lp`, facts) },
      ],
    };
  });
  return [...drawings, ...icons];
}

const TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json" };

async function main(): Promise<void> {
  const outDir = path.join(repoRoot, "eval/runs/pilot-context");
  const siteDir = path.join(outDir, "_site");
  const sceneDir = path.join(outDir, "_scenes");
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(sceneDir, { recursive: true });
  sharedBundle();

  const server = createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
    const file = url.startsWith("/_fonts/") ? path.join(FONTS_DIR, path.basename(url)) : path.join(outDir, url);
    if (!existsSync(file) || !statSync(file).isFile() || (!file.startsWith(outDir) && !file.startsWith(FONTS_DIR))) return void res.writeHead(404).end();
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" }).end(readFileSync(file));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const browser = await chromium.launch();
  try {
    const contexts = {
      360: await browser.newContext({ viewport: { width: 360, height: 800 }, deviceScaleFactor: 1, reducedMotion: "reduce" }),
      1280: await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, reducedMotion: "reduce" }),
    };
    const pages = { 360: await contexts[360].newPage(), 1280: await contexts[1280].newPage() };
    const compose = await browser.newPage({ viewport: { width: 1700, height: 900 } });
    for (const entry of pilotContextPages()) {
      const shots: { name: string; width: number; height: number }[] = [];
      for (const scene of entry.scenes) {
        for (const [rel, data] of siteFiles(scene.spec, new Map())) {
          const f = path.join(siteDir, rel);
          mkdirSync(path.dirname(f), { recursive: true });
          writeFileSync(f, data);
        }
        const page = pages[scene.width];
        await page.goto(`${base}/_site/${scene.spec.slug}/index.html`, { waitUntil: "networkidle" });
        await page.evaluate(() => document.fonts.ready);
        await page.addStyleTag({ content: ".action-bar,.site-header,.site-footer,.skip-link{display:none!important}" });
        const h = await page.evaluate(() => Math.ceil(Math.max(...[...document.querySelectorAll("main section")].map((s) => s.getBoundingClientRect().bottom + scrollY))));
        const sw = await page.evaluate(() => document.documentElement.scrollWidth);
        if (sw > scene.width + 1) console.warn(`${entry.file} ${scene.name}: horizontal scroll (${sw} px)`);
        await page.screenshot({ path: path.join(sceneDir, `${entry.file}-${scene.name}.png`), fullPage: true, clip: { x: 0, y: 0, width: scene.width, height: h } });
        shots.push({ name: scene.name, width: scene.width, height: h });
      }
      const wide = shots.filter((s) => s.width === 1280);
      const phone = shots.filter((s) => s.width === 360);
      const img = (s: { name: string; width: number; height: number }) => `<img src="${base}/_scenes/${entry.file}-${s.name}.png" width="${s.width}" height="${s.height}" style="display:block">`;
      const html = `<body style="margin:0;background:#8a8a8a"><div style="display:flex;gap:24px;padding:12px;align-items:flex-start"><div style="display:flex;flex-direction:column;gap:12px">${wide.map(img).join("")}</div><div>${phone.map(img).join("")}</div></div>`;
      await compose.setContent(html, { waitUntil: "load" });
      const out = path.join(outDir, entry.file);
      await compose.screenshot({ path: out, fullPage: true });
      console.log(`${entry.file}  ${(statSync(out).size / 1024).toFixed(0)} KB`);
    }
  } finally {
    await browser.close();
    server.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
