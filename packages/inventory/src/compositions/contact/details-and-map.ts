import { definePreset } from "@sb/spec";

/** The heading, lead, contact lines and directions on the left; a drawn street map of the address on the right. */
export default definePreset({
  id: "composition/contact/details-and-map",
  tags: { mood: ["practical", "map"] },
  needs: ["copy.headline"],
  props: {
    intent: "contact",
    width: "contained",
    rows: 4,
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 4, desk: { col: 1, span: 5, row: 1 }, phone: { order: 0, span: "full" } },
      { id: "e_t", kind: "text", paragraphs: ["{copy.lead}"], desk: { col: 1, span: 5, row: 2 }, phone: { order: 1, span: "full" } },
      { id: "e_c", kind: "contact", show: ["phone", "email", "address"], desk: { col: 1, span: 5, row: 3 }, phone: { order: 2, span: "full" } },
      { id: "e_dir", kind: "action", action: "directions", label: "Pot do nas", style: "secondary", desk: { col: 1, span: 3, row: 4, alignY: "start" }, phone: { order: 3, span: "full" } },
      { id: "e_map", kind: "map", style: "street", desk: { col: 7, span: 6, row: 1, rowSpan: 4 }, phone: { order: 4, span: "full" } },
    ],
  },
  // Without a lead the contact lines move up.
  reflow: { e_t: { e_c: { row: 2, rowSpan: 2 } } },
  note: "Re-expresses contact:split-map: the map is drawn from the address (no embed, no third party).",
});
