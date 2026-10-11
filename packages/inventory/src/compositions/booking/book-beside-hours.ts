import { definePreset } from "@sb/spec";

/** The heading, a line and the booking link on the left; the opening hours and the phone on a light panel on the right. */
export default definePreset({
  id: "composition/booking/book-beside-hours",
  tags: { mood: ["practical", "panel"] },
  needs: ["copy.headline"],
  props: {
    intent: "booking",
    width: "contained",
    rows: 3,
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 4, desk: { col: 1, span: 6, row: 1 }, phone: { order: 0, span: "full" } },
      { id: "e_t", kind: "text", paragraphs: ["{copy.lead}"], desk: { col: 1, span: 6, row: 2 }, phone: { order: 1, span: "full" } },
      { id: "e_book", kind: "action", action: "book", label: "Rezervirajte termin", style: "primary", desk: { col: 1, span: 3, row: 3, alignY: "start" }, phone: { order: 2, span: "half" } },
      { id: "e_call", kind: "action", action: "call", label: "Pokličite", style: "text", desk: { col: 4, span: 2, row: 3, alignY: "start" }, phone: { order: 3, span: "half" } },
      { id: "e_hours", kind: "hours", style: "compact", fill: "surface", desk: { col: 8, span: 5, row: 1, rowSpan: 2 }, phone: { order: 4, span: "full" } },
      { id: "e_phone", kind: "contact", show: ["phone"], fill: "surface", desk: { col: 8, span: 5, row: 3 }, phone: { order: 5, span: "full" } },
    ],
  },
  // Without a lead the heading holds both rows; without a booking link the call takes its place; without hours the phone moves up.
  reflow: { e_t: { e_h: { rowSpan: 2 } }, e_book: { e_call: { col: 1 } }, e_hours: { e_phone: { row: 1, rowSpan: 2 } } },
  note: "Re-expresses booking:with-hours: the hours and phone as filled blocks beside the booking words.",
});
