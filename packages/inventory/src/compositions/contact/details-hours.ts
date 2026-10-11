import { definePreset } from "@sb/spec";

/** Heading, lead and the contact lines on the left; the opening hours and a directions link on the right. */
export default definePreset({
  id: "composition/contact/details-hours",
  tags: { mood: ["practical"] },
  needs: ["copy.headline"],
  props: {
    intent: "contact",
    width: "wide",
    rows: 3,
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 4, desk: { col: 1, span: 5, row: 1 }, phone: { order: 0, span: "full" } },
      { id: "e_t", kind: "text", paragraphs: ["{copy.lead}"], desk: { col: 1, span: 5, row: 2 }, phone: { order: 1, span: "full" } },
      { id: "e_c", kind: "contact", show: ["phone", "email", "address"], desk: { col: 1, span: 5, row: 3 }, phone: { order: 2, span: "full" } },
      { id: "e_hours", kind: "hours", style: "table", desk: { col: 7, span: 6, row: 1, rowSpan: 2 }, phone: { order: 3, span: "full" } },
      { id: "e_dir", kind: "action", action: "directions", label: "Pot do nas", style: "secondary", desk: { col: 7, span: 3, row: 3, alignY: "start" }, phone: { order: 4, span: "full" } },
    ],
  },
  // Without a lead the contact lines move up beside the hours; without hours the heading widens and the lead keeps a readable measure.
  reflow: { e_t: { e_c: { row: 2, rowSpan: 2 } }, e_hours: { e_h: { span: 12 }, e_t: { span: 8 } } },
  note: "I3-0 format example: contact lines beside the hours; without hours the heading and lead widen.",
});
