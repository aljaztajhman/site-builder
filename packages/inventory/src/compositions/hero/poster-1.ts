import { definePreset } from "@sb/spec";

/** Poster: the headline is the picture, at display size across all twelve columns and set low; the lead and the call stand above it at the right, one line of facts under it. No photo. */
export default definePreset({
  id: "composition/hero/poster-1",
  structure: "poster",
  tags: { mood: ["poster", "type", "no-photo", "loud"], stances: ["swiss-grid", "ljubljana-sixties-poster"] },
  needs: ["copy.headline"],
  props: {
    intent: "hero",
    width: "wide",
    minHeight: "tall",
    rows: 4,
    elements: [
      { id: "e_lead", kind: "text", paragraphs: ["{copy.lead}"], size: 1, desk: { col: 8, span: 5, row: 1, alignY: "start" }, phone: { order: 3, span: "full" } },
      { id: "e_call", kind: "action", action: "call", label: "Pokličite", style: "primary", desk: { col: 8, span: 3, row: 2, alignY: "start" }, phone: { order: 1, span: "full" } },
      { id: "e_title", kind: "heading", text: "{copy.headline}", level: 1, size: 7, weight: 800, desk: { col: 1, span: 12, row: 3, alignY: "end" }, phone: { order: 0, span: "full" } },
      {
        id: "e_facts",
        kind: "ribbon",
        items: ["{business.street}, {business.town}", "{business.phone}", "{business.hours.note}"],
        move: "still",
        fill: "surface",
        color: "text",
        desk: { col: 1, span: 12, row: 4, alignY: "start" },
        phone: { order: 2, span: "full" },
      },
    ],
  },
  reflow: { e_call: {}, e_lead: {} },
  note: "Design 5 structure 1 (poster): one display headline across the grid, set low with air above it; the lead and call a small block at the top right, the facts one line under it.",
});
