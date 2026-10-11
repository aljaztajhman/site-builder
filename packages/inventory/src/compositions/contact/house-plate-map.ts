import { definePreset } from "@sb/spec";

/** The street as an enamel house-number plate hung at a slight angle above a drawn corner map on the left; the heading, the lead and the contact lines on the right (the map carries the address and the directions link). */
export default definePreset({
  id: "composition/contact/house-plate-map",
  tags: { mood: ["sign", "map", "enamel"], stances: ["enamel-house-plate", "wayfinding"] },
  needs: ["copy.headline", "business.street"],
  props: {
    intent: "contact",
    width: "contained",
    rows: 3,
    elements: [
      { id: "e_plate", kind: "fact", value: "{business.street}", label: "{business.town}", treatment: "house-number", size: 5, desk: { col: 1, span: 4, row: 1, alignY: "end", tilt: -3 }, phone: { order: 2, span: "inset" } },
      { id: "e_map", kind: "map", style: "corner", desk: { col: 1, span: 6, row: 2, rowSpan: 2 }, phone: { order: 3, span: "full" } },
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 5, weight: 800, measure: "m", desk: { col: 8, span: 5, row: 1, alignY: "end" }, phone: { order: 0, span: "full" } },
      { id: "e_t", kind: "text", paragraphs: ["{copy.lead}"], desk: { col: 8, span: 5, row: 2 }, phone: { order: 1, span: "full" } },
      { id: "e_c", kind: "contact", show: ["phone", "email"], desk: { col: 8, span: 5, row: 3, alignY: "start" }, phone: { order: 4, span: "full" } },
    ],
  },
  reflow: { e_t: { e_c: { row: 2, rowSpan: 2, alignY: "start" } } },
  note: "From avtoservis-golob (the street on an enamel house plate) and the enamel-house-plate stance: the address is the plate on the wall, hung over a drawn map of the corner.",
});
