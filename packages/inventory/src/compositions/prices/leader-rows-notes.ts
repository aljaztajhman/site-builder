import { definePreset } from "@sb/spec";

/** The heading and lead on the left; the priced offerings with dotted leaders and their notes on the right. */
export default definePreset({
  id: "composition/prices/leader-rows-notes",
  tags: { mood: ["prices", "classic"], stances: ["account-ledger"] },
  needs: ["copy.headline", "brief.priced[0].name"],
  props: {
    intent: "prices",
    width: "contained",
    rows: 2,
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 4, desk: { col: 1, span: 4, row: 1 }, phone: { order: 0, span: "full" } },
      { id: "e_t", kind: "text", paragraphs: ["{copy.lead}"], desk: { col: 1, span: 4, row: 2 }, phone: { order: 1, span: "full" } },
      {
        id: "e_p",
        kind: "prices",
        items: [{ name: "{brief.priced[0].name}", price: "{brief.priced[0].price}", note: "{brief.priced[0].description}" }, { name: "{brief.priced[1].name}", price: "{brief.priced[1].price}", note: "{brief.priced[1].description}" }, { name: "{brief.priced[2].name}", price: "{brief.priced[2].price}", note: "{brief.priced[2].description}" }, { name: "{brief.priced[3].name}", price: "{brief.priced[3].price}", note: "{brief.priced[3].description}" }, { name: "{brief.priced[4].name}", price: "{brief.priced[4].price}", note: "{brief.priced[4].description}" }, { name: "{brief.priced[5].name}", price: "{brief.priced[5].price}", note: "{brief.priced[5].description}" }, { name: "{brief.priced[6].name}", price: "{brief.priced[6].price}", note: "{brief.priced[6].description}" }, { name: "{brief.priced[7].name}", price: "{brief.priced[7].price}", note: "{brief.priced[7].description}" }, { name: "{brief.priced[8].name}", price: "{brief.priced[8].price}", note: "{brief.priced[8].description}" }, { name: "{brief.priced[9].name}", price: "{brief.priced[9].price}", note: "{brief.priced[9].description}" }],
        style: "leaders",
        desk: { col: 6, span: 7, row: 1, rowSpan: 2 },
        phone: { order: 2, span: "full" },
      },
    ],
  },
  // Without a lead the heading holds both rows.
  reflow: { e_t: { e_h: { rowSpan: 2 } } },
  note: "Re-expresses price-list:grouped: notes under the names, the leader to the price.",
});
