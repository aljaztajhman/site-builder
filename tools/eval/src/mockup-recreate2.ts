/**
 * pnpm tsx tools/eval/src/mockup-recreate2.ts
 *
 * Mockup spike 2, step 5 (docs/plans/mockup-spike.md): the best art-directed mockup per business rebuilt in the
 * composition language, as in mockup-recreate.ts: one preset per section with slot markers filled by fillPreset from
 * the business, brief and copy, plus design tokens. No hand-written HTML or CSS.
 *
 *  - pekarna-kvas from mockups/d2-pekarna-b-1.jpg ("Polica": the daily breads stacked on oak planks)
 *  - the invented tattoo studio from mockups/d2-tattoo-a-1.jpg ("Rust line": rust field, one off-white hairline)
 *  - the invented florist (eval/runs/mockup-spike/florist-brief.json) from mockups/d2-florist-a-1.jpg ("Rosehip Red")
 *
 * Gaps lifted here only, without changing the spec or the renderer; each is marked WORKAROUND(<name>) where it happens
 * so a builder can turn it into a feature:
 *  - WORKAROUND(ai-art-outside-hero): validateSite allows generated images only in the opener; a second cut-out (the
 *    tattoo swallow) sits in a later section. The issue it raises is the only one accepted; the page renders as is.
 *  - WORKAROUND(invented-business-type): there is no tattoo or florist type; both sit on the frizerstvo-lana golden
 *    ("hairdresser") with the business replaced.
 *  - WORKAROUND(art-ground-match): a cut-out keeps the mockup's painted ground, so the section's band colour is set to
 *    the colour sampled from the cut-out (a real feature: background removal, or a transparent-PNG asset).
 * Every other validateSite issue stops the run. Renders at 1280 and 360 px with the page checks, writes
 * eval/runs/mockup-spike/recreate2/<id>-{desk,phone}{,-full}.png and report.json. No model call.
 */
import { readFile, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { chromium } from "playwright";
import { loadConfig } from "@sb/config";
import { processPhoto, serveStatic } from "@sb/engine";
import { fillPreset, migrateSpec, presetSection, validateSite, type CompositionPreset, type ComposedProps, type PresetSources, type Section, type SiteSpec } from "@sb/spec";
import { checkPage, openPage, type PageChecks } from "./compose-sheet.ts";
import { writeSiteFiles } from "./kitchen-sink.ts";
import { specMedia } from "./okus-items.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, "../../..");
const SPIKE = path.join(REPO_ROOT, "eval/runs/mockup-spike");
const OUT = path.join(SPIKE, "recreate2");

const golden = async (id: string): Promise<SiteSpec> => migrateSpec(JSON.parse(await readFile(path.join(REPO_ROOT, "tools/eval/golden", `${id}.json`), "utf8"))) as SiteSpec;

interface Built {
  spec: SiteSpec;
  media: Map<string, Uint8Array>;
  /** validateSite messages accepted as a marked workaround (substring match). */
  accept: string[];
}

function sectionsFor(presets: CompositionPreset[], src: (intent: string) => PresetSources): Section[] {
  return presets.map((p) => {
    const intent = (p.props as { intent: string }).intent;
    const r = fillPreset(p, src(intent));
    if (!r.ok) throw new Error(`${p.id}: ${r.reason} ${[...r.missing, ...r.issues].join("; ")}`);
    if (r.dropped.length) console.log(`  ${p.id}: dropped ${r.dropped.map((d) => JSON.stringify(d)).join(", ")}`);
    return presetSection(p, r.props as ComposedProps, `s_${intent}`) as unknown as Section;
  });
}

/** A cut-out of a mockup (no text, people or premises in it) as a labelled AI image, processed like the pipeline's pictures. */
async function cutOut(file: string, crop: { left: number; top: number; width: number; height: number }, id: string, alt: string, media: Map<string, Uint8Array>): Promise<SiteSpec["assets"]["images"][number]> {
  const config = loadConfig();
  const buf = await sharp(path.join(SPIKE, "mockups", file)).extract(crop).jpeg({ quality: 90 }).toBuffer();
  const p = await processPhoto(id, new Uint8Array(buf), [...config.images.widths], { avif: config.images.avifQuality, webp: config.images.webpQuality });
  for (const v of p.variants) media.set(v.file, v.data);
  return { id, src: `uploads/${id}.jpg`, width: p.width, height: p.height, alt, origin: "generated" };
}

/** WORKAROUND(invented-business-type): the frizerstvo-lana golden with the invented business's facts. */
async function inventedSpec(briefFile: string, slug: string): Promise<{ spec: SiteSpec; brief: { facts: { services: { name: string; detail: string }[]; people: { name: string; role: string }[] } } }> {
  const brief = JSON.parse(await readFile(path.join(SPIKE, briefFile), "utf8")) as {
    facts: { name: string; phone: string; email: string; address: { street: string; postalCode: string; city: string }; hours: { from: string; to: string; open: string; close: string }[]; services: { name: string; detail: string }[]; people: { name: string; role: string }[] };
  };
  const spec = await golden("frizerstvo-lana");
  spec.slug = slug;
  const days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const open = new Set(brief.facts.hours.flatMap((h) => days.slice(days.indexOf(h.from), days.indexOf(h.to) + 1)));
  spec.business = {
    ...spec.business,
    name: brief.facts.name,
    phone: brief.facts.phone,
    email: brief.facts.email,
    address: brief.facts.address,
    hours: {
      entries: [
        ...brief.facts.hours.map((h) => ({ from: h.from, to: h.to, open: h.open, close: h.close })),
        ...days.filter((d) => !open.has(d)).map((d) => ({ from: d, to: d, closed: true })),
      ].sort((a, b) => days.indexOf(a.from) - days.indexOf(b.from)),
    },
  } as SiteSpec["business"];
  delete spec.assets.logo;
  spec.pages = spec.pages.filter((p) => p.kind !== "standard");
  return { spec, brief };
}

const sources = (spec: SiteSpec, brief: PresetSources["brief"], copy: Record<string, PresetSources["copy"]>) => (intent: string): PresetSources => ({
  business: spec.business,
  images: spec.assets.images.map((i) => ({ id: i.id, origin: i.origin ?? "client" })),
  colors: spec.design.colors,
  ...(brief ? { brief } : {}),
  ...(copy[intent] ? { copy: copy[intent] } : {}),
});

// ---------- pekarna-kvas: "Polica" (d2-pekarna-b) ----------

async function pekarna(): Promise<Built> {
  const spec = await golden("pekarna-kvas");
  const all = JSON.parse(await readFile(path.join(REPO_ROOT, "packages/inventory/test/fixtures/preset-sources.json"), "utf8")) as Record<string, { brief: PresetSources["brief"]; copy: Record<string, PresetSources["copy"]> }>;
  const f = all["pekarna-kvas"]!;
  spec.slug = "spike2-pekarna";
  // bold-local: white page, Archivo heavy (the nearest we have to the mockup's condensed Anton), square corners, natural photos.
  spec.design = {
    ...spec.design,
    direction: "bold-local",
    fontPair: "archivo-archivo",
    colors: { background: "#ffffff", surface: "#eef0f2", text: "#2a1a10", muted: "#5a4334", primary: "#c2401f", onPrimary: "#fffaf6", accent: "#a8692e", border: "#c08a4e", inverse: "#3b2414", onInverse: "#fbf4ec", band: "#9b5a1e", onBand: "#fffaf6" },
    radius: 0,
    baseFontSize: 17,
    scale: 1.3,
    headingWeight: 800,
    headingTracking: -0.02,
    density: "regular",
    shadow: "none",
    imagery: "natural",
  };
  delete spec.design.wordmark;
  // The mockup's one call button is in the hero: the header's own call button would make two on the first screen.
  spec.chrome = { ...spec.chrome, header: { ...spec.chrome.header, cta: "none" }, mobileActionBar: false };
  const presets = [
    {
      id: "composition/hero/spike2-shelf-headline",
      props: {
        intent: "hero",
        width: "wide",
        rows: 3,
        elements: [
          { id: "e_title", kind: "heading", text: "{copy.headline}", level: 1, size: 6, weight: 800, measure: "l", desk: { col: 1, span: 8, row: 1, alignY: "end" }, phone: { order: 0, span: "full" } },
          // The plank under the headline: a site's own drawing (decor svg), oak.
          { id: "e_plank", kind: "decor", svg: { width: 400, height: 8, paths: [{ d: "M0 0 H400 V8 H0 Z", fill: "border" }] }, fit: "cell", desk: { col: 1, span: 8, row: 2, alignY: "start" }, phone: { order: 1, span: "full" } },
          { id: "e_lead", kind: "text", paragraphs: ["{copy.lead}"], desk: { col: 1, span: 5, row: 3, alignY: "start" }, phone: { order: 2, span: "full" } },
          { id: "e_call", kind: "action", action: "call", label: "Pokličite", style: "primary", desk: { col: 6, span: 3, row: 3, alignY: "start" }, phone: { order: 3, span: "full" } },
          { id: "e_tray", kind: "image", image: "{images[2]}", ratio: "fill", desk: { col: 9, span: 4, row: 1, rowSpan: 3, bleedX: "end" }, phone: { order: 4, span: "bleed" } },
        ],
      },
    },
    {
      id: "composition/products/spike2-shelf-list",
      props: {
        intent: "products",
        width: "wide",
        rows: 6,
        gap: 1,
        // The signature: each bread a display-size line resting on its own oak plank. A list tops out at size 2, so the
        // breads are five headings. The planks are a gap: a decor plank in the heading's cell is dropped by the fill
        // (decor may not share a cell with text) and a row each would need 11 rows (MAX_ROWS 8). It needs a heading
        // treatment "plank" (a thick rule in a colour role under the line).
        elements: [
          { id: "e_head", kind: "heading", text: "Vsak dan", level: 2, size: 2, desk: { col: 1, span: 7, row: 1, alignY: "end" }, phone: { order: 0, span: "full" } },
          ...[0, 1, 2, 3, 4].map((i) => ({ id: `e_b${i}`, kind: "heading", text: `{brief.offerings[${i}].name}`, level: 3, size: 5, weight: 800, desk: { col: 1, span: 7, row: 2 + i, alignY: "start" }, phone: { order: 1 + i, span: "full" } })),
          { id: "e_loaves", kind: "image", image: "{images[0]}", ratio: "fill", desk: { col: 8, span: 5, row: 1, rowSpan: 6, bleedX: "end" }, phone: { order: 6, span: "bleed" } },
        ],
      },
    },
    {
      id: "composition/notice/spike2-ribbon-note",
      tone: "band",
      props: {
        intent: "notice",
        width: "full",
        rows: 1,
        background: [{ kind: "field", role: "band" }],
        elements: [{ id: "e_note", kind: "text", paragraphs: ["{copy.lead}"], size: 1, desk: { col: 1, span: 8, row: 1, alignY: "center" }, phone: { order: 0, span: "full" } }],
      },
    },
    {
      id: "composition/contact/spike2-split-rye",
      props: {
        intent: "contact",
        width: "wide",
        rows: 2,
        background: [{ kind: "field", role: "inverse", cols: { from: 1, to: 5 } }],
        elements: [
          { id: "e_phone", kind: "fact", value: "{business.phone}", label: "Naročila po telefonu", labelAt: "before", treatment: "numeral", size: 6, link: { action: "call" }, color: "onInverse", desk: { col: 1, span: 5, row: 1, alignY: "end" }, phone: { order: 0, span: "full" } },
          { id: "e_where", kind: "text", paragraphs: ["{business.address}"], color: "onInverse", desk: { col: 1, span: 4, row: 2, alignY: "start" }, phone: { order: 1, span: "full" } },
          { id: "e_hours", kind: "hours", style: "table", desk: { col: 6, span: 3, row: 1, rowSpan: 2, alignY: "start" }, phone: { order: 2, span: "full" } },
          { id: "e_hands", kind: "image", image: "{images[1]}", ratio: "4:3", desk: { col: 9, span: 4, row: 1, rowSpan: 2 }, phone: { order: 3, span: "full", hidden: true } },
        ],
      },
    },
  ] as unknown as CompositionPreset[];
  const copy = { ...f.copy };
  spec.pages.find((p) => p.kind === "home")!.sections = sectionsFor(presets, (intent) => sources(spec, f.brief, intent === "notice" ? { notice: f.copy.products } : copy)(intent));
  const media = await specMedia("pekarna-kvas", spec, loadConfig().images.widths);
  return { spec, media, accept: [] };
}

// ---------- the tattoo studio: "Rust line" (d2-tattoo-a) ----------

async function tattoo(): Promise<Built> {
  const { spec, brief } = await inventedSpec("tattoo-brief.json", "spike2-tattoo");
  const media = new Map<string, Uint8Array>();
  // WORKAROUND(art-ground-match): the band is the rust sampled from the cut-outs (#812d11 at their corners).
  // industrial: a dark page (deep oxide), Archivo heavy for the mockup's condensed black display, square corners.
  spec.design = {
    ...spec.design,
    direction: "industrial",
    fontPair: "archivo-archivo",
    colors: { background: "#43170a", surface: "#5a2412", text: "#f3ece6", muted: "#e2d2c8", primary: "#b9a8f0", onPrimary: "#1e1310", accent: "#b9a8f0", border: "#a35a40", inverse: "#1e1310", onInverse: "#f3ece6", band: "#812d11", onBand: "#f3ece6" },
    radius: 0,
    baseFontSize: 17,
    scale: 1.28,
    headingWeight: 700,
    headingTracking: -0.01,
    density: "compact",
    shadow: "none",
    imagery: "monochrome",
    wordmark: { style: "plain" },
  };
  spec.chrome = { ...spec.chrome, mobileActionBar: false };
  spec.assets.images = [
    await cutOut("d2-tattoo-a-1.jpg", { left: 840, top: 60, width: 660, height: 250 }, "img_ai_fern", "Ena sama bela linija, narisana kot praprot", media),
    // WORKAROUND(ai-art-outside-hero): the swallow at the end of the services' line, a second AI cut-out below the opener.
    await cutOut("d2-tattoo-a-1.jpg", { left: 1405, top: 565, width: 105, height: 115 }, "img_ai_swallow", "Lastovka, narisana z eno linijo", media),
  ];
  const presets = [
    {
      id: "composition/hero/spike2-rust-hairline",
      tone: "band",
      props: {
        intent: "hero",
        width: "wide",
        rows: 2,
        background: [{ kind: "field", role: "band" }],
        elements: [
          { id: "e_title", kind: "heading", text: "{copy.headline}", level: 1, size: 7, weight: 800, measure: "l", desk: { col: 1, span: 7, row: 1, rowSpan: 2, alignY: "center" }, phone: { order: 0, span: "full" } },
          { id: "e_fern", kind: "image", image: "{images[0]}", ratio: "21:9", desk: { col: 8, span: 5, row: 1, alignY: "start", bleedX: "end" }, phone: { order: 1, span: "bleed" } },
          { id: "e_lead", kind: "text", paragraphs: ["{copy.lead}"], size: 1, desk: { col: 9, span: 4, row: 2, alignY: "end" }, phone: { order: 2, span: "full" } },
        ],
      },
    },
    {
      id: "composition/services/spike2-four-condensed",
      props: {
        intent: "services",
        width: "wide",
        rows: 1,
        elements: [
          ...[0, 1, 2].map((i) => ({ id: `e_s${i}`, kind: "heading", text: `{brief.offerings[${i}].name}`, level: 2, size: 3, weight: 800, desk: { col: 1 + i * 3, span: 3, row: 1, alignY: "center" }, phone: { order: i, span: "full" } })),
          { id: "e_s3", kind: "heading", text: "{brief.offerings[3].name}", level: 2, size: 3, weight: 800, desk: { col: 10, span: 2, row: 1, alignY: "center" }, phone: { order: 3, span: "full" } },
          { id: "e_swallow", kind: "image", image: "{images[1]}", ratio: "1:1", desk: { col: 12, span: 1, row: 1, alignY: "center" }, phone: { order: 4, span: "half", hidden: true } },
        ],
      },
    },
    {
      id: "composition/contact/spike2-numeral-hours",
      tone: "band",
      props: {
        intent: "contact",
        width: "wide",
        rows: 2,
        background: [{ kind: "field", role: "band" }],
        elements: [
          { id: "e_phone", kind: "fact", value: "{business.phone}", label: "Naročila", labelAt: "before", treatment: "numeral", size: 7, link: { action: "call" }, desk: { col: 1, span: 6, row: 1, alignY: "end" }, phone: { order: 0, span: "full" } },
          { id: "e_call", kind: "action", action: "call", label: "Pokličite", style: "primary", desk: { col: 1, span: 3, row: 2, alignY: "start" }, phone: { order: 1, span: "full" } },
          { id: "e_hours", kind: "hours", style: "compact", desk: { col: 8, span: 5, row: 1, alignY: "end" }, phone: { order: 2, span: "full" } },
          { id: "e_where", kind: "text", paragraphs: ["{business.address}"], desk: { col: 8, span: 5, row: 2, alignY: "start" }, phone: { order: 3, span: "full" } },
        ],
      },
    },
  ] as unknown as CompositionPreset[];
  const offerings = brief.facts.services.map((s) => ({ name: s.name, description: s.detail }));
  const copy = { hero: { headline: "Vsak motiv narisan na novo", lead: "Majhen tatu studio v Mariboru. Tetovaže po vaši zgodbi, nič iz kataloga. Samo z naročili." } };
  spec.pages.find((p) => p.kind === "home")!.sections = sectionsFor(presets, sources(spec, { offerings, facts: { people: brief.facts.people } }, copy));
  return { spec, media, accept: ["generated"] };
}

// ---------- the florist: "Rosehip Red" (d2-florist-a) ----------

async function florist(): Promise<Built> {
  const { spec, brief } = await inventedSpec("florist-brief.json", "spike2-florist");
  const media = new Map<string, Uint8Array>();
  // pregib: white page, Bricolage Grotesque heavy (the mockup's own pick), natural imagery.
  // WORKAROUND(art-ground-match): the band is the hip red sampled from the briar cut-out (#a91e17).
  spec.design = {
    ...spec.design,
    direction: "pregib",
    fontPair: "bricolage-public-sans",
    colors: { background: "#ffffff", surface: "#f1f3f5", text: "#1e1412", muted: "#5a4a46", primary: "#a91e17", onPrimary: "#fbf4ef", accent: "#2f5d3a", border: "#d9a19c", inverse: "#fbf4ef", onInverse: "#1e1412", band: "#a91e17", onBand: "#fbf4ef" },
    radius: 6,
    baseFontSize: 18,
    scale: 1.3,
    headingWeight: 800,
    headingTracking: -0.035,
    density: "regular",
    shadow: "none",
    imagery: "natural",
    wordmark: { style: "stacked-caps" },
  };
  spec.chrome = { ...spec.chrome, mobileActionBar: false };
  spec.assets.images = [await cutOut("d2-florist-a-1.jpg", { left: 940, top: 100, width: 596, height: 568 }, "img_ai_briar", "Narisana veja šipka s plodovi in listi", media)];
  const presets = [
    {
      id: "composition/hero/spike2-briar-field",
      tone: "band",
      props: {
        intent: "hero",
        width: "wide",
        rows: 3,
        headerOver: true,
        background: [{ kind: "field", role: "band" }],
        elements: [
          { id: "e_title", kind: "heading", text: "{copy.headline}", level: 1, size: 7, weight: 800, measure: "l", desk: { col: 1, span: 7, row: 1, alignY: "end" }, phone: { order: 0, span: "full" } },
          { id: "e_lead", kind: "text", paragraphs: ["{copy.lead}"], size: 1, desk: { col: 1, span: 6, row: 2, alignY: "start" }, phone: { order: 1, span: "full" } },
          { id: "e_call", kind: "action", action: "call", label: "Pokličite", style: "secondary", desk: { col: 1, span: 2, row: 3, alignY: "start" }, phone: { order: 2, span: "full" } },
          { id: "e_phone", kind: "fact", value: "{business.phone}", label: "Naročila", labelAt: "before", treatment: "numeral", size: 3, link: { action: "call" }, desk: { col: 3, span: 4, row: 3, alignY: "start" }, phone: { order: 3, span: "full" } },
          { id: "e_briar", kind: "image", image: "{images[0]}", ratio: "fill", desk: { col: 8, span: 5, row: 1, rowSpan: 3, bleedX: "end" }, phone: { order: 4, span: "bleed" } },
        ],
      },
    },
    {
      id: "composition/services/spike2-red-names",
      props: {
        intent: "services",
        width: "wide",
        rows: 3,
        elements: [
          {
            id: "e_list",
            kind: "list",
            items: ["{brief.offerings[0].name}", "{brief.offerings[1].name}", "{brief.offerings[2].name}", "{brief.offerings[3].name}"],
            marker: "rule",
            weight: "bold",
            size: 2,
            color: "primary",
            desk: { col: 1, span: 6, row: 1, rowSpan: 3, alignY: "start" },
            phone: { order: 0, span: "full" },
          },
          { id: "e_note", kind: "text", paragraphs: ["{copy.lead}"], desk: { col: 8, span: 5, row: 1, alignY: "start" }, phone: { order: 1, span: "full" } },
          { id: "e_hours", kind: "hours", style: "compact", desk: { col: 8, span: 4, row: 2, alignY: "start" }, phone: { order: 2, span: "full" } },
          { id: "e_where", kind: "text", paragraphs: ["{business.address}"], desk: { col: 8, span: 4, row: 3, alignY: "start" }, phone: { order: 3, span: "full" } },
        ],
      },
    },
  ] as unknown as CompositionPreset[];
  const offerings = brief.facts.services.map((s) => ({ name: s.name, description: s.detail }));
  const copy = {
    hero: { headline: "Šopki iz cvetja tega tedna", lead: "Majhna cvetličarna na Glavnem trgu v Novem mestu. Šopke vežemo sproti, iz sezonskega cvetja z vrtnarij v Beli krajini." },
    services: { lead: "Šopek naročite po telefonu dan prej." },
  };
  spec.pages.find((p) => p.kind === "home")!.sections = sectionsFor(presets, sources(spec, { offerings, facts: { people: brief.facts.people } }, copy));
  return { spec, media, accept: [] };
}

async function main(): Promise<void> {
  await mkdir(OUT, { recursive: true });
  const work = path.join(OUT, "site");
  await rm(work, { recursive: true, force: true });
  const report: Record<string, { checks: Record<string, PageChecks>; accepted: string[] }> = {};
  const built: [string, SiteSpec][] = [];
  for (const [id, make] of [["pekarna", pekarna], ["tattoo", tattoo], ["florist", florist]] as const) {
    const { spec, media, accept } = await make();
    const v = validateSite(spec);
    const issues = v.ok ? [] : v.issues.map((i) => `${i.path} ${i.message}`);
    const accepted = issues.filter((i) => accept.some((a) => i.includes(a)));
    const blocking = issues.filter((i) => !accepted.includes(i));
    console.log(`${id}: validateSite ${blocking.length ? `FAILED\n   ${blocking.join("\n   ")}` : "ok"}${accepted.length ? ` (accepted as workarounds: ${accepted.join("; ")})` : ""}`);
    if (blocking.length) continue;
    const out = v.ok ? v.spec : spec;
    await writeFile(path.join(OUT, `${id}.spec.json`), `${JSON.stringify(out, null, 2)}\n`);
    await writeSiteFiles(out, media, path.join(work, id), loadConfig().images.widths);
    built.push([id, out]);
    report[id] = { checks: {}, accepted };
  }
  const server = await serveStatic(work);
  const browser = await chromium.launch();
  try {
    for (const [id, spec] of built) {
      for (const [name, vp] of [
        ["desk", { width: 1280, height: 800 }],
        ["phone", { width: 360, height: 800 }],
      ] as const) {
        const { page, ctx } = await openPage(browser, vp, `${server.url}/${id}/${spec.slug}/index.html`);
        await page.waitForTimeout(300);
        await writeFile(path.join(OUT, `${id}-${name}.png`), await page.screenshot());
        await writeFile(path.join(OUT, `${id}-${name}-full.png`), await page.screenshot({ fullPage: true }));
        report[id]!.checks[name] = await checkPage(page);
        await ctx.close();
      }
      const c = report[id]!.checks;
      console.log(`${id}: axe desk ${c.desk!.axe.length} phone ${c.phone!.axe.length}; hscroll ${c.desk!.horizontalScroll || c.phone!.horizontalScroll}; call buttons per screen ${c.desk!.callButtons.max}/${c.phone!.callButtons.max}; h1 ${c.desk!.h1}${[...c.desk!.axe, ...c.phone!.axe].map((a) => `\n   ${a}`).join("")}`);
    }
  } finally {
    await browser.close();
    await server.close();
  }
  await writeFile(path.join(OUT, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
