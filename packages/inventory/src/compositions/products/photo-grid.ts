import { definePreset } from "@sb/spec";

/** The heading and lead, then four offerings in a row, each a square photo over its name and price. */
export default definePreset({
  id: "composition/products/photo-grid",
  tags: { mood: ["photo", "grid", "shop"], trades: ["bakery", "shop", "tourist-farm"] },
  needs: ["copy.headline", "brief.offerings[0].name"],
  props: {
    intent: "products",
    width: "contained",
    rows: 4,
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 4, desk: { col: 1, span: 8, row: 1 }, phone: { order: 0, span: "full" } },
      { id: "e_t", kind: "text", paragraphs: ["{copy.lead}"], desk: { col: 1, span: 7, row: 2 }, phone: { order: 1, span: "full" } },
      { id: "e_i0", kind: "image", image: "{images[0]}", ratio: "1:1", desk: { col: 1, span: 3, row: 3 }, phone: { order: 2, span: "inset" } },
      { id: "e_p0", kind: "prices", items: [{ name: "{brief.offerings[0].name}", price: "{brief.offerings[0].price}" }], style: "rows", desk: { col: 1, span: 3, row: 4 }, phone: { order: 3, span: "full" } },
      { id: "e_i1", kind: "image", image: "{images[1]}", ratio: "1:1", desk: { col: 4, span: 3, row: 3 }, phone: { order: 4, span: "inset" } },
      { id: "e_p1", kind: "prices", items: [{ name: "{brief.offerings[1].name}", price: "{brief.offerings[1].price}" }], style: "rows", desk: { col: 4, span: 3, row: 4 }, phone: { order: 5, span: "full" } },
      { id: "e_i2", kind: "image", image: "{images[2]}", ratio: "1:1", desk: { col: 7, span: 3, row: 3 }, phone: { order: 6, span: "inset" } },
      { id: "e_p2", kind: "prices", items: [{ name: "{brief.offerings[2].name}", price: "{brief.offerings[2].price}" }], style: "rows", desk: { col: 7, span: 3, row: 4 }, phone: { order: 7, span: "full" } },
      { id: "e_i3", kind: "image", image: "{images[3]}", ratio: "1:1", desk: { col: 10, span: 3, row: 3 }, phone: { order: 8, span: "inset" } },
      {
        id: "e_p3",
        kind: "prices",
        items: [{ name: "{brief.offerings[3].name}", price: "{brief.offerings[3].price}" }],
        style: "rows",
        desk: { col: 10, span: 3, row: 4 },
        phone: { order: 9, span: "full" },
      },
    ],
  },
  // Without a photo the name and price sit at the foot of the cell.
  reflow: { e_i0: { e_p0: { row: 3, rowSpan: 2, alignY: "end" } }, e_i1: { e_p1: { row: 3, rowSpan: 2, alignY: "end" } }, e_i2: { e_p2: { row: 3, rowSpan: 2, alignY: "end" } }, e_i3: { e_p3: { row: 3, rowSpan: 2, alignY: "end" } } },
  note: "Re-expresses products:grid: a product is a photo and a one-line price; a missing price is the marked placeholder.",
});
