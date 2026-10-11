import { definePreset } from "@sb/spec";

/** The heading, the line and the booking link with the phone beside it on the left; the town and street as a hut stamp pressed at an angle on the right. */
export default definePreset({
  id: "composition/booking/town-stamp",
  tags: { mood: ["stamp", "playful", "action"], stances: ["hut-stamp-booklet", "trail-marker"] },
  needs: ["copy.headline", "business.town"],
  props: {
    intent: "booking",
    width: "contained",
    rows: 3,
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 5, weight: 800, measure: "m", desk: { col: 1, span: 7, row: 1 }, phone: { order: 0, span: "full" } },
      { id: "e_t", kind: "text", paragraphs: ["{copy.lead}"], size: 1, desk: { col: 1, span: 6, row: 2 }, phone: { order: 1, span: "full" } },
      { id: "e_book", kind: "action", action: "book", label: "Naročite se", style: "primary", desk: { col: 1, span: 3, row: 3 }, phone: { order: 2, span: "full" } },
      { id: "e_c", kind: "contact", show: ["phone"], desk: { col: 4, span: 4, row: 3, alignY: "center" }, phone: { order: 3, span: "full" } },
      { id: "e_stamp", kind: "fact", value: "{business.town}", label: "{business.street}", treatment: "stamp", size: 5, desk: { col: 9, span: 3, row: 1, rowSpan: 3, alignY: "center", tilt: -6 }, phone: { order: 4, span: "inset", alignX: "end" } },
    ],
  },
  reflow: { e_t: { e_h: { rowSpan: 2 } }, e_book: { e_c: { col: 1, span: 7 } } },
  note: "From Kmetija Kramar (hut-stamp-booklet: the stamp you collect at the hut) and the trail-marker stance: the place pressed as a stamp beside the booking, a mark of being there.",
});
