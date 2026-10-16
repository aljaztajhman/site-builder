import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AppConfigSchema, loadConfig, repoRoot } from "../src/index.ts";

const raw = () => JSON.parse(readFileSync(path.join(repoRoot, "config/app.config.json"), "utf8")) as { outsideReview: { reviewers: Record<string, unknown>[]; pricesUsdPerMTok: Record<string, unknown> } };

const saved = process.env.APP_CONFIG_PATH;
const dirs: string[] = [];
afterEach(() => {
  if (saved === undefined) delete process.env.APP_CONFIG_PATH;
  else process.env.APP_CONFIG_PATH = saved;
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function loadFrom(c: unknown) {
  const d = mkdtempSync(path.join(tmpdir(), "cfg-"));
  dirs.push(d);
  const file = path.join(d, "app.config.json");
  writeFileSync(file, JSON.stringify(c));
  process.env.APP_CONFIG_PATH = file;
  return loadConfig(file);
}

describe("outsideReview config", () => {
  it("ships three reviewers, each with a price; the OpenRouter ones apart from the Anthropic price list", () => {
    const c = loadConfig();
    expect(c.outsideReview.provider).toBe("openrouter");
    expect(c.outsideReview.reviewers.map((r) => r.id)).toEqual(["gemini", "gpt", "claude"]);
    for (const r of c.outsideReview.reviewers) {
      expect(c.outsideReview.pricesUsdPerMTok[r.model]).toBeDefined();
      if (r.provider !== "anthropic") expect(c.pricesUsdPerMTok[r.model]).toBeUndefined();
    }
    expect(c.outsideReview.reviewers.find((r) => r.id === "claude")).toMatchObject({ provider: "anthropic", model: "claude-fable-5-1", batch: true });
  });

  it("rejects a reviewer whose model has no price", () => {
    const c = raw();
    c.outsideReview.reviewers.push({ id: "extra", model: "vendor/unpriced", maxTokens: 1000, structured: "json_object" });
    expect(() => loadFrom(c)).toThrow(/no price for vendor\/unpriced/);
  });

  it("rejects an unknown structured mode and a missing section", () => {
    const c = raw();
    c.outsideReview.reviewers[0]!.structured = "xml";
    expect(() => AppConfigSchema.parse(c)).toThrow();
    const { outsideReview: _dropped, ...rest } = raw();
    expect(() => AppConfigSchema.parse(rest)).toThrow();
  });
});
