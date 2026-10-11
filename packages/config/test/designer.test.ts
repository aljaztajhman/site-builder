import { describe, expect, it } from "vitest";
import { AppConfigSchema, loadConfig } from "../src/index.ts";

describe("designer switch", () => {
  it("is on trial (studio 0.5): only DESIGNER_TRIAL_EMAILS accounts get the studio until the owner's blind A/B passes", () => {
    expect(loadConfig().designer.agent).toBe("trial");
  });

  it("reads the old boolean as off / on, and refuses anything else", () => {
    const raw = structuredClone(loadConfig()) as unknown as { designer: { agent: unknown } };
    const parse = (agent: unknown) => AppConfigSchema.safeParse({ ...raw, designer: { ...raw.designer, agent } });
    expect(parse(false).data?.designer.agent).toBe("off");
    expect(parse(true).data?.designer.agent).toBe("on");
    expect(parse("trial").data?.designer.agent).toBe("trial");
    expect(parse("maybe").success).toBe(false);
  });

  it("the director, the art director and the rebuild are priced stages under one per-run cap", () => {
    const c = loadConfig();
    for (const s of [c.models.director, c.models.artDirector, c.models.rebuild]) expect(c.pricesUsdPerMTok[s.model]).toBeDefined();
    // Studio 0.5b: art director + mockup + rebuild, then the picker's director if it falls back.
    expect(c.studio.perRunMaxEur).toBe(0.9);
  });

  it("the mockup pipeline: on by default, its image models priced in imageGen.models", () => {
    const c = loadConfig();
    expect(c.studio.mode).toBe("mockup");
    const m = c.imageGen.models[c.studio.mockup.model]!;
    expect(m.endpoint).toBe("openai/gpt-image-2.5/flare/edit");
    expect(m.usdPerImage ?? m.usdPerMegapixel).toBeGreaterThan(0);
    expect(c.imageGen.models[c.studio.mockup.textModel]).toBeDefined();
    expect([c.studio.mockup.width, c.studio.mockup.height, c.studio.mockup.quality]).toEqual([1536, 1024, "high"]);
  });
});
