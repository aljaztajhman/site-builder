import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.{ts,tsx}", "apps/*/test/**/*.test.{ts,tsx}", "tools/*/test/**/*.test.{ts,tsx}"],
    // Unit tests must never reach the network; see test-setup.ts.
    setupFiles: ["./test-setup.ts"],
    testTimeout: 30_000,
    // Forks, not threads: worker threads crashed Node 24 on CI with a V8 wasm JIT check (exit 132, "Illegal instruction";
    // docs/plans/studio-phase1-review.md B2).
    pool: "forks",
  },
});
