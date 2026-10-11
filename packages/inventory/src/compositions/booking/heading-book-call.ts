import { definePreset } from "@sb/spec";

/** A short rule, the heading, a line, then the booking link with the call beside it. */
export default definePreset({
  id: "composition/booking/heading-book-call",
  tags: { mood: ["direct", "calm"] },
  needs: ["copy.headline"],
  props: {
    intent: "booking",
    width: "contained",
    rows: 4,
    elements: [
      { id: "e_rule", kind: "decor", svg: { width: 400, height: 8, paths: [{ d: "M0 4H400", fill: "none", stroke: "text", width: 1 }] }, desk: { col: 1, span: 8, row: 1 }, phone: { order: 0, span: "full" } },
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 4, desk: { col: 1, span: 8, row: 2 }, phone: { order: 1, span: "full" } },
      { id: "e_t", kind: "text", paragraphs: ["{copy.lead}"], desk: { col: 1, span: 7, row: 3 }, phone: { order: 2, span: "full" } },
      { id: "e_book", kind: "action", action: "book", label: "Rezervirajte termin", style: "primary", desk: { col: 1, span: 3, row: 4, alignY: "start" }, phone: { order: 3, span: "half" } },
      { id: "e_call", kind: "action", action: "call", label: "Pokličite", style: "text", desk: { col: 4, span: 2, row: 4, alignY: "start" }, phone: { order: 4, span: "half" } },
    ],
  },
  // Without a booking link the call takes its place.
  reflow: { e_book: { e_call: { col: 1 } } },
  note: "Re-expresses booking:simple: the booking link only where the client has one (else the call stays).",
});
