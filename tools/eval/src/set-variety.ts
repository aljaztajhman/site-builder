/**
 * pnpm variety <name>=<source> [<name>=<source> ...] [--json <file>]   (or one bare <source>)
 *
 * Free variety numbers for a set of site specs (no model call, no network): how many distinct directions, font pairs,
 * hero variants and primary colours the set uses, and the mean and smallest pairwise look distance, from the engine's
 * own look functions (packages/engine/src/studio/look.ts, weights from config studio.uniqueness: genome axes,
 * composition signature, palette in Lab, perceptual hash of the first screens, stance). The perceptual hash needs
 * first-screen pictures: a manifest entry's `desk` and `phone`, or `<id>-desk.png` / `<id>-phone.png` /
 * `<id>-1280-first.png` / `<id>-360-first.png` beside the spec; a page without them is compared by its spec alone, and
 * the report says how many pages had pictures.
 *
 * A source is a manifest JSON (`["a.spec.json", ...]` or `[{ "id", "spec", "desk"?, "phone"?, "trade"? }]`, paths relative
 * to the manifest), a glob (`eval/runs/studio-poc-direct/*.spec.json`), a directory (its `*.spec.json`, else `*.json`),
 * or a comma-separated list of those. Prints each set's markdown line and the JSON; `--json <file>` writes the JSON.
 */
import { existsSync, globSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { z } from "zod";
import { loadConfig, type AppConfig } from "@sb/config";
import { lookDistance, lookPrintOf, phash, type LookPrint } from "@sb/engine";
import { migrateSpec, type SiteSpec } from "@sb/spec";
import { lookFeatures } from "./look-distance.ts";

export interface VarietyEntry {
  id: string;
  spec: string;
  trade?: string;
  desk?: string;
  phone?: string;
}

const ManifestEntry = z.union([
  z.string().min(1),
  z.strictObject({ id: z.string().min(1).optional(), spec: z.string().min(1), trade: z.string().optional(), desk: z.string().optional(), phone: z.string().optional() }),
]);
const Manifest = z.union([z.array(ManifestEntry), z.strictObject({ pages: z.array(ManifestEntry) })]);

/** `<dir>/<id>.spec.json` → `<id>`; studio-poc's `<id>.today.spec.json` (today's site) → `<id>` too; any other `.json` → its name. */
const idOf = (file: string) => path.basename(file).replace(/\.spec\.json$/i, "").replace(/\.json$/i, "").replace(/\.today$/i, "");

/** The first-screen pictures lying beside a spec file: studio-poc's names (`<id>-today-desk.png` for today's) or an eval run's. */
function siblingShots(specFile: string): { desk?: string; phone?: string } {
  const dir = path.dirname(specFile);
  const id = idOf(specFile);
  const stem = /\.today\.(spec\.)?json$/i.test(specFile) ? `${id}-today` : id;
  const find = (...names: string[]) => names.map((n) => path.join(dir, n)).find((f) => existsSync(f));
  const desk = find(`${stem}-desk.png`, `${stem}-1280-first.png`, path.join(id, "home-1280-first.png"));
  const phone = find(`${stem}-phone.png`, `${stem}-360-first.png`, path.join(id, "home-360-first.png"));
  return { ...(desk ? { desk } : {}), ...(phone ? { phone } : {}) };
}

function entriesOfManifest(file: string): VarietyEntry[] {
  const parsed = Manifest.parse(JSON.parse(readFileSync(file, "utf8")));
  const list = Array.isArray(parsed) ? parsed : parsed.pages;
  const at = (p: string) => path.resolve(path.dirname(file), p);
  return list.map((e) => {
    const spec = at(typeof e === "string" ? e : e.spec);
    if (!existsSync(spec)) throw new Error(`${file}: ${spec} not found`);
    const given: { id?: string | undefined; trade?: string | undefined; desk?: string | undefined; phone?: string | undefined } = typeof e === "string" ? {} : e;
    const shots = siblingShots(spec);
    const desk = given.desk ? at(given.desk) : shots.desk;
    const phone = given.phone ? at(given.phone) : shots.phone;
    return { id: given.id ?? idOf(spec), spec, ...(given.trade ? { trade: given.trade } : {}), ...(desk ? { desk } : {}), ...(phone ? { phone } : {}) };
  });
}

/** The specs a source names (manifest, glob, directory, or a comma-separated list); ids must be unique. */
export function loadVarietyEntries(source: string, cwd = process.cwd()): VarietyEntry[] {
  const out: VarietyEntry[] = [];
  for (const raw of source.split(",").map((s) => s.trim()).filter(Boolean)) {
    const p = path.resolve(cwd, raw);
    if (/[*?[\]{}]/.test(raw)) {
      const files = globSync(raw, { cwd }).map((f) => path.resolve(cwd, f)).sort();
      for (const spec of files) out.push({ id: idOf(spec), spec, ...siblingShots(spec) });
    } else if (!existsSync(p)) {
      throw new Error(`${p} not found`);
    } else if (statSync(p).isDirectory()) {
      const names = readdirSync(p).sort();
      const specs = names.filter((n) => /\.spec\.json$/i.test(n));
      for (const n of specs.length ? specs : names.filter((n) => /\.json$/i.test(n))) out.push({ id: idOf(n), spec: path.join(p, n), ...siblingShots(path.join(p, n)) });
    } else if (/\.spec\.json$/i.test(p)) {
      out.push({ id: idOf(p), spec: p, ...siblingShots(p) });
    } else {
      out.push(...entriesOfManifest(p));
    }
  }
  const dup = out.map((e) => e.id).filter((id, i, all) => all.indexOf(id) !== i);
  if (dup.length) throw new Error(`page(s) given twice: ${[...new Set(dup)].join(", ")}`);
  if (!out.length) throw new Error(`No spec in ${source}: expected a manifest JSON, a glob or a directory of *.spec.json`);
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

const counts = (xs: string[]): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const x of xs) out[x] = (out[x] ?? 0) + 1;
  return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
};

export interface VarietyReport {
  pages: number;
  directions: { distinct: number; counts: Record<string, number> };
  fontPairs: { distinct: number; counts: Record<string, number> };
  /** The first section's `type:variant`. */
  heroes: { distinct: number; counts: Record<string, number> };
  primaryColours: { distinct: number; counts: Record<string, number> };
  distance: {
    pairs: number;
    /** null: fewer than two pages. */
    mean: number | null;
    min: number | null;
    closest: { a: string; b: string; distance: number } | null;
    /** Pages whose first-screen pictures went into the hash (at 360 and 1280 px), and how many pairs had it. */
    withPictures: number;
    pairsWithPhash: number;
  };
}

/** One page's look print: the spec, and the perceptual hash of its first screens when the pictures are there. */
export async function loadPrint(e: VarietyEntry): Promise<{ id: string; spec: SiteSpec; print: LookPrint; pictures: boolean }> {
  const spec = migrateSpec(JSON.parse(readFileSync(e.spec, "utf8"))) as SiteSpec;
  const hash = async (f?: string) => (f && existsSync(f) ? phash(new Uint8Array(readFileSync(f))) : null);
  const [phash1280, phash360] = [await hash(e.desk), await hash(e.phone)];
  const address = spec.business.address;
  const town = address && "city" in address ? address.city : null;
  const print = lookPrintOf(spec, { trade: e.trade ?? spec.business.type, town, phash1280, phash360 });
  return { id: e.id, spec, print, pictures: phash1280 !== null || phash360 !== null };
}

export function varietyOf(pages: { id: string; spec: SiteSpec; print: LookPrint; pictures: boolean }[], weights: AppConfig["studio"]["uniqueness"]["weights"]): VarietyReport {
  const feats = pages.map((p) => lookFeatures(p.spec));
  const group = (xs: string[]) => ({ distinct: new Set(xs).size, counts: counts(xs) });
  const ds: { a: string; b: string; distance: number; phash: boolean }[] = [];
  for (let i = 0; i < pages.length; i++) {
    for (let j = i + 1; j < pages.length; j++) {
      const d = lookDistance(pages[i]!.print, pages[j]!.print, weights);
      ds.push({ a: pages[i]!.id, b: pages[j]!.id, distance: d.total, phash: d.parts.phash !== null });
    }
  }
  const closest = ds.length ? ds.reduce((m, x) => (x.distance < m.distance ? x : m)) : null;
  return {
    pages: pages.length,
    directions: group(feats.map((f) => f.direction)),
    fontPairs: group(feats.map((f) => f.fontPair)),
    heroes: group(feats.map((f) => `${f.hero.type}:${f.hero.variant}`)),
    primaryColours: group(feats.map((f) => f.palette.primary.toLowerCase())),
    distance: {
      pairs: ds.length,
      mean: ds.length ? ds.reduce((s, x) => s + x.distance, 0) / ds.length : null,
      min: closest ? closest.distance : null,
      closest: closest ? { a: closest.a, b: closest.b, distance: closest.distance } : null,
      withPictures: pages.filter((p) => p.pictures).length,
      pairsWithPhash: ds.filter((x) => x.phash).length,
    },
  };
}

const n2 = (x: number | null) => (x === null ? "n/a" : x.toFixed(2));

/** One line per set: `**name** (10 pages): 8 directions, 9 font pairs, 6 heroes, 10 primary colours; look distance mean 0.52, min 0.31 (a / b); first screens on 10 of 10 pages.` */
export function markdownLine(name: string, r: VarietyReport): string {
  const d = r.distance;
  const shots = d.withPictures ? `first-screen hashes on ${d.withPictures} of ${r.pages} pages (${d.pairsWithPhash} of ${d.pairs} pairs)` : "no first-screen pictures: spec parts only (no perceptual hash)";
  return `**${name}** (${r.pages} pages): ${r.directions.distinct} directions, ${r.fontPairs.distinct} font pairs, ${r.heroes.distinct} hero variants, ${r.primaryColours.distinct} primary colours; look distance mean ${n2(d.mean)}, closest ${n2(d.min)}${d.closest ? ` (${d.closest.a} / ${d.closest.b})` : ""}; ${shots}.`;
}

export async function main(argv: string[], print: (line: string) => void = console.log): Promise<number> {
  let v;
  try {
    v = parseArgs({ args: argv, allowPositionals: true, options: { json: { type: "string" } } });
  } catch (e) {
    print(`${e instanceof Error ? e.message : String(e)}\nUsage: pnpm variety <name>=<manifest.json|glob|dir|a,b> [...] [--json <file>]`);
    return 2;
  }
  if (!v.positionals.length) {
    print("Usage: pnpm variety <name>=<manifest.json|glob|dir|a,b> [...] [--json <file>]");
    return 2;
  }
  const weights = loadConfig().studio.uniqueness.weights;
  const result: Record<string, VarietyReport> = {};
  try {
    for (const arg of v.positionals) {
      const eq = arg.indexOf("=");
      const [name, source] = eq > 0 && !/[\\/*]/.test(arg.slice(0, eq)) ? [arg.slice(0, eq), arg.slice(eq + 1)] : [path.basename(arg).replace(/[*?]/g, "") || "set", arg];
      const pages = await Promise.all(loadVarietyEntries(source).map(loadPrint));
      result[name] = varietyOf(pages, weights);
      print(markdownLine(name, result[name]));
    }
  } catch (e) {
    print(e instanceof Error ? e.message : String(e));
    return 1;
  }
  const json = `${JSON.stringify(result, null, 2)}\n`;
  if (v.values.json) writeFileSync(path.resolve(v.values.json), json);
  else print(json);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
