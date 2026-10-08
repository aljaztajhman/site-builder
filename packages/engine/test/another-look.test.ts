import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FAMILIES, checkDesign, direction as directionById, familyOf, migrateSpec, validateSite, type SiteSpec } from "@sb/spec";
import { NO_FAMILY_MESSAGE, anotherLook, currentLookIndex, heroAs, keyOf, lookCycle, lookKey, sameLook, siteSeed, type LookKey } from "../src/index.ts";

/**
 * "Druga podoba" (HQ sb-druga-podoba, engine another-look.ts): the same content in the next look of the site's template
 * family, picked in code. No model call anywhere in here.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const golden = (name: string): SiteSpec => migrateSpec(JSON.parse(readFileSync(path.join(here, `../../../tools/eval/golden/${name}.json`), "utf8"))) as SiteSpec;
/** The template goldens: each has a family. */
const TEMPLATE_GOLDENS = ["fizioterapija-pregib", "frizerstvo-lana", "gostilna-zlata-zlica", "kmetija-grabnar", "racunovodstvo-seliskar", "trgovina-oljka-in-sol", "zobozdravstvo-lebar"];
const home = (s: SiteSpec) => s.pages.find((p) => p.kind === "home")!;

/** Everything of a spec but its look: the design, and the homepage hero's type and variant. */
function content(s: SiteSpec): string {
  const { design: _design, ...rest } = structuredClone(s);
  const hero = rest.pages.find((p) => p.kind === "home")!.sections[0] as unknown as Record<string, unknown>;
  delete hero.type;
  delete hero.variant;
  return JSON.stringify(rest);
}

/** The owner typed the hero's headline and a later section's title (spec ownerEdits). */
function withOwnerEdits(s: SiteSpec): SiteSpec {
  const h = home(s);
  return { ...s, ownerEdits: [{ section: h.sections[0]!.id, path: "/props/headline" }, { section: h.sections[1]!.id, path: "/props/title" }] };
}

/** The etiketa golden with a split hero instead of the label (a site whose hero can change). */
function splitHero(): SiteSpec {
  const s = golden("trgovina-oljka-in-sol");
  const h = home(s).sections[0]! as unknown as { type: string; variant: string; props: Record<string, unknown> };
  const { eyebrow, headline, intro, primary, secondary, image } = h.props;
  h.type = "hero-split";
  h.variant = "image-left";
  h.props = { ...(eyebrow ? { eyebrow } : {}), headline, intro: String(intro).slice(0, 200), ...(primary ? { primary } : {}), ...(secondary ? { secondary } : {}), image };
  expect(validateSite(s).ok).toBe(true);
  return s;
}

const tap = (s: SiteSpec, seed: number, o: { neighbours?: LookKey[]; skeleton?: boolean } = {}) => {
  const r = anotherLook(s, { seed, neighbours: o.neighbours ?? [], ...(o.skeleton ? { skeleton: { neighbours: [] } } : {}) });
  if (!r.ok) throw new Error(r.message);
  return r;
};

describe("Druga podoba: the look picker", () => {
  it("is deterministic per seed, and the seed changes the order", () => {
    const s = golden("zobozdravstvo-lebar");
    for (const seed of [1, 2, siteSeed("site_0123456789abcdef")]) {
      expect(JSON.stringify(tap(s, seed).spec)).toBe(JSON.stringify(tap(s, seed).spec));
      expect(JSON.stringify(tap(s, seed, { skeleton: true }).spec)).toBe(JSON.stringify(tap(s, seed, { skeleton: true }).spec));
    }
    const orders = new Set(Array.from({ length: 12 }, (_, i) => JSON.stringify(lookCycle(s, siteSeed(`site_${i}`)))));
    expect(orders.size).toBeGreaterThan(1);
  });

  for (const name of TEMPLATE_GOLDENS) {
    it(`${name}: never the current look, through every look of the family, content byte-identical, valid, nothing banned`, () => {
      const start = withOwnerEdits(golden(name));
      const seed = siteSeed(`site_${name}`);
      const cycle = lookCycle(start, seed)!;
      const family = familyOf(directionById(start.design.direction))!;
      // Every palette and every font pair of the family is in the cycle.
      expect(new Set(cycle.map((l) => l.paletteId))).toEqual(new Set(family.palettes.map((p) => p.id)));
      expect(new Set(cycle.map((l) => l.fontPair))).toEqual(new Set(family.fontPairs));
      // Each step of the cycle (the last back to the first too) changes the palette.
      for (const [i, l] of cycle.entries()) expect(l.paletteId).not.toBe(cycle[(i + 1) % cycle.length]!.paletteId);
      let s = start;
      const seen = new Set<string>();
      for (let i = 0; i < cycle.length; i++) {
        const r = tap(s, seed);
        expect(sameLook(lookKey(s), lookKey(r.spec)), `${name} tap ${i + 1}`).toBe(false);
        expect(content(r.spec)).toBe(content(start));
        expect(JSON.stringify(r.spec.ownerEdits)).toBe(JSON.stringify(start.ownerEdits));
        expect(JSON.stringify(r.spec.assets)).toBe(JSON.stringify(start.assets));
        expect(JSON.stringify(r.spec.business)).toBe(JSON.stringify(start.business));
        // The design keeps its tokens; only colours and fonts are the look's.
        const { colors: _a, fontPair: _b, ...tokens } = r.spec.design;
        const { colors: _c, fontPair: _d, ...was } = start.design;
        expect(tokens).toEqual(was);
        const v = validateSite(r.spec);
        expect(v.issues, `${name} tap ${i + 1}`).toEqual([]);
        expect(checkDesign(r.spec.design, directionById(r.spec.design.direction))).toEqual([]);
        expect(currentLookIndex(r.spec, cycle)).toBe(r.index);
        seen.add(`${r.look.paletteId}|${r.look.fontPair}|${r.look.hero}`);
        s = r.spec;
      }
      // N taps visit all N looks: the cycle goes through the whole family.
      expect(seen.size).toBe(cycle.length);
    });
  }

  it("changes the hero only where the other hero takes the same props (split ↔ image), never a signature hero", () => {
    const s = splitHero();
    const hero = home(s).sections[0]!;
    expect(heroAs(hero, "hero-image:overlay-left")?.type).toBe("hero-image");
    expect(heroAs(hero, "hero-signature:label")).toBeNull();
    expect(heroAs(hero, "hero-type:large")).toBeNull();
    const label = home(golden("trgovina-oljka-in-sol")).sections[0]!;
    expect(heroAs(label, "hero-split:image-left")).toBeNull();
    expect(heroAs(label, "hero-image:overlay-left")).toBeNull();
    // A type-only hero has no photo: it never becomes one that needs it.
    const typeHero = home(golden("avtoservis-mrak")).sections[0]!;
    expect(heroAs(typeHero, "hero-split:image-right")).toBeNull();
    expect(heroAs(typeHero, "hero-type:large")?.variant).toBe("large");
    // An intro longer than hero-image takes stays a split hero.
    const long = structuredClone(hero) as typeof hero & { props: { intro: string } };
    long.props.intro = "x".repeat(210);
    expect(heroAs(long, "hero-image:overlay-left")).toBeNull();

    const seed = siteSeed("site_split");
    const cycle = lookCycle(s, seed)!;
    expect(new Set(cycle.map((l) => l.hero))).toEqual(new Set(["hero-split:image-left", "hero-image:overlay-left"]));
    expect(cycle).toHaveLength(FAMILIES.etiketa!.palettes.length * FAMILIES.etiketa!.fontPairs.length * 2);
    let at = s;
    const heroes = new Set<string>();
    for (let i = 0; i < cycle.length; i++) {
      const r = tap(at, seed);
      expect(content(r.spec)).toBe(content(s));
      expect(validateSite(r.spec).issues).toEqual([]);
      heroes.add(`${home(r.spec).sections[0]!.type}:${home(r.spec).sections[0]!.variant}`);
      at = r.spec;
    }
    expect(heroes).toEqual(new Set(["hero-split:image-left", "hero-image:overlay-left"]));
  });

  it("avoids the looks of the same trade's sites", () => {
    const s = golden("gostilna-zlata-zlica");
    const seed = siteSeed("site_gostilna");
    const first = tap(s, seed);
    const away = tap(s, seed, { neighbours: [first.key] });
    expect(sameLook(away.key, first.key)).toBe(false);
    expect(sameLook(away.key, lookKey(s))).toBe(false);
    // With every other look taken by a neighbour it still changes the look (the next one in the cycle).
    const cycle = lookCycle(s, seed)!;
    const all: LookKey[] = [];
    let at = s;
    for (let i = 0; i < cycle.length; i++) {
      const r = tap(at, seed);
      all.push(r.key);
      at = r.spec;
    }
    const crowded = tap(s, seed, { neighbours: all });
    expect(sameLook(crowded.key, lookKey(s))).toBe(false);
    expect(JSON.stringify(crowded.spec)).toBe(JSON.stringify(first.spec));
  });

  it("brings another skeleton only with variety.skeleton on", () => {
    for (const name of ["zobozdravstvo-lebar", "kmetija-grabnar", "racunovodstvo-seliskar"]) {
      const s = golden(name);
      const seed = siteSeed(`site_${name}`);
      const off = tap(s, seed);
      expect(off.spec.design.skeleton).toBeUndefined();
      expect(off.look.skeleton).toBeUndefined();
      // A site that has a skeleton keeps it as it is with the switch off.
      const framed = tap(s, seed, { skeleton: true }).spec;
      expect(framed.design.skeleton).toBeDefined();
      expect(tap(framed, seed).spec.design.skeleton).toEqual(framed.design.skeleton);
      // On: each look another frame (header, phone actions, footer) than the one before, valid, content untouched.
      let at = framed;
      for (let i = 0; i < 6; i++) {
        const r = tap(at, seed, { skeleton: true });
        const a = at.design.skeleton!;
        const b = r.spec.design.skeleton!;
        expect(r.look.skeleton).toEqual(b);
        expect(a.header === b.header && a.actions === b.actions && a.footer === b.footer, `${name} tap ${i + 1}`).toBe(false);
        expect(validateSite(r.spec).issues).toEqual([]);
        expect(content(r.spec)).toBe(content(s));
        at = r.spec;
      }
    }
  });

  it("refuses a style without a family, in Slovene", () => {
    for (const name of ["avtoservis-mrak", "pekarna-kvas", "instalacije-rebernik"]) {
      const r = anotherLook(golden(name), { seed: 1, neighbours: [] });
      expect(r).toEqual({ ok: false, reason: "no_family", message: NO_FAMILY_MESSAGE });
      expect(lookCycle(golden(name), 1)).toBeNull();
    }
    expect(NO_FAMILY_MESSAGE).toMatch(/drugih podob/);
  });

  it("the result's key is the look it renders", () => {
    const s = golden("kmetija-grabnar");
    const r = tap(s, 7);
    expect(r.key).toEqual(keyOf(r.spec.design, home(r.spec).sections[0]!));
  });
});
