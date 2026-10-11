import { describe, expect, it } from "vitest";
import { ComposedProps } from "@sb/spec";
import { fieldRect, headerGround, insideField, overPhoto, phoneRowCount, phoneRows, readingOrder, type LayerOf } from "../src/groups/composed/layout.ts";

/** Spec v20 section-level helpers of the composed renderer (docs/plans/studio-phase1-design.md §1.3, §3.4). */
const desk = (col: number, span: number, row: number, more: object = {}) => ({ col, span, row, ...more });
const text = (id: string, order: number, d: object, span = "full", hidden = false) => ({ id, kind: "text", paragraphs: ["Besedilo."], desk: d, phone: { order, span, ...(hidden ? { hidden } : {}) } });
const parse = (more: object) =>
  ComposedProps.parse({
    intent: "story",
    width: "contained",
    rows: 3,
    elements: [
      text("e_a", 0, desk(1, 6, 1)),
      text("e_b", 1, desk(1, 6, 2), "half"),
      text("e_c", 2, desk(1, 6, 3), "half"),
      text("e_d", 3, desk(8, 5, 1), "half"),
      text("e_x", 4, desk(8, 5, 2), "full", true),
      text("e_e", 5, desk(8, 5, 3)),
    ],
    ...more,
  });

describe("phoneRows", () => {
  it("places elements as the 4-column phone grid does: a half takes two columns, hidden ones none", () => {
    const p = parse({});
    const rows = phoneRows(readingOrder(p.elements));
    expect(Object.fromEntries(rows)).toEqual({ e_a: 1, e_b: 2, e_c: 2, e_d: 3, e_e: 4 });
    expect(rows.has("e_x")).toBe(false);
    expect(phoneRowCount(rows)).toBe(4);
  });
});

describe("fields", () => {
  it("default to the whole grid; an element is inside only when wholly inside", () => {
    const p = parse({ background: [{ kind: "field", role: "inverse", cols: { from: 1, to: 6 }, rows: { from: 1, to: 2 } }] });
    const f = p.background![0] as LayerOf<"field">;
    expect(fieldRect(f, 3)).toEqual({ c0: 1, c1: 6, r0: 1, r1: 2 });
    expect(fieldRect({ kind: "field", role: "band" }, 3)).toEqual({ c0: 1, c1: 12, r0: 1, r1: 3 });
    const inside = p.elements.filter((e) => insideField(e, f, 3)).map((e) => e.id);
    expect(inside).toEqual(["e_a", "e_b"]);
  });
});

describe("headerGround", () => {
  it("photo scrim > edge-to-edge top field (desktop) / field holding the first phone row (phones) > the tone's ground", () => {
    expect(headerGround(parse({ background: [{ kind: "photo", image: "img_01", scrim: { role: "primary", strength: 2 } }] }), "alt")).toEqual({ desk: "primary", phone: "primary" });
    expect(headerGround(parse({ background: [{ kind: "field", role: "band", rows: { from: 1, to: 1 } }] }))).toEqual({ desk: "band", phone: "band" });
    expect(headerGround(parse({ background: [{ kind: "field", role: "band", cols: { from: 1, to: 6 } }] }), "inverse")).toEqual({ desk: "inverse", phone: "band" });
    expect(headerGround(parse({}), "band")).toEqual({ desk: "band", phone: "band" });
    expect(headerGround(parse({}))).toEqual({ desk: "background", phone: "background" });
  });
});

describe("overPhoto", () => {
  const image = (more: object = {}) => ({ id: "e_img", kind: "image", image: "img_1", ratio: "fill", desk: desk(1, 12, 1, { rowSpan: 2 }), phone: { order: 1, span: "full" }, ...more });
  const els = (...imgs: object[]) => ComposedProps.parse({ intent: "story", width: "contained", rows: 2, elements: [text("e_t", 0, desk(2, 6, 1, { layer: 1 })), ...imgs] }).elements;

  it("backs text over a photo with a panel, but not over an image with its own scrim (the scrim is its ground, §3.1)", () => {
    const plain = els(image());
    expect(overPhoto(plain[0]!, plain)).toBe(true);
    const scrimmed = els(image({ scrim: { role: "inverse", strength: 3 } }));
    expect(overPhoto(scrimmed[0]!, scrimmed)).toBe(false);
    // A scrimmed image and a plain one under the same text: the plain one still needs the panel.
    const both = els(image({ scrim: { role: "inverse", strength: 3 } }), image({ id: "e_img2", desk: desk(4, 6, 1), phone: { order: 2, span: "full" } }));
    expect(overPhoto(both[0]!, both)).toBe(true);
  });

  it("gives prices hung as tags or plates no panel (each item is on its own ground), but a price list in rows gets one", () => {
    const prices = (style: string) =>
      ComposedProps.parse({
        intent: "hero",
        width: "wide",
        rows: 2,
        elements: [{ id: "e_p", kind: "prices", style, items: [{ name: "Kruh", price: { amount: 4 } }], desk: desk(2, 4, 1, { layer: 1 }), phone: { order: 0, span: "full" } }, image()],
      }).elements;
    for (const style of ["tags", "plates"]) expect(overPhoto(prices(style)[0]!, prices(style))).toBe(false);
    expect(overPhoto(prices("rows")[0]!, prices("rows"))).toBe(true);
  });
});
