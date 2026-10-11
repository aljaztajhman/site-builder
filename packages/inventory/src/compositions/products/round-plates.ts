import { definePreset } from "@sb/spec";

/** The heading and lead, then three offerings on round photos with the name and price under each, the middle one set a little lower. */
export default definePreset({
  id: "composition/products/round-plates",
  tags: { mood: ["round", "photo", "menu"], trades: ["restaurant", "bakery", "tourist-farm"] },
  needs: ["copy.headline", "brief.offerings[0].name"],
  props: {
    intent: "products",
    width: "contained",
    rows: 4,
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 4, desk: { col: 1, span: 8, row: 1 }, phone: { order: 0, span: "full" } },
      { id: "e_t", kind: "text", paragraphs: ["{copy.lead}"], desk: { col: 1, span: 7, row: 2 }, phone: { order: 1, span: "full" } },
      { id: "e_i0", kind: "image", image: "{images[0]}", ratio: "1:1", mask: "circle", desk: { col: 1, span: 4, row: 3, shiftY: 0 }, phone: { order: 2, span: "inset" } },
      {
        id: "e_p0",
        kind: "prices",
        items: [{ name: "{brief.offerings[0].name}", price: "{brief.offerings[0].price}" }],
        style: "rows",
        size: 1,
        desk: { col: 1, span: 4, row: 4 },
        phone: { order: 3, span: "full" },
      },
      { id: "e_i1", kind: "image", image: "{images[1]}", ratio: "1:1", mask: "circle", desk: { col: 5, span: 4, row: 3, shiftY: 1 }, phone: { order: 4, span: "inset" } },
      {
        id: "e_p1",
        kind: "prices",
        items: [{ name: "{brief.offerings[1].name}", price: "{brief.offerings[1].price}" }],
        style: "rows",
        size: 1,
        desk: { col: 5, span: 4, row: 4 },
        phone: { order: 5, span: "full" },
      },
      { id: "e_i2", kind: "image", image: "{images[2]}", ratio: "1:1", mask: "circle", desk: { col: 9, span: 4, row: 3, shiftY: 0 }, phone: { order: 6, span: "inset" } },
      {
        id: "e_p2",
        kind: "prices",
        items: [{ name: "{brief.offerings[2].name}", price: "{brief.offerings[2].price}" }],
        style: "rows",
        size: 1,
        desk: { col: 9, span: 4, row: 4 },
        phone: { order: 7, span: "full" },
      },
    ],
  },
  // Without a photo the name and price sit at the foot of the cell.
  reflow: { e_i0: { e_p0: { row: 3, rowSpan: 2, alignY: "end" } }, e_i1: { e_p1: { row: 3, rowSpan: 2, alignY: "end" } }, e_i2: { e_p2: { row: 3, rowSpan: 2, alignY: "end" } } },
  note: "Re-expresses products:plates: round photos as plates, a name and price under each.",
});
