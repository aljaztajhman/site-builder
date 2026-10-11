import { definePreset } from "@sb/spec";

/** No photo needed: the headline, lead and the phone as a big number on the left, the trade drawn large on the right (a radiator on its pipes). */
export default definePreset({
  id: "composition/hero/headline-drawn-trade",
  tags: { mood: ["drawing", "type", "practical"], trades: ["builder"], stances: ["technical-drawing", "line-drawing"] },
  needs: ["copy.headline"],
  props: {
    intent: "hero",
    width: "wide",
    minHeight: "m",
    rows: 3,
    elements: [
      { id: "e_title", kind: "heading", text: "{copy.headline}", level: 1, size: 6, weight: 800, measure: "m", desk: { col: 1, span: 7, row: 1, alignY: "end" }, phone: { order: 0, span: "full" } },
      { id: "e_lead", kind: "text", paragraphs: ["{copy.lead}"], desk: { col: 1, span: 6, row: 2 }, phone: { order: 1, span: "full" } },
      { id: "e_phone", kind: "fact", value: "{business.phone}", label: "Pokličite", labelAt: "before", treatment: "numeral", size: 5, link: { action: "call" }, desk: { col: 1, span: 5, row: 3, alignY: "start" }, phone: { order: 2, span: "full" } },
      { id: "e_draw", kind: "decor", motif: "pipes", desk: { col: 9, span: 4, row: 1, rowSpan: 3, alignY: "center" }, phone: { order: 3, span: "full", hidden: true } },
    ],
  },
  note: "Re-expresses hero-signature:drawing: the trade drawn instead of a photo (the pipes motif), the phone as the call object.",
});
