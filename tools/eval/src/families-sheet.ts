/**
 * pnpm variety:sheet [<template id>[,<id>]]
 *
 * The template families (packages/spec/src/families.ts) rendered: every template × palette × hero on its trade's
 * fixture (the golden spec's content and the fixture's photos), first screens at 360 and 1280 px, with the page
 * checks the eval uses (no horizontal scroll, banned patterns, one h1, tap targets). Writes
 * eval/look/families-<template>.jpg (one row per palette, one column per hero, phone beside desktop; axe WCAG 2.2 A/AA
 * on each) and
 * eval/look/families-checks.json. No model call. Exits 1 when a check fails.
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { chromium, type Browser } from "playwright";
import { loadConfig } from "@sb/config";
import { measurePage, processLogo, processPhoto, runAxe, serveStatic } from "@sb/engine";
import { siteFiles } from "@sb/render";
import { DIRECTIONS, FAMILIES, enforceDesign, migrateSpec, validateSite, type Direction, type SiteSpec } from "@sb/spec";
import { loadFixtures } from "./fixtures/load.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");

type Section = SiteSpec["pages"][number]["sections"][number];
type HeroProps = { eyebrow?: string; headline: string; intro: string; primary?: unknown; secondary?: unknown; image?: unknown };

const cut = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).replace(/\s+\S*$/, "")}…`);

/** The homepage hero as `hero` ("type:variant"), carrying the same headline, intro, actions and photo. */
export function heroAs(section: Section, hero: string, firstImage: string | null): Section {
  const [type, variant] = hero.split(":") as [string, string];
  const p = section.props as HeroProps;
  const image = p.image ?? firstImage ?? undefined;
  const base = { ...(p.eyebrow ? { eyebrow: p.eyebrow } : {}), ...(p.primary ? { primary: p.primary } : {}), ...(p.secondary ? { secondary: p.secondary } : {}) };
  if (type === "hero-signature") {
    return { id: section.id, type, variant, props: { ...base, headline: cut(p.headline, 60), intro: cut(p.intro, 220), fact: "phone", factLabel: "Pokličite nas", ...(image && variant !== "drawing" && variant !== "receipt" ? { image } : {}) } } as Section;
  }
  if (type === "hero-type") return { id: section.id, type, variant, props: { ...base, headline: cut(p.headline, 90), intro: cut(p.intro, 260) } } as Section;
  return { id: section.id, type, variant, props: { ...base, headline: cut(p.headline, 70), intro: cut(p.intro, type === "hero-image" ? 200 : 220), image } } as Section;
}

export interface FamilyVariant {
  template: string;
  palette: string;
  hero: string;
  spec: SiteSpec;
  fixtureId: string;
}

/** Every palette × hero of one template's family, on its trade's fixture. */
export async function familyVariants(dir: Direction): Promise<FamilyVariant[]> {
  const family = FAMILIES[dir.id]!;
  const fixture = loadFixtures().find((f) => f.brief.businessType === dir.template!.firstFor[0])!;
  const golden = migrateSpec(JSON.parse(await readFile(path.join(repoRoot, "tools/eval/golden", `${fixture.id}.json`), "utf8")));
  const out: FamilyVariant[] = [];
  for (const palette of family.palettes) {
    for (const hero of family.heroes) {
      const spec = structuredClone(golden);
      spec.design = enforceDesign({ ...spec.design, direction: dir.id, fontPair: family.fontPairs[0]!, colors: { ...palette.colors } }, dir);
      const home = spec.pages.find((p) => p.kind === "home")!;
      home.sections[0] = heroAs(home.sections[0]!, hero, spec.assets.images[0]?.id ?? null);
      out.push({ template: dir.id, palette: palette.id, hero, spec, fixtureId: fixture.id });
    }
  }
  return out;
}

/** Processed photos per fixture: every variant of a template shares its fixture's photos (AVIF encoding is slow). */
const processedMedia = new Map<string, Promise<{ media: Map<string, Uint8Array>; assets: SiteSpec["assets"] }>>();

/** The fixture's photos and logo, processed as the pipeline does, keyed by media file; sets their sizes in `spec`. */
export async function fixtureMedia(fixtureId: string, spec: SiteSpec): Promise<Map<string, Uint8Array>> {
  if (!processedMedia.has(fixtureId)) processedMedia.set(fixtureId, processFixtureMedia(fixtureId, structuredClone(spec.assets)));
  const done = await processedMedia.get(fixtureId)!;
  spec.assets = structuredClone(done.assets);
  return done.media;
}

async function processFixtureMedia(fixtureId: string, assets: SiteSpec["assets"]): Promise<{ media: Map<string, Uint8Array>; assets: SiteSpec["assets"] }> {
  const config = loadConfig();
  const fixture = loadFixtures().find((f) => f.id === fixtureId)!;
  const media = new Map<string, Uint8Array>();
  for (const [i, img] of assets.images.entries()) {
    const photo = fixture.photos[i];
    if (!photo) continue;
    const processed = await processPhoto(img.id, new Uint8Array(await readFile(photo.path)), config.images.widths, { avif: config.images.avifQuality, webp: config.images.webpQuality });
    for (const v of processed.variants) media.set(v.file, v.data);
    img.width = processed.width;
    img.height = processed.height;
  }
  if (assets.logo && fixture.logoPath) {
    const logo = await processLogo(new Uint8Array(await readFile(fixture.logoPath)), "image/svg+xml");
    media.set(logo.file, logo.data);
    assets.logo = { ...assets.logo, file: logo.file, width: logo.width, height: logo.height };
  }
  return { media, assets };
}

export interface VariantCheck {
  template: string;
  palette: string;
  hero: string;
  width: number;
  problems: string[];
}

/** Renders a variant and checks its homepage at 360 and 1280 px; returns the first screens and the problems. */
export async function renderVariant(browser: Browser, v: FamilyVariant, media: Map<string, Uint8Array>, dir: string): Promise<{ shots: Buffer[]; checks: VariantCheck[] }> {
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
  const checks: VariantCheck[] = [];
  try {
    for (const w of [{ width: 360, height: 800 }, { width: 1280, height: 800 }]) {
      const ctx = await browser.newContext({ viewport: w, deviceScaleFactor: 1, reducedMotion: "reduce" });
      const page = await ctx.newPage();
      await page.goto(`${server.url}/${v.spec.slug}/index.html`, { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      shots.push(await page.screenshot());
      const t = config.checks.tapTarget;
      const m = await measurePage(page, { primaryMin: t.primaryMin, primaryGap: t.primaryGap, absoluteMin: t.absoluteMin });
      const h1 = await page.evaluate(() => document.querySelectorAll("h1").length);
      const found = [...problems];
      // The same axe rules the generation's checks run (WCAG 2.2 A/AA): a palette that makes text unreadable fails here.
      for (const a of await runAxe(page)) found.push(`axe ${a.id} (${a.nodes}): ${a.targets.slice(0, 2).join(", ")}`);
      if (m.horizontalScroll) found.push(`horizontal scroll (${m.scrollWidth} px)`);
      for (const b of m.banned) found.push(`banned: ${b}`);
      for (const s of m.smallPrimaryTargets) found.push(`tap target below ${t.primaryMin} px: ${s}`);
      if (h1 !== 1) found.push(`${h1} h1 elements`);
      checks.push({ template: v.template, palette: v.palette, hero: v.hero, width: w.width, problems: found });
      await ctx.close();
    }
  } finally {
    await server.close();
  }
  return { shots, checks };
}

async function sheet(rows: { label: string; cells: { label: string; phone: Buffer; desktop: Buffer }[] }[]): Promise<Buffer> {
  const phoneW = 180;
  const deskW = 512;
  const cellW = phoneW + 8 + deskW;
  const cellH = 400 + 30;
  const left = 150;
  const width = left + rows[0]!.cells.length * (cellW + 24);
  const height = rows.length * (cellH + 24) + 10;
  const composites: { input: Buffer; top: number; left: number }[] = [];
  const text = (t: string, w: number, size = 16) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="26"><text x="2" y="19" font-family="sans-serif" font-size="${size}" font-weight="700" fill="#1a1a1a">${t.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</text></svg>`);
  for (const [r, row] of rows.entries()) {
    const top = 10 + r * (cellH + 24);
    composites.push({ input: text(row.label, left - 10), top: top + 30, left: 6 });
    for (const [c, cell] of row.cells.entries()) {
      const x = left + c * (cellW + 24);
      composites.push({ input: text(cell.label, cellW, 14), top, left: x });
      composites.push({ input: await sharp(cell.phone).resize(phoneW, 400, { fit: "cover", position: "top" }).png().toBuffer(), top: top + 30, left: x });
      composites.push({ input: await sharp(cell.desktop).resize(deskW, 320, { fit: "cover", position: "top" }).png().toBuffer(), top: top + 30, left: x + phoneW + 8 });
    }
  }
  return sharp({ create: { width, height, channels: 3, background: "#e9e9e9" } }).composite(composites).jpeg({ quality: 76 }).toBuffer();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const only = process.argv[2]?.split(",");
  const dirs = DIRECTIONS.filter((d) => d.template && FAMILIES[d.id] && (!only || only.includes(d.id)));
  const lookDir = path.join(repoRoot, "eval/look");
  await mkdir(lookDir, { recursive: true });
  const browser = await chromium.launch();
  const all: VariantCheck[] = [];
  try {
    for (const dir of dirs) {
      const variants = await familyVariants(dir);
      const rows = new Map<string, { label: string; cells: { label: string; phone: Buffer; desktop: Buffer }[] }>();
      for (const v of variants) {
        const media = await fixtureMedia(v.fixtureId, v.spec);
        const r = await renderVariant(browser, v, media, path.join(repoRoot, "eval/runs/families", dir.id, `${v.palette}-${v.hero.replace(":", "-")}`));
        all.push(...r.checks);
        const row = rows.get(v.palette) ?? { label: v.palette, cells: [] };
        row.cells.push({ label: v.hero, phone: r.shots[0]!, desktop: r.shots[1]! });
        rows.set(v.palette, row);
        const bad = r.checks.filter((c) => c.problems.length);
        console.log(`${dir.id} ${v.palette} ${v.hero}: ${bad.length ? bad.map((c) => `${c.width} px: ${c.problems.join("; ")}`).join(" | ") : "ok"}`);
      }
      await writeFile(path.join(lookDir, `families-${dir.id}.jpg`), await sheet([...rows.values()]));
    }
  } finally {
    await browser.close();
  }
  await writeFile(path.join(lookDir, "families-checks.json"), JSON.stringify(all, null, 1));
  const failing = all.filter((c) => c.problems.length);
  console.log(`\n${all.length} renders, ${failing.length} with problems. Sheets in eval/look/families-*.jpg.`);
  process.exit(failing.length ? 1 : 0);
}
