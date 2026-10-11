import { definePreset } from "@sb/spec";

/** The heading, then every offering with its note and a dotted leader to its price, in one column. */
export default definePreset({
  id: "composition/menu/leaders-column",
  tags: { mood: ["menu", "classic"], trades: ["restaurant", "bakery", "tourist-farm"] },
  needs: ["copy.headline", "brief.offerings[0].name"],
  props: {
    intent: "menu",
    width: "contained",
    rows: 2,
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 4, desk: { col: 1, span: 7, row: 1 }, phone: { order: 0, span: "full" } },
      {
        id: "e_p",
        kind: "prices",
        items: [{ name: "{brief.offerings[0].name}", price: "{brief.offerings[0].price}", note: "{brief.offerings[0].description}" }, { name: "{brief.offerings[1].name}", price: "{brief.offerings[1].price}", note: "{brief.offerings[1].description}" }, { name: "{brief.offerings[2].name}", price: "{brief.offerings[2].price}", note: "{brief.offerings[2].description}" }, { name: "{brief.offerings[3].name}", price: "{brief.offerings[3].price}", note: "{brief.offerings[3].description}" }, { name: "{brief.offerings[4].name}", price: "{brief.offerings[4].price}", note: "{brief.offerings[4].description}" }, { name: "{brief.offerings[5].name}", price: "{brief.offerings[5].price}", note: "{brief.offerings[5].description}" }, { name: "{brief.offerings[6].name}", price: "{brief.offerings[6].price}", note: "{brief.offerings[6].description}" }, { name: "{brief.offerings[7].name}", price: "{brief.offerings[7].price}", note: "{brief.offerings[7].description}" }, { name: "{brief.offerings[8].name}", price: "{brief.offerings[8].price}", note: "{brief.offerings[8].description}" }, { name: "{brief.offerings[9].name}", price: "{brief.offerings[9].price}", note: "{brief.offerings[9].description}" }, { name: "{brief.offerings[10].name}", price: "{brief.offerings[10].price}", note: "{brief.offerings[10].description}" }, { name: "{brief.offerings[11].name}", price: "{brief.offerings[11].price}", note: "{brief.offerings[11].description}" }],
        style: "leaders",
        desk: { col: 1, span: 7, row: 2 },
        phone: { order: 1, span: "full" },
      },
    ],
  },
  note: "Re-expresses menu:classic: one column of the whole list.",
});
