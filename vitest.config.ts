import { globSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

const include = ["packages/*/test/**/*.test.{ts,tsx}", "apps/*/test/**/*.test.{ts,tsx}", "tools/*/test/**/*.test.{ts,tsx}"];

// Test tiers (docs/dev/agent-team.md, "Test tiers"). A test file whose source carries `// @module-tag slow` (first
// line by convention) is in the `slow` project; every other file is in `fast`. `pnpm test` runs fast, `pnpm test:slow`
// runs slow (CI runs both), `pnpm test:all` runs everything. The slow files are excluded from fast by path, not by
// --tags-filter, so the fast run never imports them. Same regex as vitest's own module-tag parser.
export const SLOW_MARKER = /(\/\/|\*)\s*@module-tag\s+slow\b/;
const root = dirname(fileURLToPath(import.meta.url));
export const testFiles = globSync(include, { cwd: root })
  .map((file) => file.replaceAll("\\", "/"))
  .sort();
export const slowFiles = testFiles.filter((file) => SLOW_MARKER.test(readFileSync(`${root}/${file}`, "utf8")));

export default defineConfig({
  test: {
    // No root `include`: projects with `extends: true` concatenate arrays with the root's, so each project sets its own.
    // Unit tests must never reach the network; see test-setup.ts.
    setupFiles: ["./test-setup.ts"],
    testTimeout: 30_000,
    // Forks, not threads: worker threads crashed Node 24 on CI with a V8 wasm JIT check (exit 132, "Illegal instruction";
    // docs/plans/studio-phase1-review.md B2).
    pool: "forks",
    tags: [{ name: "slow", description: "Launches a browser or replays a generation and takes seconds; CI's test-slow job runs it." }],
    projects: [
      { extends: true, test: { name: "fast", include, exclude: [...configDefaults.exclude, ...slowFiles] } },
      { extends: true, test: { name: "slow", include: slowFiles } },
    ],
  },
});
