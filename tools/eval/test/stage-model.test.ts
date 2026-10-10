import { describe, expect, it } from "vitest";
import { loadConfig, type AppConfig } from "@sb/config";
import { requestHash, type ModelRequest } from "@sb/engine";
import { applyStageModels, parseStageModels, stageModelsSlug } from "../src/stage-model.ts";

const fresh = (): AppConfig => structuredClone(loadConfig());

describe("--stage-model", () => {
  it("parses repeated overrides, with and without an effort", () => {
    const o = parseStageModels(["--only", "pekarna-kvas", "--stage-model", "content=claude-haiku-5-5:low", "--stage-model", "critique=claude-haiku-5-5"], fresh());
    expect(o).toEqual([
      { stage: "content", model: "claude-haiku-5-5", effort: "low" },
      { stage: "critique", model: "claude-haiku-5-5" },
    ]);
    expect(parseStageModels(["--replay"], fresh())).toEqual([]);
  });

  it("rejects an unknown stage, an unpriced model, an unknown effort, a repeated stage and a malformed value", () => {
    const c = fresh();
    expect(() => parseStageModels(["--stage-model", "hero=claude-haiku-5-5"], c)).toThrow(/unknown stage hero/);
    expect(() => parseStageModels(["--stage-model", "content=claude-nope-1"], c)).toThrow(/no price configured for claude-nope-1/);
    expect(() => parseStageModels(["--stage-model", "content=claude-haiku-5-5:turbo"], c)).toThrow(/unknown effort turbo/);
    expect(() => parseStageModels(["--stage-model", "content=claude-haiku-5-5", "--stage-model", "content=claude-opus-5-5"], c)).toThrow(/given twice/);
    expect(() => parseStageModels(["--stage-model", "content"], c)).toThrow(/takes <stage>=<model>/);
    expect(() => parseStageModels(["--stage-model"], c)).toThrow(/takes <stage>=<model>/);
  });

  it("changes only the overridden stage, keeping its maxTokens (and effort unless given)", () => {
    const config = fresh();
    const before = structuredClone(config.models);
    applyStageModels(config, parseStageModels(["--stage-model", "critique=claude-haiku-5-5", "--stage-model", "design=claude-opus-5-5:high"], config));
    expect(config.models.critique).toEqual({ ...before.critique, model: "claude-haiku-5-5" });
    expect(config.models.design).toEqual({ ...before.design, model: "claude-opus-5-5", effort: "high" });
    for (const k of Object.keys(before) as (keyof typeof before)[]) if (k !== "critique" && k !== "design") expect(config.models[k], k).toEqual(before[k]);
  });

  it("names each setup's recordings directory apart, whatever the flag order", () => {
    const c = fresh();
    const a = stageModelsSlug(parseStageModels(["--stage-model", "critique=claude-haiku-5-5", "--stage-model", "content=claude-haiku-5-5:low"], c));
    const b = stageModelsSlug(parseStageModels(["--stage-model", "content=claude-haiku-5-5:low", "--stage-model", "critique=claude-haiku-5-5"], c));
    expect(a).toBe("content=claude-haiku-5-5@low,critique=claude-haiku-5-5");
    expect(b).toBe(a);
    expect(a).not.toMatch(/[:<>"|?*\\/]/);
  });

  it("recordings never match across models: the request hash includes the model", () => {
    const req: ModelRequest = { stage: "content", system: ["sys"], messages: [{ role: "user", content: "hi" }] };
    expect(requestHash(req, "claude-haiku-5-5")).not.toBe(requestHash(req, "claude-sonnet-5-5"));
  });
});
