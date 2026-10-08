import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  BusinessSubtype,
  DIRECTIONS,
  SUBMOTIFS,
  SUBMOTIF_BASE,
  SUBTYPES,
  SUBTYPE_MOTIF,
  migrateSpec,
  siteMotif,
  stylesheetName,
  subtypeFits,
  subtypesOf,
  validateSite,
  type SiteSpec,
} from "../src/index.ts";

/** The business subtype (spec v15, variety engine Step 3): the trade within a type picks the drawn motif. */
const golden = (id: string) => migrateSpec(JSON.parse(readFileSync(new URL(`../../../tools/eval/golden/${id}.json`, import.meta.url), "utf8")) as unknown) as SiteSpec;
const site = (direction: string, subtype?: string) => ({ design: { direction }, business: subtype ? { subtype: BusinessSubtype.parse(subtype) } : {} });

describe("business subtypes", () => {
  it("are the plan's sub-trades, each belonging to one type", () => {
    expect(SUBTYPES).toEqual({
      "car-repair": ["repair", "tyres", "bodywork"],
      builder: ["plumbing", "electrical", "carpentry", "roofing", "painting"],
      shop: ["deli", "florist", "boutique"],
    });
    expect(subtypesOf("builder")).toContain("electrical");
    expect(subtypesOf("dental")).toEqual([]);
    expect(subtypeFits("builder", "roofing")).toBe(true);
    expect(subtypeFits("shop", "roofing")).toBe(false);
    expect(subtypeFits("hairdresser", "florist")).toBe(false);
    const all = Object.values(SUBTYPES).flat();
    expect(new Set(all).size).toBe(all.length);
  });

  it("map to the new motifs: electrician wire, carpenter joint, roofer tiles, painter strip, florist stem, boutique tag", () => {
    expect(SUBTYPE_MOTIF).toEqual({ electrical: "wire", carpentry: "joint", roofing: "tiles", painting: "strip", florist: "stem", boutique: "tag" });
    expect([...SUBMOTIFS].sort()).toEqual(Object.values(SUBTYPE_MOTIF).sort());
    // Each sub-trade motif draws on the layout of its parent type's template.
    const templateOf = (type: string) => DIRECTIONS.find((d) => d.template?.firstFor.includes(type as never))!.template!.motif;
    for (const [subtype, motif] of Object.entries(SUBTYPE_MOTIF)) {
      const type = Object.entries(SUBTYPES).find(([, subs]) => (subs as readonly string[]).includes(subtype))![0];
      expect(SUBMOTIF_BASE[motif], subtype).toBe(templateOf(type));
    }
  });

  it("pick the motif on their trade's template only; without a subtype nothing changes", () => {
    expect(siteMotif(site("cevi", "electrical"))).toEqual({ motif: "pipes", sub: "wire" });
    expect(siteMotif(site("cevi", "carpentry"))).toEqual({ motif: "pipes", sub: "joint" });
    expect(siteMotif(site("cevi", "roofing"))).toEqual({ motif: "pipes", sub: "tiles" });
    expect(siteMotif(site("cevi", "painting"))).toEqual({ motif: "pipes", sub: "strip" });
    expect(siteMotif(site("etiketa", "florist"))).toEqual({ motif: "label", sub: "stem" });
    expect(siteMotif(site("etiketa", "boutique"))).toEqual({ motif: "label", sub: "tag" });
    // Plumbing and a deli keep their template's own motif.
    expect(siteMotif(site("cevi", "plumbing"))).toEqual({ motif: "pipes" });
    expect(siteMotif(site("etiketa", "deli"))).toEqual({ motif: "label" });
    // A florist on the bakery template keeps the scoring cuts; an electrician on a general direction gets no motif.
    expect(siteMotif(site("skorja", "florist"))).toEqual({ motif: "crust" });
    expect(siteMotif(site("industrial", "electrical"))).toEqual({});
    expect(siteMotif(site("cevi"))).toEqual({ motif: "pipes" });
    expect(stylesheetName({ motif: "pipes", sub: "wire" })).toBe("site-pipes-wire.css");
    expect(stylesheetName({ motif: "pipes" })).toBe("site-pipes.css");
    expect(stylesheetName({})).toBe("site.css");
  });

  it("validates a subtype only within its own type", () => {
    const shop = golden("trgovina-oljka-in-sol");
    expect(validateSite({ ...shop, business: { ...shop.business, subtype: "florist" } }).issues).toEqual([]);
    const wrong = validateSite({ ...shop, business: { ...shop.business, subtype: "roofing" } });
    expect(wrong.ok ? [] : wrong.issues.map((i) => `${i.path} ${i.message}`)).toEqual(["/business/subtype subtype roofing is not a kind of shop"]);
    expect(validateSite({ ...shop, business: { ...shop.business, subtype: "gardening" as never } }).ok).toBe(false);
  });
});
