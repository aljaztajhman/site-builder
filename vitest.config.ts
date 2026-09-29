import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.{ts,tsx}", "apps/*/test/**/*.test.{ts,tsx}", "tools/*/test/**/*.test.{ts,tsx}"],
    // Unit tests must never reach the network; see test/setup.ts.
    setupFiles: ["./test-setup.ts"],
    testTimeout: 30_000,
    pool: "threads",
  },
});
