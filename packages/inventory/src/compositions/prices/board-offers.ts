import { definePreset } from "@sb/spec";

/** The heading small, then up to three priced offerings set large on a menu board. */
export default definePreset({
  id: "composition/prices/board-offers",
  tags: { mood: ["prices", "bold"], stances: ["shopfront-fascia"] },
  needs: ["copy.headline", "brief.priced[0].name"],
  props: {
    intent: "prices",
    width: "contained",
    rows: 2,
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 2, desk: { col: 1, span: 8, row: 1 }, phone: { order: 0, span: "full" } },
      {
        id: "e_p",
        kind: "prices",
        items: [{ name: "{brief.priced[0].name}", price: "{brief.priced[0].price}" }, { name: "{brief.priced[1].name}", price: "{brief.priced[1].price}" }, { name: "{brief.priced[2].name}", price: "{brief.priced[2].price}" }],
        style: "board",
        size: 2,
        desk: { col: 1, span: 8, row: 2 },
        phone: { order: 1, span: "full" },
      },
    ],
  },
  note: "Re-expresses price-list:offers: few prices, large, on a board (a price can't be a display-size fact: no price fact object).",
});
