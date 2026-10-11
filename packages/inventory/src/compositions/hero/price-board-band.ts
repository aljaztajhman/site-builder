import { definePreset } from "@sb/spec";

/** The price before you come: the headline and the call on the left; on a coloured band bled to the right edge, the client's own prices on a workshop board, the first thing read. */
export default definePreset({
  id: "composition/hero/price-board-band",
  tone: "band",
  tags: { mood: ["prices", "band", "board", "practical"], trades: ["car-repair", "builder", "hairdresser", "shop"], stances: ["workshop-docket", "till-receipt", "tool-shadow-board"] },
  needs: ["copy.headline", "brief.priced[0].name"],
  props: {
    intent: "hero",
    width: "wide",
    minHeight: "screen",
    rows: 4,
    headerOver: true,
    background: [{ kind: "field", role: "band" }],
    elements: [
      { id: "e_where", kind: "text", paragraphs: ["{business.street}, {business.town}"], desk: { col: 1, span: 6, row: 1, alignY: "end" }, phone: { order: 0, span: "full" } },
      { id: "e_title", kind: "heading", text: "{copy.headline}", level: 1, size: 6, weight: 900, measure: "s", desk: { col: 1, span: 6, row: 2, alignY: "center" }, phone: { order: 1, span: "full" } },
      { id: "e_lead", kind: "text", paragraphs: ["{copy.lead}"], size: 1, desk: { col: 1, span: 5, row: 3, alignY: "start" }, phone: { order: 2, span: "full" } },
      { id: "e_phone", kind: "fact", value: "{business.phone}", label: "Pokličite", labelAt: "before", treatment: "numeral", size: 5, link: { action: "call" }, desk: { col: 1, span: 5, row: 4, alignY: "start" }, phone: { order: 3, span: "full" } },
      {
        id: "e_board",
        kind: "prices",
        style: "plates",
        phoneColumns: 2,
        size: 2,
        items: [
          { name: "{brief.priced[0].name}", price: "{brief.priced[0].price}" },
          { name: "{brief.priced[1].name}", price: "{brief.priced[1].price}" },
          { name: "{brief.priced[2].name}", price: "{brief.priced[2].price}" },
          { name: "{brief.priced[3].name}", price: "{brief.priced[3].price}" },
        ],
        desk: { col: 8, span: 5, row: 1, rowSpan: 4, alignY: "center" },
        phone: { order: 4, span: "full" },
      },
    ],
  },
  reflow: { e_board: { e_title: { span: 9 }, e_lead: { span: 7 } } },
  note: "New (hero bar E): the facts as the hero, the client's prices on a board on the band; every price from the brief.",
});
