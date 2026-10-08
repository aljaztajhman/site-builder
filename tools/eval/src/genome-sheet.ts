/**
 * pnpm variety:genome [<golden>[,<golden>]]
 *
 * The design genome (spec v18, docs/plans/variety-engine.md Step 5; engine genome.ts) on five goldens: three on general
 * directions, where every axis but the motif is free (a call-first car repair shop without a logo, a dark builder without
 * photos, a bakery with a logo and a photo hero), and two trade templates (the farm's trail, the dentist's smile). Per
 * golden a few looks chosen so that every value of every axis the golden can take shows at least once, plus, on the
 * general goldens, every imagery treatment and shape and a third of the font pairs each (so all of them render).
 * Every other look also has a skeleton (Step 4). Each look at 360 and 1280 px with the page checks the eval uses (a valid
 * spec, no horizontal scroll, banned patterns, axe WCAG 2.2 A/AA, one h1, 44 px targets with 8 px spacing, call and
 * directions in one tap on the phone, and with a skeleton one call button per screen). Writes eval/look/genome-<golden>.jpg
 * and eval/look/genome-checks.json. No model call. Exits 1 when a check fails.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Browser } from "playwright";
import { chromium } from "playwright";
import { applySkeleton, expressGenome, genomeFits, genomePools, hash32, type GenomePools } from "@sb/engine";
import { DIRECTIONS, FONT_PAIRS, GENOME_AXES, Imagery, SHAPES, direction, genomeOf, groundOf, migrateSpec, type GenomeView, type SiteSpec, type Skeleton } from "@sb/spec";
import { fixtureMedia } from "./families-sheet.ts";
import { renderSkeleton, sheet, type SkeletonCheck } from "./skeleton-sheet.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");

export const GENOME_GOLDENS = ["avtoservis-mrak", "instalacije-rebernik", "pekarna-kvas", "kmetija-grabnar", "zobozdravstvo-lebar"] as const;
const GENERAL: readonly string[] = ["avtoservis-mrak", "instalacije-rebernik", "pekarna-kvas"];

export interface GenomeLook {
  site: string;
  label: string;
  genome: GenomeView;
  spec: SiteSpec;
}

/** The values the sheet shows for a golden: its pools, and on the general goldens every imagery and shape and a third of the font pairs. */
export function sheetPools(spec: SiteSpec, site: string): GenomePools {
  const pools = genomePools(spec);
  const g = GENERAL.indexOf(site);
  if (g < 0) return pools;
  // Every ground: the tinted pages (clinical-calm, alpine-nature) are no car repair or builder preset's; shown there too
  // (not with a logo: the logo keeps its colours).
  const tints = spec.assets.logo ? [] : DIRECTIONS.filter((d) => d.palette.background === "tint" && !pools.palette.some((p) => p.id === d.id)).map((d) => ({ id: d.id, colors: d.palette.fallback }));
  return {
    ...pools,
    palette: [...pools.palette, ...tints],
    type: [...new Set([...pools.type, ...FONT_PAIRS.filter((_, i) => i % GENERAL.length === g).map((p) => p.id)])],
    imagery: [...Imagery.options],
    shape: [...SHAPES],
  };
}

type Axis = "type" | "palette" | "hero" | "header" | "footer" | "rhythm" | "imagery" | "shape" | "density";
const AXES: Axis[] = ["type", "palette", "hero", "header", "footer", "rhythm", "imagery", "shape", "density"];

/** MurmurHash3's finaliser: FNV-1a's low bits follow the input's, this spreads them. */
function spread(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** One value per axis from the pools, by a hash of the seed, the candidate and the axis. */
function candidate(spec: SiteSpec, pools: GenomePools, seed: number, k: number): GenomeView {
  const own = genomeOf(spec);
  const at = <T>(axis: Axis, list: readonly T[]): T => list[spread(hash32(`${seed}:${k}:${axis}`)) % list.length]!;
  const palette = at("palette", pools.palette);
  return {
    ...own,
    type: at("type", pools.type),
    palette: palette.id,
    ground: groundOf(palette.colors.background),
    hero: at("hero", pools.hero),
    header: at("header", pools.header),
    footer: at("footer", pools.footer),
    rhythm: at("rhythm", pools.rhythm),
    imagery: at("imagery", pools.imagery),
    shape: at("shape", pools.shape),
    density: at("density", pools.density),
  };
}

const valueOf = (v: GenomeView, a: Axis) => String(v[a]);
const poolValues = (pools: GenomePools, a: Axis): string[] => (a === "palette" ? pools.palette.map((p) => p.id) : (pools[a] as readonly string[]).map(String));

/**
 * Looks that together show every value of every axis (a greedy cover over valid combinations in a fixed order). Values
 * no valid combination can take (a rule excludes them on this golden) are left out and listed.
 */
export function coverLooks(spec: SiteSpec, pools: GenomePools, seed = 1): { looks: GenomeView[]; unreachable: string[] } {
  const want = new Set(AXES.flatMap((a) => poolValues(pools, a).map((v) => `${a}=${v}`)));
  const valid: GenomeView[] = [];
  for (let k = 0; k < 6000 && valid.length < 1500; k++) {
    const v = candidate(spec, pools, seed, k);
    if (genomeFits(v)) valid.push(v);
  }
  const reachable = new Set(valid.flatMap((v) => AXES.map((a) => `${a}=${valueOf(v, a)}`)));
  const unreachable = [...want].filter((w) => !reachable.has(w));
  for (const u of unreachable) want.delete(u);
  const looks: GenomeView[] = [];
  while (want.size) {
    let best: GenomeView | undefined;
    let gain = 0;
    for (const v of valid) {
      const g = AXES.filter((a) => want.has(`${a}=${valueOf(v, a)}`)).length;
      if (g > gain) {
        gain = g;
        best = v;
      }
    }
    if (!best) break;
    looks.push(best);
    for (const a of AXES) want.delete(`${a}=${valueOf(best, a)}`);
  }
  return { looks, unreachable };
}

const short = (v: GenomeView, sk?: Skeleton) =>
  `${v.type} · ${v.palette} (${v.ground}) · ${v.hero} · ${sk ? `skeleton ${sk.header}/${sk.footer}/${sk.buttons}` : `${v.header}/${v.footer}`} · ${v.rhythm} · ${v.imagery} · ${v.shape} · ${v.density}`;

/** Every look of the sheet (or of the goldens named). */
export async function genomeLooks(only?: string[]): Promise<GenomeLook[]> {
  const out: GenomeLook[] = [];
  for (const site of GENOME_GOLDENS) {
    if (only && !only.includes(site)) continue;
    const base = migrateSpec(JSON.parse(await readFile(path.join(repoRoot, "tools/eval/golden", `${site}.json`), "utf8")));
    const pools = sheetPools(base, site);
    const { looks } = coverLooks(base, pools);
    for (const [i, v] of looks.entries()) {
      let spec = structuredClone(base);
      // Every other look with a skeleton (Step 4): its header and footer then are the skeleton's.
      if (i % 2 === 1) spec = applySkeleton(spec, { seed: hash32(`${site}:${i}`), dir: direction(spec.design.direction), neighbours: [] }).spec;
      const view = spec.design.skeleton ? { ...v, header: spec.design.skeleton.header, footer: spec.design.skeleton.footer } : v;
      const dressed = expressGenome(spec, view, { ...pools, header: [view.header], footer: [view.footer] });
      out.push({ site, label: short(genomeOf(dressed), dressed.design.skeleton), genome: genomeOf(dressed), spec: dressed });
    }
  }
  return out;
}

/** Renders a look and checks its homepage at 360 and 1280 px (renderSkeleton's checks; one call button per screen only with a skeleton). */
export async function renderGenome(browser: Browser, look: GenomeLook, media: Map<string, Uint8Array>, dir: string): Promise<{ shots: Buffer[]; checks: SkeletonCheck[] }> {
  const skeleton = look.spec.design.skeleton;
  const r = await renderSkeleton(browser, { site: look.site, label: look.label, skeleton: skeleton ?? ({} as Skeleton), spec: look.spec, fixtureId: look.site }, media, dir);
  // Without a skeleton the one-call-button rule isn't enforced (docs/PRODUCT.md: sites with a skeleton): today's frame.
  if (!skeleton) for (const c of r.checks) c.problems = c.problems.filter((p) => !/call buttons on one screen/.test(p));
  return r;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const only = process.argv[2]?.split(",");
  const lookDir = path.join(repoRoot, "eval/look");
  await mkdir(lookDir, { recursive: true });
  const browser = await chromium.launch();
  const all: SkeletonCheck[] = [];
  try {
    const looks = await genomeLooks(only);
    const bySite = new Map<string, { label: string; shots: Buffer[] }[]>();
    for (const [n, look] of looks.entries()) {
      const media = await fixtureMedia(look.site, look.spec);
      const r = await renderGenome(browser, look, media, path.join(repoRoot, "eval/runs/genome", `${look.site}-${n}`));
      all.push(...r.checks);
      const rows = bySite.get(look.site) ?? [];
      rows.push({ label: look.label, shots: r.shots.slice(0, 4) });
      bySite.set(look.site, rows);
      const bad = r.checks.filter((c) => c.problems.length);
      console.log(`${look.site} ${look.label}: ${bad.length ? bad.map((c) => `${c.width} px: ${c.problems.join("; ")}`).join(" | ") : "ok"}`);
    }
    for (const [site, rows] of bySite) await writeFile(path.join(lookDir, `genome-${site}.jpg`), await sheet(rows));
  } finally {
    await browser.close();
  }
  await writeFile(path.join(lookDir, "genome-checks.json"), JSON.stringify(all, null, 1));
  const failing = all.filter((c) => c.problems.length);
  console.log(`\n${all.length} renders, ${failing.length} with problems. Axes: ${GENOME_AXES.join(", ")}. Sheets in eval/look/genome-*.jpg.`);
  process.exit(failing.length ? 1 : 0);
}
