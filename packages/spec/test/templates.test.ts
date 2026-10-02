import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { DIRECTIONS, MOTIFS, SECTION_DEFS, checkDesign, contrast, earliestOpening, enforceDesign, formatPhoneNational, migrateSpec, plateCode, templateFor, validateSite, type Design, type SiteSpec } from "../src/index.ts";

describe("trade template directions (docs/design/templates)", () => {
  const templates = DIRECTIONS.filter((d) => d.template);

  it("implements M, S, J, R and T, one motif each", () => {
    expect(templates.map((d) => [d.id, d.template!.id, d.template!.motif])).toEqual([
      ["tablica", "M", "plate"],
      ["cevi", "S", "pipes"],
      ["skorja", "J", "crust"],
      ["racun", "R", "ledger"],
      ["etiketa", "T", "label"],
    ]);
    expect(new Set(templates.map((d) => d.template!.motif)).size).toBe(templates.length);
    for (const d of templates) expect(MOTIFS).toContain(d.template!.motif);
  });

  it("outlines a homepage of real section types and variants, opening on the direction's own hero", () => {
    for (const d of templates) {
      const outline = d.template!.homepage.map((line) => line.split(/[\s:]/)[0]!);
      expect(d.template!.homepage[0]!.startsWith(d.layout.heroes[0]!)).toBe(true);
      for (const [i, line] of d.template!.homepage.entries()) {
        const [type, variant] = line.split(" ")[0]!.split(":");
        const def = SECTION_DEFS.find((s) => s.type === type);
        expect(def, `${d.id} ${outline[i]}`).toBeDefined();
        expect(def!.variants as readonly string[], `${d.id} ${line}`).toContain(variant);
      }
    }
  });

  it("sets display type three to six times the body size on desktop", () => {
    for (const d of templates) {
      const body = d.ranges.baseFontSize[1];
      expect(d.template!.display[1] / body, d.id).toBeGreaterThanOrEqual(4);
      expect(d.template!.display[1] / body, d.id).toBeLessThanOrEqual(7);
      expect(d.template!.display[0], d.id).toBeLessThanOrEqual(44);
    }
  });

  it("holds the colours it sets as text at 4.5:1, and repairs an edit that breaks them", () => {
    for (const d of templates.filter((x) => x.template!.textPairs)) {
      for (const [fg, bg] of d.template!.textPairs!) expect(contrast(d.palette.fallback[fg]!, d.palette.fallback[bg]!), `${d.id} ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
    const racun = DIRECTIONS.find((x) => x.id === "racun")!;
    // A light green primary passes the base rule (3:1) but not as Račun's poster-size text.
    const light: Design = { ...design("racun"), colors: { ...racun.palette.fallback, primary: "#3f9a6c" } };
    expect(contrast("#3f9a6c", "#ffffff")).toBeGreaterThan(3);
    expect(checkDesign(light, racun).map((i) => i.message)).toContain(`primary on background contrast ${contrast("#3f9a6c", "#ffffff").toFixed(2)} < 4.5 (text in racun)`);
    const fixed = enforceDesign(light, racun);
    expect(checkDesign(fixed, racun)).toEqual([]);
    expect(contrast(fixed.colors.primary, fixed.colors.surface)).toBeGreaterThanOrEqual(4.5);
    // The base directions keep the 3:1 rule for primary.
    expect(checkDesign({ ...design("clean-swiss"), colors: { ...DIRECTIONS[0]!.palette.fallback, primary: "#3f9a6c", onPrimary: "#111111" } }, DIRECTIONS[0]).filter((i) => i.path === "/design/colors/primary")).toEqual([]);
  });

  it("keeps its band colour readable", () => {
    for (const d of templates) {
      const c = d.palette.fallback;
      expect(c.band, d.id).toBeDefined();
      expect(checkDesign({ ...design(d.id) }, d)).toEqual([]);
    }
  });

  it("is the first choice for its trade when the photos allow it", () => {
    expect(templateFor("car-repair", 0)?.id).toBe("tablica");
    expect(templateFor("builder", 0)?.id).toBe("cevi");
    expect(templateFor("bakery", 3)?.id).toBe("skorja");
    expect(templateFor("bakery", 0)).toBeUndefined();
    expect(templateFor("accountant", 0)?.id).toBe("racun");
    expect(templateFor("shop", 1)?.id).toBe("etiketa");
    expect(templateFor("shop", 0)).toBeUndefined();
    expect(templateFor("dental", 3)).toBeUndefined();
  });

  it("repairs a band without its text colour and an unreadable one", () => {
    const d = DIRECTIONS.find((x) => x.id === "tablica")!;
    const bad: Design = { ...design("tablica"), colors: { ...d.palette.fallback, onBand: "#fff8cc" } };
    expect(checkDesign(bad, d).map((i) => i.path)).toContain("/design/colors/onBand");
    expect(checkDesign(enforceDesign(bad, d), d)).toEqual([]);
    const { onBand: _onBand, ...noText } = d.palette.fallback;
    expect(checkDesign({ ...bad, colors: noText }, d).map((i) => i.message)).toContain("band and onBand go together");
    expect(enforceDesign({ ...bad, colors: noText }, d).colors.onBand).toBeDefined();
  });
});

function design(id: string): Design {
  const d = DIRECTIONS.find((x) => x.id === id)!;
  return {
    direction: d.id,
    fontPair: d.fontPairs[0]!,
    colors: { ...d.palette.fallback },
    radius: d.ranges.radius[0],
    baseFontSize: d.ranges.baseFontSize[0],
    scale: d.ranges.scale[0],
    headingWeight: d.ranges.headingWeight[1],
    headingCase: d.ranges.headingCase[0]!,
    headingTracking: d.ranges.headingTracking[0],
    density: d.ranges.density[0]!,
    shadow: d.ranges.shadow[0]!,
    imagery: d.imagery,
  };
}

describe("facts drawn by the motifs", () => {
  it("writes the phone as dialled at home", () => {
    expect(formatPhoneNational("+38641555730")).toBe("041 555 730");
    expect(formatPhoneNational("+38642123456")).toBe("04 212 34 56");
    expect(formatPhoneNational("+43664123456")).toBe("+43664123456");
  });

  it("knows the plate code only of registration-area seats", () => {
    expect(plateCode("Kranj")).toBe("KR");
    expect(plateCode(" novo mesto ")).toBe("NM");
    expect(plateCode("Krško")).toBe("KK");
    expect(plateCode("Ptuj")).toBeNull();
  });

  it("finds the earliest opening time and the days it holds for", () => {
    const bakery = { entries: [{ from: "mon", to: "fri", open: "06:30", close: "18:00" }, { from: "sat", to: "sat", open: "06:30", close: "12:00" }, { from: "sun", to: "sun", open: "07:00", close: "10:00" }] } as const;
    expect(earliestOpening(structuredClone(bakery) as never)).toEqual({ time: "6.30", days: "pon–sob", everyDay: false });
    const split = { entries: [{ from: "mon", to: "mon", open: "07:00", close: "15:00" }, { from: "tue", to: "tue", open: "09:00", close: "15:00" }, { from: "wed", to: "wed", open: "07:00", close: "15:00" }] };
    expect(earliestOpening(split as never)?.days).toBe("pon, sre");
    const daily = { entries: [{ from: "mon", to: "sun", open: "08:00", close: "20:00" }] };
    expect(earliestOpening(daily as never)).toEqual({ time: "8.00", days: "pon–ned", everyDay: true });
    expect(earliestOpening({ entries: [{ from: "mon", to: "sun", closed: true }] } as never)).toBeNull();
  });
});

describe("hero-signature receipt (R) and the hero rules", () => {
  const golden = (): SiteSpec => migrateSpec(JSON.parse(readFileSync(new URL("../../../tools/eval/golden/racunovodstvo-seliskar.json", import.meta.url), "utf8")) as unknown);
  const hero = (spec: SiteSpec) => spec.pages[0]!.sections[0] as Extract<SiteSpec["pages"][number]["sections"][number], { type: "hero-signature" }>;

  it("validates the golden Račun site: a receipt hero, client types, the founding year, no opening hours", () => {
    const spec = golden();
    expect(validateSite(spec).issues).toEqual([]);
    expect(spec.design.direction).toBe("racun");
    expect(hero(spec).variant).toBe("receipt");
    expect(spec.business.hours).toBeUndefined();
    expect(spec.pages[0]!.sections.map((s) => `${s.type}:${s.variant}`)).toEqual(["hero-signature:receipt", "highlights:figures", "services-list:rows", "about:figure", "contact:call-out"]);
  });

  it("needs factLabel for a phone or an opening time, shows the address only on a label, the receipt only as a receipt", () => {
    const issues = (edit: (h: ReturnType<typeof hero>) => void) => {
      const spec = golden();
      edit(hero(spec));
      return validateSite(spec).issues.map((i) => `${i.path} ${i.message}`);
    };
    expect(issues((h) => delete h.props.factLabel)).toEqual(["/pages/0/sections/0/props/factLabel factLabel is required when the hero shows the phone"]);
    expect(issues((h) => (h.props.fact = "address"))).toEqual(["/pages/0/sections/0/props/fact fact address is only shown by the label variant"]);
    expect(issues((h) => (h.variant = "drawing"))).toEqual(["/pages/0/sections/0/props/receipt receipt is only shown by the receipt variant"]);
  });

  it("limits the receipt to two to seven short lines", () => {
    const tooMany = golden();
    hero(tooMany).props.receipt!.lines = Array.from({ length: 8 }, (_, i) => `Storitev ${i}`);
    expect(validateSite(tooMany).ok).toBe(false);
    const tooLong = golden();
    hero(tooLong).props.receipt!.lines[0] = "x".repeat(45);
    expect(validateSite(tooLong).ok).toBe(false);
  });
});

describe("hero-signature label (T)", () => {
  const golden = (): SiteSpec => migrateSpec(JSON.parse(readFileSync(new URL("../../../tools/eval/golden/trgovina-oljka-in-sol.json", import.meta.url), "utf8")) as unknown);

  it("validates the golden Etiketa site: the address on the label, product labels, the gift band, hours with the shop front", () => {
    const spec = golden();
    expect(validateSite(spec).issues).toEqual([]);
    expect(spec.design.direction).toBe("etiketa");
    expect(spec.pages[0]!.sections.map((s) => `${s.type}:${s.variant}`)).toEqual(["hero-signature:label", "price-list:tags", "text:narrow", "image-text:round", "opening-hours:photo", "contact:call-out"]);
    const hero = spec.pages[0]!.sections[0]!;
    expect(hero.type === "hero-signature" && hero.props.fact).toBe("address");
    expect(hero.type === "hero-signature" && hero.props.factLabel).toBeUndefined();
  });

  it("refuses an inset or a hours photo that isn't one of the site's images", () => {
    const spec = golden();
    const hero = spec.pages[0]!.sections[0]! as Extract<SiteSpec["pages"][number]["sections"][number], { type: "hero-signature" }>;
    hero.props.inset = "img_99";
    expect(validateSite(spec).issues.map((i) => i.message)).toContain("unknown image img_99");
  });

  it("keeps the leaf surface out of the cream band and every text pair at 4.5:1", () => {
    const d = DIRECTIONS.find((x) => x.id === "etiketa")!;
    expect(checkDesign(design("etiketa"), d)).toEqual([]);
    expect(contrast(d.palette.fallback.inverse, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(contrast(d.palette.fallback.accent, d.palette.fallback.inverse)).toBeGreaterThanOrEqual(3);
  });
});

describe("variants that need a prop to look different", () => {
  it("name a real variant and an optional prop of the section", () => {
    const declared = SECTION_DEFS.filter((d) => d.variantNeeds);
    expect(declared.map((d) => d.type).sort()).toEqual(["about", "hero-signature", "opening-hours"]);
    for (const d of declared) {
      for (const [variant, prop] of Object.entries(d.variantNeeds!)) {
        expect(d.variants as readonly string[], `${d.type}:${variant}`).toContain(variant);
        const shape = d.props.shape as Record<string, { isOptional: () => boolean }>;
        expect(shape[prop!], `${d.type}.${prop}`).toBeDefined();
        expect(shape[prop!]!.isOptional(), `${d.type}.${prop}`).toBe(true);
      }
    }
  });
});
