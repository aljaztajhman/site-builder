import { describe, expect, it } from "vitest";
import { validateSite } from "@sb/spec";
import { composeFromBase, composeHomepageDetailed, composerFixture, fittingStances, inventory, studioShortlist } from "../src/index.ts";

/**
 * Studio 0.5 (docs/plans/studio-0.5.md): the composer over any base spec with a director's choice. The fixture path is a
 * thin wrapper over it (composer.test.ts holds its behaviour; it is byte-identical to before the generalisation).
 */
describe("composeFromBase", () => {
  const fx = composerFixture("instalacije-rebernik");
  const stance = fittingStances("instalacije-rebernik")[0]!.id;

  it("without a choice and with the fixture's slug, is exactly the fixture page", () => {
    const a = composeHomepageDetailed({ fixtureId: "instalacije-rebernik", stance, seed: 3, catalogue: "approved" });
    const b = composeFromBase({ base: fx.base, sources: fx.sources, stance, seed: 3, catalogue: "approved", tradeWord: fx.tradeWord!, label: "instalacije-rebernik", fixture: { slug: a.spec.slug } });
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it("follows the choice: the presets in its order (an intent twice), its palette and pairing, per-section copy; keeps slug and logo", () => {
    const s = studioShortlist(fx.base, fx.sources, fx.tradeWord);
    const story = s.presets.story!;
    const choice = {
      palette: s.palettes.at(-1)!.id,
      pairing: s.pairings.at(-1)!.id,
      sections: [
        { intent: "hero", preset: s.presets.hero!.at(-1)!.id, copy: { headline: "Toplo doma, brez skrbi" } },
        { intent: "services", preset: s.presets.services![0]!.id },
        { intent: "story", preset: story[0]!.id, copy: { headline: "Prva zgodba" } },
        { intent: "story", preset: story[1]!.id, copy: { headline: "Druga zgodba" } },
        { intent: "contact", preset: s.presets.contact![0]!.id },
      ],
    };
    const r = composeFromBase({ base: fx.base, sources: fx.sources, stance, seed: 9, catalogue: "approved", tradeWord: fx.tradeWord!, choice });
    expect(validateSite(r.spec).ok).toBe(true);
    expect(r.spec.slug).toBe(fx.base.slug);
    expect(r.used.palette).toBe(choice.palette);
    expect(r.used.pairing).toBe(choice.pairing);
    const placed = choice.sections.map((c) => c.preset).filter((p) => r.used.presets.includes(p));
    expect(placed.length).toBeGreaterThanOrEqual(4);
    expect(r.used.presets[0]).toBe(choice.sections[0]!.preset);
    const home = r.spec.pages.find((p) => p.kind === "home")!;
    expect(new Set(home.sections.map((x) => x.id)).size).toBe(home.sections.length);
    expect(JSON.stringify(home.sections[0]!.props)).toContain("Toplo doma, brez skrbi");
    for (const id of r.used.presets) if (!id.startsWith("kept:")) expect(inventory().byId(id)?.status, id).toBe("approved");
  });

  it("falls back to its own pick for an id outside the catalogue, and records it", () => {
    const r = composeFromBase({
      base: fx.base,
      sources: fx.sources,
      stance,
      seed: 2,
      catalogue: "approved",
      tradeWord: fx.tradeWord!,
      choice: { palette: "palette/no-such", sections: [{ intent: "hero", preset: "composition/hero/no-such" }, { intent: "services" }] },
    });
    expect(validateSite(r.spec).ok).toBe(true);
    expect(r.used.fallbacks).toEqual(expect.arrayContaining(["palette palette/no-such", "hero composition/hero/no-such"]));
    expect(r.used.presets[0]).toMatch(/^composition\/hero\//);
  });
});
