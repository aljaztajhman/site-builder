import { describe, expect, it } from "vitest";
import { DIRECTIONS, MOTIFS, SECTION_DEFS, checkDesign, earliestOpening, enforceDesign, formatPhoneNational, plateCode, templateFor, type Design } from "../src/index.ts";

describe("trade template directions (docs/design/templates M, S, J)", () => {
  const templates = DIRECTIONS.filter((d) => d.template);

  it("implements M, S and J, one motif each", () => {
    expect(templates.map((d) => [d.id, d.template!.id, d.template!.motif])).toEqual([
      ["tablica", "M", "plate"],
      ["cevi", "S", "pipes"],
      ["skorja", "J", "crust"],
    ]);
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
