import { definePreset } from "@sb/spec";

/** The heading and lead, then the priced offerings as plain rows of name and price in a readable column. */
export default definePreset({
  id: "composition/prices/rows-table",
  tags: { mood: ["prices", "quiet"] },
  needs: ["copy.headline", "brief.priced[0].name"],
  props: {
    intent: "prices",
    width: "contained",
    rows: 3,
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 4, desk: { col: 1, span: 7, row: 1 }, phone: { order: 0, span: "full" } },
      { id: "e_t", kind: "text", paragraphs: ["{copy.lead}"], desk: { col: 1, span: 7, row: 2 }, phone: { order: 1, span: "full" } },
      {
        id: "e_p",
        kind: "prices",
        items: [{ name: "{brief.priced[0].name}", price: "{brief.priced[0].price}" }, { name: "{brief.priced[1].name}", price: "{brief.priced[1].price}" }, { name: "{brief.priced[2].name}", price: "{brief.priced[2].price}" }, { name: "{brief.priced[3].name}", price: "{brief.priced[3].price}" }, { name: "{brief.priced[4].name}", price: "{brief.priced[4].price}" }, { name: "{brief.priced[5].name}", price: "{brief.priced[5].price}" }, { name: "{brief.priced[6].name}", price: "{brief.priced[6].price}" }, { name: "{brief.priced[7].name}", price: "{brief.priced[7].price}" }],
        style: "rows",
        desk: { col: 1, span: 7, row: 3 },
        phone: { order: 2, span: "full" },
      },
    ],
  },
  note: "Re-expresses price-list:table: name and price, nothing else.",
});
