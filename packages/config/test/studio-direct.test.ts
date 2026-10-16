import { describe, expect, it } from "vitest";
import { AppConfigSchema, loadConfig } from "../src/index.ts";

/** Studio "direct" (the Fable studio, .claude/plans/studio-shootout.md unit 1): no image model, Fable composes the page. */
const FABLE = "claude-fable-5-1";

describe("studio.mode direct", () => {
  it("accepts mockup, picker and direct; refuses anything else; mockup when unset", () => {
    const raw = structuredClone(loadConfig()) as unknown as { studio: Record<string, unknown> };
    const parse = (mode: unknown) => AppConfigSchema.safeParse({ ...raw, studio: { ...raw.studio, mode } });
    for (const mode of ["mockup", "picker", "direct"]) expect(parse(mode).data?.studio.mode).toBe(mode);
    expect(parse("fable").success).toBe(false);
    const { mode: _drop, ...rest } = raw.studio;
    expect(AppConfigSchema.safeParse({ ...raw, studio: rest }).data?.studio.mode).toBe("mockup");
    expect(loadConfig().studio.mode).toBe("mockup");
  });

  it("runs its two stages on Fable 5.1 at medium effort, priced, thinking room in maxTokens", () => {
    const c = loadConfig();
    expect(c.models.artDirectorDirect).toEqual({ model: FABLE, effort: "medium", maxTokens: 8000 });
    expect(c.models.composeDirect).toEqual({ model: FABLE, effort: "medium", maxTokens: 24000 });
    expect(c.pricesUsdPerMTok[FABLE]).toMatchObject({ input: 10, output: 50 });
    // Fable thinks on every call and the thinking counts toward max_tokens.
    expect(c.modelTraits?.[FABLE]).toMatchObject({ thinkingDefaultOn: true });
    expect(c.modelTraits![FABLE]!.minMaxTokens).toBeLessThanOrEqual(c.models.artDirectorDirect.maxTokens);
    expect(c.studio.direct.timeoutSeconds).toBeGreaterThan(0);
    // Its own cap: the mockup path's (the live trial's) stays where it was.
    expect(c.studio.direct.perRunMaxEur).toBe(1.8);
    expect(c.studio.perRunMaxEur).toBe(0.9);
  });
});
