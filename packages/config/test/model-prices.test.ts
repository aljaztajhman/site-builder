import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AppConfigSchema, costEur, loadConfig, priceCard, repoRoot } from "../src/index.ts";

const config = loadConfig();
const HAIKU = "claude-haiku-5-5";
const usage = (input: number, output: number, cacheWrite = 0, cacheRead = 0) => ({ input_tokens: input, output_tokens: output, cache_creation_input_tokens: cacheWrite, cache_read_input_tokens: cacheRead });

describe("model prices (design studio M1)", () => {
  it("prices Haiku 5.5 at its base card for a prompt up to 100K tokens", () => {
    // 100K input exactly is not above the threshold: $0.10 / $0.50 per MTok.
    expect(costEur(config, HAIKU, usage(100_000, 10_000))).toBeCloseTo(((100_000 * 0.1 + 10_000 * 0.5) / 1e6) * config.eurPerUsd, 12);
  });

  it("prices the whole call at the long-prompt card once the prompt (cache reads and writes included) is over 100K", () => {
    expect(costEur(config, HAIKU, usage(150_000, 10_000))).toBeCloseTo(((150_000 * 0.5 + 10_000 * 2.5) / 1e6) * config.eurPerUsd, 12);
    // 10K uncached + 5K written + 90K read = 105K prompt tokens: every rate is the long card's.
    const long = ((10_000 * 0.5 + 1_000 * 2.5 + 5_000 * 0.625 + 90_000 * 0.05) / 1e6) * config.eurPerUsd;
    expect(costEur(config, HAIKU, usage(10_000, 1_000, 5_000, 90_000))).toBeCloseTo(long, 12);
    expect(priceCard(config, HAIKU, 100_001).input).toBe(0.5);
    expect(priceCard(config, HAIKU, 100_000).input).toBe(0.1);
    // Batch discount applies on top.
    expect(costEur(config, HAIKU, usage(150_000, 0), true)).toBeCloseTo(((150_000 * 0.5) / 1e6) * config.eurPerUsd * config.batchPriceFactor, 12);
  });

  it("keeps every other model's price exactly as before, at any prompt length", () => {
    for (const model of ["claude-haiku-4-5-20251001", "claude-sonnet-5-5", "claude-opus-5-5"]) {
      const p = config.pricesUsdPerMTok[model]!;
      expect(p.longPrompt).toBeUndefined();
      const u = usage(900_000, 20_000, 3_000, 400_000);
      const before = ((u.input_tokens * p.input + u.output_tokens * p.output + u.cache_creation_input_tokens * p.cacheWrite5m + u.cache_read_input_tokens * p.cacheRead) / 1e6) * config.eurPerUsd;
      expect(costEur(config, model, u)).toBe(before);
    }
  });

  it("runs no stage on Haiku 5.5: the bake-off decides that", () => {
    expect(Object.values(config.models).map((m) => m.model)).not.toContain(HAIKU);
    expect(config.modelTraits?.[HAIKU]).toMatchObject({ thinkingDefaultOn: true, minMaxTokens: 2048, defaultEffort: "medium", refusalRetryModel: "claude-opus-5-5" });
    expect(config.pricesUsdPerMTok[config.modelTraits![HAIKU]!.refusalRetryModel!]).toBeDefined();
  });

  it("rejects a model that thinks by default without a max_tokens floor", () => {
    const raw = JSON.parse(readFileSync(path.join(repoRoot, "config/app.config.json"), "utf8")) as { modelTraits: Record<string, Record<string, unknown>> };
    expect(AppConfigSchema.safeParse(raw).success).toBe(true);
    delete raw.modelTraits[HAIKU]!.minMaxTokens;
    expect(AppConfigSchema.safeParse(raw).success).toBe(false);
  });
});
