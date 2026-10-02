import { describe, expect, it } from "vitest";
import { MIGRATIONS, SPEC_VERSION, migrateSpec, type SiteSpec } from "../src/index.ts";

describe("migrateSpec", () => {
  it("passes the current version through unchanged", () => {
    const spec = { specVersion: SPEC_VERSION, slug: "x" };
    expect(migrateSpec(spec)).toBe(spec);
  });

  it("has a migration step for every version below the current one", () => {
    for (let v = 1; v < SPEC_VERSION; v++) expect(MIGRATIONS[v], `migration from v${v}`).toBeTypeOf("function");
  });

  it("runs steps in order and bumps the version", () => {
    const steps = {
      1: (s: Record<string, unknown>) => ({ ...s, a: 1 }),
      2: (s: Record<string, unknown>) => ({ ...s, b: (s.a as number) + 1 }),
    };
    expect(migrateSpec({ specVersion: 1 }, steps, 3)).toEqual({ specVersion: 3, a: 1, b: 2 });
  });

  it("rejects missing, unknown and future versions", () => {
    expect(() => migrateSpec({})).toThrow(/specVersion/);
    expect(() => migrateSpec({ specVersion: SPEC_VERSION + 1 })).toThrow(/newer/);
    expect(() => migrateSpec({ specVersion: 1 }, {}, 2)).toThrow(/No migration/);
    expect(() => migrateSpec(null)).toThrow();
  });
});

describe("migration 1 → 2 (contact-form section type)", () => {
  it("turns a stored v1 site into a valid v2 site unchanged apart from the version", async () => {
    const { readFileSync } = await import("node:fs");
    const { validateSite } = await import("../src/index.ts");
    const golden = JSON.parse(readFileSync(new URL("../../../tools/eval/golden/pekarna-kvas.json", import.meta.url), "utf8")) as Record<string, unknown>;
    const v1 = { ...golden, specVersion: 1 };
    const v2 = migrateSpec(v1, MIGRATIONS, 2);
    expect(v2).toEqual({ ...golden, specVersion: 2 });
    expect(migrateSpec(v2).specVersion).toBe(SPEC_VERSION);
    expect(validateSite(migrateSpec(v2)).ok).toBe(true);
  });
});

describe("migration 2 → 3 (image origin)", () => {
  it("turns a stored v2 site into a valid v3 site unchanged apart from the version; its photos count as the client's", async () => {
    const { readFileSync } = await import("node:fs");
    const { validateSite } = await import("../src/index.ts");
    const golden = JSON.parse(readFileSync(new URL("../../../tools/eval/golden/pekarna-kvas.json", import.meta.url), "utf8")) as { assets: { images: { origin?: string }[] } };
    const v3 = migrateSpec({ ...golden, specVersion: 2 }, MIGRATIONS, 3);
    expect(v3).toEqual({ ...golden, specVersion: 3 });
    expect(validateSite(migrateSpec(v3)).ok).toBe(true);
    expect(v3.assets.images.every((i) => i.origin === undefined)).toBe(true);
  });
});

describe("migration 4 → 5 (trade templates)", () => {
  it("turns a stored v4 site into a valid v5 site unchanged apart from the version", async () => {
    const { readFileSync } = await import("node:fs");
    const { validateSite } = await import("../src/index.ts");
    const golden = JSON.parse(readFileSync(new URL("../../../tools/eval/golden/avtoservis-mrak.json", import.meta.url), "utf8")) as Record<string, unknown>;
    const v5 = migrateSpec({ ...golden, specVersion: 4 }, MIGRATIONS, 5);
    expect(v5).toEqual({ ...golden, specVersion: 5 });
    expect(validateSite(migrateSpec(v5)).ok).toBe(true);
  });

  it("accepts what v5 adds: the band tone, band colours, hero-signature, price tags and the call-out", async () => {
    const { readFileSync } = await import("node:fs");
    const { validateSite, direction } = await import("../src/index.ts");
    const golden = JSON.parse(readFileSync(new URL("../../../tools/eval/golden/avtoservis-mrak.json", import.meta.url), "utf8")) as SiteSpec;
    const t = direction("tablica");
    const spec = structuredClone(golden);
    spec.design = { ...spec.design, direction: t.id, fontPair: t.fontPairs[0]!, colors: { ...t.palette.fallback }, radius: 6, baseFontSize: 18, scale: 1.25, headingWeight: 900, headingCase: "uppercase", headingTracking: -0.02, density: "regular", shadow: "none", imagery: t.imagery };
    spec.pages[0]!.sections = [
      { id: "s_hero", type: "hero-signature", variant: "photo", tone: "inverse", props: { headline: "Servis vseh znamk v Kranju", intro: "Družinski servis od leta 2008.", fact: "phone", factLabel: "Najhitreje nas dobite po telefonu", image: "img_01" } },
      { id: "s_cene", type: "price-list", variant: "tags", tone: "inverse", props: { title: "Nekaj cen", groups: [{ items: [{ name: "Diagnostika", price: { amount: 30 } }] }] } },
      { id: "s_klic", type: "contact", variant: "call-out", tone: "band", props: { title: "Pokličite" } },
    ];
    const r = validateSite(spec);
    expect(r.issues).toEqual([]);
    // As a v4 spec, the same content is rejected: v5 is what makes it valid.
    expect(validateSite({ ...spec, specVersion: 4 }).ok).toBe(false);
  });
});

describe("migration 5 → 6 (owner-edited price lists and menus)", () => {
  const read = async (id: string) => {
    const { readFileSync } = await import("node:fs");
    return JSON.parse(readFileSync(new URL(`../../../tools/eval/golden/${id}.json`, import.meta.url), "utf8")) as SiteSpec;
  };

  it("turns stored v5 sites (a price list, a menu) into valid v6 sites unchanged apart from the version", async () => {
    const { validateSite } = await import("../src/index.ts");
    for (const id of ["frizerstvo-lana", "gostilna-zlata-zlica"]) {
      const golden = await read(id);
      const v6 = migrateSpec({ ...golden, specVersion: 5 }, MIGRATIONS, 6);
      expect(v6, id).toEqual({ ...golden, specVersion: 6 });
      expect(validateSite(migrateSpec(v6)).issues, id).toEqual([]);
    }
  });

  it("accepts what v6 adds: an item or dish marked unavailable (a boolean)", async () => {
    const { validateSite, priceList, menuSection } = await import("../src/index.ts");
    const golden = migrateSpec(await read("frizerstvo-lana"));
    const spec = structuredClone(golden);
    const prices = spec.pages[1]!.sections.find((s) => s.type === "price-list")!;
    (prices.props as { groups: { items: { unavailable?: boolean }[] }[] }).groups[0]!.items[1]!.unavailable = true;
    expect(validateSite(spec).issues).toEqual([]);
    expect(priceList.schema.safeParse({ ...prices, props: { title: "Cenik", groups: [{ items: [{ name: "A", price: { amount: 1 }, unavailable: "yes" }] }] } }).success).toBe(false);
    expect(menuSection.schema.safeParse({ id: "s_m", type: "menu", variant: "classic", props: { title: "Jedi", categories: [{ name: "Juhe", dishes: [{ name: "Ričet", price: { amount: 6 }, unavailable: true }] }] } }).success).toBe(true);
  });
});

describe("migration 6 → 7 (trade templates R and T)", () => {
  const read = async (id: string) => {
    const { readFileSync } = await import("node:fs");
    return JSON.parse(readFileSync(new URL(`../../../tools/eval/golden/${id}.json`, import.meta.url), "utf8")) as SiteSpec;
  };

  it("turns stored v6 sites into valid v7 sites unchanged apart from the version", async () => {
    const { validateSite } = await import("../src/index.ts");
    for (const id of ["avtoservis-mrak", "pekarna-kvas", "frizerstvo-lana"]) {
      const golden = await read(id);
      const v7 = migrateSpec({ ...golden, specVersion: 6 });
      expect(v7, id).toEqual({ ...golden, specVersion: 7 });
      expect(validateSite(v7).issues, id).toEqual([]);
    }
  });

  it("accepts what v7 adds (the receipt hero, figures, the founding year) and only from v7 on", async () => {
    const { validateSite } = await import("../src/index.ts");
    const spec = migrateSpec(await read("racunovodstvo-seliskar"));
    expect(validateSite(spec).issues).toEqual([]);
    expect(spec.pages[0]!.sections.map((s) => s.variant)).toEqual(["receipt", "figures", "rows", "figure", "call-out"]);
    // A stored spec must be migrated before it validates: the schema takes only the current version.
    expect(validateSite({ ...spec, specVersion: 6 }).ok).toBe(false);
  });
});

describe("generated images", () => {
  it("may fill a hero but not a products section (pekarna-kvas uses img_01 in both)", async () => {
    const { readFileSync } = await import("node:fs");
    const { validateSite } = await import("../src/index.ts");
    type Spec = { assets: { images: { id: string; origin?: string }[] }; pages: { sections: { type: string }[] }[] };
    const spec = JSON.parse(readFileSync(new URL("../../../tools/eval/golden/pekarna-kvas.json", import.meta.url), "utf8")) as Spec;
    spec.assets.images[0]!.origin = "generated";
    const r = validateSite(spec);
    expect(r.ok).toBe(false);
    const home = spec.pages[0]!.sections;
    const flagged = r.issues.filter((i) => i.message.includes("AI-generated")).map((i) => home[Number(/sections\/(\d+)/.exec(i.path)![1])]!.type);
    expect(flagged).toEqual(["products"]);
  });
});
