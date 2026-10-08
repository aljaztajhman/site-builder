import { describe, expect, it } from "vitest";
import { DIRECTIONS, FAMILIES, FONT_PAIRS, SECTION_DEFS, acceptedFontPairs, checkDesign, deltaE, enforceDesign, familyOf, outlineSlots, validateOutline, type Design } from "../src/index.ts";

/** Template families (docs/plans/variety-engine.md, Step 1): each trade template is 2–3 palettes, font pairs and heroes. */
const templates = DIRECTIONS.filter((d) => d.template);

describe("template families", () => {
  it("every trade template has a family of 2–3 palettes and font pairs and 1–3 heroes, its own first", () => {
    expect(templates).toHaveLength(10);
    for (const dir of templates) {
      const f = familyOf(dir)!;
      expect(f, dir.id).toBeDefined();
      for (const list of [f.palettes, f.fontPairs]) {
        expect(list.length, dir.id).toBeGreaterThanOrEqual(2);
        expect(list.length, dir.id).toBeLessThanOrEqual(3);
      }
      expect(f.heroes.length, dir.id).toBeGreaterThanOrEqual(1);
      expect(f.heroes.length, dir.id).toBeLessThanOrEqual(3);
      // The alternates are photo heroes: never a type-only hero in place of the signature (HQ it-family-type-heroes).
      for (const h of f.heroes.slice(1)) expect(h, dir.id).toMatch(/^hero-(split|image):/);
      expect(f.palettes[0]!.colors, dir.id).toEqual(dir.palette.fallback);
      expect(f.fontPairs[0], dir.id).toBe(dir.fontPairs[0]);
      expect(f.heroes[0], dir.id).toBe(dir.layout.heroes[0]);
      expect(new Set(f.palettes.map((p) => p.id)).size, dir.id).toBe(f.palettes.length);
    }
    expect(Object.keys(FAMILIES).sort()).toEqual(templates.map((d) => d.id).sort());
  });

  it("names only font pairs, section types and variants that exist", () => {
    const pairs = new Set(FONT_PAIRS.map((p) => p.id));
    for (const f of Object.values(FAMILIES)) {
      for (const p of f.fontPairs) expect(pairs, p).toContain(p);
      for (const h of f.heroes) {
        const [type, variant] = h.split(":");
        const def = SECTION_DEFS.find((d) => d.type === type);
        expect(def?.group, h).toBe("heroes");
        expect(def!.variants, h).toContain(variant);
      }
    }
  });

  it("every palette passes the design rules as designed: contrast enforcement moves no role noticeably, nothing banned", () => {
    for (const dir of templates) {
      for (const p of familyOf(dir)!.palettes) {
        const design: Design = { direction: dir.id, fontPair: dir.fontPairs[0]!, colors: { ...p.colors }, radius: dir.ranges.radius[0], baseFontSize: dir.ranges.baseFontSize[0], scale: dir.ranges.scale[0], headingWeight: dir.ranges.headingWeight[0], headingCase: dir.ranges.headingCase[0]!, headingTracking: dir.ranges.headingTracking[0], density: dir.ranges.density[0]!, shadow: dir.ranges.shadow[0]!, imagery: dir.imagery };
        const enforced = enforceDesign(design, dir);
        expect(checkDesign(enforced, dir), `${dir.id}/${p.id}`).toEqual([]);
        for (const [role, hex] of Object.entries(p.colors)) {
          expect(deltaE(hex, enforced.colors[role as keyof typeof enforced.colors]!), `${dir.id}/${p.id} ${role}`).toBeLessThan(6);
        }
      }
    }
  });

  it("validation accepts a family's font pairs; a direction without a family only its own", () => {
    const tablica = DIRECTIONS.find((d) => d.id === "tablica")!;
    expect(acceptedFontPairs(tablica)).toEqual(expect.arrayContaining(FAMILIES.tablica!.fontPairs));
    const plain = DIRECTIONS.find((d) => !d.template)!;
    expect(acceptedFontPairs(plain)).toEqual(plain.fontPairs);
  });
});

describe("outline slots", () => {
  const jedilnik = DIRECTIONS.find((d) => d.id === "jedilnik")!;
  const own = jedilnik.template!.homepage.map((line) => {
    const [type, variant] = line.split(/\s|:/).filter(Boolean) as [string, string];
    return { type, variant };
  });

  it("the hero is one of the family's heroes, the closing section required, the rest optional", () => {
    const slots = outlineSlots(jedilnik);
    expect(slots[0]).toMatchObject({ kind: "one-of", options: FAMILIES.jedilnik!.heroes });
    expect(slots.at(-1)!.kind).toBe("required");
    expect(slots.slice(1, -1).every((s) => s.kind === "optional")).toBe(true);
    expect(outlineSlots(jedilnik, "hero-image:overlay-bottom")[0]!.options).toEqual(["hero-image:overlay-bottom"]);
  });

  it("validates every template's own outline, and with any family hero", () => {
    for (const dir of templates) {
      const sections = dir.template!.homepage.map((line) => {
        const [type, variant] = line.split(/\s|:/).filter(Boolean) as [string, string];
        return { type, variant };
      });
      expect(validateOutline(sections, outlineSlots(dir)), dir.id).toEqual([]);
      for (const hero of familyOf(dir)!.heroes) {
        const [type, variant] = hero.split(":") as [string, string];
        expect(validateOutline([{ type, variant }, ...sections.slice(1)], outlineSlots(dir)), `${dir.id} ${hero}`).toEqual([]);
      }
    }
  });

  it("an optional section may be left out; a missing closing section, a foreign hero, a reordering or an extra section fail", () => {
    const slots = outlineSlots(jedilnik);
    expect(validateOutline([own[0]!, own[2]!, own.at(-1)!], slots)).toEqual([]);
    expect(validateOutline(own.slice(0, -1), slots)).toEqual([expect.stringMatching(/^missing contact:call-out/)]);
    expect(validateOutline([{ type: "hero-type", variant: "large" }, ...own.slice(1)], slots)[0]).toMatch(/^missing one of hero-signature:card/);
    expect(validateOutline([own[0]!, own[2]!, own[1]!, own.at(-1)!], slots).length).toBeGreaterThan(0);
    expect(validateOutline([...own, { type: "faq", variant: "list" }], slots)).toEqual(["faq:list is not in the outline, or out of order"]);
  });
});
