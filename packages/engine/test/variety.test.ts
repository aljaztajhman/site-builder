import { describe, expect, it } from "vitest";
import { loadConfig } from "@sb/config";
import { FAMILIES, deltaE, direction as directionById } from "@sb/spec";
import {
  ModelClient,
  awayFromNeighbours,
  brandColours,
  chooseDesign,
  designFromChoice,
  designWithVariety,
  familyLine,
  fittingDirections,
  keyOf,
  pickFromFamily,
  sameLook,
  seededOrder,
  siteSeed,
  type LookKey,
  type ModelRequest,
  type ModelTransport,
  type Swatch,
} from "../src/index.ts";

/** The variety engine (docs/plans/variety-engine.md, Steps 1–2), behind config variety.families; no model call. */
const choice = (id: string, over: Record<string, unknown> = {}) => ({
  direction: id,
  fontPair: "x",
  primary: "#1d4ed8",
  accent: null,
  radius: 4,
  baseFontSize: 18,
  scale: 1.25,
  headingWeight: 900,
  headingCase: "uppercase" as const,
  headingTracking: -0.02,
  density: "regular" as const,
  shadow: "none" as const,
  reason: "",
  ...over,
});
const logo = (...hex: string[]): Swatch[] => hex.map((h, i) => ({ hex: h, weight: 0.5 - i * 0.1, source: "logo" as const }));
const ids = Array.from({ length: 20 }, (_, i) => `site_${(0x1a2b3c + i * 7919).toString(16)}`);

describe("site seed", () => {
  it("is stable per site id and differs between sites", () => {
    expect(siteSeed("site_abc")).toBe(siteSeed("site_abc"));
    expect(new Set(ids.map((id) => siteSeed(id))).size).toBe(20);
    // A regeneration moves it; the same move twice lands on the same seed.
    expect(siteSeed("site_abc", "look-1")).not.toBe(siteSeed("site_abc"));
    expect(siteSeed("site_abc", "look-1")).toBe(siteSeed("site_abc", "look-1"));
  });

  it("orders options the same way every time for one seed, differently across seeds", () => {
    const opts = ["a", "b", "c", "d", "e"];
    expect(seededOrder(opts, 42, "x")).toEqual(seededOrder(opts, 42, "x"));
    expect(seededOrder(opts, 42, "x").sort()).toEqual(opts);
    const firsts = new Set(ids.map((id) => seededOrder(opts, siteSeed(id), "x")[0]));
    expect(firsts.size).toBeGreaterThan(2);
  });

  it("renders the same site the same way every time", () => {
    const v = { seed: siteSeed("site_same"), neighbours: [], pictures: true, swatches: [] };
    expect(designWithVariety(choice("tablica"), v)).toEqual(designWithVariety(choice("tablica"), v));
  });
});

describe("neighbours", () => {
  // Tablica's family has 3 palettes × 3 font pairs × 2 heroes = 18 looks, cevi's (signature hero only) 9: the sites
  // past them move off as any direction does (awayFromNeighbours).
  for (const id of ["tablica", "cevi"] as const) {
    it(`20 ${id} sites in one town, each designed after the last: no two share direction, palette family, font pair and hero`, () => {
      const family = FAMILIES[id]!;
      const looks = family.palettes.length * family.fontPairs.length * family.heroes.length;
      const made: LookKey[] = [];
      for (const site of ids) {
        const r = designWithVariety(choice(id), { seed: siteSeed(site), neighbours: [...made], pictures: true, swatches: [] });
        made.push(keyOf(r.design, { type: r.hero!.split(":")[0]!, variant: r.hero!.split(":")[1]! }));
      }
      for (let i = 0; i < made.length; i++) for (let j = i + 1; j < made.length; j++) expect(sameLook(made[i]!, made[j]!), `${ids[i]} / ${ids[j]}`).toBe(false);
      // They spread over the family, not only past it: the first `looks` sites take every look of the family.
      const inFamily = made.slice(0, looks);
      const familyLook = (m: LookKey) => family.palettes.some((p) => deltaE(m.primary, p.colors.primary) < 10 && deltaE(m.band, p.colors.band ?? p.colors.primary) < 10);
      expect(inFamily.every(familyLook), id).toBe(true);
      expect(new Set(inFamily.map((m) => `${m.fontPair}|${m.hero}`)).size).toBe(family.fontPairs.length * family.heroes.length);
      expect(new Set(made.map((m) => m.hero))).toEqual(new Set(family.heroes));
    });
  }

  it("a direction without a family moves off a neighbour's look: other fonts first, then other colours", () => {
    const dir = directionById("clean-swiss");
    const base = designFromChoice(choice("clean-swiss"));
    const hero = dir.layout.heroes[0]!;
    const n = keyOf(base, { type: hero.split(":")[0]!, variant: hero.split(":")[1]! });
    const moved = awayFromNeighbours(base, dir, hero, [n], 1);
    expect(sameLook(keyOf(moved, { type: hero.split(":")[0]!, variant: hero.split(":")[1]! }), n)).toBe(false);
    expect(awayFromNeighbours(base, dir, hero, [], 1)).toEqual(base);
  });

  it("without pictures, a family never picks a hero that needs one", () => {
    for (const id of ids) {
      const r = designWithVariety(choice("tablica"), { seed: siteSeed(id), neighbours: [], pictures: false, swatches: [] });
      expect(r.hero, id).not.toMatch(/^hero-(split|image):/);
    }
  });
});

describe("brand colours in the template's roles", () => {
  const tablica = directionById("tablica");
  it("a coloured logo lands in primary and the band; contrast still holds", () => {
    const r = designWithVariety(choice("tablica"), { seed: 1, neighbours: [], pictures: true, swatches: logo("#1f4e9c") });
    expect(deltaE(r.design.colors.primary, "#1f4e9c")).toBeLessThan(10);
    // Tablica's band is its own colour (signal yellow): a single logo colour goes to primary and accent, the band stays.
    expect(r.design.colors.band).toBe("#ffcc00");
    const two = designWithVariety(choice("tablica"), { seed: 1, neighbours: [], pictures: true, swatches: logo("#1f4e9c", "#e8a317") });
    expect(deltaE(two.design.colors.band!, "#e8a317")).toBeLessThan(10);
  });

  it("a logo without a usable colour falls back to a family palette", () => {
    expect(brandColours(tablica.palette.fallback, logo("#777777", "#fafafa", "#0a0a0a"))).toBeNull();
    const r = designWithVariety(choice("tablica"), { seed: siteSeed("site_grey"), neighbours: [], pictures: true, swatches: logo("#777777") });
    expect(FAMILIES.tablica!.palettes.map((p) => p.colors.band)).toContain(r.design.colors.band);
  });
});

describe("the design step", () => {
  const config = loadConfig();
  const brief = { name: "Avto Kovač", businessType: "car-repair", tone: "professional", summary: "Servis nemških vozil." } as never;
  async function request(variety?: Parameters<typeof chooseDesign>[1]["variety"]): Promise<ModelRequest> {
    const seen: ModelRequest[] = [];
    const transport: ModelTransport = {
      async send(r, stage) {
        seen.push(r);
        return { text: JSON.stringify(choice("tablica")), stopReason: "end_turn", model: stage.model, usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } };
      },
    };
    await chooseDesign(new ModelClient({ config, transport, spentToday: async () => 0, onCall: async () => undefined }), { brief, swatches: [], photoCount: 2, generatedCount: 0, ...(variety ? { variety } : {}) });
    return seen[0]!;
  }

  it("with the switch off, the request is today's: the template named as the first choice", async () => {
    const off = (await request()).messages[0]!.content as string;
    expect(off).toContain("Choose it whenever the business fits its description.");
    expect(off).not.toContain("Also fitting");
  });

  it("with it on, the template is offered beside two fitting directions, and a regeneration asks for another look", async () => {
    const seed = siteSeed("site_kovac");
    const alts = fittingDirections("car-repair", seed, ["tablica"]);
    expect(alts).toHaveLength(2);
    expect(alts.every((d) => !d.template && d.bestFor.includes("car-repair"))).toBe(true);
    const on = (await request({ seed, neighbours: [], pictures: true })).messages[0]!.content as string;
    expect(on).toContain(`Also fitting: ${alts.map((d) => `${d.id} (${d.name})`).join(", ")}`);
    expect(on).not.toContain("Choose it whenever");
    const previous: LookKey = { direction: "tablica", primary: "#15181c", band: "#ffcc00", fontPair: "archivo-public-sans", hero: "hero-signature:photo" };
    expect(familyLine("car-repair", 2, { seed, neighbours: [], pictures: true, previous })).toContain("The owner asked for a different look. The site it replaces uses direction tablica");
  });

  it("a regeneration lands on a different look than the one it replaces", () => {
    for (const id of ids) {
      const first = designWithVariety(choice("tablica"), { seed: siteSeed(id), neighbours: [], pictures: true, swatches: [] });
      const previous = keyOf(first.design, { type: first.hero!.split(":")[0]!, variant: first.hero!.split(":")[1]! });
      const again = designWithVariety(choice("tablica"), { seed: siteSeed(id, JSON.stringify(previous)), neighbours: [], previous, pictures: true, swatches: [] });
      expect(sameLook(keyOf(again.design, { type: again.hero!.split(":")[0]!, variant: again.hero!.split(":")[1]! }), previous), id).toBe(false);
    }
  });
});

describe("template families keep their signature hero first", () => {
  it("every seed gets the signature hero while palettes and fonts are free; a photo hero only once neighbours took them", () => {
    for (const id of Object.keys(FAMILIES)) {
      const dir = directionById(id);
      const family = FAMILIES[id as keyof typeof FAMILIES]!;
      const signature = family.heroes[0]!;
      for (let seed = 1; seed <= 20; seed++) {
        expect(pickFromFamily(dir, { seed, logo: [], pictures: true, neighbours: [] })?.hero, `${id} seed ${seed}`).toBe(signature);
      }
      if (family.heroes.length < 2) continue;
      // Every palette and font pair with the signature hero taken: the next site gets a photo hero.
      const taken: LookKey[] = family.palettes.flatMap((p) =>
        family.fontPairs.map((fontPair) => ({ direction: id, primary: p.colors.primary, band: p.colors.band ?? p.colors.primary, fontPair, hero: signature })),
      );
      const next = pickFromFamily(dir, { seed: 7, logo: [], pictures: true, neighbours: taken });
      expect(next?.hero, id).not.toBe(signature);
    }
  });
});
