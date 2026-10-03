import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { SAME_COLOUR, SHOWCASES, awayFromShowcases, checkDesign, direction, enforceDesign, hexToRgb, showcaseLookalike, type Design } from "../src/index.ts";

/**
 * The landing page's trade showcase (src/showcase.ts) shows sites a client never gets: their colours
 * are not the colours the engine gives that trade, and a design that comes close is moved away.
 */
const golden = (id: string) => JSON.parse(readFileSync(new URL(`../../../tools/eval/golden/${id}.json`, import.meta.url), "utf8")) as { design: Design };
const showcaseDesign = (s: (typeof SHOWCASES)[number]): Design => ({ ...golden(s.golden).design, colors: s.colors });
const distance = (a: string, b: string) => {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};

describe("trade showcase", () => {
  it("has one entry per golden, unique ids and labels, direction and fonts as in the golden", () => {
    expect(new Set(SHOWCASES.map((s) => s.id)).size).toBe(SHOWCASES.length);
    expect(new Set(SHOWCASES.map((s) => s.label)).size).toBe(SHOWCASES.length);
    expect(new Set(SHOWCASES.map((s) => s.golden)).size).toBe(SHOWCASES.length);
    for (const s of SHOWCASES) {
      const d = golden(s.golden).design;
      expect([s.id, s.direction, s.fontPair]).toEqual([s.id, d.direction, d.fontPair]);
      expect(s.id).toMatch(/^[a-z]+$/);
    }
  });

  it("every colourway passes the design rules of its direction as it is (contrast, no cream, bands)", () => {
    for (const s of SHOWCASES) {
      const d = showcaseDesign(s);
      const dir = direction(d.direction);
      expect(checkDesign(d, dir), s.id).toEqual([]);
      expect(enforceDesign(d, dir).colors, s.id).toEqual(d.colors);
    }
  });

  it("a trade template's own palette is never a showcase's: its primary is a clearly different colour", () => {
    for (const s of SHOWCASES) {
      const dir = direction(s.direction);
      if (!dir.template) continue;
      const client: Design = { ...showcaseDesign(s), colors: { ...dir.palette.fallback } };
      expect(distance(dir.palette.fallback.primary, s.colors.primary), s.id).toBeGreaterThanOrEqual(SAME_COLOUR);
      expect(showcaseLookalike(client), s.id).toBeUndefined();
    }
    // Templates without a showcase (tablica, cevi, skorja) can't look like one: the guard only matches a showcase's direction.
    expect(SHOWCASES.filter((s) => direction(s.direction).template).length).toBeGreaterThanOrEqual(7);
  });

  it("moves a design that would look like a showcase away from it, inside its direction's rules", () => {
    for (const s of SHOWCASES) {
      const d = showcaseDesign(s);
      const dir = direction(d.direction);
      expect(showcaseLookalike(d)?.id).toBe(s.id);
      const moved = awayFromShowcases(d, dir);
      expect(showcaseLookalike(moved), s.id).toBeUndefined();
      expect(checkDesign(moved, dir), s.id).toEqual([]);
      expect(moved.fontPair).toBe(d.fontPair);
    }
  });

  it("leaves every other design as it is", () => {
    for (const s of SHOWCASES) {
      const d = showcaseDesign(s);
      const dir = direction(d.direction);
      // Another direction's fonts, or a different main colour: not a lookalike.
      const other = dir.fontPairs.find((f) => f !== d.fontPair);
      if (other) expect(awayFromShowcases({ ...d, fontPair: other }, dir)).toEqual({ ...d, fontPair: other });
    }
    const bakery = golden("pekarna-kvas").design;
    expect(awayFromShowcases(bakery, direction(bakery.direction))).toEqual(bakery);
  });
});
