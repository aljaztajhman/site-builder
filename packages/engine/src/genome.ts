/**
 * The variety engine, Step 5 (docs/plans/variety-engine.md), behind config `variety.genome`: a site's look picked axis by
 * axis instead of taken whole from one direction. No model call: everything is chosen in code from the site's seed, its
 * business and its neighbours, after the content is written, and dresses that content without rewriting it.
 *
 * - genomePools: the values each axis may take for this site. The direction the design step chose is the preset (it
 *   keeps the motif and, for a trade template, its family's type, palettes and heroes, its rhythm and natural photos);
 *   otherwise the values of every preset that fits the trade, so each one is a curated point and the mix is new. A logo
 *   keeps the design step's colours (the business's own material first). Heroes only where the written hero's props fit
 *   the other layout (section intents, spec intents.ts); header and footer are the skeleton's when the site has one
 *   (Step 4 picks them), else the chrome's.
 * - pickGenome: in the seed's order, the first combination inside the compatibility rules (spec genome-rules.ts) that is
 *   at least MIN_GENOME_DISTANCE axes away from every neighbour of the same trade (and from the look it replaces); else
 *   the farthest one.
 * - expressGenome: the genome written into the spec: the design's tokens (enforceDesign holds them to the rules and
 *   contrast), the chrome or skeleton, the homepage hero's layout and the section rhythm. Texts, photos and facts stay.
 * - anotherGenomeLook: "Druga podoba" with the switch on, for every style: the next genome away from the current one.
 */
import {
  DIRECTIONS,
  FAMILIES,
  OVERLAY_HEROES,
  RHYTHMS,
  SHAPES,
  SHAPE_RADIUS,
  acceptedFontPairs,
  asLayout,
  direction as directionById,
  enforceDesign,
  familyOf,
  genomeDistance,
  genomeIssues,
  genomeOf,
  groundOf,
  type Colors,
  type Design,
  type Direction,
  type FooterFamily,
  type GenomeView,
  type HeaderFamily,
  type Imagery,
  type Page,
  type Rhythm,
  type Shape,
  type SiteSpec,
  type Skeleton,
} from "@sb/spec";
import { hash32 } from "./variety.ts";
import { holdRhythm, pickCentred, pickSkeleton } from "./skeleton.ts";

type Section = Page["sections"][number];
type Density = Design["density"];

/** A new genome differs from every neighbour's (and from the look it replaces) on at least this many of the 11 axes. */
export const MIN_GENOME_DISTANCE = 4;
/** Candidates tried in the seed's order before the farthest one is taken. */
const CANDIDATES = 800;

export interface PaletteOption {
  /** "preset" (the design step's colours), a direction id, or "<template>/<palette>". */
  id: string;
  colors: Colors;
}

export interface GenomePools {
  type: string[];
  palette: PaletteOption[];
  hero: string[];
  header: HeaderFamily[];
  footer: FooterFamily[];
  rhythm: Rhythm[];
  imagery: Imagery[];
  shape: Shape[];
  density: Density[];
}

const unique = <T>(xs: readonly T[]): T[] => [...new Set(xs)];
const homeIndex = (spec: Pick<SiteSpec, "pages">) => Math.max(0, spec.pages.findIndex((p) => p.kind === "home"));
const heroKey = (s: { type: string; variant: string } | undefined) => (s ? `${s.type}:${s.variant}` : "none");

/** Directions (not templates) that fit the trade; the trade's templates. */
function tradePresets(type: string): { general: Direction[]; templates: Direction[] } {
  return {
    general: DIRECTIONS.filter((d) => !d.template && d.bestFor.includes(type as never)),
    templates: DIRECTIONS.filter((d) => d.template && d.template.firstFor.includes(type as never)),
  };
}

/** The type-only hero layouts: a general direction's type hero may take either. */
const TYPE_HEROES = ["hero-type:large", "hero-type:with-facts"];

/** What each axis may take for this site (see the module comment). */
export function genomePools(spec: SiteSpec): GenomePools {
  const dir = directionById(spec.design.direction);
  const hero = spec.pages[homeIndex(spec)]?.sections[0];
  const own = heroKey(hero);
  const current: PaletteOption = { id: spec.design.genome?.palette ?? "preset", colors: spec.design.colors };
  const logo = spec.assets.logo !== undefined;
  const skeleton = spec.design.skeleton;
  const header: HeaderFamily[] = skeleton ? [skeleton.header] : ["bar", "split-cta", "stacked"];
  const footer: FooterFamily[] = skeleton ? [skeleton.footer] : ["columns", "compact"];
  const heroes = (list: string[]) => unique([own, ...list]).filter((h) => h === own || (hero !== undefined && asLayout(hero, h) !== null));
  const palettes = (list: PaletteOption[]) => {
    const out = [current];
    if (!logo) for (const p of list) if (!out.some((o) => o.id === p.id)) out.push(p);
    return out;
  };
  const familyPalettes = (t: Direction) => (FAMILIES[t.id]?.palettes ?? []).map((p) => ({ id: `${t.id}/${p.id}`, colors: p.colors }));
  if (dir.template) {
    const family = familyOf(dir);
    return {
      type: acceptedFontPairs(dir),
      palette: palettes(familyPalettes(dir)),
      hero: heroes([...(family?.heroes ?? []), ...dir.layout.heroes]),
      header,
      footer,
      rhythm: [dir.layout.rhythm],
      imagery: unique<Imagery>([dir.imagery, "natural"]),
      shape: ["square", "soft"],
      density: [...dir.ranges.density],
    };
  }
  const { general, templates } = tradePresets(spec.business.type);
  const fit = unique([dir, ...general]);
  return {
    type: unique([...fit.flatMap(acceptedFontPairs), ...templates.flatMap(acceptedFontPairs)]),
    palette: palettes([...fit.map((d) => ({ id: d.id, colors: d.palette.fallback })), ...templates.flatMap(familyPalettes)]),
    // A type-only hero may become the other type-only one (template families no longer list them: HQ it-family-type-heroes).
    hero: heroes([...fit.flatMap((d) => d.layout.heroes), ...templates.flatMap((t) => FAMILIES[t.id]?.heroes ?? []), ...(hero?.type === "hero-type" ? TYPE_HEROES : [])]),
    header,
    footer,
    rhythm: [...RHYTHMS],
    imagery: unique<Imagery>([...fit.map((d) => d.imagery), "natural", "framed"]),
    shape: [...SHAPES],
    density: unique(fit.flatMap((d) => d.ranges.density)),
  };
}

/** The genome a choice of one value per axis gives (the motif is the preset's). */
function viewOf(base: Pick<GenomeView, "preset" | "motif">, c: Omit<GenomeView, "preset" | "ground" | "motif" | "palette"> & { palette: PaletteOption }): GenomeView {
  return {
    preset: base.preset,
    type: c.type,
    palette: c.palette.id,
    ground: groundOf(c.palette.colors.background),
    hero: c.hero,
    header: c.header,
    footer: c.footer,
    rhythm: c.rhythm,
    imagery: c.imagery,
    shape: c.shape,
    density: c.density,
    motif: base.motif,
  };
}

type Axis = "type" | "palette" | "hero" | "header" | "footer" | "rhythm" | "imagery" | "shape" | "density";

/** FNV-1a's low bits follow the input's; a finaliser (MurmurHash3's) spreads them, so small pools vary independently. */
function mix32(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Candidate `k` in the seed's order: each axis's value from its own hash, so the axes vary independently. */
function candidate(base: Pick<GenomeView, "preset" | "motif">, pools: GenomePools, seed: number, k: number): GenomeView {
  const at = <T>(axis: Axis, list: readonly T[]): T => list[mix32(hash32(`${seed}:genome:${k}:${axis}`)) % list.length]!;
  return viewOf(base, {
    type: at("type", pools.type),
    palette: at("palette", pools.palette),
    hero: at("hero", pools.hero),
    header: at("header", pools.header),
    footer: at("footer", pools.footer),
    rhythm: at("rhythm", pools.rhythm),
    imagery: at("imagery", pools.imagery),
    shape: at("shape", pools.shape),
    density: at("density", pools.density),
  });
}

/** Whether a genome goes together (the skeleton's buttons follow the shape when expressed, so they aren't checked here). */
export const genomeFits = (v: GenomeView): boolean => genomeIssues(v).length === 0;

export interface PickGenomeInput {
  seed: number;
  /** Genomes of the same trade's sites (same town first). */
  neighbours: GenomeView[];
  /** Genomes to stay away from too (the current look, for Druga podoba). */
  avoid?: GenomeView[];
  pools?: GenomePools;
}

/** The site's genome: see the module comment. Deterministic for one seed, one spec and one set of neighbours. */
export function pickGenome(spec: SiteSpec, o: PickGenomeInput): GenomeView {
  const pools = o.pools ?? genomePools(spec);
  const taken = [...o.neighbours, ...(o.avoid ?? [])];
  const own = genomeOf(spec);
  let best: { v: GenomeView; d: number } | undefined;
  for (let k = 0; k < CANDIDATES; k++) {
    const v = candidate(own, pools, o.seed, k);
    if (!genomeFits(v)) continue;
    const d = taken.length ? Math.min(...taken.map((n) => genomeDistance(n, v))) : Infinity;
    if (d >= MIN_GENOME_DISTANCE) return v;
    if (!best || d > best.d) best = { v, d };
  }
  return best?.v ?? own;
}

/** A radius the shape allows, the site's own when it already does. */
function radiusFor(radius: number, shape: Shape): number {
  const [lo, hi] = SHAPE_RADIUS[shape];
  if (radius >= lo && radius <= hi) return radius;
  return { square: 0, soft: 6, cut: 2, arch: 8 }[shape];
}

/**
 * The spec dressed in a genome (see the module comment). The result differs from the input only in its design, chrome
 * variants, the homepage hero's layout and section tones; contrast and the rules are enforced (enforceDesign).
 */
export function expressGenome(spec: SiteSpec, v: GenomeView, pools: GenomePools = genomePools(spec)): SiteSpec {
  const dir = directionById(v.preset);
  const palette = pools.palette.find((p) => p.id === v.palette) ?? { id: v.palette, colors: spec.design.colors };
  let skeleton: Skeleton | undefined = spec.design.skeleton;
  // A header over the photo needs a full-bleed photo hero; elsewhere its closest relative, the menu as a word.
  if (skeleton?.header === "overlay" && !OVERLAY_HEROES.includes(v.hero)) skeleton = { ...skeleton, header: "word" };
  const draft: Design = {
    ...spec.design,
    fontPair: v.type,
    colors: { ...palette.colors },
    imagery: v.imagery,
    density: v.density,
    radius: radiusFor(spec.design.radius, v.shape),
    genome: { source: "picked", palette: v.palette, rhythm: v.rhythm, shape: v.shape },
  };
  if (skeleton) draft.skeleton = skeleton;
  const design = enforceDesign(draft, dir);
  const chrome = skeleton
    ? spec.chrome
    : { ...spec.chrome, header: { ...spec.chrome.header, variant: v.header as SiteSpec["chrome"]["header"]["variant"] }, footer: { ...spec.chrome.footer, variant: v.footer as SiteSpec["chrome"]["footer"]["variant"] } };
  const hi = homeIndex(spec);
  const pages = spec.pages.map((p, i) => {
    let sections = p.sections;
    if (i === hi && sections[0]) {
      const hero = asLayout(sections[0], v.hero);
      if (hero && hero !== sections[0]) sections = [hero, ...sections.slice(1)];
    }
    // A template keeps its outline's tones; elsewhere the genome's rhythm is held in code.
    if (!dir.template && (p.kind === "home" || p.kind === "standard")) sections = holdRhythm(sections as Section[], v.rhythm);
    return sections === p.sections ? p : { ...p, sections };
  });
  return { ...spec, design, chrome, pages };
}

export interface AppliedGenome {
  spec: SiteSpec;
  genome: GenomeView;
  /** The closest neighbour's distance (11 when there is none). */
  distance: number;
}

/** The genome step on a generated spec (config variety.genome): picked, then expressed. */
export function applyGenome(spec: SiteSpec, o: { seed: number; neighbours: GenomeView[] }): AppliedGenome {
  const pools = genomePools(spec);
  const v = pickGenome(spec, { seed: o.seed, neighbours: o.neighbours, pools });
  const out = expressGenome(spec, v, pools);
  const genome = genomeOf(out);
  return { spec: out, genome, distance: o.neighbours.length ? Math.min(...o.neighbours.map((n) => genomeDistance(n, genome))) : 11 };
}

/** How many combinations of the pools go together: what this site's look can be. */
export function countGenomes(spec: SiteSpec, pools: GenomePools = genomePools(spec)): number {
  let n = 0;
  const base = genomeOf(spec);
  for (const type of pools.type)
    for (const palette of pools.palette)
      for (const hero of pools.hero)
        for (const header of pools.header)
          for (const footer of pools.footer)
            for (const rhythm of pools.rhythm)
              for (const imagery of pools.imagery)
                for (const shape of pools.shape)
                  for (const density of pools.density) {
                    const v: GenomeView = { ...base, type, palette: palette.id, ground: groundOf(palette.colors.background), hero, header, footer, rhythm, imagery, shape, density };
                    if (genomeFits(v)) n++;
                  }
  return n;
}

export const NO_OTHER_GENOME_MESSAGE = "Druge podobe za to stran ni: vse možne že uporabljajo podobne strani.";

export type AnotherGenomeLook = { ok: true; spec: SiteSpec; genome: GenomeView; distance: number } | { ok: false; reason: "no_other_look"; message: string };

/**
 * "Druga podoba" with config variety.genome: the same texts and photos in the next genome, at least MIN_GENOME_DISTANCE
 * axes from the current one where the pools allow, and away from the neighbours. Each tap moves the seed by the current
 * look, so taps walk on. With `skeleton` (config variety.skeleton), the look gets another skeleton too, as anotherLook.
 */
export function anotherGenomeLook(spec: SiteSpec, o: { seed: number; neighbours: GenomeView[]; skeleton?: { neighbours: Skeleton[] } }): AnotherGenomeLook {
  const current = genomeOf(spec);
  const seed = hash32(`${o.seed}:podoba-genome:${JSON.stringify(current)}`);
  let base = spec;
  if (o.skeleton && spec.design.skeleton) {
    const dir = directionById(spec.design.direction);
    const hi = homeIndex(spec);
    const taken = [...o.skeleton.neighbours, spec.design.skeleton];
    const picked = pickSkeleton({ seed, dir, design: spec.design, hero: spec.pages[hi]?.sections[0], business: spec.business, hasLogo: spec.assets.logo !== undefined, neighbours: taken });
    const centred = pickCentred(spec.pages, { seed, dir });
    base = { ...spec, design: { ...spec.design, skeleton: centred.length ? { ...picked, centred } : picked } };
  }
  const pools = genomePools(base);
  const v = pickGenome(base, { seed, neighbours: o.neighbours, avoid: [current], pools });
  if (genomeDistance(v, current) === 0) return { ok: false, reason: "no_other_look", message: NO_OTHER_GENOME_MESSAGE };
  const out = expressGenome(base, v, pools);
  const genome = genomeOf(out);
  return { ok: true, spec: out, genome, distance: genomeDistance(genome, current) };
}
