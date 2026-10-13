import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { configDefaults } from "vitest/config";
import config, { SLOW_MARKER, slowFiles, testFiles } from "../../../vitest.config.ts";

/** The fast/slow split in vitest.config.ts (docs/dev/agent-team.md, "Test tiers"): every test file in exactly one tier. */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const projects = (config.test?.projects ?? []) as { test: { name: string; include?: string[]; exclude?: string[] } }[];
// Spelled in two parts so this file doesn't carry the marker itself.
const MARKER_LINE = "// @module-" + "tag slow";
const project = (name: string) => projects.find((p) => p.test.name === name)!.test;

describe("test tiers", () => {
  it("finds the test files and a slow tier in them", () => {
    expect(testFiles.length).toBeGreaterThan(200);
    expect(slowFiles.length).toBeGreaterThan(0);
    expect(slowFiles.every((f) => testFiles.includes(f))).toBe(true);
  });

  it("puts exactly the files with the marker in slow, the marker on their first line", () => {
    const marked = testFiles.filter((f) => SLOW_MARKER.test(readFileSync(path.join(root, f), "utf8")));
    expect(slowFiles).toEqual(marked);
    for (const f of slowFiles) expect(readFileSync(path.join(root, f), "utf8").split(/\r?\n/)[0], f).toBe(MARKER_LINE);
  });

  it("has two projects: fast is every test file but the slow ones, slow is only those", () => {
    expect(projects.map((p) => p.test.name)).toEqual(["fast", "slow"]);
    // No root include: with `extends: true` it would be concatenated into each project's.
    expect(config.test?.include).toBeUndefined();
    const fast = project("fast");
    const slow = project("slow");
    expect(fast.include).toEqual(["packages/*/test/**/*.test.{ts,tsx}", "apps/*/test/**/*.test.{ts,tsx}", "tools/*/test/**/*.test.{ts,tsx}"]);
    expect(fast.exclude).toEqual([...configDefaults.exclude, ...slowFiles]);
    expect(slow.include).toEqual(slowFiles);
    expect(slow.exclude).toBeUndefined();
    expect(config.test?.tags?.map((t) => t.name)).toEqual(["slow"]);
  });

  it("keeps this guard in the fast tier", () => {
    expect(slowFiles).not.toContain("tools/eval/test/test-tiers.test.ts");
    expect(testFiles).toContain("tools/eval/test/test-tiers.test.ts");
  });
});
