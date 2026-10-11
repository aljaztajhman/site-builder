/**
 * The studio's reference homepages (docs/plans/studio-phase1-design.md §5 I10, decision D3): made in the composition
 * language, as v20 site specs our renderer draws, never as free HTML. One folder per reference under
 * tools/eval/references/<id>/:
 *
 * - brief.json: a fixture business (fictional but realistic Slovene small business). `description` is the client's own
 *   words and the only source of facts: checkFacts holds the page to it. `facts` restates them in structure (name,
 *   phone, address …) and must agree with the spec. `photos` borrows a golden fixture's photos (tools/eval/fixtures/<id>/
 *   photos, used in order for the spec's images) or is null for a page without photos.
 * - site.json: a spec v20 site (the homepage at least, plus the three system pages validateSite requires). It may use
 *   any vocabulary name that exists (approved or draft).
 * - meta.json: id, stance (an id of the stance deck), trades, title, the gap note (what the language couldn't say:
 *   it feeds Phase 4) and sources (which hand-made reference or idea it draws on).
 *
 * checkReference() is the harness: schema, validateSite with no issue, checkFacts with no violation, the stance exists and
 * doesn't list the trade under `never`, a gap note, the photos exist. The browser half (360/1280, no horizontal scroll,
 * axe) is test/references.test.ts. Each reference that passes is registered in the inventory as kind `reference`
 * (packages/inventory/src/references.ts; the test keeps the two lists equal).
 *
 * Adding a reference: make the folder with the three files (copy an example); write the description first and take
 * every fact on the page from it; borrow photos only from a golden fixture whose subjects fit (or none); run
 * `pnpm vitest run tools/eval/test/references.test.ts --maxWorkers=1` until it passes (checkReference names each
 * problem); look at `pnpm references:shots --only <id>` at both widths; write the gap note from what you couldn't
 * make; add { id, stance, trades } to STUDIO_REFERENCES in packages/inventory/src/references.ts (the test fails until
 * the two lists match).
 *
 * CLI (no model call, € 0):
 *   pnpm references:shots [--only <id>,<id>]   desk and phone screenshots (first screen and whole page) to
 *                                               eval/runs/references/ (gitignored)
 *   pnpm references:okus [--okus-dir <dir>] [--local-fonts]
 *                                               Okus round 2 (the studio references with today's goldens and the 19
 *                                               hand-made references; okus-round.ts) into eval/runs/references/okus by
 *                                               default; --okus-dir tools/okus writes the round the Okus page publishes.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { chromium } from "playwright";
import { checkFacts, serveStatic } from "@sb/engine";
import { BusinessType, PRACTICAL_FACTS, STANCES, migrateSpec, validateSite, type SiteSpec } from "@sb/spec";
import { writeSiteFiles } from "./kitchen-sink.ts";
import { buildRound, shoot, specMedia } from "./okus-items.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, "../../..");
export const REFERENCES_DIR = path.join(REPO_ROOT, "tools/eval/references");
export const REFERENCE_SHOTS_DIR = path.join(REPO_ROOT, "eval/runs/references");
const FIXTURES_DIR = path.join(REPO_ROOT, "tools/eval/fixtures");

/** A reference id: lower-case kebab case; it is the folder name and the inventory name (reference/<id>). */
export const ReferenceId = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(60);

const Day = z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
const Clock = z.string().regex(/^\d{2}:\d{2}$/);

export const ReferenceBrief = z.strictObject({
  id: ReferenceId,
  /** The business type the site is for (spec BusinessType). */
  businessType: BusinessType,
  town: z.string().min(2),
  /** The client's own words: everything the page may say comes from here. */
  description: z.string().min(200),
  /** A golden fixture whose photos the spec's images use, in order, with their subjects; null: no photos. */
  photos: z.strictObject({ fixture: z.string().regex(/^[a-z0-9-]+$/), subjects: z.array(z.string().min(3)).min(1) }).nullable(),
  facts: z.strictObject({
    name: z.string().min(2),
    phone: z.string().regex(/^\+386\d{8}$/).optional(),
    email: z.string().email().optional(),
    address: z.strictObject({ street: z.string().min(3), postalCode: z.string().regex(/^\d{4}$/), city: z.string().min(2) }).optional(),
    hours: z.array(z.strictObject({ from: Day, to: Day, open: Clock, close: Clock })).optional(),
    prices: z.array(z.strictObject({ item: z.string().min(2), amount: z.number().positive(), from: z.boolean().optional() })).optional(),
    people: z.array(z.strictObject({ name: z.string().min(2), role: z.string().min(2) })).optional(),
    /** Practical facts the client gave (business.amenities may use only these). */
    amenities: z.array(z.enum(PRACTICAL_FACTS)).optional(),
    other: z.array(z.string().min(3)).optional(),
  }),
});
export type ReferenceBrief = z.infer<typeof ReferenceBrief>;

export const ReferenceMeta = z.strictObject({
  id: ReferenceId,
  /** A stance id from the deck (packages/spec/src/studio/stances.ts). */
  stance: z.string().regex(/^[a-z0-9-]+$/),
  trades: z.array(BusinessType).min(1),
  /** A short name for the director and Okus labels (never shown to the owner while rating). */
  title: z.string().min(3).max(60),
  /** What the composition language couldn't say for this page: concrete, so Phase 4 can act on it. */
  gapNote: z.string().trim().min(40).max(1200),
  /** The hand-made references (template letters or REFERENCES ids) or ideas it draws on. */
  sources: z.array(z.string().trim().min(3)).min(1),
});
export type ReferenceMeta = z.infer<typeof ReferenceMeta>;

export interface Reference {
  id: string;
  dir: string;
  brief: ReferenceBrief;
  meta: ReferenceMeta;
  /** The site as stored, migrated to the current spec version (not validated: checkReference does that). */
  spec: SiteSpec;
}

const readJson = (file: string): unknown => JSON.parse(readFileSync(file, "utf8")) as unknown;

/** The reference folders, sorted (every directory under tools/eval/references). */
export function referenceIds(dir: string = REFERENCES_DIR): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

/** Loads one reference; throws with the file and the zod issues when brief.json or meta.json is malformed. */
export function loadReference(id: string, dir: string = REFERENCES_DIR): Reference {
  const folder = path.join(dir, id);
  const parse = <T>(schema: z.ZodType<T>, file: string): T => {
    const r = schema.safeParse(readJson(path.join(folder, file)));
    if (!r.success) throw new Error(`${id}/${file}: ${r.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
    return r.data;
  };
  const brief = parse(ReferenceBrief, "brief.json");
  const meta = parse(ReferenceMeta, "meta.json");
  const spec = migrateSpec(readJson(path.join(folder, "site.json"))) as SiteSpec;
  return { id, dir: folder, brief, meta, spec };
}

export function loadReferences(dir: string = REFERENCES_DIR): Reference[] {
  return referenceIds(dir).map((id) => loadReference(id, dir));
}

/**
 * Everything a reference is held to outside the browser; [] when it passes. Each line names the check and the path.
 */
export function checkReference(ref: Reference): string[] {
  const out: string[] = [];
  const { brief, meta, spec } = ref;
  if (brief.id !== ref.id) out.push(`brief.json id ${brief.id} is not the folder name ${ref.id}`);
  if (meta.id !== ref.id) out.push(`meta.json id ${meta.id} is not the folder name ${ref.id}`);

  // The spec: valid, and no fact the brief doesn't give.
  const v = validateSite(spec);
  if (!v.ok) for (const i of v.issues) out.push(`validateSite ${i.path}: ${i.message}`);
  if (spec.specVersion !== 20) out.push(`site.json is spec v${spec.specVersion}; references are written in spec v20`);
  if (v.ok) for (const f of checkFacts(v.spec, brief.description)) out.push(`checkFacts ${f.kind} ${f.path}: ${f.value}${f.detail ? ` (${f.detail})` : ""}`);

  // The brief's structured facts agree with the spec (and so with the description, through checkFacts).
  const b = spec.business;
  if (b.name !== brief.facts.name) out.push(`business.name "${b.name}" is not brief facts.name "${brief.facts.name}"`);
  if (b.type !== brief.businessType) out.push(`business.type ${b.type} is not brief businessType ${brief.businessType}`);
  if (brief.facts.phone && typeof b.phone === "string" && b.phone !== brief.facts.phone) out.push(`business.phone ${b.phone} is not brief facts.phone`);
  if (brief.facts.address && b.address && "city" in b.address && b.address.city !== brief.facts.address.city) out.push(`business.address.city ${b.address.city} is not brief facts.address.city`);
  if (brief.facts.address && brief.facts.address.city !== brief.town) out.push(`brief town ${brief.town} is not facts.address.city ${brief.facts.address.city}`);
  const amenities = new Set<string>(brief.facts.amenities ?? []);
  for (const a of b.amenities ?? []) if (!amenities.has(a)) out.push(`business.amenities ${a} is not in brief facts.amenities`);

  // Photos: borrowed from a golden fixture, one per spec image.
  const images = spec.assets.images;
  if (brief.photos === null) {
    if (images.length) out.push(`site.json has ${images.length} images but the brief has no photos`);
  } else {
    const photoDir = path.join(FIXTURES_DIR, brief.photos.fixture, "photos");
    const files = existsSync(photoDir) ? readdirSync(photoDir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)) : [];
    if (!files.length) out.push(`photos fixture ${brief.photos.fixture} has no photos`);
    if (images.length > files.length) out.push(`site.json has ${images.length} images; fixture ${brief.photos.fixture} has ${files.length} photos`);
    if (images.length > brief.photos.subjects.length) out.push(`site.json has ${images.length} images; the brief describes ${brief.photos.subjects.length}`);
  }
  if (spec.assets.logo) out.push("site.json has a logo: references are typographic (the wordmark), the fixture logos belong to the goldens");

  // Meta: the stance exists and doesn't refuse the trade; the gap note says something.
  const stance = STANCES.find((s) => s.id === meta.stance);
  if (!stance) out.push(`meta.json stance ${meta.stance} is not in the stance deck`);
  else if ((stance.trades.never as readonly string[]).includes(brief.businessType)) out.push(`stance ${meta.stance} never fits ${brief.businessType}`);
  if (!meta.trades.includes(brief.businessType)) out.push(`meta.json trades ${meta.trades.join(", ")} leave out the brief's ${brief.businessType}`);
  return out;
}

/** The spec with its photos processed (the fixture's photos, as the pipeline would), ready to render. */
export async function referenceSite(ref: Reference): Promise<{ spec: SiteSpec; media: Map<string, Uint8Array> }> {
  const spec = structuredClone(ref.spec);
  const media = ref.brief.photos ? await specMedia(ref.brief.photos.fixture, spec) : new Map<string, Uint8Array>();
  return { spec, media };
}

/** Writes the reference's published files into `dir` and returns the homepage path relative to it. */
export async function writeReferenceSite(ref: Reference, dir: string): Promise<string> {
  const { spec, media } = await referenceSite(ref);
  await writeSiteFiles(spec, media, dir);
  return `${spec.slug}/index.html`;
}

/** pnpm references:shots: first screen and whole page at 1280 and 360 px per reference, as PNG. */
export async function referenceShots(opts: { only?: readonly string[]; outDir?: string; log?: (l: string) => void } = {}): Promise<string[]> {
  const log = opts.log ?? (() => {});
  const outDir = opts.outDir ?? REFERENCE_SHOTS_DIR;
  const refs = loadReferences().filter((r) => !opts.only?.length || opts.only.includes(r.id));
  await mkdir(outDir, { recursive: true });
  const work = await mkdtemp(path.join(tmpdir(), "sb-refs-"));
  const server = await serveStatic(work);
  const browser = await chromium.launch();
  const files: string[] = [];
  try {
    for (const ref of refs) {
      const problems = checkReference(ref);
      if (problems.length) log(`${ref.id}: ${problems.length} problem(s), first: ${problems[0]}`);
      const home = await writeReferenceSite(ref, path.join(work, ref.id));
      await shoot(browser, ref.id, `${server.url}/${ref.id}/${home}`, outDir, null);
      for (const s of ["desk", "deskFull", "phone", "phoneFull"]) files.push(path.join(outDir, `${ref.id}-${s}.png`));
      log(`${ref.id}: ${path.relative(REPO_ROOT, outDir)}/${ref.id}-{desk,deskFull,phone,phoneFull}.png`);
    }
  } finally {
    await browser.close();
    await server.close();
    await rm(work, { recursive: true, force: true });
  }
  return files;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, ...args] = process.argv.slice(2);
  const val = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const only = val("--only")?.split(",").map((s) => s.trim()).filter(Boolean);
  if (cmd === "shots") {
    const files = await referenceShots({ ...(only ? { only } : {}), log: (l) => console.log(l) });
    console.log(`${files.length} screenshots in ${path.relative(REPO_ROOT, REFERENCE_SHOTS_DIR)}`);
  } else if (cmd === "okus") {
    const okusDir = path.resolve(REPO_ROOT, val("--okus-dir") ?? path.join(REFERENCE_SHOTS_DIR, "okus"));
    const started = Date.now();
    const r = await buildRound({ round: 2, okusDir, localFonts: args.includes("--local-fonts"), log: (l) => console.log(l) });
    const count = (k: string) => r.items.filter((i) => i.kind === k).length;
    console.log(`\nRound 2: ${path.relative(REPO_ROOT, r.dir)}`);
    console.log(`  items ${r.items.length} (studio ${count("studio")}, goldens ${count("golden")}, hand-made ${count("reference")}), pairs ${r.pairs.length}`);
    console.log(`  ${(r.bytes / 1024 / 1024).toFixed(2)} MB; whole pages q${r.step.quality} at ${r.step.deskWidth}/${r.step.phoneWidth} px; ${Math.round((Date.now() - started) / 1000)} s`);
  } else {
    console.error("Usage: references.ts shots [--only <id>,<id>] | okus [--okus-dir <dir>] [--local-fonts]");
    process.exit(1);
  }
}
