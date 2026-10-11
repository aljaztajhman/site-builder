import { definePreset } from "@sb/spec";

/** The headline, lead and call on the left; on a coloured band to the right, the client's offerings listed on a paper slip. */
export default definePreset({
  id: "composition/hero/offerings-slip",
  tags: { mood: ["list", "band", "practical"], stances: ["till-receipt", "workshop-docket"] },
  needs: ["copy.headline", "brief.offerings[1].name"],
  props: {
    intent: "hero",
    width: "wide",
    minHeight: "m",
    rows: 4,
    background: [{ kind: "field", role: "band", cols: { from: 8, to: 12 } }],
    elements: [
      { id: "e_where", kind: "text", paragraphs: ["{business.street}, {business.town}"], desk: { col: 1, span: 5, row: 1, alignY: "end" }, phone: { order: 0, span: "full" } },
      { id: "e_title", kind: "heading", text: "{copy.headline}", level: 1, size: 6, weight: 800, measure: "m", desk: { col: 1, span: 6, row: 2 }, phone: { order: 1, span: "full" } },
      { id: "e_lead", kind: "text", paragraphs: ["{copy.lead}"], desk: { col: 1, span: 6, row: 3 }, phone: { order: 2, span: "full" } },
      { id: "e_call", kind: "action", action: "call", label: "Pokličite", style: "primary", desk: { col: 1, span: 2, row: 4, alignY: "start" }, phone: { order: 3, span: "full" } },
      {
        id: "e_slip",
        kind: "list",
        items: ["{brief.offerings[0].name}", "{brief.offerings[1].name}", "{brief.offerings[2].name}", "{brief.offerings[3].name}", "{brief.offerings[4].name}", "{brief.offerings[5].name}", "{brief.offerings[6].name}"],
        marker: "rule",
        size: 1,
        fill: "background",
        desk: { col: 9, span: 4, row: 1, rowSpan: 4, alignY: "center" },
        phone: { order: 4, span: "full" },
      },
    ],
  },
  note: "Re-expresses hero-signature:receipt: the receipt is a list with its own paper ground on a band field; its lines are the client's offerings.",
});
