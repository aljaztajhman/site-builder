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
      const v7 = migrateSpec({ ...golden, specVersion: 6 }, MIGRATIONS, 7);
      expect(v7, id).toEqual({ ...golden, specVersion: 7 });
      expect(validateSite(migrateSpec(v7)).issues, id).toEqual([]);
    }
  });

  it("accepts what v7 adds (the receipt and label heroes, figures, the founding year, a round photo, hours with photos) and only from v7 on", async () => {
    const { validateSite } = await import("../src/index.ts");
    const spec = migrateSpec(await read("racunovodstvo-seliskar"));
    expect(validateSite(spec).issues).toEqual([]);
    expect(spec.pages[0]!.sections.map((s) => s.variant)).toEqual(["receipt", "figures", "rows", "figure", "call-out"]);
    const shop = migrateSpec(await read("trgovina-oljka-in-sol"));
    expect(validateSite(shop).issues).toEqual([]);
    expect(shop.pages[0]!.sections.map((s) => s.variant)).toEqual(["label", "tags", "narrow", "round", "photo", "call-out"]);
    // A stored spec must be migrated before it validates: the schema takes only the current version.
    expect(validateSite({ ...spec, specVersion: 6 }).ok).toBe(false);
  });
});

describe("migration 7 → 8 (trade templates K and L)", () => {
  const read = async (id: string) => {
    const { readFileSync } = await import("node:fs");
    return JSON.parse(readFileSync(new URL(`../../../tools/eval/golden/${id}.json`, import.meta.url), "utf8")) as SiteSpec;
  };

  it("turns stored v7 sites into valid v8 sites unchanged apart from the version", async () => {
    const { validateSite } = await import("../src/index.ts");
    for (const id of ["racunovodstvo-seliskar", "trgovina-oljka-in-sol", "pekarna-kvas"]) {
      const golden = await read(id);
      const v8 = migrateSpec({ ...golden, specVersion: 7 }, MIGRATIONS, 8);
      expect(v8, id).toEqual({ ...golden, specVersion: 8 });
      expect(validateSite(migrateSpec(v8)).issues, id).toEqual([]);
    }
  });

  it("accepts what v8 adds: the card and mirrors heroes, offers, plates, a photo pair with a figure, a team photo", async () => {
    const { validateSite } = await import("../src/index.ts");
    const inn = migrateSpec(await read("gostilna-zlata-zlica"));
    expect(validateSite(inn).issues).toEqual([]);
    expect(inn.pages[0]!.sections.map((s) => `${s.type}:${s.variant}`)).toEqual(["hero-signature:card", "price-list:offers", "products:plates", "image-text:pair", "team:photo", "contact:call-out"]);
    const salon = migrateSpec(await read("frizerstvo-lana"));
    expect(validateSite(salon).issues).toEqual([]);
    expect(salon.pages[0]!.sections.map((s) => `${s.type}:${s.variant}`)).toEqual(["hero-signature:mirrors", "cta:band", "price-list:grouped", "team:photo", "contact:call-out"]);
  });
});

describe("migration 8 → 9 (trade template O)", () => {
  it("turns stored v8 sites into valid v9 sites unchanged apart from the version, and accepts what v9 adds", async () => {
    const { readFileSync } = await import("node:fs");
    const { validateSite } = await import("../src/index.ts");
    const read = (id: string) => JSON.parse(readFileSync(new URL(`../../../tools/eval/golden/${id}.json`, import.meta.url), "utf8")) as SiteSpec;
    for (const id of ["gostilna-zlata-zlica", "frizerstvo-lana"]) {
      const golden = read(id);
      const v9 = migrateSpec({ ...golden, specVersion: 8 }, MIGRATIONS, 9);
      expect(v9, id).toEqual({ ...golden, specVersion: 9 });
      expect(validateSite(migrateSpec(v9)).issues, id).toEqual([]);
    }
    const dentist = migrateSpec(read("zobozdravstvo-lebar"));
    expect(validateSite(dentist).issues).toEqual([]);
    expect(dentist.pages[0]!.sections.map((s) => `${s.type}:${s.variant}`)).toEqual(["hero-signature:disc", "opening-hours:week", "services-list:aside", "team:photo", "contact:call-out"]);
  });
});

describe("migration 9 → 10 (trade templates N and P)", () => {
  it("turns stored v9 sites into valid v10 sites unchanged apart from the version, and accepts what v10 adds", async () => {
    const { readFileSync } = await import("node:fs");
    const { validateSite } = await import("../src/index.ts");
    const read = (id: string) => JSON.parse(readFileSync(new URL(`../../../tools/eval/golden/${id}.json`, import.meta.url), "utf8")) as SiteSpec;
    for (const id of ["zobozdravstvo-lebar", "gostilna-zlata-zlica", "avtoservis-mrak"]) {
      const golden = read(id);
      const v10 = migrateSpec({ ...golden, specVersion: 9 }, MIGRATIONS, 10);
      expect(v10, id).toEqual({ ...golden, specVersion: 10 });
      expect(validateSite(migrateSpec(v10)).issues, id).toEqual([]);
    }
    const farm = migrateSpec(read("kmetija-grabnar"));
    expect(validateSite(farm).issues).toEqual([]);
    expect(farm.pages[0]!.sections.map((s) => `${s.type}:${s.variant}`)).toEqual(["hero-signature:view", "price-list:rates", "gallery:wall", "image-text:image-right", "opening-hours:poster", "services-list:aside", "team:list", "contact:call-out"]);
    const physio = migrateSpec(read("fizioterapija-pregib"));
    expect(validateSite(physio).issues).toEqual([]);
    expect(physio.pages[0]!.sections.map((s) => `${s.type}:${s.variant}`)).toEqual(["hero-signature:bend", "highlights:figures", "services-list:aside", "text:narrow", "price-list:tags", "cta:band", "contact-strip:cards"]);
  });

  it("validates a stored v9 spec only after migration (the schema takes only the current version)", async () => {
    const { readFileSync } = await import("node:fs");
    const { validateSite } = await import("../src/index.ts");
    const farm = JSON.parse(readFileSync(new URL("../../../tools/eval/golden/kmetija-grabnar.json", import.meta.url), "utf8")) as SiteSpec;
    expect(validateSite({ ...farm, specVersion: 9 }).ok).toBe(false);
    expect(validateSite(migrateSpec({ ...farm, specVersion: 9 })).ok).toBe(true);
  });
});

describe("migration 10 → 11 (footer year and statement date in the spec)", () => {
  it("turns stored v10 sites into valid v11 sites unchanged apart from the version, and accepts the dates", async () => {
    const { readFileSync } = await import("node:fs");
    const { validateSite } = await import("../src/index.ts");
    const read = (id: string) => JSON.parse(readFileSync(new URL(`../../../tools/eval/golden/${id}.json`, import.meta.url), "utf8")) as SiteSpec;
    for (const id of ["kmetija-grabnar", "pekarna-kvas"]) {
      const golden = read(id);
      const v11 = migrateSpec({ ...golden, specVersion: 10 }, MIGRATIONS, 11);
      expect(v11, id).toEqual({ ...golden, specVersion: 11 });
      expect(validateSite(migrateSpec(v11)).issues, id).toEqual([]);
    }
    const dated = read("pekarna-kvas");
    dated.chrome.footer.year = 2026;
    const a11y = dated.pages.find((p) => p.kind === "accessibility")!.sections[0]!;
    if (a11y.type === "legal") a11y.props.date = "2026-10-02";
    expect(validateSite(dated).issues).toEqual([]);
    // Only the accessibility statement is dated, and only as YYYY-MM-DD.
    const privacy = dated.pages.find((p) => p.kind === "privacy")!.sections[0]!;
    if (privacy.type === "legal") privacy.props.date = "2026-10-02";
    expect(validateSite(dated).issues.map((i) => i.message)).toContain("only the accessibility statement carries a date");
    if (a11y.type === "legal") a11y.props.date = "2. 10. 2026";
    expect(validateSite(dated).ok).toBe(false);
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

describe("migration 12 → 13 (more pages, it-plan-limits)", () => {
  it("turns stored v12 sites into valid v13 sites unchanged apart from the version, and holds Plus's 20 pages", async () => {
    const { readFileSync } = await import("node:fs");
    const { validateSite, SiteSpec: Schema } = await import("../src/index.ts");
    const read = (id: string) => JSON.parse(readFileSync(new URL(`../../../tools/eval/golden/${id}.json`, import.meta.url), "utf8")) as SiteSpec;
    for (const id of ["pekarna-kvas", "avtoservis-mrak", "gostilna-zlata-zlica"]) {
      const golden = read(id);
      const v13 = migrateSpec({ ...golden, specVersion: 12 }, MIGRATIONS, 13);
      expect(v13, id).toEqual({ ...golden, specVersion: 13 });
      // Valid once brought to the current version (the schema accepts only the current one).
      expect(validateSite(migrateSpec(v13)).issues, id).toEqual([]);
    }
    // 20 home and standard pages beside privacy, accessibility and 404: 23 pages, which v12 refused (12 at most).
    const site = read("pekarna-kvas");
    const extra = Array.from({ length: 19 }, (_, i) => ({ ...site.pages[0]!, id: `p_extra_${i + 1}`, kind: "standard" as const, slug: `stran-${i + 1}`, nav: { label: `Stran ${i + 1}`, show: false } }));
    const big = { ...site, pages: [site.pages[0]!, ...extra, ...site.pages.slice(1)] };
    expect(big.pages.length).toBe(23);
    expect(Schema.safeParse(big).success).toBe(true);
    expect(Schema.safeParse({ ...big, pages: [...big.pages, { ...extra[0]!, id: "p_x2", slug: "x2" }, { ...extra[0]!, id: "p_x3", slug: "x3" }] }).success).toBe(false);
  });
});

describe("migration 13 → 14 (the owner's own texts, it-keep-owner-edits)", () => {
  it("turns stored v13 sites into valid v14 sites unchanged apart from the version; ownerEdits is optional and checked", async () => {
    const { readFileSync } = await import("node:fs");
    const { validateSite, SiteSpec: Schema, MAX_OWNER_EDITS } = await import("../src/index.ts");
    const read = (id: string) => JSON.parse(readFileSync(new URL(`../../../tools/eval/golden/${id}.json`, import.meta.url), "utf8")) as SiteSpec;
    for (const id of ["pekarna-kvas", "racunovodstvo-seliskar", "zobozdravstvo-lebar"]) {
      const golden = read(id);
      const v14 = migrateSpec({ ...golden, specVersion: 13 }, MIGRATIONS, 14);
      expect(v14, id).toEqual({ ...golden, specVersion: 14 });
      expect(v14.ownerEdits, id).toBeUndefined();
      expect(validateSite(migrateSpec(v14)).issues, id).toEqual([]);
    }
    const site = migrateSpec(read("pekarna-kvas"));
    const section = site.pages[0]!.sections[0]!.id;
    expect(Schema.safeParse({ ...site, ownerEdits: [{ section, path: "/props/title" }] }).success).toBe(true);
    // Only pointers inside a section's props, by a section id; never more than MAX_OWNER_EDITS.
    expect(Schema.safeParse({ ...site, ownerEdits: [{ section, path: "/variant" }] }).success).toBe(false);
    expect(Schema.safeParse({ ...site, ownerEdits: [{ section: "hero", path: "/props/title" }] }).success).toBe(false);
    expect(Schema.safeParse({ ...site, ownerEdits: Array.from({ length: MAX_OWNER_EDITS + 1 }, () => ({ section, path: "/props/title" })) }).success).toBe(false);
  });
});

describe("migration 14 → 15 (the business subtype, variety engine Step 3)", () => {
  it("turns stored v14 sites into valid v15 sites unchanged apart from the version; the subtype is optional and checked", async () => {
    const { readFileSync } = await import("node:fs");
    const { validateSite, SiteSpec: Schema } = await import("../src/index.ts");
    const read = (id: string) => JSON.parse(readFileSync(new URL(`../../../tools/eval/golden/${id}.json`, import.meta.url), "utf8")) as SiteSpec;
    for (const id of ["instalacije-rebernik", "trgovina-oljka-in-sol", "avtoservis-mrak", "kmetija-grabnar"]) {
      const golden = read(id);
      const v15 = migrateSpec({ ...golden, specVersion: 14 }, MIGRATIONS, 15);
      expect(v15, id).toEqual({ ...golden, specVersion: 15 });
      expect(v15.business.subtype, id).toBeUndefined();
      expect(validateSite(migrateSpec(v15)).issues, id).toEqual([]);
    }
    const shop = migrateSpec(read("trgovina-oljka-in-sol"));
    expect(Schema.safeParse({ ...shop, business: { ...shop.business, subtype: "florist" } }).success).toBe(true);
    // Only a known subtype; whether it fits the type is validateSite's (subtype.test.ts).
    expect(Schema.safeParse({ ...shop, business: { ...shop.business, subtype: "gardening" } }).success).toBe(false);
    expect(SPEC_VERSION).toBe(15);
  });
});
