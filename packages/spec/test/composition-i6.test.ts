import { describe, expect, it } from "vitest";
import {
  FACT_OBJECTS,
  TYPE_TREATMENTS,
  TYPE_TREATMENT_LIMITS,
  factObjectGround,
  repairComposition,
  splitFirstWord,
  splitLeadingNumber,
  typeTreatmentGround,
  typeTreatmentProblem,
  validateComposition,
  type Colors,
  type CompositionContext,
} from "../src/index.ts";
import { composed, fact, has, heading, issue, repairPath } from "./helpers/composed.ts";

/**
 * Batch I6 (docs/plans/studio-phase1-design.md §5): the G20 limits of the type treatments I6a adds, and G9 for the own
 * grounds of the fact objects (I6b) and type treatments that paint one (factObjectGround, typeTreatmentGround).
 */

/** Tablica's palette (tools/eval/composed/m.json), as in composition-guards-v2.test.ts. */
const PALETTE: Colors = {
  background: "#ffffff",
  surface: "#eef0f3",
  text: "#15181c",
  muted: "#4a525c",
  primary: "#15181c",
  onPrimary: "#ffffff",
  accent: "#b38f00",
  border: "#d9dee4",
  inverse: "#15181c",
  onInverse: "#f5f5f5",
  band: "#ffcc00",
  onBand: "#15181c",
};
const C: CompositionContext = { colors: PALETTE, imageIds: new Set(["img_01", "img_02"]) };
const at = { col: 1, span: 6, row: 1 };
const h = (rest: Record<string, unknown>, tone?: "alt" | "inverse" | "band") => composed([heading("e_head", at, 0, rest)], {}, tone);
const NEW_TYPE = TYPE_TREATMENTS.slice(3);
const NEW_FACT = FACT_OBJECTS.slice(6);

describe("I6 vocabulary", () => {
  it("adds 12 type treatments and 11 fact objects after the starters", () => {
    expect(TYPE_TREATMENTS.slice(0, 3)).toEqual(["none", "stacked", "knockout"]);
    expect(NEW_TYPE).toHaveLength(12);
    expect(FACT_OBJECTS.slice(0, 6)).toEqual(["numeral", "plate", "stamp", "ticket", "seal", "tag"]);
    expect(NEW_FACT).toHaveLength(11);
  });
});

describe("G20 type treatment limits (I6a)", () => {
  /** [treatment, heading fields that pass, heading fields that fail with the message]. */
  const CASES: [string, Record<string, unknown>, [Record<string, unknown>, RegExp][]][] = [
    [
      "circle",
      { text: "Servis vseh znamk v Kranju", size: 2 },
      [
        [{ text: "Vodovod, ogrevanje, toplotne črpalke Ptuj", size: 4 }, /circle takes at most 40 characters \(has 41\)/],
        [{ text: "Potica za praznike", size: 1 }, /circle needs size 2 or more/],
      ],
    ],
    [
      "vertical",
      { text: "Kontakt", size: 4, case: "uppercase", weight: 800 },
      [
        [{ text: "Kje smo", size: 4, case: "uppercase", weight: 800 }, /vertical takes one word/],
        [{ text: "Avtoservisi", size: 4, case: "uppercase", weight: 800 }, /vertical takes at most 10 characters \(has 11\)/],
        [{ text: "Kontakt", size: 3, case: "uppercase", weight: 800 }, /vertical needs size 4–5/],
        [{ text: "Kontakt", size: 6, case: "uppercase", weight: 800 }, /vertical needs size 4–5/],
        [{ text: "Kontakt", size: 4 }, /vertical needs case uppercase/],
      ],
    ],
    [
      "oversized-first-word",
      { text: "Servis vseh znamk v Kranju", size: 5 },
      [
        [{ text: "Kontakt", size: 5 }, /oversized-first-word needs at least two words/],
        [{ text: "Vodovodnoinštalaterski servis", size: 5 }, /oversized-first-word needs a first word of at most 14 characters/],
      ],
    ],
    ["rule-flanked", { text: "Kdaj smo odprti", size: 3 }, [[{ text: "Najhitreje nas dobite po telefonu", size: 3 }, /rule-flanked takes at most 30 characters \(has 33\)/]]],
    ["masthead", { text: "Pekarna Kvas", size: 3 }, [[{ text: "Pekarna Kvas", size: 2 }, /masthead needs size 3 or more/]]],
    [
      "drop-numeral",
      { text: "2008 – družinski servis v Kranju", size: 5 },
      [
        [{ text: "Družinski servis od leta 2008", size: 5 }, /drop-numeral needs a heading that starts with a number/],
        [{ text: "2008", size: 5 }, /drop-numeral needs a heading that starts with a number/],
        [{ text: "12345678 dni", size: 5 }, /drop-numeral needs a heading that starts with a number/],
        [{ text: "2008 – družinski servis", size: 7 }, /drop-numeral takes size 6 at most/],
      ],
    ],
    ["ruled-total", { text: "Storitve in cene", size: 4 }, []],
    ["title-block", { text: "Od klica do pisne ponudbe", size: 4 }, []],
    ["typed-line", { text: "Pokličite ali pišite", size: 3 }, []],
    ["fascia-lettering", { text: "Avtoservis Mrak", size: 5 }, []],
    ["marker-highlight", { text: "Ogled je brezplačen", size: 5 }, []],
    ["corner-marks", { text: "Kaj servisiramo", size: 4 }, []],
  ];

  it("covers every treatment I6a adds", () => {
    expect(CASES.map(([t]) => t).sort()).toEqual([...NEW_TYPE].sort());
  });

  for (const [t, ok, bad] of CASES) {
    it(`${t}: passes within its limits`, () => {
      expect(validateComposition(h({ treatment: t, ...ok }), C)).toEqual([]);
    });
    for (const [fields, message] of bad) {
      it(`${t}: rejects ${JSON.stringify(fields)} and repairs by dropping the treatment`, () => {
        const s = h({ treatment: t, ...fields });
        expect(issue(s, new RegExp(`e_head: ${message.source}`), C)).toMatchObject({ code: "structure", path: "/props/elements/0/treatment" });
        const r = repairComposition(s, C);
        expect(r.repairs.map(repairPath)).toContain("/props/elements/0/treatment");
        expect((r.section.props.elements[0] as { treatment?: string }).treatment).toBeUndefined();
        expect(has(r.section, /treatment|takes|needs/, C)).toBe(false);
      });
    }
  }

  it("the limits are the exported numbers", () => {
    expect(TYPE_TREATMENT_LIMITS).toEqual({
      circle: { maxChars: 40, minSize: 2 },
      vertical: { maxChars: 10, minSize: 4, maxSize: 5 },
      "oversized-first-word": { maxFirstWord: 14 },
      "rule-flanked": { maxChars: 30 },
      masthead: { minSize: 3 },
      "drop-numeral": { maxSize: 6 },
    });
    expect(typeTreatmentProblem({ treatment: "stacked", text: "a b c d e", size: 3 })).toBeUndefined(); // stacked and knockout keep their own rules
  });

  it("the splits never change or add words: a leading number only when the heading has one", () => {
    expect(splitLeadingNumber("2008 – družinski servis")).toEqual({ number: "2008", rest: "– družinski servis" });
    expect(splitLeadingNumber("4,20 € pirin kruh")).toEqual({ number: "4,20 €", rest: "pirin kruh" });
    expect(splitLeadingNumber("6.30–18.00 vsak dan")).toBeUndefined(); // 10 characters: too long to drop
    expect(splitLeadingNumber("Od leta 2008 v Kranju")).toBeUndefined();
    expect(splitFirstWord("Servis vseh znamk")).toEqual({ first: "Servis", rest: "vseh znamk" });
    expect(splitFirstWord("Kontakt")).toBeUndefined();
  });
});

describe("G9 own grounds of the I6 fact objects and type treatments", () => {
  const GROUNDS: Record<string, { default: string; flipTone?: "alt" | "inverse" | "band"; flipped?: string }> = {
    "house-number": { default: "primary", flipTone: "band", flipped: "onBand" },
    "index-tab": { default: "primary", flipTone: "band", flipped: "onBand" },
    signpost: { default: "band", flipTone: "band", flipped: "onBand" },
    "door-plate": { default: "band", flipTone: "band", flipped: "onBand" },
    timetable: { default: "inverse", flipTone: "inverse", flipped: "onInverse" },
    receipt: { default: "surface", flipTone: "alt", flipped: "background" },
    calendar: { default: "surface", flipTone: "alt", flipped: "background" },
  };

  it("factObjectGround names a guaranteed-pair ground for the objects that paint one, none for the rest", () => {
    for (const t of NEW_FACT) {
      const g = GROUNDS[t];
      expect(factObjectGround(t, "default"), t).toBe(g?.default);
      if (g?.flipTone) expect(factObjectGround(t, g.flipTone), t).toBe(g.flipped);
    }
    expect(NEW_FACT.filter((t) => !GROUNDS[t]).sort()).toEqual(["dimension", "ruler", "split", "total"]);
  });

  const factIn = (treatment: string, color: string, tone?: "alt" | "inverse" | "band") =>
    composed([heading("e_head", at, 0), fact("e_f", { col: 8, span: 4, row: 1 }, 1, { size: 5, treatment, color })], {}, tone);

  it("checks a fact's colour against its object's own ground, and repairs by dropping the colour", () => {
    for (const [t, g] of Object.entries(GROUNDS)) {
      const s = factIn(t, g.default);
      expect(issue(s, new RegExp(`e_f: ${g.default} on ${g.default} fails contrast \\(1\\.00 < 3\\)`), C), t).toMatchObject({ code: "design", path: "/props/elements/1/color" });
      const r = repairComposition(s, C);
      expect(r.repairs.map(repairPath), t).toEqual(["/props/elements/1/color"]);
      expect(validateComposition(r.section, C), t).toEqual([]);
      // On the tone that flips it, the object's ground is the flipped role.
      expect(has(factIn(t, g.flipped!, g.flipTone), new RegExp(`e_f: ${g.flipped} on ${g.flipped} fails`), C), `${t} flipped`).toBe(true);
    }
  });

  it("checks the objects without a ground against the section's ground", () => {
    for (const t of ["total", "dimension", "split", "ruler"]) {
      expect(has(factIn(t, "background"), /e_f: background on background fails/, C), t).toBe(true);
      expect(validateComposition(factIn(t, "text"), C), t).toEqual([]);
    }
  });

  it("typeTreatmentGround: fascia-lettering on the band colour, marker-highlight on primary, both flipped on a band section", () => {
    expect(typeTreatmentGround("fascia-lettering", "default")).toBe("band");
    expect(typeTreatmentGround("fascia-lettering", "band")).toBe("onBand");
    expect(typeTreatmentGround("marker-highlight", "inverse")).toBe("primary");
    expect(typeTreatmentGround("marker-highlight", "band")).toBe("onBand");
    for (const t of NEW_TYPE.filter((x) => x !== "fascia-lettering" && x !== "marker-highlight")) expect(typeTreatmentGround(t, "default"), t).toBeUndefined();
    expect(typeTreatmentGround(undefined, "default")).toBeUndefined();
  });

  it("checks a treated heading's colour against the treatment's own ground, not the section's", () => {
    // band text on the band board fails; on a plain heading the same colour on white would be 1.47 and fail too, so take onBand.
    const fascia = h({ treatment: "fascia-lettering", text: "Avtoservis Mrak", size: 5, color: "band" });
    expect(issue(fascia, /e_head: band on band fails contrast \(1\.00 < 3\)/, C)).toMatchObject({ code: "design", path: "/props/elements/0/color" });
    // onBand (#15181c) reads on the band board, though it would read on white too: the point is it is checked against band.
    expect(validateComposition(h({ treatment: "fascia-lettering", text: "Avtoservis Mrak", size: 5, color: "onBand" }), C)).toEqual([]);
    // primary on the marker's primary band fails, though primary on the white page passes (17.81).
    expect(has(h({ treatment: "marker-highlight", text: "Ogled je brezplačen", size: 5, color: "primary" }), /e_head: primary on primary fails/, C)).toBe(true);
    expect(validateComposition(h({ text: "Ogled je brezplačen", size: 5, color: "primary" }), C)).toEqual([]);
    // On a band section the board flips to onBand: onBand text on it fails, band passes.
    expect(has(h({ treatment: "fascia-lettering", text: "Avtoservis Mrak", size: 5, color: "onBand" }, "band"), /e_head: onBand on onBand fails/, C)).toBe(true);
    expect(validateComposition(h({ treatment: "fascia-lettering", text: "Avtoservis Mrak", size: 5, color: "band" }, "band"), C)).toEqual([]);
  });

  it("a heading with an own ground needs no scrim over a photo layer (G3 leaves it alone)", () => {
    const s = composed([heading("e_head", at, 0, { treatment: "fascia-lettering", text: "Avtoservis Mrak", size: 5 })], { background: [{ kind: "photo", image: "img_02", scrim: { role: "inverse", strength: 1 } }] }, "inverse");
    expect(has(s, /e_head/, C)).toBe(false);
    const plain = composed([heading("e_head", at, 0, { text: "Avtoservis Mrak", size: 5 })], { background: [{ kind: "photo", image: "img_02", scrim: { role: "inverse", strength: 1 } }] }, "inverse");
    expect(has(plain, /e_head/, C)).toBe(true);
  });
});
