import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  BusinessType,
  CARDS,
  CARD_REQUIREMENTS,
  Design,
  REFERENCES,
  STANCES,
  STANCE_FAMILIES,
  assetKnownToday,
  deckIssues,
  migrateSpec,
  stanceFitsSubtype,
  subtypesOf,
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
        { ...good, id: "f", trades: { fit: ["dental"], never: [], subOnly: ["roofing"] } },
        { ...good, id: "a" },
      ],
      [
        { id: "x", text: "short" },
        { id: "y", text: "A valid card text." },
        { id: "y", text: "A valid card text." },
        { id: "z", text: "A valid card text too.", appliesTo: { requires: ["a-logo"] } },
      ],
      REFERENCES,
    );
    expect(issues).toEqual([
      "stance a: unknown font pair comic-sans",
      "stance b: unknown asset fact/hologram",
      "stance c: unknown reference nowhere",
      "stance d: dental both fits and never",
      expect.stringMatching(/^stance e: axes\.ground\.0 /),
      "stance f: subtype roofing of a type it doesn't fit",
      "stance a: duplicate id",
      expect.stringMatching(/^card x: text /),
      "card y: duplicate id",
      expect.stringMatching(/^card z: appliesTo\.requires\.0 /),
    ]);
  });

  it("the full decks: up to 80 stances and 50 cards (design-studio.md §5.2–5.3)", () => {
    expect(STANCES.length).toBeGreaterThanOrEqual(70);
    expect(STANCES.length).toBeLessThanOrEqual(80);
    expect(CARDS.length).toBeGreaterThanOrEqual(40);
    expect(CARDS.length).toBeLessThanOrEqual(50);
    expect(new Set(STANCES.map((s) => s.name)).size, "names").toBe(STANCES.length);
    expect(new Set(STANCES.map((s) => s.pitch)).size, "pitches").toBe(STANCES.length);
    expect(new Set(CARDS.map((c) => c.text)).size, "card texts").toBe(CARDS.length);
  });

  it("balances the families: every family present, none over a quarter of the deck", () => {
    expect(new Set(STANCES.map((s) => s.family))).toEqual(new Set(STANCE_FAMILIES));
    for (const f of STANCE_FAMILIES) {
      const n = STANCES.filter((s) => s.family === f).length;
      expect(n, f).toBeLessThanOrEqual(STANCES.length / 4);
      expect(n, f).toBeGreaterThanOrEqual(8);
    }
  });

  it("has at least 15 stances rooted in Slovene visual culture, spread over at least four families", () => {
    const sl = STANCES.filter((s) => s.slovene);
    expect(sl.length).toBeGreaterThanOrEqual(15);
    expect(new Set(sl.map((s) => s.family)).size).toBeGreaterThanOrEqual(4);
    for (const id of ["trail-marker", "beehive-panel", "plecnik-classicism", "karst-stone", "idrija-lace", "hayrack", "pisanice"]) {
      expect(sl.map((s) => s.id), id).toContain(id);
    }
  });

  it("every trade and every sub-trade has at least six stances it fits", () => {
    for (const t of BusinessType.options) {
      const fit = STANCES.filter((s) => stanceFitsSubtype(s, t));
      expect(fit.length, t).toBeGreaterThanOrEqual(6);
      // A deal of six takes at most two per family: the fitting stances must span at least three families.
      expect(new Set(fit.map((s) => s.family)).size, t).toBeGreaterThanOrEqual(3);
      for (const sub of subtypesOf(t)) expect(STANCES.filter((s) => stanceFitsSubtype(s, t, sub)).length, `${t}/${sub}`).toBeGreaterThanOrEqual(6);
    }
  });

  it("narrows by subtype: subOnly and subNever", () => {
    const tiles = STANCES.find((s) => s.id === "old-town-roofs")!;
    expect(stanceFitsSubtype(tiles, "builder", "roofing")).toBe(true);
    expect(stanceFitsSubtype(tiles, "builder", "plumbing")).toBe(false);
    expect(stanceFitsSubtype(tiles, "builder")).toBe(true);
    expect(stanceFitsSubtype(tiles, "restaurant")).toBe(true);
    expect(stanceFitsSubtype(tiles, "dental")).toBe(false);
    const packet = STANCES.find((s) => s.id === "seed-packet")!;
    expect(stanceFitsSubtype(packet, "shop", "deli")).toBe(true);
    expect(stanceFitsSubtype(packet, "shop", "boutique")).toBe(false);
  });

  it("stances are visual only: no years, no 'since', no claims", () => {
    for (const s of STANCES) {
      const words = `${s.pitch} ${s.avoid}`;
      expect(words, s.id).not.toMatch(/\b(1[89]\d{2}|20\d{2})\b|\bsince\b|\baward|\bcertified|\bbest\b|\btradition(al)? since/i);
    }
  });

  it("no pitch asks for a banned pattern (docs/PRODUCT.md); the avoid notes name them instead", () => {
    const banned = /monospace|gradient|pill|glassmorph|frosted|emoji|cream|beige|off-white (page|ground)|italic|drop shadow|eyebrow|tracked|centred|centered|dobrodošli|welcome|pure (black|white)|\b01\b|icon cards?/i;
    for (const s of STANCES) expect(s.pitch, s.id).not.toMatch(banned);
    // Cards may forbid centring ("nothing is centred"); otherwise the same list.
    for (const c of CARDS) expect(c.text.replace(/nothing is centred/g, ""), c.id).not.toMatch(banned);
    // The deck as a whole warns against the patterns each language is most tempted by.
    const avoid = STANCES.map((s) => s.avoid).join(" ");
    for (const w of [/monospace/i, /gradient/i, /pill/i, /emoji/i, /beige/i, /italic/i, /centred/i, /drop shadow/i, /tracked/i, /pure black/i, /'01'/i, /feature cards/i]) expect(avoid).toMatch(w);
  });

  it("vague pitches are refused: each names something you could draw", () => {
    const vague = /\b(modern and clean|clean and modern|sleek|elegant|professional look|timeless|stylish|premium feel|minimalist design)\b/i;
    for (const s of STANCES) expect(s.pitch, s.id).not.toMatch(vague);
  });

  it("cards: appliesTo names known trades, families and requirements; every trade can be dealt six cards today", () => {
    for (const c of CARDS) {
      if (c.appliesTo) expect(Object.keys(c.appliesTo).length, c.id).toBeGreaterThan(0);
      for (const r of c.appliesTo?.requires ?? []) expect(CARD_REQUIREMENTS, c.id).toContain(r);
    }
    const today = CARDS.filter((c) => !c.needs);
    expect(today.length).toBeGreaterThanOrEqual(36);
    for (const t of BusinessType.options) {
      for (const f of STANCE_FAMILIES) {
        const fits = today.filter((c) => (!c.appliesTo?.trades || c.appliesTo.trades.includes(t)) && (!c.appliesTo?.families || c.appliesTo.families.includes(f)));
        // Even a site with no photos, prices, hours, phone or address has six cards left.
        expect(fits.filter((c) => !c.appliesTo?.requires).length, `${t} ${f}`).toBeGreaterThanOrEqual(6);
      }
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
