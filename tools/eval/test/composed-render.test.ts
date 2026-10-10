import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser } from "playwright";
import { loadConfig } from "@sb/config";
import { measurePage, runAxe, serveStatic } from "@sb/engine";
import { siteFiles } from "@sb/render";
import { ComposedProps, migrateSpec, type Section, type SiteSpec } from "@sb/spec";
import { fixtureMedia } from "../src/families-sheet.ts";

/**
 * Composed sections (spec v19) in a browser: two pages of composed sections that use every element kind, mask, fact
 * treatment, price and hours style, surface texture and divider, at 360 and 1280 px. Per page and width: axe WCAG 2.2
 * A/AA, no horizontal scroll, 44 px primary targets, body text at 16 px or more, no banned pattern, exactly one h1.
 * Screenshots (full page) go to eval/runs/composed-render/ (gitignored): look at them. No model call.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const shots = path.join(repoRoot, "eval/runs/composed-render");
const config = loadConfig();

let browser: Browser;
let dir: string;
beforeAll(async () => {
  browser = await chromium.launch();
  dir = await mkdtemp(path.join(tmpdir(), "sb-composed-"));
  await mkdir(shots, { recursive: true });
}, 60_000);
afterAll(async () => {
  await browser?.close();
  await rm(dir, { recursive: true, force: true });
});

const d = (col: number, span: number, row: number, more: object = {}) => ({ col, span, row, ...more });
const full = (order: number, more: object = {}) => ({ order, span: "full", ...more });
const section = (id: string, props: object, tone?: string): Section => ({ id, type: "composed", variant: "free", ...(tone ? { tone } : {}), props: ComposedProps.parse(props) }) as Section;

/** The photos of the avtoservis golden: 1600x1200 (workshop), 1200x1600 (a mechanic at an engine), 1600x1200. */
const [WIDE, TALL, WIDE2] = ["img_01", "img_02", "img_03"];

function homeSections(): Section[] {
  return [
    // The opener of the spec's own sample: a plate for the phone beside a photo with a cut corner, a mark over its corner.
    section("s_open", {
      intent: "hero",
      width: "wide",
      minHeight: "l",
      rows: 4,
      surface: { texture: "grain" },
      elements: [
        { id: "e_title", kind: "heading", text: "Servis vseh znamk v Kranju", level: 1, size: 7, weight: 800, measure: "m", desk: d(1, 7, 1), phone: full(0) },
        { id: "e_lead", kind: "text", paragraphs: ["Menjava olja, zavore, diagnostika. Naročite se in pripeljite vozilo."], size: 1, desk: d(1, 6, 2), phone: full(1) },
        { id: "e_plate", kind: "fact", value: "041 555 730", label: "Pokličite za termin", treatment: "plate", size: 5, desk: d(1, 6, 3), phone: full(2) },
        { id: "e_call", kind: "action", action: "call", label: "Pokliči", style: "primary", desk: d(1, 3, 4, { alignY: "start" }), phone: full(3) },
        { id: "e_photo", kind: "image", image: TALL, ratio: "4:5", mask: "cut", desk: d(8, 5, 1, { rowSpan: 4, layer: 1 }), phone: full(4) },
        { id: "e_mark", kind: "decor", motif: "plate", desk: d(10, 3, 4, { layer: 2, shiftY: 1 }), phone: { order: 5, span: "half", hidden: true } },
      ],
    }),
    // A list ruled like a price board beside a heading; a drawing of its own in roles.
    section(
      "s_work",
      {
        intent: "services",
        width: "contained",
        rows: 2,
        surface: { divider: "rule" },
        elements: [
          { id: "e_h", kind: "heading", text: "Kaj delamo", level: 2, size: 4, desk: d(1, 5, 1), phone: full(0) },
          { id: "e_t", kind: "text", paragraphs: ["Vozila vseh znamk, od rednega servisa do popravil po nesreči. Za večja dela se dogovorimo za termin."], desk: d(1, 5, 2), phone: full(1) },
          { id: "e_l", kind: "list", items: ["Redni servis in menjava olja", "Zavore in podvozje", "Diagnostika motorja", "Priprava na tehnični pregled", "Menjava pnevmatik"], marker: "rule", desk: d(7, 6, 1, { rowSpan: 2 }), phone: full(2) },
          { id: "e_d", kind: "decor", svg: { width: 120, height: 24, paths: [{ d: "M0 12h40l8-8 16 16 8-8h48", fill: "none", stroke: "accent", width: 4 }] }, desk: d(1, 3, 2, { alignY: "end" }), phone: { order: 3, span: "inset" } },
        ],
      },
      "alt",
    ),
    // A round photo and a heading with facts as a seal and a stamp.
    section("s_story", {
      intent: "story",
      width: "contained",
      rows: 2,
      elements: [
        { id: "e_img", kind: "image", image: WIDE, ratio: "1:1", mask: "circle", treatment: "tint", desk: d(1, 4, 1, { rowSpan: 2, alignY: "center" }), phone: { order: 1, span: "inset" } },
        { id: "e_h", kind: "heading", text: "Delavnica, ki jo poznate", level: 2, size: 5, case: "normal", desk: d(6, 7, 1), phone: full(0) },
        { id: "e_seal", kind: "fact", value: "07.00", label: "Odpiramo ob", treatment: "seal", size: 4, desk: d(6, 3, 2), phone: { order: 2, span: "half" } },
        { id: "e_stamp", kind: "fact", value: "3 dni", label: "Običajen rok za servis", treatment: "stamp", size: 3, desk: d(9, 4, 2), phone: { order: 3, span: "half" } },
      ],
    }),
    // Text over a photo: the heading and the paragraph sit on their backing panels.
    section("s_over", {
      intent: "highlights",
      width: "full",
      minHeight: "m",
      rows: 3,
      elements: [
        { id: "e_photo", kind: "image", image: WIDE2, ratio: "fill", treatment: "duotone", desk: d(1, 12, 1, { rowSpan: 3 }), phone: full(2) },
        { id: "e_h", kind: "heading", text: "Vaš avto je pri nas v pravih rokah", level: 2, size: 5, desk: d(2, 6, 2, { layer: 2 }), phone: full(0) },
        { id: "e_t", kind: "text", paragraphs: ["Vsako delo najprej ocenimo in vam povemo, kaj je treba narediti."], desk: d(2, 5, 3, { layer: 2, alignY: "start" }), phone: full(1) },
      ],
    }),
    // Prices as plates, the week's hours, tickets and tags; on the inverse ground.
    section(
      "s_prices",
      {
        intent: "prices",
        width: "contained",
        rows: 3,
        surface: { divider: "motif" },
        elements: [
          { id: "e_h", kind: "heading", text: "Cenik", level: 2, size: 4, desk: d(1, 6, 1), phone: full(0) },
          { id: "e_p", kind: "prices", style: "plates", items: [{ name: "Menjava olja", note: "z oljnim filtrom", price: { amount: 59 } }, { name: "Pregled pred tehničnim", price: { amount: 35, from: true } }, { name: "Diagnostika", price: { onRequest: true } }], desk: d(1, 12, 2), phone: full(1) },
          { id: "e_t", kind: "fact", value: "od 35 €", label: "Pregled pred tehničnim", treatment: "ticket", size: 3, desk: d(1, 4, 3), phone: { order: 2, span: "half" } },
          { id: "e_g", kind: "fact", value: "7.00", label: "Prvi termin", treatment: "tag", size: 3, desk: d(5, 4, 3), phone: { order: 3, span: "half" } },
        ],
      },
      "inverse",
    ),
  ];
}

function servicesSections(): Section[] {
  return [
    section("s_head", {
      intent: "page-head",
      width: "contained",
      rows: 2,
      elements: [
        { id: "e_h", kind: "heading", text: "Storitve in cenik", level: 1, size: 6, case: "uppercase", weight: 800, desk: d(1, 9, 1), phone: full(0) },
        { id: "e_side", kind: "heading", text: "Delovni čas", level: 2, size: 1, rotate: "-90", desk: d(12, 1, 1, { rowSpan: 2 }), phone: { order: 1, span: "full" } },
        { id: "e_t", kind: "text", paragraphs: ["Cene so okvirne, končno ceno povemo po pregledu vozila."], size: 1, desk: d(1, 7, 2), phone: full(2) },
      ],
    }),
    section(
      "s_rows",
      {
        intent: "prices",
        width: "contained",
        rows: 2,
        elements: [
          { id: "e_rows", kind: "prices", style: "rows", items: [{ name: "Menjava olja", price: { amount: 59 } }, { name: "Menjava zavornih ploščic", note: "spredaj ali zadaj", price: { amount: 89, from: true } }, { name: "Menjava pnevmatik", price: { amount: 30, unit: "na kolo" } }, { name: "Popravilo po nesreči", price: { onRequest: true } }], desk: d(1, 7, 1), phone: full(1) },
          { id: "e_tags", kind: "prices", style: "tags", items: [{ name: "Brisalci", price: { amount: 12 } }, { name: "Žarnica", price: { amount: 8 } }], desk: d(8, 5, 1), phone: full(2) },
          { id: "e_h", kind: "heading", text: "Najpogostejša dela", level: 2, size: 3, desk: d(1, 7, 2), phone: full(0) },
        ],
      },
      "alt",
    ),
    section("s_where", {
      intent: "contact",
      width: "contained",
      rows: 3,
      elements: [
        { id: "e_h", kind: "heading", text: "Obiščite nas", level: 2, size: 4, desk: d(1, 6, 1), phone: full(0) },
        { id: "e_hours", kind: "hours", style: "week", desk: d(1, 6, 2), phone: full(1) },
        { id: "e_contact", kind: "contact", show: ["phone", "email", "address", "map"], desk: d(8, 5, 2), phone: full(2) },
        { id: "e_img", kind: "image", image: WIDE, ratio: "3:2", mask: "stamp", treatment: "grain", desk: d(8, 5, 3), phone: { order: 4, span: "inset", alignX: "end" } },
        { id: "e_dir", kind: "action", action: "directions", label: "Navodila za pot", style: "secondary", desk: d(1, 3, 3, { alignY: "start" }), phone: full(3) },
        { id: "e_ticket", kind: "image", image: TALL, ratio: "3:4", mask: "ticket", desk: d(5, 2, 3), phone: { order: 5, span: "half", hidden: true } },
        { id: "e_arch", kind: "image", image: WIDE2, ratio: "4:5", mask: "arch", desk: d(3, 2, 3), phone: { order: 6, span: "half", hidden: true } },
      ],
    }),
    section(
      "s_compact",
      {
        intent: "hours",
        width: "wide",
        rows: 1,
        elements: [
          { id: "e_c", kind: "hours", style: "compact", desk: d(1, 4, 1), phone: full(0) },
          { id: "e_n", kind: "fact", value: "7.00", label: "Odpremo ob", treatment: "numeral", size: 8, desk: d(6, 7, 1), phone: full(1) },
        ],
      },
      "band",
    ),
  ];
}

async function pageSpec(): Promise<{ spec: SiteSpec; media: Map<string, Uint8Array> }> {
  const spec = migrateSpec(JSON.parse(await readFile(path.join(here, "../golden/avtoservis-mrak.json"), "utf8"))) as SiteSpec;
  spec.pages.find((p) => p.kind === "home")!.sections = homeSections();
  spec.pages.find((p) => p.id === "p_storitve")!.sections = servicesSections();
  const media = await fixtureMedia("avtoservis-mrak", spec);
  return { spec, media };
}

describe("composed sections at 360 and 1280 px", () => {
  it("two pages with every kind of element pass the page checks and are photographed", async () => {
    const { spec, media } = await pageSpec();
    const out = path.join(dir, "site");
    for (const [rel, data] of siteFiles(spec, media, { imageWidths: config.images.widths })) {
      await mkdir(path.dirname(path.join(out, rel)), { recursive: true });
      await writeFile(path.join(out, rel), data);
    }
    const server = await serveStatic(out);
    const problems: string[] = [];
    try {
      for (const file of ["index.html", "storitve.html"]) {
        for (const w of [360, 1280]) {
          const phone = w < 768;
          const ctx = await browser.newContext({ viewport: { width: w, height: 800 }, deviceScaleFactor: 1, reducedMotion: "reduce", ...(phone ? { isMobile: true, hasTouch: true } : {}) });
          const page = await ctx.newPage();
          await page.goto(`${server.url}/${spec.slug}/${file}`, { waitUntil: "networkidle" });
          await page.evaluate(() => document.fonts.ready);
          const t = config.checks.tapTarget;
          const m = await measurePage(page, { primaryMin: t.primaryMin, primaryGap: t.primaryGap, absoluteMin: t.absoluteMin });
          const where = `${file} at ${w} px`;
          const h1 = await page.evaluate(() => document.querySelectorAll("h1").length);
          if (h1 !== 1) problems.push(`${where}: ${h1} h1 elements`);
          for (const a of await runAxe(page)) problems.push(`${where}: axe ${a.id} (${a.nodes}): ${a.targets.slice(0, 3).join(", ")}`);
          if (m.horizontalScroll) problems.push(`${where}: horizontal scroll (${m.scrollWidth} px)`);
          for (const s of m.smallPrimaryTargets) problems.push(`${where}: tap target below ${t.primaryMin} px: ${s}`);
          for (const s of m.tinyTargets) problems.push(`${where}: target below ${t.absoluteMin} px: ${s}`);
          for (const s of m.smallText) problems.push(`${where}: body text below 16 px: ${s}`);
          for (const b of m.banned) problems.push(`${where}: banned: ${b}`);
          // The composed sections are there, with their grid, and phones show no hidden element.
          const composed = await page.evaluate(() => ({ sections: document.querySelectorAll("main > .s-composed").length, grids: document.querySelectorAll(".cx").length, hidden: [...document.querySelectorAll(".cx-nophone")].filter((e) => getComputedStyle(e).display !== "none").length }));
          if (composed.sections !== composed.grids || composed.sections < 4) problems.push(`${where}: ${composed.sections} composed sections, ${composed.grids} grids`);
          if (phone && composed.hidden) problems.push(`${where}: ${composed.hidden} elements hidden on phones are shown`);
          if (!phone && (await page.evaluate(() => [...document.querySelectorAll(".cx-nophone")].some((e) => getComputedStyle(e).display === "none")))) problems.push(`${where}: an element hidden on phones is hidden on desktop`);
          // Nothing clipped: a plate or object whose text is wider than its box (they hide their overflow).
          const clipped = await page.evaluate(() => [...document.querySelectorAll(".cx .plate, .cx .cx-fact__obj, .cx .cx-tag, .cx .cx-el")].filter((e) => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX !== "visible").map((e) => `${e.className} ${e.textContent?.slice(0, 20)}`));
          if (clipped.length) problems.push(`${where}: clipped: ${clipped.join("; ")}`);
          // Phones: nothing is rotated, shifted or on top of another element's text.
          if (phone) {
            const odd = await page.evaluate(() => [...document.querySelectorAll(".cx-el")].filter((e) => { const cs = getComputedStyle(e); return (cs.translate !== "none" && cs.translate !== "0px 0px") || (cs.rotate !== "none" && cs.rotate !== "0deg") || cs.writingMode !== "horizontal-tb"; }).map((e) => e.className));
            if (odd.length) problems.push(`${where}: rotated or shifted on a phone: ${odd.join("; ")}`);
          }
          await page.screenshot({ path: path.join(shots, `${file.replace(".html", "")}-${w}.png`), fullPage: true });
          await ctx.close();
        }
      }
    } finally {
      await server.close();
    }
    expect(problems).toEqual([]);
  }, 300_000);
});
