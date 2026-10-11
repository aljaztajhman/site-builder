import { definePreset } from "@sb/spec";

/** Type only: the headline, lead and call on the left; the phone, the address and the opening hours in a column on the right. */
export default definePreset({
  id: "composition/hero/headline-facts",
  tags: { mood: ["type", "practical", "facts"], stances: ["station-timetable", "functional-catalogue", "swiss-grid"] },
  needs: ["copy.headline"],
  props: {
    intent: "hero",
    width: "wide",
    rows: 3,
    elements: [
      { id: "e_title", kind: "heading", text: "{copy.headline}", level: 1, size: 5, weight: 800, measure: "l", desk: { col: 1, span: 8, row: 1 }, phone: { order: 0, span: "full" } },
      { id: "e_lead", kind: "text", paragraphs: ["{copy.lead}"], size: 1, desk: { col: 1, span: 7, row: 2 }, phone: { order: 1, span: "full" } },
      { id: "e_call", kind: "action", action: "call", label: "Pokličite", style: "primary", desk: { col: 1, span: 2, row: 3, alignY: "start" }, phone: { order: 2, span: "full" } },
      { id: "e_contact", kind: "contact", show: ["phone", "address"], desk: { col: 10, span: 3, row: 1, rowSpan: 2 }, phone: { order: 3, span: "full" } },
      { id: "e_hours", kind: "hours", style: "compact", desk: { col: 10, span: 3, row: 3 }, phone: { order: 4, span: "full" } },
    ],
  },
  // Without hours the contact column takes all three rows.
  reflow: { e_hours: { e_contact: { rowSpan: 3 } } },
  note: "Re-expresses hero-type:with-facts: the business facts as their own column beside the headline, every one from the client.",
});
