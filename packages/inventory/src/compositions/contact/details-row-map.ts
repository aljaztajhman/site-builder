import { definePreset } from "@sb/spec";

/** The heading and lead, the contact lines and the hours side by side, a wide drawn map under them. */
export default definePreset({
  id: "composition/contact/details-row-map",
  tags: { mood: ["practical", "map", "wide"] },
  needs: ["copy.headline"],
  props: {
    intent: "contact",
    width: "contained",
    rows: 4,
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 4, desk: { col: 1, span: 8, row: 1 }, phone: { order: 0, span: "full" } },
      { id: "e_t", kind: "text", paragraphs: ["{copy.lead}"], desk: { col: 1, span: 7, row: 2 }, phone: { order: 1, span: "full" } },
      { id: "e_c", kind: "contact", show: ["phone", "email", "address"], desk: { col: 1, span: 7, row: 3 }, phone: { order: 2, span: "full" } },
      { id: "e_hours", kind: "hours", style: "compact", desk: { col: 9, span: 4, row: 3 }, phone: { order: 3, span: "full" } },
      { id: "e_map", kind: "map", style: "corner", desk: { col: 1, span: 12, row: 4 }, phone: { order: 4, span: "full" } },
    ],
  },
  // Without hours the contact lines take the row.
  reflow: { e_hours: { e_c: { span: 12 } } },
  note: "Re-expresses contact:stacked: the facts in a row, the map across under them.",
});
