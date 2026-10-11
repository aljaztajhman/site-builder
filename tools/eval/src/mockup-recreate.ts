/**
 * pnpm tsx tools/eval/src/mockup-recreate.ts
 *
 * Mockup spike, step 5 (docs/plans/mockup-spike.md): the two best AI homepage mockups recreated in the composition
 * language, the way a director call would write them: one preset per section (props with slot markers, filled from the
 * business, the brief and the section's copy by fillPreset), a palette and a font pair as design tokens, nothing else.
 * No hand-written HTML or CSS; the renderer draws it. Facts reach the page only through slots.
 *
 *  - pekarna-kvas from mockups/gpt-pekarna-1.jpg: the fixture's golden spec, its photos and logo.
 *  - the invented tattoo studio (eval/runs/mockup-spike/tattoo-brief.json) from mockups/gpt-tattoo-2.jpg: the spec is
 *    the frizerstvo-lana golden with the business replaced (there is no tattoo business type), its one picture the
 *    mockup's own artwork cut out of it (no text, people or premises in the cut) as a labelled AI image in the opener.
 *
 * Renders each at 1280 and 360 px in Chromium (first screen and whole page), runs the page checks (axe, horizontal
 * scroll, call buttons per screen, h1), writes eval/runs/mockup-spike/recreate/<id>-{desk,phone}{,-full}.png and
 * report.json. No model call.
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
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
const OUT = path.join(SPIKE, "recreate");

const golden = async (id: string): Promise<SiteSpec> => migrateSpec(JSON.parse(await readFile(path.join(REPO_ROOT, "tools/eval/golden", `${id}.json`), "utf8"))) as SiteSpec;

// ---------- pekarna-kvas (mockup gpt-pekarna-1) ----------

/**
 * White page (the mockup's cream is on the banned list), dark-brown type, a baked-crust brown for the band at the foot.
 * The inverse is light: the jedilnik direction wants the band readable on the inverse, which a dark inverse can't give.
 */
const PEKARNA_COLORS = {
  background: "#ffffff",
  surface: "#eef0f2",
  text: "#2a180c",
  muted: "#5c4636",
  primary: "#8b4a1f",
  onPrimary: "#ffffff",
  accent: "#9a5a1f",
  border: "#e0d0b8",
  inverse: "#fbf4ea",
  onInverse: "#2a180c",
  band: "#8b4a1f",
  onBand: "#fbf4ea",
};

const PEKARNA: CompositionPreset[] = [
  {
    id: "composition/hero/spike-type-left-shelf",
    props: {
      intent: "hero",
      width: "wide",
      rows: 3,
      elements: [
        { id: "e_title", kind: "heading", text: "{copy.headline}", level: 1, size: 5, weight: 650, measure: "l", desk: { col: 1, span: 5, row: 1, alignY: "end" }, phone: { order: 0, span: "full" } },
        { id: "e_lead", kind: "text", paragraphs: ["{copy.lead}"], size: 1, desk: { col: 1, span: 5, row: 2, alignY: "start" }, phone: { order: 1, span: "full" } },
        { id: "e_rule", kind: "decor", drawing: "motif/bakery/wheat-ear-line", color: "accent", fit: "fixed", size: 2, desk: { col: 1, span: 2, row: 3, alignY: "start" }, phone: { order: 2, span: "inset", hidden: true } },
        { id: "e_photo", kind: "image", image: "{images[0]}", ratio: "fill", desk: { col: 6, span: 7, row: 1, rowSpan: 3, bleedX: "end" }, phone: { order: 3, span: "bleed" } },
      ],
    },
  },
  {
    id: "composition/products/spike-list-two-photos",
    props: {
      intent: "products",
      width: "wide",
      rows: 3,
      elements: [
        { id: "e_head", kind: "heading", text: "{copy.headline}", level: 2, size: 4, desk: { col: 1, span: 4, row: 1, alignY: "end" }, phone: { order: 0, span: "full" } },
        {
          id: "e_list",
          kind: "list",
          items: ["{brief.offerings[0].name}", "{brief.offerings[1].name}", "{brief.offerings[2].name}", "{brief.offerings[3].name}", "{brief.offerings[4].name}"],
          marker: "none",
          size: 1,
          desk: { col: 1, span: 4, row: 2, alignY: "start" },
          phone: { order: 1, span: "full" },
        },
        { id: "e_note", kind: "text", paragraphs: ["{copy.lead}"], desk: { col: 1, span: 4, row: 3, alignY: "start" }, phone: { order: 2, span: "full" } },
        { id: "e_hands", kind: "image", image: "{images[1]}", ratio: "fill", desk: { col: 5, span: 3, row: 1, rowSpan: 3 }, phone: { order: 3, span: "bleed" } },
        { id: "e_tray", kind: "image", image: "{images[2]}", ratio: "fill", desk: { col: 8, span: 5, row: 1, rowSpan: 3, bleedX: "end" }, phone: { order: 4, span: "bleed", hidden: true } },
      ],
    },
  },
  {
    id: "composition/contact/spike-facts-band",
    tone: "band",
    props: {
      intent: "contact",
      width: "wide",
      rows: 1,
      background: [{ kind: "field", role: "band" }],
      elements: [
        { id: "e_hours", kind: "hours", style: "compact", desk: { col: 1, span: 4, row: 1, alignY: "center" }, phone: { order: 0, span: "full" } },
        { id: "e_where", kind: "text", paragraphs: ["{business.address}"], desk: { col: 5, span: 3, row: 1, alignY: "center" }, phone: { order: 1, span: "full" } },
        { id: "e_phone", kind: "fact", value: "{business.phone}", label: "Naročila po telefonu", labelAt: "before", treatment: "numeral", size: 3, link: { action: "call" }, desk: { col: 9, span: 4, row: 1, alignY: "center", alignX: "end" }, phone: { order: 2, span: "full" } },
        // No "Pokličite" button here: on phones the action bar is already the one call button per screen (banned: two).
      ],
    },
  },
] as unknown as CompositionPreset[];

// ---------- the tattoo studio (mockup gpt-tattoo-2), invented fixture data ----------

const TATTOO_COLORS = {
  background: "#ffffff",
  surface: "#eef0f2",
  text: "#1c1a17",
  muted: "#4d463e",
  primary: "#a63a24",
  onPrimary: "#ffffff",
  accent: "#bf4b2c",
  border: "#b9604c",
  inverse: "#1c1a17",
  onInverse: "#ebe5dc",
  band: "#1c1a17",
  onBand: "#ebe5dc",
};

const TATTOO: CompositionPreset[] = [
  {
    id: "composition/hero/spike-type-left-art",
    props: {
      intent: "hero",
      width: "wide",
      rows: 2,
      elements: [
        { id: "e_title", kind: "heading", text: "{copy.headline}", level: 1, size: 6, weight: 500, measure: "l", desk: { col: 1, span: 6, row: 1, alignY: "end" }, phone: { order: 0, span: "full" } },
        { id: "e_lead", kind: "text", paragraphs: ["{copy.lead}"], size: 1, desk: { col: 1, span: 5, row: 2, alignY: "start" }, phone: { order: 1, span: "full" } },
        { id: "e_art", kind: "image", image: "{images[0]}", ratio: "3:2", desk: { col: 7, span: 6, row: 1, rowSpan: 2 }, phone: { order: 2, span: "full" } },
      ],
    },
  },
  {
    id: "composition/services/spike-four-across",
    props: {
      intent: "services",
      width: "contained",
      rows: 1,
      surface: { divider: "rule" },
      // Running text spans at least 4 columns (TEXT_SPAN), so the four services are names only, as in the mockup.
      elements: [0, 1, 2, 3].map((i) => ({ id: `e_name${i}`, kind: "heading", text: `{brief.offerings[${i}].name}`, level: 2, size: 2, weight: 500, desk: { col: 1 + i * 3, span: 3, row: 1, alignY: "start", alignX: "center" }, phone: { order: i, span: "half", alignX: "center" } })),
    },
  },
  {
    id: "composition/contact/spike-ruled-row",
    props: {
      intent: "contact",
      width: "contained",
      rows: 1,
      surface: { divider: "rule" },
      elements: [
        { id: "e_hours", kind: "hours", style: "compact", desk: { col: 1, span: 4, row: 1, alignY: "center" }, phone: { order: 0, span: "full" } },
        { id: "e_where", kind: "text", paragraphs: ["{business.address}"], desk: { col: 5, span: 4, row: 1, alignY: "center" }, phone: { order: 1, span: "full" } },
        { id: "e_phone", kind: "fact", value: "{business.phone}", label: "Naročila", labelAt: "before", treatment: "numeral", size: 3, link: { action: "call" }, desk: { col: 9, span: 4, row: 1, alignY: "center", alignX: "end" }, phone: { order: 2, span: "full" } },
        // No "Pokličite" button here: on phones the action bar is already the one call button per screen (banned: two).
      ],
    },
  },
] as unknown as CompositionPreset[];

/** The mockup's artwork (peony, swallow, red sun) cut out of gpt-tattoo-2.jpg: no text, no people, no premises. */
const TATTOO_ART = { file: "mockups/gpt-tattoo-2.jpg", crop: { left: 760, top: 110, width: 690, height: 420 } };

// ---------- building ----------

function sectionsFor(presets: CompositionPreset[], src: (intent: string) => PresetSources): Section[] {
  return presets.map((p) => {
    const intent = (p.props as { intent: string }).intent;
    const r = fillPreset(p, src(intent));
    if (!r.ok) throw new Error(`${p.id}: ${r.reason} ${[...r.missing, ...r.issues].join("; ")}`);
    if (r.dropped.length) console.log(`  ${p.id}: dropped ${r.dropped.map((d) => JSON.stringify(d)).join(", ")}`);
    return presetSection(p, r.props as ComposedProps, `s_${intent}`) as unknown as Section;
  });
}

async function pekarna(): Promise<{ spec: SiteSpec; media: Map<string, Uint8Array> }> {
  const spec = await golden("pekarna-kvas");
  const all = JSON.parse(await readFile(path.join(REPO_ROOT, "packages/inventory/test/fixtures/preset-sources.json"), "utf8")) as Record<string, { brief: PresetSources["brief"]; copy: Record<string, PresetSources["copy"]> }>;
  const f = all["pekarna-kvas"]!;
  spec.slug = "spike-pekarna";
  spec.design = { ...spec.design, direction: "warm-craft", fontPair: "fraunces-source-sans", colors: PEKARNA_COLORS, radius: 4, baseFontSize: 17, scale: 1.28, headingWeight: 650, headingTracking: -0.01, density: "regular", shadow: "none", imagery: "offset-block" };
  delete spec.design.wordmark;
  const src = (intent: string): PresetSources => ({
    business: spec.business,
    images: spec.assets.images.map((i) => ({ id: i.id, origin: i.origin ?? "client" })),
    colors: spec.design.colors,
    brief: f.brief,
    ...(f.copy[intent] ? { copy: f.copy[intent] } : {}),
  });
  spec.pages.find((p) => p.kind === "home")!.sections = sectionsFor(PEKARNA, src);
  const media = await specMedia("pekarna-kvas", spec, loadConfig().images.widths);
  return { spec, media };
}

async function tattoo(): Promise<{ spec: SiteSpec; media: Map<string, Uint8Array> }> {
  const brief = JSON.parse(await readFile(path.join(SPIKE, "tattoo-brief.json"), "utf8")) as {
    description: string;
    facts: { name: string; phone: string; email: string; address: { street: string; postalCode: string; city: string }; hours: { from: string; to: string; open: string; close: string }[]; services: { name: string; detail: string }[]; people: { name: string; role: string }[] };
  };
  const spec = await golden("frizerstvo-lana");
  spec.slug = "spike-tattoo";
  // There is no tattoo business type: the studio sits under "hairdresser", the nearest by-appointment trade (a gap).
  spec.business = {
    ...spec.business,
    name: brief.facts.name,
    phone: brief.facts.phone,
    email: brief.facts.email,
    address: brief.facts.address,
    hours: {
      entries: [
        { from: "mon", to: "mon", closed: true },
        ...brief.facts.hours.map((h) => ({ from: h.from, to: h.to, open: h.open, close: h.close })),
        { from: "sun", to: "sun", closed: true },
      ],
    },
  } as SiteSpec["business"];
  spec.design = { ...spec.design, direction: "editorial", fontPair: "garamond-karla", colors: TATTOO_COLORS, radius: 0, baseFontSize: 18, scale: 1.333, headingWeight: 500, headingTracking: -0.02, density: "airy", shadow: "none", imagery: "framed", wordmark: { style: "plain" } };
  delete spec.assets.logo;
  // The paper tone lifted to white (levels per channel) so the line art sits on the white page; nothing is redrawn.
  const art = await sharp(path.join(SPIKE, TATTOO_ART.file)).extract(TATTOO_ART.crop).linear([1.15, 1.19, 1.27], [0, 0, 0]).jpeg({ quality: 90 }).toBuffer();
  const config = loadConfig();
  const processed = await processPhoto("img_ai_art", new Uint8Array(art), [...config.images.widths], { avif: config.images.avifQuality, webp: config.images.webpQuality });
  spec.assets.images = [{ id: "img_ai_art", src: "uploads/art.jpg", width: processed.width, height: processed.height, alt: "Risba potonike in lastovke pred rdečim soncem", origin: "generated" }];
  const media = new Map<string, Uint8Array>(processed.variants.map((v) => [v.file, v.data]));
  // Only the homepage and the system pages: the hairdresser's own pages are not this business's.
  spec.pages = spec.pages.filter((p) => p.kind !== "standard");
  const offerings = brief.facts.services.map((s) => ({ name: s.name, description: s.detail }));
  const copy: Record<string, PresetSources["copy"]> = { hero: { headline: "Vsak motiv narisan na novo", lead: "Majhen tatu studio v Mariboru. Tetovaže po vaši zgodbi, nič iz kataloga. Samo z naročili." } };
  const src = (intent: string): PresetSources => ({
    business: spec.business,
    images: spec.assets.images.map((i) => ({ id: i.id, origin: i.origin ?? "client" })),
    colors: spec.design.colors,
    brief: { offerings, facts: { people: brief.facts.people } },
    ...(copy[intent] ? { copy: copy[intent] } : {}),
  });
  spec.pages.find((p) => p.kind === "home")!.sections = sectionsFor(TATTOO, src);
  return { spec, media };
}

async function main(): Promise<void> {
  await mkdir(OUT, { recursive: true });
  const work = path.join(OUT, "site");
  await rm(work, { recursive: true, force: true });
  const report: Record<string, { checks: Record<string, PageChecks>; issues: string[] }> = {};
  const built: [string, SiteSpec, Map<string, Uint8Array>][] = [];
  for (const [id, make] of [["pekarna", pekarna], ["tattoo", tattoo]] as const) {
    const { spec, media } = await make();
    const v = validateSite(spec);
    const issues = v.ok ? [] : v.issues.map((i) => `${i.path} ${i.message}`);
    console.log(`${id}: validateSite ${v.ok ? "ok" : `FAILED\n   ${issues.join("\n   ")}`}`);
    if (!v.ok) {
      report[id] = { checks: {}, issues };
      continue;
    }
    await writeFile(path.join(OUT, `${id}.spec.json`), `${JSON.stringify(v.spec, null, 2)}\n`);
    await writeSiteFiles(v.spec, media, path.join(work, id), loadConfig().images.widths);
    built.push([id, v.spec, media]);
    report[id] = { checks: {}, issues };
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
