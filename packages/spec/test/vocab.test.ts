import { describe, expect, it } from "vitest";
import { DRAWINGS, DrawingId, ELEMENT_KINDS, LANGUAGE_VERSION, MOTIONS, MOTION_META, PRACTICAL_FACTS, REPEATABLE, VOCABS, Vocab, inVocab, type VocabKey } from "../src/index.ts";

/**
 * The vocabularies as they shipped (spec v20, F1b). Lists are APPEND-ONLY: stored sites name these values. A batch that
 * adds names appends them to the list in vocab.ts and may append them here too; removing or renaming an entry, or
 * reordering one, fails this test. Never edit an existing line to make it pass.
 */
const SHIPPED: Record<VocabKey, readonly string[]> = {
  MASKS: ["none", "arch", "circle", "cut", "stamp", "ticket"],
  IMAGE_TREATMENTS: ["none", "duotone", "tint", "grain"],
  TEXTURES: ["none", "grain", "lines"],
  EDGES: ["straight", "rule", "cut", "torn", "drawing"],
  FACT_OBJECTS: ["numeral", "plate", "stamp", "ticket", "seal", "tag"],
  TYPE_TREATMENTS: ["none", "stacked", "knockout"],
  MOTIONS: ["reveal", "unmask"],
  WORDMARK_STYLES: ["plain"],
  DRAWINGS: ["motif/bakery/wheat-ear-line", "ornament/rope-line"],
  REPEATABLE: ["ornament/rope-line"],
  PRACTICAL_FACTS: [
    "parking",
    "free-parking",
    "bike-parking",
    "ev-charging",
    "public-transport",
    "wheelchair",
    "step-free",
    "accessible-toilet",
    "lift",
    "card",
    "contactless",
    "cash-only",
    "invoice",
    "gift-voucher",
    "wifi",
    "toilets",
    "baby-change",
    "kids-welcome",
    "play-corner",
    "pets-welcome",
    "no-pets",
    "terrace",
    "garden",
    "air-con",
    "takeaway",
    "delivery",
    "home-visits",
    "pickup-service",
    "emergency",
    "appointment-only",
    "walk-ins",
    "online-booking",
    "phone-booking",
    "vegetarian",
    "vegan",
    "gluten-free",
    "local-produce",
    "english",
    "german",
    "italian",
  ],
};

describe("vocabularies (spec v20)", () => {
  it("are append-only: every shipped list is a prefix of today's, in order", () => {
    expect(Object.keys(VOCABS).sort()).toEqual(Object.keys(SHIPPED).sort());
    for (const key of Object.keys(SHIPPED) as VocabKey[]) {
      const now = VOCABS[key] as readonly string[];
      expect(now.slice(0, SHIPPED[key].length), key).toEqual(SHIPPED[key]);
    }
  });

  it("hold valid, unique names that their own fields accept", () => {
    for (const key of Object.keys(VOCABS) as VocabKey[]) {
      const list = VOCABS[key] as readonly string[];
      expect(new Set(list).size, key).toBe(list.length);
      const schema = key === "DRAWINGS" || key === "REPEATABLE" ? DrawingId : Vocab(key);
      for (const name of list) expect(schema.safeParse(name).success, `${key}: ${name}`).toBe(true);
    }
  });

  it("keep their invariants: repeatable drawings are drawings, practical facts are the fixed 40, motions are described", () => {
    for (const d of REPEATABLE) expect(DRAWINGS as readonly string[]).toContain(d);
    expect(PRACTICAL_FACTS.length).toBe(40);
    expect(Object.keys(MOTION_META).sort()).toEqual([...MOTIONS].sort());
    for (const m of MOTIONS) for (const t of MOTION_META[m].targets) expect(ELEMENT_KINDS as readonly string[]).toContain(t);
    expect(inVocab("MASKS", "arch")).toBe(true);
    expect(inVocab("MASKS", "blob")).toBe(false);
    expect(LANGUAGE_VERSION).toBe(2);
  });

  it("take any well-formed name in the schema (membership is the guard's), and reject malformed ones", () => {
    const mask = Vocab("MASKS");
    expect(mask.safeParse("future-mask-2").success).toBe(true);
    for (const bad of ["", "Arch", "arch ", "arch_1", "-arch", "arch-", "a--b", "x".repeat(41), 3]) expect(mask.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    // The schema still lists the shipped names, as a z.enum did (inventory sources read `.options`).
    expect(mask.options).toBe(VOCABS.MASKS);
    for (const ok of ["motif/bakery/wheat-ear-line", "ornament/rope-line", "motif/x"]) expect(DrawingId.safeParse(ok).success, ok).toBe(true);
    for (const bad of ["icon/line/parking", "motif", "motif/", "motif/a/b/c", "Motif/a", "ornament/a b"]) expect(DrawingId.safeParse(bad).success, bad).toBe(false);
  });
});
