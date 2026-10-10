import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  BusinessType,
  CARDS,
  Design,
  REFERENCES,
  STANCES,
  STANCE_FAMILIES,
  assetKnownToday,
  deckIssues,
  migrateSpec,
  validateSite,
  type SiteSpec,
} from "../src/index.ts";

/** The design studio's decks (design-studio.md §5) and design.seed (spec v19). */
describe("studio decks", () => {
  it("the starter decks are valid: schema, unique ids, known font pairs, assets and references", () => {
    expect(deckIssues(STANCES, CARDS, REFERENCES)).toEqual([]);
    expect(STANCES.length).toBeGreaterThanOrEqual(8);
    expect(CARDS.length).toBeGreaterThanOrEqual(8);
  });

  it("every stance's signatures name an asset that exists today or an inventory kind", () => {
    for (const s of STANCES) for (const a of s.signatures) expect(assetKnownToday(a), `${s.id} ${a}`).not.toBe(false);
    // Each stance names at least one asset that renders today, so a shortlist has something before the inventory lands.
    for (const s of STANCES) expect(s.signatures.some((a) => assetKnownToday(a) === true), s.id).toBe(true);
  });

  it("knows today's assets and refuses unknown ones of a listed kind", () => {
    expect(assetKnownToday("fact/plate")).toBe(true);
    expect(assetKnownToday("mask/arch")).toBe(true);
    expect(assetKnownToday("motif/wire")).toBe(true);
    expect(assetKnownToday("imagery/duotone")).toBe(true);
    expect(assetKnownToday("fact/hologram")).toBe(false);
    expect(assetKnownToday("mask/none")).toBe(false);
    expect(assetKnownToday("ornament/beehive-panel")).toBeUndefined();
  });

  it("finds broken stances and cards", () => {
    const good = STANCES[0]!;
    const issues = deckIssues(
      [
        { ...good, id: "a", axes: { ...good.axes, type: ["comic-sans"] } },
        { ...good, id: "b", signatures: ["fact/hologram"] },
        { ...good, id: "c", references: ["nowhere"] },
        { ...good, id: "d", trades: { fit: ["dental"], never: ["dental"] } },
        { ...good, id: "e", axes: { ...good.axes, ground: ["cream"] } },
        { ...good, id: "a" },
      ],
      [{ id: "x", text: "short" }, { id: "y", text: "A valid card text." }, { id: "y", text: "A valid card text." }],
      REFERENCES,
    );
    expect(issues).toEqual([
      "stance a: unknown font pair comic-sans",
      "stance b: unknown asset fact/hologram",
      "stance c: unknown reference nowhere",
      "stance d: dental both fits and never",
      expect.stringMatching(/^stance e: axes\.ground\.0 /),
      "stance a: duplicate id",
      expect.stringMatching(/^card x: text /),
      "card y: duplicate id",
    ]);
  });

  it("covers every family, with Slovene-rooted stances among them", () => {
    expect(new Set(STANCES.map((s) => s.family))).toEqual(new Set(STANCE_FAMILIES));
    for (const id of ["trail-marker", "beehive-panel", "plecnik-classicism", "karst-stone"]) expect(STANCES.map((s) => s.id)).toContain(id);
  });

  it("every trade has at least two stances it fits", () => {
    for (const t of BusinessType.options) {
      const fit = STANCES.filter((s) => !s.trades.never.includes(t) && (s.trades.fit.includes(t) || s.trades.fit.includes("*")));
      expect(fit.length, t).toBeGreaterThanOrEqual(2);
    }
  });

  it("stances are visual only: no years, no 'since', no claims", () => {
    for (const s of STANCES) {
      const words = `${s.pitch} ${s.avoid}`;
      expect(words, s.id).not.toMatch(/\b(1[89]\d{2}|20\d{2})\b|\bsince\b|\baward|\bcertified|\bbest\b|\btradition(al)? since/i);
    }
  });

  it("the references are the templates in docs/design/templates/templates.json", () => {
    const json = JSON.parse(readFileSync(new URL("../../../docs/design/templates/templates.json", import.meta.url), "utf8")) as { templates: { id: string; name: string }[] };
    const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
    expect(REFERENCES.map((r) => [r.template, r.name, r.id]).sort()).toEqual(json.templates.map((t) => [t.id, t.name, fold(t.name)]).sort());
  });
});

describe("design.seed (spec v19)", () => {
  it("takes 6 to 12 lowercase base-36 characters", () => {
    expect(Design.shape.seed.safeParse("0a1b2c").success).toBe(true);
    expect(Design.shape.seed.safeParse("abcdefghijkl").success).toBe(true);
    for (const bad of ["abc", "ABCDEF", "abc-def", "abcdefghijklm"]) expect(Design.shape.seed.safeParse(bad).success, bad).toBe(false);
  });

  it("is optional: a v18 spec migrates and validates without it, and a v19 spec with one validates", () => {
    const golden = JSON.parse(readFileSync(new URL("../../../tools/eval/golden/avtoservis-mrak.json", import.meta.url), "utf8")) as unknown;
    const spec = migrateSpec(golden);
    expect(spec.design.seed).toBeUndefined();
    const withSeed: SiteSpec = { ...spec, design: { ...spec.design, seed: "k3x9q2a" } };
    const r = validateSite(withSeed);
    expect(r.ok, JSON.stringify(r)).toBe(true);
  });
});
