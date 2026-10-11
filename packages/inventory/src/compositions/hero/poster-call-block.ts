import { definePreset } from "@sb/spec";

/** No photo needed: the trade as a printed poster (hot and cold pipes from a heat pump through the wall to a radiator) large on the right, bled to the page's right and bottom edges; the headline on the left and the phone as a solid block in the hot colour. */
export default definePreset({
  id: "composition/hero/poster-call-block",
  tags: { mood: ["poster", "illustration", "no-photo", "call"], trades: ["builder"], stances: ["technical-drawing", "safety-signage", "wayfinding"] },
  needs: ["copy.headline", "business.phone"],
  props: {
    intent: "hero",
    width: "wide",
    minHeight: "screen",
    rows: 4,
    elements: [
      { id: "e_where", kind: "text", paragraphs: ["{business.street}, {business.town}"], desk: { col: 1, span: 6, row: 1, alignY: "end" }, phone: { order: 0, span: "full" } },
      { id: "e_title", kind: "heading", text: "{copy.headline}", level: 1, size: 5, weight: 800, measure: "l", desk: { col: 1, span: 6, row: 2, alignY: "center" }, phone: { order: 1, span: "full" } },
      { id: "e_lead", kind: "text", paragraphs: ["{copy.lead}"], desk: { col: 1, span: 5, row: 3, alignY: "start" }, phone: { order: 2, span: "full" } },
      { id: "e_phone", kind: "fact", value: "{business.phone}", label: "Pokličite za ogled", labelAt: "before", treatment: "numeral", size: 5, fill: "primary", link: { action: "call" }, desk: { col: 1, span: 5, row: 4, alignY: "start", alignX: "start" }, phone: { order: 3, span: "full" } },
      { id: "e_art", kind: "decor", drawing: "motif/plumbing/heat-pump-radiator-solid", fit: "cell", desk: { col: 7, span: 6, row: 1, rowSpan: 4, alignY: "center", bleedX: "end" }, phone: { order: 4, span: "bleed" } },
    ],
  },
  reflow: {},
  note: "New (hero bar G), after S Cevi: the trade drawn as a full-strength poster instead of a line drawing; the phone as the hot-coloured call block.",
});
