import { definePreset } from "@sb/spec";

/** Colour field: the band colour fills the first screen, the header on it; a large headline, and one small picture window set low and off the grid at the right. */
export default definePreset({
  id: "composition/hero/field-1",
  structure: "field",
  tags: { mood: ["colour", "field", "window", "no-photo"], stances: ["bauhaus-geometry"] },
  needs: ["copy.headline"],
  props: {
    intent: "hero",
    width: "wide",
    minHeight: "l",
    rows: 4,
    headerOver: true,
    background: [{ kind: "field", role: "band" }],
    elements: [
      { id: "e_where", kind: "text", paragraphs: ["{business.street}, {business.town}"], desk: { col: 1, span: 5, row: 1, alignY: "end" }, phone: { order: 1, span: "full" } },
      { id: "e_title", kind: "heading", text: "{copy.headline}", level: 1, size: 7, weight: 800, desk: { col: 1, span: 9, row: 2, rowSpan: 2, alignY: "end" }, phone: { order: 0, span: "full" } },
      { id: "e_lead", kind: "text", paragraphs: ["{copy.lead}"], size: 1, desk: { col: 1, span: 5, row: 4, alignY: "start" }, phone: { order: 3, span: "full" } },
      { id: "e_call", kind: "action", action: "call", label: "Pokličite", style: "primary", desk: { col: 7, span: 3, row: 4, alignY: "start" }, phone: { order: 2, span: "full" } },
      { id: "e_window", kind: "image", image: "{images[0]}", ratio: "4:5", desk: { col: 10, span: 3, row: 1, rowSpan: 3, alignY: "center", shiftY: 2 }, phone: { order: 4, span: "inset" } },
    ],
  },
  reflow: { e_call: {}, e_where: {}, e_window: {} },
  note: "Design 5 structure 6 (colour field): one flat colour for the whole first screen instead of a dark page with line icons; any picture only as a small window.",
});
