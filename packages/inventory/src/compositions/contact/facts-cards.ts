import { definePreset } from "@sb/spec";

/** The heading, then the phone, the address and the opening hours each on a light panel of its own. */
export default definePreset({
  id: "composition/contact/facts-cards",
  tags: { mood: ["practical", "panel"] },
  needs: ["copy.headline"],
  props: {
    intent: "contact",
    width: "contained",
    rows: 2,
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 4, desk: { col: 1, span: 8, row: 1 }, phone: { order: 0, span: "full" } },
      { id: "e_phone", kind: "contact", show: ["phone"], fill: "surface", desk: { col: 1, span: 4, row: 2 }, phone: { order: 1, span: "full" } },
      { id: "e_addr", kind: "contact", show: ["address"], fill: "surface", desk: { col: 5, span: 4, row: 2 }, phone: { order: 2, span: "full" } },
      { id: "e_hours", kind: "hours", style: "compact", fill: "surface", desk: { col: 9, span: 4, row: 2 }, phone: { order: 3, span: "full" } },
    ],
  },
  // Without hours the address card widens.
  reflow: { e_hours: { e_addr: { span: 8 } } },
  note: "Re-expresses contact-strip:cards: the cards are the facts' own surface grounds.",
});
