/**
 * pnpm motifs:sheet
 *
 * The sub-trade motifs (variety engine Step 3, spec v15 business.subtype) rendered on their template's layout: wire,
 * joint, tiles and strip on Cevi (the installer fixture's facts and copy in Cevi's homepage outline), stem and tag on
 * Etiketa (the shop fixture's golden), with plumbing and the deli beside them as the template's own motif. Each page at
 * 360 and 1280 px with the checks the eval uses (a valid spec, no horizontal scroll, banned patterns, axe WCAG 2.2
 * A/AA, one h1, primary tap targets). Writes eval/look/motifs.jpg (one row per motif, the top of the page on a phone
 * and on a desktop) and eval/look/motifs-checks.json. No model call. Exits 1 when a check fails.
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { chromium, type Browser } from "playwright";
import { loadConfig } from "@sb/config";
import { measurePage, runAxe, serveStatic } from "@sb/engine";
import { siteFiles } from "@sb/render";
import { FAMILIES, direction, enforceDesign, migrateSpec, siteMotif, validateSite, type BusinessSubtype, type SiteSpec } from "@sb/spec";
import { fixtureMedia, heroAs } from "./families-sheet.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");

type Section = SiteSpec["pages"][number]["sections"][number];

export interface MotifVariant {
  /** The motif drawn ("pipes", "wire", …). */
  motif: string;
  subtype: BusinessSubtype;
  spec: SiteSpec;
  fixtureId: string;
}

async function golden(id: string): Promise<SiteSpec> {
  return migrateSpec(JSON.parse(await readFile(path.join(repoRoot, "tools/eval/golden", `${id}.json`), "utf8")));
}

/** The installer's golden in Cevi's homepage outline (Cevi has no golden of its own): drawing hero, rows, band statement, steps, places, the call. */
export async function ceviSite(): Promise<SiteSpec> {
  const spec = await golden("instalacije-rebernik");
  const dir = direction("cevi");
  spec.design = enforceDesign({ ...spec.design, direction: "cevi", fontPair: FAMILIES.cevi!.fontPairs[0]!, colors: { ...FAMILIES.cevi!.palettes[0]!.colors }, imagery: dir.imagery }, dir);
  const home = spec.pages.find((p) => p.kind === "home")!;
  const by = (type: string) => home.sections.find((s) => s.type === type)!;
  const as = (s: Section, variant: string, tone?: string): Section => ({ ...s, variant, ...(tone ? { tone } : {}) }) as Section;
  const { tone: _drop, ...area } = by("service-area") as Section & { tone?: string };
  home.sections = [
    heroAs(by("hero-type"), "hero-signature:drawing", null),
    as(by("services-list"), "rows"),
    as(by("text"), "narrow", "band"),
    as(by("steps"), "horizontal", "alt"),
    as(area as Section, "list"),
    { id: "s_klic", type: "contact", variant: "call-out", tone: "inverse", props: { title: "Pokličite za brezplačen ogled" } } as Section,
  ];
  return spec;
}

/** Every sub-trade motif and its template's own, on the template's fixture. */
export async function motifVariants(): Promise<MotifVariant[]> {
  const cevi = await ceviSite();
  const shop = await golden("trgovina-oljka-in-sol");
  const out: MotifVariant[] = [];
  const add = (base: SiteSpec, subtype: BusinessSubtype, fixtureId: string) => {
    const spec = structuredClone(base);
    spec.business.subtype = subtype;
    const m = siteMotif(spec);
    out.push({ motif: m.sub ?? m.motif!, subtype, spec, fixtureId });
  };
  for (const s of ["plumbing", "electrical", "carpentry", "roofing", "painting"] as const) add(cevi, s, "instalacije-rebernik");
  for (const s of ["deli", "florist", "boutique"] as const) add(shop, s, "trgovina-oljka-in-sol");
  return out;
}

export interface MotifCheck {
  motif: string;
  width: number;
  problems: string[];
}

/** Renders a variant and checks its homepage at 360 and 1280 px; returns the top of the page at each width and the problems. */
export async function renderMotif(browser: Browser, v: MotifVariant, media: Map<string, Uint8Array>, dir: string): Promise<{ shots: Buffer[]; checks: MotifCheck[] }> {
  const config = loadConfig();
  const valid = validateSite(v.spec);
  const problems = valid.ok ? [] : valid.issues.map((i) => `invalid: ${i.path} ${i.message}`);
  await rm(dir, { recursive: true, force: true });
  for (const [rel, data] of siteFiles(v.spec, media, { imageWidths: config.images.widths })) {
    const file = path.join(dir, rel);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, data);
  }
  const server = await serveStatic(dir);
  const shots: Buffer[] = [];
  const checks: MotifCheck[] = [];
  try {
    for (const w of [{ width: 360, height: 800 }, { width: 1280, height: 800 }]) {
      const ctx = await browser.newContext({ viewport: w, deviceScaleFactor: 1, reducedMotion: "reduce" });
      const page = await ctx.newPage();
      await page.goto(`${server.url}/${v.spec.slug}/index.html`, { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      // The fixed phone bar would cover the page's middle in a full-page shot.
      await page.addStyleTag({ content: ".action-bar{display:none!important}" });
      shots.push(await page.screenshot({ fullPage: true }));
      await page.reload({ waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      const t = config.checks.tapTarget;
      const m = await measurePage(page, { primaryMin: t.primaryMin, primaryGap: t.primaryGap, absoluteMin: t.absoluteMin });
      const h1 = await page.evaluate(() => document.querySelectorAll("h1").length);
      const sub = await page.evaluate(() => document.body.dataset.submotif ?? null);
      const found = [...problems];
      for (const a of await runAxe(page)) found.push(`axe ${a.id} (${a.nodes}): ${a.targets.slice(0, 2).join(", ")}`);
      if (m.horizontalScroll) found.push(`horizontal scroll (${m.scrollWidth} px)`);
      for (const b of m.banned) found.push(`banned: ${b}`);
      for (const s of m.smallPrimaryTargets) found.push(`tap target below ${t.primaryMin} px: ${s}`);
      if (h1 !== 1) found.push(`${h1} h1 elements`);
      const want = siteMotif(v.spec).sub ?? null;
      if (sub !== want) found.push(`data-submotif ${sub}, expected ${want}`);
      checks.push({ motif: v.motif, width: w.width, problems: found });
      await ctx.close();
    }
  } finally {
    await server.close();
  }
  return { shots, checks };
}

async function sheet(rows: { label: string; phone: Buffer; desktop: Buffer }[]): Promise<Buffer> {
  const phoneW = 300;
  const phoneH = 1300;
  const deskW = 900;
  const deskH = 1300;
  const left = 130;
  const rowH = Math.max(phoneH, deskH) + 20;
  const width = left + phoneW + 16 + deskW + 10;
  const composites: { input: Buffer; top: number; left: number }[] = [];
  const text = (t: string) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${left - 10}" height="30"><text x="4" y="22" font-family="sans-serif" font-size="20" font-weight="700" fill="#1a1a1a">${t}</text></svg>`);
  for (const [i, r] of rows.entries()) {
    const top = 10 + i * rowH;
    composites.push({ input: text(r.label), top: top + 10, left: 4 });
    composites.push({ input: await sharp(r.phone).resize(phoneW, null).extract({ left: 0, top: 0, width: phoneW, height: Math.min(phoneH, (await sharp(r.phone).resize(phoneW, null).toBuffer({ resolveWithObject: true })).info.height) }).png().toBuffer(), top, left });
    const d = await sharp(r.desktop).resize(deskW, null).toBuffer({ resolveWithObject: true });
    composites.push({ input: await sharp(d.data).extract({ left: 0, top: 0, width: deskW, height: Math.min(deskH, d.info.height) }).png().toBuffer(), top, left: left + phoneW + 16 });
  }
  return sharp({ create: { width, height: rows.length * rowH + 20, channels: 3, background: "#e9e9e9" } }).composite(composites).jpeg({ quality: 74 }).toBuffer();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const lookDir = path.join(repoRoot, "eval/look");
  await mkdir(lookDir, { recursive: true });
  const browser = await chromium.launch();
  const all: MotifCheck[] = [];
  const rows: { label: string; phone: Buffer; desktop: Buffer }[] = [];
  try {
    for (const v of await motifVariants()) {
      const media = await fixtureMedia(v.fixtureId, v.spec);
      const r = await renderMotif(browser, v, media, path.join(repoRoot, "eval/runs/motifs", v.motif));
      all.push(...r.checks);
      rows.push({ label: v.motif, phone: r.shots[0]!, desktop: r.shots[1]! });
      const bad = r.checks.filter((c) => c.problems.length);
      console.log(`${v.motif} (${v.subtype}): ${bad.length ? bad.map((c) => `${c.width} px: ${c.problems.join("; ")}`).join(" | ") : "ok"}`);
    }
  } finally {
    await browser.close();
  }
  await writeFile(path.join(lookDir, "motifs.jpg"), await sheet(rows));
  await writeFile(path.join(lookDir, "motifs-checks.json"), JSON.stringify(all, null, 1));
  const failing = all.filter((c) => c.problems.length);
  console.log(`\n${all.length} renders, ${failing.length} with problems. Sheet in eval/look/motifs.jpg.`);
  process.exit(failing.length ? 1 : 0);
}
