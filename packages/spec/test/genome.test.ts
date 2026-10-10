import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DIRECTIONS,
  FONT_PAIRS,
  GENOME_AXES,
  GENOME_RULES,
  type Genome,
  SECTION_DEFS,
  SECTION_INTENT,
  SHAPES,
  SiteSpec,
  asLayout,
  checkDesign,
  enforceDesign,
  genomeIssues,
  genomeOf,
  groundOf,
  layoutsFor,
  migrateSpec,
  presetGenome,
  shapeOfRadius,
  typeSystem,
  uppercaseAllowed,
  validateSite,
  type Design,
  type GenomeView,
} from "../src/index.ts";

/** The design genome (docs/plans/variety-engine.md, Step 5; spec v18). */
const read = (id: string) => migrateSpec(JSON.parse(readFileSync(new URL(`../../../tools/eval/golden/${id}.json`, import.meta.url), "utf8")));
const GOLDENS = ["avtoservis-mrak", "fizioterapija-pregib", "frizerstvo-lana", "gostilna-zlata-zlica", "instalacije-rebernik", "kmetija-grabnar", "pekarna-kvas", "racunovodstvo-seliskar", "trgovina-oljka-in-sol", "zobozdravstvo-lebar"];

/** A direction's preset as a design at one corner of its ranges (lo: the low end of every range, else the high end). */
function presetDesign(id: string, lo: boolean): Design {
  const d = DIRECTIONS.find((x) => x.id === id)!;
  const r = d.ranges;
  const end = (x: [number, number]) => (lo ? x[0] : x[1]);
  return {
    direction: d.id,
    fontPair: d.fontPairs[0]!,
    colors: d.palette.fallback,
    radius: end(r.radius),
    baseFontSize: end(r.baseFontSize),
    scale: end(r.scale),
    headingWeight: end(r.headingWeight),
    headingTracking: end(r.headingTracking),
    headingCase: lo ? r.headingCase[0]! : r.headingCase[r.headingCase.length - 1]!,
    density: lo ? r.density[0]! : r.density[r.density.length - 1]!,
    shadow: r.shadow[0]!,
    imagery: d.imagery,
  };
}

/** A picked genome on a golden: its design with the axes and tokens set, nothing else changed. */
function picked(id: string, change: Partial<Design>, genome: Partial<Genome> = {}): SiteSpec {
  const spec = read(id);
  spec.design = { ...spec.design, ...change, genome: { source: "picked", palette: "preset", rhythm: spec.design.genome!.rhythm, shape: spec.design.genome!.shape, ...genome } };
  return spec;
}

describe("genome schema and migration 17 → 18", () => {
  it("every golden migrates to its direction's preset genome, one to one, and stays valid", () => {
    for (const id of GOLDENS) {
      const golden = JSON.parse(readFileSync(new URL(`../../../tools/eval/golden/${id}.json`, import.meta.url), "utf8")) as SiteSpec;
      const v17 = { ...golden, specVersion: 17, design: { ...golden.design } } as Record<string, unknown> & { design: Record<string, unknown> };
      delete v17.design.genome;
      const v18 = migrateSpec(v17);
      const dir = DIRECTIONS.find((d) => d.id === golden.design.direction)!;
      expect(v18.specVersion, id).toBeGreaterThanOrEqual(18);
      expect(v18.design.genome, id).toEqual({ source: "preset", palette: "preset", rhythm: dir.layout.rhythm, shape: shapeOfRadius(golden.design.radius) });
      // Nothing else changes, and the stored golden is that migration's result.
      expect({ ...v18, design: { ...v18.design, genome: undefined } }, id).toEqual({ ...golden, design: { ...golden.design, genome: undefined } });
      expect(v18, id).toEqual(golden);
      expect(validateSite(v18).issues, id).toEqual([]);
      // The genome's axes read from where they live: the preset is the direction.
      const g = genomeOf(v18);
      expect([g.preset, g.type, g.imagery, g.density, g.rhythm], id).toEqual([dir.id, golden.design.fontPair, golden.design.imagery, golden.design.density, dir.layout.rhythm]);
      expect(g.motif, id).toBe(dir.template?.motif ?? "none");
    }
  });

  it("keeps a genome a spec already has, and the schema takes only known axis values", () => {
    const spec = read("pekarna-kvas");
    const own = { source: "picked" as const, palette: "warm-craft", rhythm: "flat" as const, shape: "cut" as const };
    expect(migrateSpec({ ...spec, specVersion: 17, design: { ...spec.design, genome: own } }).design.genome).toEqual(own);
    for (const bad of [{ ...own, shape: "pill" }, { ...own, rhythm: "zigzag" }, { ...own, source: "model" }, { ...own, palette: "Warm Craft" }, { ...own, extra: 1 }]) {
      expect(SiteSpec.safeParse({ ...spec, design: { ...spec.design, genome: bad } }).success, JSON.stringify(bad)).toBe(false);
    }
    expect(SiteSpec.safeParse({ ...spec, design: { ...spec.design, genome: own } }).success).toBe(true);
  });
});

describe("compatibility rules", () => {
  it("every preset satisfies them at both ends of its ranges (directions and templates are points of the space)", () => {
    for (const d of DIRECTIONS) {
      for (const lo of [true, false]) {
        const design = presetDesign(d.id, lo);
        const view = genomeOf({ design, pages: [{ kind: "home", sections: [{ type: d.layout.heroes[0]!.split(":")[0]!, variant: d.layout.heroes[0]!.split(":")[1]! }] }], chrome: { header: { variant: d.layout.header }, footer: { variant: d.layout.footer } }, business: {} });
        expect(genomeIssues(view), `${d.id} ${lo ? "low" : "high"}`).toEqual([]);
        // And as a picked genome its tokens are inside the type system and shape: the repair changes nothing.
        const asPicked: Design = { ...design, genome: { ...presetGenome(design, d), source: "picked" } };
        expect(checkDesign(asPicked, d), `${d.id} ${lo ? "low" : "high"}`).toEqual([]);
      }
    }
  });

  it("every font pair a preset uses has a type system; uppercase only with heavy grotesks", () => {
    for (const p of FONT_PAIRS) expect(typeSystem(p.id), p.id).toBeDefined();
    expect(uppercaseAllowed("archivo-archivo", 800)).toBe(true);
    expect(uppercaseAllowed("archivo-archivo", 500)).toBe(false);
    expect(uppercaseAllowed("garamond-karla", 800)).toBe(false);
    expect(uppercaseAllowed("fraunces-source-sans", 900)).toBe(false);
    expect(typeSystem("garamond-karla")!.cases).toEqual(["normal"]);
    expect(typeSystem("archivo-archivo")!.cases).toContain("uppercase");
    expect(typeSystem("garamond-karla")!.serif).toBe(true);
  });

  it("finds each broken rule", () => {
    const base: GenomeView = genomeOf(read("avtoservis-mrak"));
    expect(genomeIssues(base)).toEqual([]);
    const broken = (change: Partial<GenomeView>, buttons?: "soft" | "square") => genomeIssues({ ...base, ...change }, buttons ? { buttons } : {}).map((i) => i.rule);
    expect(broken({ ground: "dark", imagery: "duotone", shape: "soft" })).toEqual(["dark-imagery"]);
    expect(broken({ ground: "other" })).toEqual(["ground"]);
    expect(broken({ shape: "cut", imagery: "rounded" })).toEqual(["cut-imagery", "round-imagery"]);
    expect(broken({ shape: "arch", imagery: "framed" })).toEqual(["arch-imagery"]);
    expect(broken({ shape: "square", imagery: "arched" })).toEqual(["round-imagery"]);
    expect(broken({ density: "compact", type: "garamond-karla" })).toEqual(["compact-type"]);
    expect(broken({ rhythm: "flat", density: "compact" })).toEqual(["flat-density"]);
    expect(broken({ header: "overlay" })).toEqual(["overlay-hero"]);
    expect(broken({ type: "comic-sans" })).toEqual(["type"]);
    expect(broken({ shape: "square" }, "soft")).toEqual(["shape-buttons"]);
    expect(broken({ shape: "soft" }, "square")).toEqual(["shape-buttons"]);
    // A trade template: its motif needs a light page, its own type family and rhythm, natural photos, square or soft.
    const plate: GenomeView = genomeOf(read("racunovodstvo-seliskar"));
    expect(genomeIssues(plate)).toEqual([]);
    const t = (change: Partial<GenomeView>) => genomeIssues({ ...plate, ...change }).map((i) => i.rule);
    expect(t({ ground: "dark" })).toEqual(["motif-ground"]);
    expect(t({ type: "archivo-archivo" })).toEqual(["template-type"]);
    expect(t({ rhythm: "flat" })).toEqual(["template-rhythm"]);
    expect(t({ imagery: "framed" })).toEqual(["motif-imagery"]);
    expect(t({ shape: "cut" })).toEqual(["motif-shape"]);
    expect(GENOME_RULES.length).toBeGreaterThanOrEqual(14);
    expect(GENOME_AXES).toHaveLength(11);
  });

  it("validation refuses a picked genome that breaks a rule; a preset genome keeps its direction's rules", () => {
    // Dark ground with duotone photos on a general direction.
    const bad = picked("avtoservis-mrak", { imagery: "duotone", radius: 6, colors: DIRECTIONS.find((d) => d.id === "industrial")!.palette.fallback }, { shape: "soft" });
    expect(validateSite(bad).issues.map((i) => i.message)).toContain("genome: a dark page takes natural, framed, monochrome or full-bleed photos");
    // The same tokens under a preset genome: the direction's rules (imagery must be the direction's).
    const preset = { ...bad, design: { ...bad.design, genome: presetGenome(bad.design, DIRECTIONS.find((d) => d.id === "bold-local")) } };
    expect(validateSite(preset).issues.map((i) => i.path)).toContain("/design/imagery");
    // A picked genome may leave the direction's ranges where the rules allow: another trade preset's font pair, a cut shape.
    const free = picked("avtoservis-mrak", { fontPair: "space-grotesk-plex", headingWeight: 700, radius: 2, imagery: "monochrome" }, { shape: "cut", rhythm: "alternate" });
    expect(validateSite(free).issues).toEqual([]);
    expect(validateSite({ ...free, design: { ...free.design, genome: { ...free.design.genome!, source: "preset" } } }).ok).toBe(false);
  });

  it("the repair (enforceDesign) brings a picked genome's tokens inside the rules, idempotently", () => {
    const dir = DIRECTIONS.find((d) => d.id === "bold-local")!;
    const wild: Design = {
      ...read("avtoservis-mrak").design,
      fontPair: "garamond-karla",
      headingCase: "uppercase",
      headingWeight: 900,
      density: "compact",
      imagery: "duotone",
      radius: 12,
      colors: { ...DIRECTIONS.find((d) => d.id === "dark-elegant")!.palette.fallback },
      genome: { source: "picked", palette: "dark-elegant", rhythm: "flat", shape: "cut" },
    };
    const fixed = enforceDesign(wild, dir);
    expect(fixed.headingCase).toBe("normal");
    expect(fixed.headingWeight).toBeLessThanOrEqual(typeSystem("garamond-karla")!.weight[1]);
    expect(fixed.density).toBe("regular");
    expect(fixed.imagery).toBe("natural");
    expect(fixed.radius).toBeLessThanOrEqual(4);
    expect(groundOf(fixed.colors.background)).toBe("dark");
    expect(checkDesign(fixed, dir)).toEqual([]);
    expect(enforceDesign(fixed, dir)).toEqual(fixed);
    const spec = read("avtoservis-mrak");
    spec.design = fixed;
    expect(validateSite(spec).issues).toEqual([]);
    // A trade template's picked genome: its motif keeps a light page, its family's type, natural photos, its rhythm.
    const t = DIRECTIONS.find((d) => d.id === "racun")!;
    const tpl = enforceDesign({ ...read("racunovodstvo-seliskar").design, fontPair: "archivo-archivo", imagery: "monochrome", colors: { ...DIRECTIONS.find((d) => d.id === "industrial")!.palette.fallback }, genome: { source: "picked", palette: "industrial", rhythm: "flat", shape: "arch" } }, t);
    expect([tpl.fontPair, tpl.imagery, groundOf(tpl.colors.background), tpl.genome!.rhythm]).toEqual([t.fontPairs[0], "natural", "white", t.layout.rhythm]);
    expect(["square", "soft"]).toContain(tpl.genome!.shape);
    const site = read("racunovodstvo-seliskar");
    site.design = tpl;
    expect(validateSite(site).issues).toEqual([]);
  });

  it("the skeleton's buttons follow the shape", () => {
    const spec = read("pekarna-kvas");
    const dir = DIRECTIONS.find((d) => d.id === spec.design.direction)!;
    const skeleton = { header: "bar", actions: "bar", footer: "columns", footerTone: "alt", width: "contained", cards: "filled", buttons: "soft", dividers: "rule", photoRatio: "standard" } as const;
    const d = enforceDesign({ ...spec.design, radius: 0, imagery: "natural", skeleton, genome: { source: "picked", palette: "preset", rhythm: "alternate", shape: "square" } }, dir);
    expect(d.skeleton!.buttons).toBe("square");
    spec.design = d;
    expect(validateSite(spec).issues).toEqual([]);
  });

  it("shapes and radius: square to 2 px, soft from 3, cut to 4, arch from 4; never past 12 (no pills)", () => {
    expect(SHAPES).toEqual(["square", "soft", "cut", "arch"]);
    const spec = picked("pekarna-kvas", { radius: 12, imagery: "natural" }, { shape: "square" });
    expect(validateSite(spec).issues.map((i) => i.path)).toContain("/design/radius");
    expect(validateSite(picked("pekarna-kvas", { radius: 10, imagery: "natural" }, { shape: "arch" })).issues).toEqual([]);
  });
});

describe("section intents", () => {
  it("every section type has an intent", () => {
    for (const d of SECTION_DEFS) expect(SECTION_INTENT[d.type], d.type).toBeDefined();
  });

  it("moves a section to another layout of its intent only where the props fit as they are", () => {
    const spec = read("pekarna-kvas");
    const hero = spec.pages[0]!.sections[0]!;
    expect(`${hero.type}:${hero.variant}`).toBe("hero-split:image-left");
    // A split hero becomes a photo hero or the other side, with the same props.
    expect(layoutsFor(hero)).toEqual(expect.arrayContaining(["hero-split:image-left", "hero-split:image-right", "hero-image:overlay-bottom", "hero-image:overlay-left"]));
    const moved = asLayout(hero, "hero-image:overlay-left")!;
    expect(moved.props).toBe(hero.props);
    expect([moved.id, moved.type, moved.variant]).toEqual([hero.id, "hero-image", "overlay-left"]);
    // Not to a type-only hero (it has no picture), not to a signature hero (it reads its props by variant), not outside the intent.
    expect(asLayout(hero, "hero-type:large")).toBeNull();
    expect(asLayout(hero, "hero-signature:photo")).toBeNull();
    expect(asLayout(hero, "gallery:grid")).toBeNull();
    // A signature hero keeps its layout.
    const sig = read("avtoservis-mrak").pages[0]!.sections[0]!;
    expect(layoutsFor(read("racunovodstvo-seliskar").pages[0]!.sections[0]!)).toEqual(["hero-signature:receipt"]);
    expect(layoutsFor(sig)).toContain("hero-type:large");
    // A services list moves out of "aside" only when every item has a description and there is no note.
    const list = { id: "s_x", type: "services-list", variant: "aside", props: { title: "Kaj delamo", items: [{ name: "Masaža" }], note: "Brez napotnice." } } as unknown as SiteSpec["pages"][number]["sections"][number];
    expect(asLayout(list, "services-list:rows")).toBeNull();
  });
});
