import { describe, expect, it } from "vitest";
import { MOTIONS, MOTION_META } from "@sb/spec";
import { STARTER_NAMES, vocabCoverage } from "@sb/render";
import { byteBudget, inventory, motionAssets } from "../src/index.ts";

/** The motion presets beyond the starters (I7a, I7b): one draft asset each, measured on its own partial. */
describe("motion assets", () => {
  const added = MOTIONS.filter((m) => !STARTER_NAMES.motion.includes(m));

  it("every preset beyond the starters is a registered draft motion/<name>, and nothing else is", () => {
    expect(added).toEqual(["rise", "wipe", "stagger", "drift-bg", "headline-reveal", "photo-unmask", "counter", "sticky-stack"]);
    expect(motionAssets().map((a) => a.id)).toEqual(added.map((m) => `motion/${m}`));
    for (const a of motionAssets()) {
      expect(a.status).toBe("draft");
      expect(inventory().byId(a.id)?.kind).toBe("motion");
    }
  });

  it("each has a partial (the registration check) and weighs under the motion byte budget", () => {
    expect(vocabCoverage("motion")).toEqual({ missing: [], orphans: [] });
    for (const a of motionAssets()) {
      expect(a.bytes, a.id).toBeGreaterThan(0);
      expect(a.bytes, a.id).toBeLessThanOrEqual(byteBudget(a)!);
    }
  });

  it("tags carry the kind and the lowest level from MOTION_META", () => {
    for (const a of motionAssets()) {
      const meta = MOTION_META[a.id.slice("motion/".length) as keyof typeof MOTION_META];
      expect(a.tags.mood).toEqual([meta.kind, meta.minLevel]);
    }
  });
});
