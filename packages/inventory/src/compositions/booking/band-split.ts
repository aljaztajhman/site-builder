import { definePreset } from "@sb/spec";

/** A band block bled to the left edge with the heading at display size and the line under it; on the paper beside it the phone, the hours and the booking link. */
export default definePreset({
  id: "composition/booking/band-split",
  tags: { mood: ["band", "split", "action"], stances: ["split-screen", "colour-block"] },
  needs: ["copy.headline"],
  props: {
    intent: "booking",
    width: "contained",
    rows: 3,
    background: [{ kind: "field", role: "band", cols: { from: 1, to: 6 } }],
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 6, weight: 800, measure: "s", color: "onBand", desk: { col: 1, span: 5, row: 1, rowSpan: 2 }, phone: { order: 0, span: "full" } },
      { id: "e_t", kind: "text", paragraphs: ["{copy.lead}"], size: 1, color: "onBand", desk: { col: 1, span: 5, row: 3 }, phone: { order: 1, span: "full" } },
      { id: "e_c", kind: "contact", show: ["phone", "email"], desk: { col: 8, span: 5, row: 1 }, phone: { order: 3, span: "full" } },
      { id: "e_hours", kind: "hours", style: "compact", desk: { col: 8, span: 5, row: 2 }, phone: { order: 4, span: "full" } },
      { id: "e_book", kind: "action", action: "book", label: "Naročite se", style: "primary", desk: { col: 8, span: 4, row: 3 }, phone: { order: 2, span: "full" } },
    ],
  },
  reflow: { e_t: { e_h: { rowSpan: 3 } }, e_hours: { e_book: { row: 2 } } },
  note: "From P Pregib (booking always in reach) and jedilnica-brin (colour as a block bled to the edge): a split where the band carries the heading and the paper carries everything needed to book.",
});
