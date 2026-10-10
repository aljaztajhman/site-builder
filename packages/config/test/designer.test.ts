import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/index.ts";

describe("designer switch", () => {
  it("is off: the studio pipeline stays off for new sites until the owner's blind A/B passes", () => {
    expect(loadConfig().designer.agent).toBe(false);
  });
});