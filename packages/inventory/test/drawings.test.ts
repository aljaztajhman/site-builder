import { describe, expect, it } from "vitest";
import { DRAWINGS, Drawing, REPEATABLE, STANCES, stanceFitsSubtype, type BusinessSubtype, type BusinessType } from "@sb/spec";
import { DRAWING_DATA, DRAWING_META, byteBudget, drawingAssets, drawingStyleOf, inventory, needsPatternCheck, patternCheck } from "../src/index.ts";

/**
 * The drawn inventory (spec DRAWINGS; batch I5, docs/plans/studio-phase1-design.md §4–§5): every drawing is registered
 * as a motif or ornament asset with its tags, within its byte budget; names end in their style with a matching mood;
 * stances fit the trades; ornaments say what tradition they draw on; repeatable ones pass the dot/grid detector.
 */
const assets = drawingAssets();
const stance = new Map(STANCES.map((s) => [s.id, s]));

describe("drawings in the inventory", () => {
  it("every name in DRAWINGS is registered once, as a motif or an ornament, a draft unless the owner decided", () => {
    expect(assets.map((a) => a.id)).toEqual([...DRAWINGS]);
    expect(Object.keys(DRAWING_META).sort()).toEqual([...DRAWINGS].sort());
    for (const a of assets) {
      expect(a.kind, a.id).toBe(a.id.startsWith("motif/") ? "motif" : "ornament");
      expect(a.status, a.id).toBe("draft");
      expect(a.license).toBe("own");
      expect(inventory().byId(a.id), a.id).toBeDefined();
    }
  });

  describe.each(assets.map((a) => [a.id, a] as const))("%s", (id, a) => {
    const d = DRAWING_DATA[id]!;

    it("is a valid Drawing whose style ends its name, with the style in its mood", () => {
      expect(Drawing.parse(d)).toEqual(d);
      expect(d.paths.length).toBeLessThanOrEqual(24);
      expect(drawingStyleOf(id)).toBe(d.style);
      expect(a.tags.mood).toContain(d.style);
    });

    it("stays within its kind's byte budget", () => {
      expect(a.bytes).toBeGreaterThan(0);
      expect(a.bytes).toBeLessThanOrEqual(byteBudget(a)!);
    });

    it("names real stances, each fitting at least one of its trades", () => {
      for (const s of a.tags.stances) {
        const st = stance.get(s);
        expect(st, `${id}: stance ${s}`).toBeDefined();
        if (a.tags.trades.length === 0) continue;
        const fits = a.tags.trades.some((t) => {
          const [type, sub] = t.split("/") as [BusinessType, BusinessSubtype | undefined];
          return stanceFitsSubtype(st!, type, sub);
        });
        expect(fits, `${id}: stance ${s} fits none of ${a.tags.trades.join(", ")}`).toBe(true);
      }
    });

    if (a.kind === "ornament") {
      it("says what tradition it draws on (a provenance note)", () => {
        expect(a.note).toMatch(/Provenance: \S/);
      });
    }

    if ((REPEATABLE as readonly string[]).includes(id)) {
      it("tiles along x and is not a dot grid, a lattice of crosses or grid paper (G19)", () => {
        expect(d.repeat).toBeDefined();
        expect(needsPatternCheck(a)).toBe(true);
        expect(patternCheck(a)).toEqual({ ok: true });
      });
    } else {
      it("does not tile", () => {
        expect(d.repeat).toBeUndefined();
        expect(needsPatternCheck(a)).toBe(false);
      });
    }
  });
});
