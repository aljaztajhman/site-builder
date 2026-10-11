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

  it("the director is a priced stage with its own per-run cap", () => {
    const c = loadConfig();
    expect(c.pricesUsdPerMTok[c.models.director.model]).toBeDefined();
    expect(c.studio.perRunMaxEur).toBe(0.4);
  });
});
