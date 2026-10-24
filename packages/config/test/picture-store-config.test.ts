import { describe, expect, it } from "vitest";
import { AppConfigSchema, loadConfig } from "../src/index.ts";

/**
 * Generated pictures are paid for before they are stored, so a refused bucket write is retried (images.storeRetries,
 * storeRetryDelayMs) before the picture counts as lost; the worker's own bucket check has its alert cooldown.
 */
describe("picture storage and worker-storage alert config", () => {
  it("loads the retry count, delay and the worker-storage cooldown", () => {
    const config = loadConfig();
    expect(config.images.storeRetries).toBe(2);
    expect(config.images.storeRetryDelayMs).toBe(500);
    expect(config.alerts.cooldownMinutes.workerStorage).toBe(60);
  });

  it("rejects a negative retry count", () => {
    const config = loadConfig();
    expect(AppConfigSchema.safeParse({ ...config, images: { ...config.images, storeRetries: -1 } }).success).toBe(false);
  });
});
