/**
 * Design 5 Wave P, unit P1 (docs/plans/phase-layout-variety.md "Wave P", docs/plans/design-direction-2026-10.md §2): the
 * vocabulary the eight first-screen structures need, added without a spec version bump (optional fields and new enum
 * values only). The renderer's side is in packages/components/test/composed-structures*.test.ts.
 *
 * 1. minHeight "tall"  2. image crop "thirds"  3. phone span "tile"  4. bleedY on an image  5. shiftX ±3 (overlap)
 * 6. the phone photo ribbon needs no new vocabulary (renderer only).
 */
import { describe, expect, it } from "vitest";
import {
  BLEED_Y_KINDS,
  COMPOSED_LAYOUT_KEYS,
  ComposedProps,
  ImageElement,
  Place,
  PhonePlace,
  REACH_SHIFT,
  TILE_KINDS,
  deskColumns,
  repairComposition,
  validateComposition,
  type Colors,
  type CompositionContext,
} from "../src/index.ts";
import { composed, decor, has, heading, issue, photo, repairPath, text } from "./helpers/composed.ts";

const PALETTE: Colors = {
  background: "#ffffff",
  surface: "#eef0f3",
  text: "#15181c",
  muted: "#4a525c",
  primary: "#15181c",
  onPrimary: "#ffffff",
  accent: "#b38f00",
  border: "#d9dee4",
  inverse: "#15181c",
  onInverse: "#f5f5f5",
  band: "#ffcc00",
  onBand: "#15181c",
};
const C: CompositionContext = { colors: PALETTE, imageIds: new Set(["img_01", "img_02", "img_03"]) };

const minimal = (more: Record<string, unknown> = {}) => ({
  intent: "hero",
  width: "full",
  rows: 1,
  elements: [{ id: "e_h", kind: "heading", text: "Kruh vsak dan", level: 1, size: 5, desk: { col: 1, span: 6, row: 1 }, phone: { order: 0, span: "full" } }],
  ...more,
});

describe("schema: the new vocabulary is additive", () => {
  it("1. minHeight takes \"tall\" beside the old values, and nothing else new", () => {
    for (const minHeight of ["none", "s", "m", "l", "screen", "tall"]) expect(ComposedProps.safeParse(minimal({ minHeight })).success, minHeight).toBe(true);
    expect(ComposedProps.safeParse(minimal({ minHeight: "huge" })).success).toBe(false);
    expect(ComposedProps.safeParse(minimal()).success).toBe(true);
  });

  it("2. an image may crop on thirds; the field is optional and takes only \"thirds\"", () => {
    const img = { id: "e_i", kind: "image", image: "img_01", ratio: "fill", desk: { col: 7, span: 6, row: 1 }, phone: { order: 1, span: "full" } };
    expect(ImageElement.safeParse(img).success).toBe(true);
    expect(ImageElement.safeParse({ ...img, crop: "thirds" }).success).toBe(true);
    expect(ImageElement.safeParse({ ...img, crop: "golden" }).success).toBe(false);
  });

  it("3. a phone place may be a tile", () => {
    for (const span of ["full", "inset", "half", "bleed", "tile"]) expect(PhonePlace.safeParse({ order: 0, span }).success, span).toBe(true);
    expect(PhonePlace.safeParse({ order: 0, span: "quarter" }).success).toBe(false);
  });

  it("5. shiftX runs −3 to 3 (60 px); shiftY keeps −3 to 3", () => {
    for (const shiftX of [-3, -2, 0, 2, 3]) expect(Place.safeParse({ col: 1, span: 6, row: 1, shiftX }).success, String(shiftX)).toBe(true);
    for (const shiftX of [-4, 4]) expect(Place.safeParse({ col: 1, span: 6, row: 1, shiftX }).success, String(shiftX)).toBe(false);
    expect(Place.safeParse({ col: 1, span: 6, row: 1, shiftY: 4 }).success).toBe(false);
  });
});

describe("4. bleedY on an image", () => {
  it("is allowed for an image (it reaches the section's edge) and still refused for text", () => {
    expect(BLEED_Y_KINDS.has("image")).toBe(true);
    const s = composed([heading("e_h", { col: 1, span: 5, row: 1 }, 0), photo("e_a", { col: 7, span: 6, row: 1, rowSpan: 3, bleedY: "top" }, 1), photo("e_b", { col: 1, span: 5, row: 2, rowSpan: 2, bleedY: "bottom" }, 2, "img_02")]);
    expect(has(s, /can't bleed past the section/, C)).toBe(false);
    const t = composed([heading("e_h", { col: 1, span: 5, row: 1, bleedY: "top" }, 0)]);
    expect(issue(t, /e_h \(heading\) can't bleed past the section/, C)).toMatchObject({ code: "structure", path: "/props/elements/0/desk/bleedY" });
  });

  it("reaches the top only from row 1 and the bottom only from the last row (else it would cover the rows between); repair drops it", () => {
    // Rows = 3. An image in row 2 reaching the top would cover row 1's heading.
    const top = composed([heading("e_h", { col: 1, span: 12, row: 1 }, 0), photo("e_p", { col: 7, span: 6, row: 2, rowSpan: 2, bleedY: "top" }, 1)]);
    expect(issue(top, /e_p reaches the section's top but doesn't start in row 1/, C)).toMatchObject({ code: "structure", path: "/props/elements/1/desk/bleedY" });
    const r = repairComposition(top, C);
    expect(r.repairs.map(repairPath)).toEqual(["/props/elements/1/desk/bleedY"]);
    expect(r.section.props.elements[1]!.desk.bleedY).toBeUndefined();
    const bottom = composed([heading("e_h", { col: 1, span: 6, row: 3 }, 1), photo("e_p", { col: 7, span: 6, row: 1, rowSpan: 2, bleedY: "bottom" }, 0)]);
    expect(issue(bottom, /e_p reaches the section's bottom but doesn't end in row 3/, C)).toMatchObject({ path: "/props/elements/1/desk/bleedY" });
    expect(has(composed([photo("e_p", { col: 7, span: 6, row: 2, rowSpan: 2, bleedY: "bottom" }, 0), heading("e_h", { col: 1, span: 6, row: 1 }, 1)]), /reaches the section/, C)).toBe(false);
    // Decor keeps passing the edge from any row, as before.
    expect(has(composed([heading("e_h", { col: 1, span: 6, row: 1 }, 0), decor("e_d", { col: 7, span: 6, row: 2, bleedY: "top" }, 1)]), /bleed|reaches/, C)).toBe(false);
  });

  it("crop is layout, not copy: never sent for translation", () => {
    expect(COMPOSED_LAYOUT_KEYS.has("crop")).toBe(true);
  });
});

describe("3. phone tiles (G12)", () => {
  const tile = { span: "tile" as const };
  const mosaic = (first: ReturnType<typeof heading>) => composed([first, photo("e_a", { col: 7, span: 6, row: 1, rowSpan: 2 }, 1, "img_01", tile), photo("e_b", { col: 1, span: 6, row: 2 }, 2, "img_02", tile), photo("e_c", { col: 7, span: 6, row: 3 }, 3, "img_03", tile)]);
  const headTile = (rest: Record<string, unknown>) => {
    const h = heading("e_h", { col: 1, span: 6, row: 1 }, 0, rest);
    (h.phone as { span: string }).span = "tile";
    return h;
  };

  it("accepts photo tiles and a headline tile on its own ground (fill)", () => {
    expect(TILE_KINDS.has("image") && TILE_KINDS.has("heading")).toBe(true);
    expect(has(mosaic(headTile({ fill: "primary", color: "onPrimary" })), /phone tile/, C)).toBe(false);
  });

  it("refuses a headline tile with no ground of its own (its words would touch the screen's edge), repaired to half", () => {
    const s = mosaic(headTile({}));
    expect(issue(s, /e_h \(heading\) is a phone tile with words and needs its own ground \(fill\)/, C)).toMatchObject({ code: "structure", path: "/props/elements/0/phone/span" });
    const r = repairComposition(s, C);
    expect(r.repairs.map(repairPath)).toContain("/props/elements/0/phone/span");
    expect(r.section.props.elements[0]!.phone.span).toBe("half");
  });

  it("refuses running text as a tile, repaired to full (text is never half width on phones)", () => {
    const t = text("e_t", { col: 1, span: 6, row: 1 }, 0, { fill: "surface" });
    (t.phone as { span: string }).span = "tile";
    const s = composed([t, photo("e_a", { col: 7, span: 6, row: 1 }, 1, "img_01", tile)]);
    expect(issue(s, /e_t \(text\) can't be a phone tile/, C)).toMatchObject({ path: "/props/elements/0/phone/span" });
    expect(repairComposition(s, C).section.props.elements[0]!.phone.span).toBe("full");
  });
});

describe("5. a split headline over the photo's edge (shiftX 3)", () => {
  const split = (shiftX: number | undefined, layer?: number, scrim?: number) =>
    composed(
      [
        heading("e_h", { col: 1, span: 6, row: 1, rowSpan: 2, ...(shiftX === undefined ? {} : { shiftX }), ...(layer === undefined ? {} : { layer }) }, 0, { size: 2 }),
        photo("e_p", { col: 7, span: 6, row: 1, rowSpan: 3, bleedX: "end" }, 1, "img_01", {}, scrim === undefined ? {} : { scrim: { role: "inverse", strength: scrim } }),
      ],
      {},
      "inverse",
    );

  it("counts the next column as covered from REACH_SHIFT steps, both ways; smaller shifts as before", () => {
    expect(REACH_SHIFT).toBe(3);
    expect(deskColumns({ col: 1, span: 6, shiftX: 3 })).toEqual({ c0: 1, c1: 7 });
    expect(deskColumns({ col: 7, span: 6, shiftX: -3 })).toEqual({ c0: 6, c1: 12 });
    expect(deskColumns({ col: 1, span: 6, shiftX: 2 })).toEqual({ c0: 1, c1: 6 });
    expect(deskColumns({ col: 7, span: 6, shiftX: 3 })).toEqual({ c0: 7, c1: 12 });
  });

  it("G26: the shifted headline lies over the photo, so it must be on a higher layer (repaired by raising it)", () => {
    expect(issue(split(3), /e_h \(heading\) shares desktop cells with e_p \(layer 0\) and must be on a higher layer/, C)).toMatchObject({ path: "/props/elements/0/desk/layer" });
    expect(repairComposition(split(3), C).section.props.elements[0]!.desk.layer).toBe(1);
    expect(has(split(3, 1), /higher layer/, C)).toBe(false);
    // Unchanged: no shift, or a shift of 2 (it stays in the gutter by the old rule), is not over the photo.
    expect(has(split(undefined), /higher layer/, C)).toBe(false);
    expect(has(split(2), /higher layer/, C)).toBe(false);
  });

  it("G3: over an image with a scrim, the shifted headline's contrast is checked and the scrim raised", () => {
    expect(issue(split(3, 1, 1), /e_h over the photo fails contrast/, C)).toMatchObject({ code: "design", path: "/props/elements/1/scrim" });
    const r = repairComposition(split(3, 1, 1), C);
    expect(r.repairs.map(repairPath)).toEqual(["/props/elements/1/scrim/strength"]);
    expect(has(r.section, /over the photo/, C)).toBe(false);
    expect(has(split(undefined, 1, 1), /over the photo/, C)).toBe(false);
  });

  it("text never overlaps text: a headline shifted 3 steps toward a paragraph two columns away is caught", () => {
    const s = composed([heading("e_h", { col: 1, span: 6, row: 1, shiftX: 3 }, 0), text("e_t", { col: 9, span: 4, row: 1 }, 1)]);
    expect(has(s, /e_t overlaps e_h on desktop; text never overlaps text/, C)).toBe(true);
  });

  it("validateComposition passes the whole split once the layer is right", () => {
    expect(validateComposition(split(3, 1), C)).toEqual([]);
  });
});
