import { definePreset } from "@sb/spec";

/** The heading, then every offering in two columns with dotted leaders to the prices. */
export default definePreset({
  id: "composition/menu/leaders-two-columns",
  tags: { mood: ["menu", "grid"], trades: ["restaurant", "bakery", "tourist-farm"] },
  needs: ["copy.headline", "brief.offerings[0].name"],
  props: {
    intent: "menu",
    width: "contained",
    rows: 2,
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 4, desk: { col: 1, span: 8, row: 1 }, phone: { order: 0, span: "full" } },
      {
        id: "e_a",
        kind: "prices",
        items: [{ name: "{brief.offerings[0].name}", price: "{brief.offerings[0].price}", note: "{brief.offerings[0].description}" }, { name: "{brief.offerings[1].name}", price: "{brief.offerings[1].price}", note: "{brief.offerings[1].description}" }, { name: "{brief.offerings[2].name}", price: "{brief.offerings[2].price}", note: "{brief.offerings[2].description}" }, { name: "{brief.offerings[3].name}", price: "{brief.offerings[3].price}", note: "{brief.offerings[3].description}" }, { name: "{brief.offerings[4].name}", price: "{brief.offerings[4].price}", note: "{brief.offerings[4].description}" }, { name: "{brief.offerings[5].name}", price: "{brief.offerings[5].price}", note: "{brief.offerings[5].description}" }],
        style: "leaders",
        desk: { col: 1, span: 6, row: 2 },
        phone: { order: 1, span: "full" },
      },
      {
        id: "e_b",
        kind: "prices",
        items: [{ name: "{brief.offerings[6].name}", price: "{brief.offerings[6].price}", note: "{brief.offerings[6].description}" }, { name: "{brief.offerings[7].name}", price: "{brief.offerings[7].price}", note: "{brief.offerings[7].description}" }, { name: "{brief.offerings[8].name}", price: "{brief.offerings[8].price}", note: "{brief.offerings[8].description}" }, { name: "{brief.offerings[9].name}", price: "{brief.offerings[9].price}", note: "{brief.offerings[9].description}" }, { name: "{brief.offerings[10].name}", price: "{brief.offerings[10].price}", note: "{brief.offerings[10].description}" }, { name: "{brief.offerings[11].name}", price: "{brief.offerings[11].price}", note: "{brief.offerings[11].description}" }],
        style: "leaders",
        desk: { col: 7, span: 6, row: 2 },
        phone: { order: 2, span: "full" },
      },
    ],
  },
  // With six offerings or fewer the first column takes a wider measure.
  reflow: { e_b: { e_a: { span: 8 } } },
  note: "Re-expresses menu:two-column: the list split in two at the sixth item.",
});
