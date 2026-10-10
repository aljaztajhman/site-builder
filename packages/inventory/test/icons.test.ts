import { describe, expect, it } from "vitest";
import { PRACTICAL_FACTS } from "@sb/spec";
import { BYTE_BUDGET, ICON_NOTES, byteBudget, iconAssets, inventory, registeredAssets, shortlist, unknownDecisionIds } from "../src/index.ts";

/** The practical-fact icon pilot (I9-p, studio-phase1-design.md §5): 40 line icons registered as drafts. */
describe("practical-fact line icons", () => {
  it("one draft icon/line/<fact> per PRACTICAL_FACTS key, each with a note, own licence, within 1 KiB", () => {
    const reg = inventory();
    expect(reg.byKind("icon").map((a) => a.id)).toEqual(PRACTICAL_FACTS.map((f) => `icon/line/${f}`));
    expect(BYTE_BUDGET.icon).toBe(1024);
    for (const fact of PRACTICAL_FACTS) {
      const a = reg.byId(`icon/line/${fact}`)!;
      expect(a, fact).toMatchObject({ kind: "icon", status: "draft", license: "own", phone: "ok" });
      expect(a.tags.mood).toEqual(["line"]);
      expect(a.note).toBe(`I9-p: ${ICON_NOTES[fact]}`);
      expect(a.bytes, fact).toBeGreaterThan(200);
      expect(a.bytes, fact).toBeLessThanOrEqual(byteBudget(a)!);
    }
  });

  it("stay out of the director's shortlist until the owner approves them", () => {
    expect(shortlist(inventory(), { trade: "bakery", limit: 1000 }).some((a) => a.kind === "icon")).toBe(false);
  });

  it("are registered, so the gallery's decisions on them merge (inventory:decide)", () => {
    expect(unknownDecisionIds(registeredAssets(), { "icon/line/parking": { status: "approved", at: "2026-10-11T08:00:00.000Z" } })).toEqual([]);
    expect(iconAssets()).toHaveLength(40);
  });
});
