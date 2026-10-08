import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { GENOME_AXES, direction as directionById, genomeDistance, genomeIssues, genomeOf, migrateSpec, validateSite, type GenomeView, type SiteSpec } from "@sb/spec";
import { MIN_GENOME_DISTANCE, anotherGenomeLook, applyGenome, applySkeleton, countGenomes, genomePools, pickGenome, siteSeed } from "../src/index.ts";

/**
 * The design genome (variety engine Step 5, config variety.genome; engine genome.ts): each axis picked in code from the
 * site seed and away from the neighbours, the written content dressed in it. No model call anywhere in here.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const golden = (name: string): SiteSpec => migrateSpec(JSON.parse(readFileSync(path.join(here, `../../../tools/eval/golden/${name}.json`), "utf8")));
const GOLDENS = ["avtoservis-mrak", "fizioterapija-pregib", "frizerstvo-lana", "gostilna-zlata-zlica", "instalacije-rebernik", "kmetija-grabnar", "pekarna-kvas", "racunovodstvo-seliskar", "trgovina-oljka-in-sol", "zobozdravstvo-lebar"];
/** Goldens on a general direction (no trade template): every axis is free. */
const GENERAL = ["avtoservis-mrak", "instalacije-rebernik", "pekarna-kvas"];

/** Everything a look may not touch: the texts, photos and facts (every section's id and props, the business, the assets). */
function content(s: SiteSpec): string {
  return JSON.stringify({
    business: s.business,
    assets: s.assets,
    pages: s.pages.map((p) => ({ ...p, sections: p.sections.map((x) => ({ id: x.id, props: x.props })) })),
    translations: s.translations,
    ownerEdits: s.ownerEdits,
  });
}

/** The site made 20 times for 20 businesses of one trade, each seeing the earlier ones as neighbours (as on the platform). */
function twenty(name: string): { genomes: GenomeView[]; specs: SiteSpec[] } {
  const spec = golden(name);
  const genomes: GenomeView[] = [];
  const specs: SiteSpec[] = [];
  for (let i = 0; i < 20; i++) {
    const r = applyGenome(spec, { seed: siteSeed(`${name}-${i}`), neighbours: genomes });
    genomes.push(r.genome);
    specs.push(r.spec);
  }
  return { genomes, specs };
}

describe("the design genome", () => {
  it("20 sites of one trade get 20 different genomes, each valid (car repair: each at least 4 axes from every earlier one)", () => {
    for (const name of GOLDENS) {
      const { genomes, specs } = twenty(name);
      expect(new Set(genomes.map((g) => JSON.stringify(g))).size, name).toBe(20);
      for (const [i, s] of specs.entries()) {
        const v = validateSite(s);
        expect(v.ok ? [] : v.issues, `${name} #${i}`).toEqual([]);
        expect(genomeIssues(genomes[i]!), `${name} #${i}`).toEqual([]);
        expect(content(s), `${name} #${i}`).toBe(content(golden(name)));
      }
      if (GENERAL.includes(name)) {
        for (let i = 1; i < 20; i++) expect(Math.min(...genomes.slice(0, i).map((g) => genomeDistance(g, genomes[i]!))), `${name} #${i}`).toBeGreaterThanOrEqual(MIN_GENOME_DISTANCE);
      }
    }
  });

  it("is the same for the same seed and neighbours, and moves with the seed", () => {
    const spec = golden("avtoservis-mrak");
    const a = applyGenome(spec, { seed: siteSeed("x"), neighbours: [] });
    expect(JSON.stringify(applyGenome(spec, { seed: siteSeed("x"), neighbours: [] }).spec)).toBe(JSON.stringify(a.spec));
    const seeds = new Set(Array.from({ length: 12 }, (_, i) => JSON.stringify(applyGenome(spec, { seed: siteSeed(`s${i}`), neighbours: [] }).genome)));
    expect(seeds.size).toBeGreaterThan(8);
  });

  it("on a general direction every axis but the motif moves; thousands of valid combinations", () => {
    for (const name of GENERAL) {
      const spec = golden(name);
      const n = countGenomes(spec);
      expect(n, name).toBeGreaterThan(1000);
      const { genomes } = twenty(name);
      // The header and footer are the chrome's (no skeleton here); the hero moves where the written hero's props allow.
      // A logo fixes the palette and so the ground (below).
      const fixed = spec.assets.logo ? ["motif", "hero", "palette", "ground"] : ["motif", "hero"];
      for (const axis of GENOME_AXES.filter((a) => !fixed.includes(a))) {
        expect(new Set(genomes.map((g) => g[axis])).size, `${name} ${axis}`).toBeGreaterThan(1);
      }
      expect(new Set(genomes.map((g) => g.motif)), name).toEqual(new Set(["none"]));
    }
    // A logo keeps the design step's colours (the business's own); without one the palette moves too.
    expect(genomePools(golden("pekarna-kvas")).palette.map((p) => p.id)).toEqual(["preset"]);
    expect(new Set(twenty("avtoservis-mrak").genomes.map((g) => g.palette)).size).toBeGreaterThan(2);
    // A photo hero moves to another photo layout with its own props; a type-only hero to the other type-only one.
    expect(new Set(twenty("pekarna-kvas").genomes.map((g) => g.hero)).size).toBeGreaterThan(1);
    expect(new Set(twenty("instalacije-rebernik").genomes.map((g) => g.hero))).toEqual(new Set(["hero-type:with-facts", "hero-type:large"]));
  });

  it("a trade template keeps its motif, signature hero, rhythm, type family and light page; the rest moves", () => {
    for (const name of ["racunovodstvo-seliskar", "kmetija-grabnar", "zobozdravstvo-lebar"]) {
      const spec = golden(name);
      const own = genomeOf(spec);
      const { genomes } = twenty(name);
      for (const g of genomes) {
        expect([g.motif, g.hero, g.rhythm, g.preset], name).toEqual([own.motif, own.hero, own.rhythm, own.preset]);
        expect(g.ground, name).not.toBe("dark");
        expect(["square", "soft"], name).toContain(g.shape);
      }
      expect(new Set(genomes.map((g) => g.type)).size, name).toBeGreaterThan(1);
      expect(new Set(genomes.map((g) => g.header)).size, name).toBeGreaterThan(1);
      expect(countGenomes(spec), name).toBeGreaterThan(100);
    }
  });

  it("with the skeleton (variety.skeleton) the header and footer are the skeleton's and the buttons follow the shape", () => {
    for (const name of [...GENERAL, "kmetija-grabnar"]) {
      const spec = golden(name);
      const genomes: GenomeView[] = [];
      for (let i = 0; i < 10; i++) {
        const seed = siteSeed(`${name}-sk-${i}`);
        const framed = applySkeleton(spec, { seed, dir: directionById(spec.design.direction), neighbours: [] }).spec;
        const r = applyGenome(framed, { seed, neighbours: genomes });
        genomes.push(r.genome);
        const v = validateSite(r.spec);
        expect(v.ok ? [] : v.issues, `${name} #${i}`).toEqual([]);
        const sk = r.spec.design.skeleton!;
        // The skeleton's own header (an overlay header becomes the word family when the hero can't carry it).
        expect([sk.header === "overlay" ? "overlay" : r.genome.header, r.genome.footer], `${name} #${i}`).toEqual([sk.header, sk.footer]);
        if (r.genome.shape === "square" || r.genome.shape === "cut") expect(sk.buttons, `${name} #${i}`).not.toBe("soft");
        else expect(sk.buttons, `${name} #${i}`).not.toBe("square");
        expect(r.spec.chrome, `${name} #${i}`).toEqual(spec.chrome);
      }
    }
  });
});

describe("Druga podoba with the genome", () => {
  it("moves along the axes on every golden (template or not), keeps every text and photo, stays valid; taps walk on", () => {
    for (const name of GOLDENS) {
      let spec = golden(name);
      const seen = new Set([JSON.stringify(genomeOf(spec))]);
      for (let tap = 0; tap < 5; tap++) {
        const r = anotherGenomeLook(spec, { seed: siteSeed(name), neighbours: [] });
        expect(r.ok, `${name} tap ${tap}`).toBe(true);
        if (!r.ok) break;
        const v = validateSite(r.spec);
        expect(v.ok ? [] : v.issues, `${name} tap ${tap}`).toEqual([]);
        expect(content(r.spec), `${name} tap ${tap}`).toBe(content(spec));
        expect(r.distance, `${name} tap ${tap}`).toBeGreaterThanOrEqual(1);
        seen.add(JSON.stringify(r.genome));
        spec = r.spec;
      }
      expect(seen.size, name).toBe(6);
    }
  });

  it("stays away from the neighbours' genomes where the pools allow", () => {
    const spec = golden("avtoservis-mrak");
    const neighbours = Array.from({ length: 6 }, (_, i) => pickGenome(spec, { seed: siteSeed(`n${i}`), neighbours: [] }));
    const r = anotherGenomeLook(spec, { seed: siteSeed("me"), neighbours });
    expect(r.ok).toBe(true);
    if (r.ok) for (const n of neighbours) expect(genomeDistance(n, r.genome)).toBeGreaterThanOrEqual(MIN_GENOME_DISTANCE);
  });
});
