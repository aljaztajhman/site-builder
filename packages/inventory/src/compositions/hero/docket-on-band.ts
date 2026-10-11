import { definePreset } from "@sb/spec";

/** The headline, lead and call on the left; on a coloured band to the right, the client's priced offerings on a till docket. */
export default definePreset({
  id: "composition/hero/docket-on-band",
  tags: { mood: ["list", "band", "practical"], stances: ["till-receipt", "workshop-docket"] },
  needs: ["copy.headline", "brief.priced[1].name"],
  props: {
    intent: "hero",
    width: "wide",
    minHeight: "m",
    rows: 4,
    background: [{ kind: "field", role: "band", cols: { from: 8, to: 12 } }],
    elements: [
      { id: "e_where", kind: "text", paragraphs: ["{business.street}, {business.town}"], desk: { col: 1, span: 5, row: 1, alignY: "end" }, phone: { order: 0, span: "full" } },
      { id: "e_title", kind: "heading", text: "{copy.headline}", level: 1, size: 6, weight: 800, measure: "m", desk: { col: 1, span: 6, row: 2, alignY: "end" }, phone: { order: 1, span: "full" } },
      { id: "e_lead", kind: "text", paragraphs: ["{copy.lead}"], desk: { col: 1, span: 6, row: 3, alignY: "start" }, phone: { order: 2, span: "full" } },
      { id: "e_call", kind: "action", action: "call", label: "Pokličite", style: "primary", desk: { col: 1, span: 2, row: 4, alignY: "start" }, phone: { order: 3, span: "full" } },
      {
        id: "e_slip",
        kind: "prices",
        items: [
          { name: "{brief.priced[0].name}", price: "{brief.priced[0].price}" },
          { name: "{brief.priced[1].name}", price: "{brief.priced[1].price}" },
          { name: "{brief.priced[2].name}", price: "{brief.priced[2].price}" },
          { name: "{brief.priced[3].name}", price: "{brief.priced[3].price}" },
          { name: "{brief.priced[4].name}", price: "{brief.priced[4].price}" },
          { name: "{brief.priced[5].name}", price: "{brief.priced[5].price}" },
        ],
        style: "docket",
        desk: { col: 9, span: 4, row: 2, rowSpan: 2 },
        phone: { order: 4, span: "full" },
      },
    ],
  },
  note: "Re-expresses hero-signature:receipt: the receipt is a docket price list on a band field; only offerings with a price, never a placeholder.",
});
