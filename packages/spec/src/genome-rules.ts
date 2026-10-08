/**
 * The design genome's axes and compatibility rules (docs/plans/variety-engine.md, Step 5; genome.ts says what is stored).
 *
 * - `genomeOf`: a site's genome as its eleven axis values, read from where each one lives in the spec.
 * - `presetGenome`: what a direction (a preset) stores; the 17 → 18 migration writes it, one to one from the direction.
 * - Type systems (`typeSystem`): a font pair with the heading weights, tracking and case the presets give it.
 * - `GENOME_RULES` / `genomeIssues`: which axis values go together (a dark ground excludes some imagery, uppercase only
 *   with heavy grotesks, a trade motif needs a light ground and its template's own type and rhythm, …). Every preset
 *   satisfies them (genome.test.ts). They hold a picked genome (validate.ts); a preset genome keeps the direction's rules.
 * - `enforceGenomeTokens`: the repair for a picked genome's design tokens (enforceDesign calls it), so a design always
 *   leaves the repair inside the rules.
 */
import { luminance } from "./color.ts";
import type { Design, Direction, Imagery } from "./design.ts";
import { DIRECTIONS } from "./directions.ts";
import { acceptedFontPairs } from "./families.ts";
import { FONT_PAIRS } from "./fonts.ts";
import type { Genome, Ground, Rhythm, Shape } from "./genome.ts";
import { siteMotif } from "./motif.ts";
import { OVERLAY_HEROES, type FooterFamily, type HeaderFamily, type Skeleton } from "./skeleton.ts";

type Range = [number, number];
type HeadingCase = Design["headingCase"];

/** A site's look as independent choices (the axes of variety Step 5). */
export interface GenomeView {
  /** The direction (preset) the genome started from: design.direction. */
  preset: string;
  /** Font pair (design.fontPair); its heading case, weight and tracking follow its type system. */
  type: string;
  /** Where the palette came from (design.genome.palette; "preset" without a genome). */
  palette: string;
  /** The page ground, from colors.background; "other" for a background that is none of the three. */
  ground: Ground | "other";
  /** The homepage hero, "type:variant" ("none" without one). */
  hero: string;
  header: HeaderFamily;
  footer: FooterFamily;
  rhythm: Rhythm;
  imagery: Imagery;
  shape: Shape;
  density: Design["density"];
  /** The drawn trade motif ("plate", "wire" …) or "none". */
  motif: string;
}

export const GENOME_AXES = ["type", "palette", "ground", "hero", "header", "footer", "rhythm", "imagery", "shape", "density", "motif"] as const satisfies readonly (keyof GenomeView)[];

/** Radius (px) each shape allows. Pills stay banned: 12 px at most (the schema). */
export const SHAPE_RADIUS: Record<Shape, Range> = { square: [0, 2], soft: [3, 12], cut: [0, 4], arch: [4, 12] };

export function shapeOfRadius(radius: number): "square" | "soft" {
  return radius <= SHAPE_RADIUS.square[1] ? "square" : "soft";
}

/** The ground a page background is: the direction rules' white, tint and dark (design-rules.ts), else "other". */
export function groundOf(background: string): Ground | "other" {
  if (background.toLowerCase() === "#ffffff") return "white";
  const lum = luminance(background);
  if (lum <= 0.05) return "dark";
  if (lum >= 0.6) return "tint";
  return "other";
}

/** What a direction stores as its genome (source "preset"). */
export function presetGenome(design: Pick<Design, "radius">, dir: Direction | undefined): Genome {
  return { source: "preset", palette: "preset", rhythm: dir?.layout.rhythm ?? "alternate", shape: shapeOfRadius(design.radius) };
}

const directionOf = (id: string): Direction | undefined => DIRECTIONS.find((d) => d.id === id);

interface GenomeSite {
  design: Design;
  pages: readonly { kind: string; sections: readonly { type: string; variant: string }[] }[];
  chrome: { header: { variant: "bar" | "split-cta" | "stacked" }; footer: { variant: "columns" | "compact" } };
  business: { subtype?: Parameters<typeof siteMotif>[0]["business"]["subtype"] };
}

/** The site's genome, every axis read from where it lives (genome.ts). Without a genome: its direction's preset. */
export function genomeOf(site: GenomeSite): GenomeView {
  const d = site.design;
  const dir = directionOf(d.direction);
  const g = d.genome ?? presetGenome(d, dir);
  const home = site.pages.find((p) => p.kind === "home") ?? site.pages[0];
  const first = home?.sections[0];
  const m = siteMotif(site);
  return {
    preset: d.direction,
    type: d.fontPair,
    palette: g.palette,
    ground: groundOf(d.colors.background),
    hero: first ? `${first.type}:${first.variant}` : "none",
    header: d.skeleton?.header ?? site.chrome.header.variant,
    footer: d.skeleton?.footer ?? site.chrome.footer.variant,
    rhythm: g.rhythm,
    imagery: d.imagery,
    shape: g.source === "preset" ? shapeOfRadius(d.radius) : g.shape,
    density: d.density,
    motif: m.sub ?? m.motif ?? "none",
  };
}

/**
 * A neighbour's genome from what the neighbour check reads (repo.neighbourLooks: the design and the homepage's first
 * section). Header and footer: the skeleton's, else the direction's defaults (the chrome isn't read); the motif without
 * the subtype.
 */
export function genomeOfLook(design: Design, hero: { type: string; variant: string } | null): GenomeView {
  const dir = directionOf(design.direction);
  return genomeOf({
    design,
    pages: [{ kind: "home", sections: hero ? [hero] : [] }],
    chrome: { header: { variant: dir?.layout.header ?? "bar" }, footer: { variant: dir?.layout.footer ?? "columns" } },
    business: {},
  });
}

/** How many axes two genomes differ on (0 to 11). */
export function genomeDistance(a: GenomeView, b: GenomeView): number {
  return GENOME_AXES.filter((k) => a[k] !== b[k]).length;
}

// ---------- Type systems ----------

/** Heading faces heavy and plain enough for uppercase headings (bold-local, industrial, tablica set them). */
const HEAVY_GROTESKS: readonly string[] = ["Archivo", "Space Grotesk", "Inter Tight", "Bricolage Grotesque"];
/** Uppercase headings need a heavy grotesk heading face at this weight or more. */
export const UPPERCASE_MIN_WEIGHT = 600;

export interface TypeSystem {
  pair: string;
  /** Heading weight range: the presets' that use the pair, within the face's own weights. */
  weight: Range;
  tracking: Range;
  cases: HeadingCase[];
  /** The heading face is a serif. */
  serif: boolean;
}

const typeSystems = new Map<string, TypeSystem | undefined>();

/** The type system of a font pair: the ranges of every preset (direction or template family) that uses it. */
export function typeSystem(pairId: string): TypeSystem | undefined {
  if (!typeSystems.has(pairId)) typeSystems.set(pairId, buildTypeSystem(pairId));
  return typeSystems.get(pairId);
}

function buildTypeSystem(pairId: string): TypeSystem | undefined {
  const pair = FONT_PAIRS.find((p) => p.id === pairId);
  const presets = DIRECTIONS.filter((d) => acceptedFontPairs(d).includes(pairId));
  if (!pair || !presets.length) return undefined;
  const lo = Math.max(pair.heading.weights[0], 400, Math.min(...presets.map((d) => d.ranges.headingWeight[0])));
  const hi = Math.min(pair.heading.weights[1], Math.max(...presets.map((d) => d.ranges.headingWeight[1])));
  const heavy = HEAVY_GROTESKS.includes(pair.heading.family);
  const cases = [...new Set(presets.flatMap((d) => d.ranges.headingCase))].filter((c) => c === "normal" || heavy);
  return {
    pair: pairId,
    weight: [Math.min(lo, hi), hi],
    tracking: [Math.min(...presets.map((d) => d.ranges.headingTracking[0])), Math.max(...presets.map((d) => d.ranges.headingTracking[1]))],
    cases: cases.length ? cases : ["normal"],
    serif: pair.heading.fallback === "serif",
  };
}

/** Uppercase headings: only a heavy grotesk heading face at UPPERCASE_MIN_WEIGHT or more. */
export function uppercaseAllowed(pairId: string, weight: number): boolean {
  const pair = FONT_PAIRS.find((p) => p.id === pairId);
  return !!pair && HEAVY_GROTESKS.includes(pair.heading.family) && weight >= UPPERCASE_MIN_WEIGHT;
}

// ---------- Compatibility rules ----------

/** Imagery a dark page takes: photos plain, framed, monochrome or to the edge (no light-page treatments). */
export const DARK_IMAGERY: readonly Imagery[] = ["natural", "framed", "monochrome", "full-bleed"];
/** Imagery that keeps a cut corner readable (no rounded corners, no offset block behind the photo). */
export const CUT_IMAGERY: readonly Imagery[] = ["natural", "framed", "monochrome", "full-bleed"];
/** Imagery an arched photo top goes with. */
export const ARCH_IMAGERY: readonly Imagery[] = ["natural", "arched"];
/** Imagery with rounded corners of its own: only with a soft or arched shape. */
export const ROUND_IMAGERY: readonly Imagery[] = ["rounded", "duotone", "arched"];

export interface GenomeContext {
  /** The skeleton's button style, when the site has a skeleton (spec v15). */
  buttons?: Skeleton["buttons"];
}

export interface GenomeRule {
  id: string;
  /** The rule in words (English; the editor names the axis). */
  text: string;
  broken: (v: GenomeView, dir: Direction | undefined, ctx: GenomeContext) => boolean;
}

const hasMotif = (v: GenomeView) => v.motif !== "none";

export const GENOME_RULES: readonly GenomeRule[] = [
  { id: "ground", text: "the page is white, a light tint or dark", broken: (v) => v.ground === "other" },
  { id: "type", text: "the font pair is one a preset uses", broken: (v) => typeSystem(v.type) === undefined },
  { id: "template-type", text: "a trade template keeps a font pair of its family", broken: (v, dir) => !!dir?.template && !acceptedFontPairs(dir).includes(v.type) },
  { id: "template-rhythm", text: "a trade template keeps its outline's section rhythm", broken: (v, dir) => !!dir?.template && v.rhythm !== dir.layout.rhythm },
  { id: "motif-ground", text: "a trade motif is drawn on a light page", broken: (v) => hasMotif(v) && v.ground === "dark" },
  {
    id: "motif-imagery",
    text: "a trade motif's photos stay natural or its template's own",
    broken: (v, dir) => hasMotif(v) && v.imagery !== "natural" && v.imagery !== dir?.imagery,
  },
  { id: "motif-shape", text: "a trade motif draws its own shapes: square or soft corners only", broken: (v) => hasMotif(v) && v.shape !== "square" && v.shape !== "soft" },
  { id: "dark-imagery", text: "a dark page takes natural, framed, monochrome or full-bleed photos", broken: (v) => v.ground === "dark" && !DARK_IMAGERY.includes(v.imagery) },
  { id: "cut-imagery", text: "cut corners take natural, framed, monochrome or full-bleed photos", broken: (v) => v.shape === "cut" && !CUT_IMAGERY.includes(v.imagery) },
  { id: "arch-imagery", text: "arched tops take natural or arched photos", broken: (v) => v.shape === "arch" && !ARCH_IMAGERY.includes(v.imagery) },
  { id: "round-imagery", text: "rounded, duotone and arched photos need soft or arched shapes", broken: (v) => ROUND_IMAGERY.includes(v.imagery) && v.shape !== "soft" && v.shape !== "arch" },
  { id: "compact-type", text: "compact density only with a sans-serif heading face", broken: (v) => v.density === "compact" && typeSystem(v.type)?.serif === true },
  { id: "flat-density", text: "a flat rhythm needs air: not compact", broken: (v) => v.rhythm === "flat" && v.density === "compact" },
  { id: "overlay-hero", text: "a header over the photo needs a full-bleed photo hero", broken: (v) => v.header === "overlay" && !OVERLAY_HEROES.includes(v.hero) },
  {
    id: "shape-buttons",
    text: "buttons follow the shape: no soft buttons on square or cut shapes, no square ones on soft or arched shapes",
    broken: (v, _dir, ctx) => (ctx.buttons === "soft" && (v.shape === "square" || v.shape === "cut")) || (ctx.buttons === "square" && (v.shape === "soft" || v.shape === "arch")),
  },
];

export interface GenomeIssue {
  rule: string;
  message: string;
}

/** The rules a genome breaks (empty when every axis value goes with the others). */
export function genomeIssues(v: GenomeView, ctx: GenomeContext = {}): GenomeIssue[] {
  const dir = directionOf(v.preset);
  return GENOME_RULES.filter((r) => r.broken(v, dir, ctx)).map((r) => ({ rule: r.id, message: `genome: ${r.text}` }));
}

/** The genome issues of a site (only a picked genome is held to them; a preset one keeps its direction's rules). */
export function siteGenomeIssues(site: GenomeSite): GenomeIssue[] {
  if (site.design.genome?.source !== "picked") return [];
  return genomeIssues(genomeOf(site), site.design.skeleton ? { buttons: site.design.skeleton.buttons } : {});
}

// ---------- Repair (a picked genome's tokens) ----------

const clamp = (v: number, [lo, hi]: Range) => Math.min(hi, Math.max(lo, v));

/** The ground a picked design is held to: its background's, a light one for a trade motif, the nearer one when "other". */
export function intendedGround(design: Design, dir: Direction): Ground {
  const g = groundOf(design.colors.background);
  const ground: Ground = g === "other" ? (luminance(design.colors.background) > 0.25 ? "white" : "dark") : g;
  return dir.template && ground === "dark" ? "white" : ground;
}

/** A palette of the ground's kind to repair with: the direction's own when it has that ground, else the first that does. */
export function groundFallback(dir: Direction, ground: Ground): Direction["palette"]["fallback"] {
  if (dir.palette.background === ground) return dir.palette.fallback;
  return (DIRECTIONS.find((d) => d.palette.background === ground) ?? dir).palette.fallback;
}

/**
 * A picked genome's design tokens brought inside the rules (the colours are the caller's, enforceDesign): a known font
 * pair (a template keeps its family's), heading weight, tracking and case within its type system, imagery that goes with
 * the ground, shape and motif, a shape that goes with the imagery and motif, the radius within the shape, a density
 * that goes with the type and rhythm, the template's rhythm, and the skeleton's buttons with the shape. Idempotent.
 */
export function enforceGenomeTokens(design: Design, dir: Direction): Design {
  const genome = design.genome!;
  const template = !!dir.template;
  const fontPair = typeSystem(design.fontPair) && (!template || acceptedFontPairs(dir).includes(design.fontPair)) ? design.fontPair : dir.fontPairs[0]!;
  const ts = typeSystem(fontPair)!;
  const headingWeight = clamp(Math.round(clamp(design.headingWeight, ts.weight) / 50) * 50, ts.weight);
  const headingCase: HeadingCase = design.headingCase === "uppercase" && ts.cases.includes("uppercase") && uppercaseAllowed(fontPair, headingWeight) ? "uppercase" : "normal";
  const ground = intendedGround(design, dir);
  const rhythm = template ? dir.layout.rhythm : genome.rhythm;
  let shape: Shape = template && genome.shape !== "square" && genome.shape !== "soft" ? shapeOfRadius(design.radius) : genome.shape;
  const imageryOk = (i: Imagery) =>
    (ground !== "dark" || DARK_IMAGERY.includes(i)) &&
    (shape !== "cut" || CUT_IMAGERY.includes(i)) &&
    (shape !== "arch" || ARCH_IMAGERY.includes(i)) &&
    (!template || i === "natural" || i === dir.imagery);
  const imagery = imageryOk(design.imagery) ? design.imagery : ([dir.imagery, "natural"] as Imagery[]).find(imageryOk) ?? "natural";
  if (ROUND_IMAGERY.includes(imagery) && shape !== "soft" && shape !== "arch") shape = "soft";
  const radius = Math.round(clamp(design.radius, SHAPE_RADIUS[shape]));
  const density = design.density === "compact" && (ts.serif || rhythm === "flat") ? "regular" : design.density;
  const out: Design = {
    ...design,
    direction: dir.id,
    fontPair,
    headingWeight,
    headingTracking: clamp(design.headingTracking, ts.tracking),
    headingCase,
    baseFontSize: Math.round(clamp(design.baseFontSize, [16, 19])),
    scale: clamp(design.scale, [1.125, 1.414]),
    imagery,
    radius,
    density,
    genome: { ...genome, rhythm, shape },
  };
  const sk = design.skeleton;
  if (sk && ((sk.buttons === "soft" && (shape === "square" || shape === "cut")) || (sk.buttons === "square" && (shape === "soft" || shape === "arch")))) {
    out.skeleton = { ...sk, buttons: shape === "square" || shape === "cut" ? "square" : "soft" };
  }
  return out;
}

/**
 * The token issues of a picked genome's design (checkDesign uses these instead of the direction's ranges): the type
 * system's ranges and case, the radius within the shape, and a ground the rules know.
 */
export function genomeTokenIssues(design: Design): { path: string; message: string }[] {
  const issues: { path: string; message: string }[] = [];
  const genome = design.genome!;
  const ts = typeSystem(design.fontPair);
  if (!ts) return [{ path: "/design/fontPair", message: `font pair ${design.fontPair} has no type system` }];
  const inRange = (key: "headingWeight" | "headingTracking", [lo, hi]: Range) => {
    if (design[key] < lo - 1e-9 || design[key] > hi + 1e-9) issues.push({ path: `/design/${key}`, message: `${key} ${design[key]} outside ${lo}..${hi} for ${design.fontPair}` });
  };
  inRange("headingWeight", ts.weight);
  inRange("headingTracking", ts.tracking);
  if (design.headingCase === "uppercase" && !(ts.cases.includes("uppercase") && uppercaseAllowed(design.fontPair, design.headingWeight)))
    issues.push({ path: "/design/headingCase", message: `uppercase headings need a heavy grotesk at ${UPPERCASE_MIN_WEIGHT} or more` });
  const [lo, hi] = SHAPE_RADIUS[genome.shape];
  if (design.radius < lo || design.radius > hi) issues.push({ path: "/design/radius", message: `radius ${design.radius} outside ${lo}..${hi} for the ${genome.shape} shape` });
  if (groundOf(design.colors.background) === "other") issues.push({ path: "/design/colors/background", message: "the page must be white, a light tint or dark" });
  return issues;
}
