import { definePreset } from "@sb/spec";

/** The heading, then the priced offerings as tags in a row, the price first and large. */
export default definePreset({
  id: "composition/prices/price-tags-row",
  tags: { mood: ["prices", "bold"], stances: ["hang-tag"] },
  needs: ["copy.headline", "brief.priced[0].name"],
  props: {
    intent: "prices",
    width: "wide",
    rows: 2,
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 4, desk: { col: 1, span: 8, row: 1 }, phone: { order: 0, span: "full" } },
      {
        id: "e_p",
        kind: "prices",
        items: [{ name: "{brief.priced[0].name}", price: "{brief.priced[0].price}" }, { name: "{brief.priced[1].name}", price: "{brief.priced[1].price}" }, { name: "{brief.priced[2].name}", price: "{brief.priced[2].price}" }, { name: "{brief.priced[3].name}", price: "{brief.priced[3].price}" }],
        style: "tags",
        phoneColumns: 1,
        desk: { col: 1, span: 12, row: 2 },
        phone: { order: 1, span: "full" },
      },
    ],
  },
  note: "Re-expresses price-list:tags: the price leads, the name under it.",
});
