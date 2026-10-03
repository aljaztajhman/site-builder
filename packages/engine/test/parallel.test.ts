import { describe, expect, it } from "vitest";
import { mapLimit } from "../src/parallel.ts";

describe("mapLimit", () => {
  it("keeps input order and never runs more than the limit at once", async () => {
    let running = 0;
    let peak = 0;
    const out = await mapLimit([30, 5, 20, 1, 10, 2, 15], 3, async (ms, i) => {
      peak = Math.max(peak, ++running);
      await new Promise((r) => setTimeout(r, ms));
      running--;
      return `${i}:${ms}`;
    });
    expect(out).toEqual(["0:30", "1:5", "2:20", "3:1", "4:10", "5:2", "6:15"]);
    expect(peak).toBe(3);
  });

  it("handles no items and rejects on the first failure", async () => {
    expect(await mapLimit([], 8, async () => 1)).toEqual([]);
    await expect(mapLimit([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error("put failed");
      return n;
    })).rejects.toThrow("put failed");
  });
});
