import { definePreset } from "@sb/spec";

/** Through the open workshop door: the client's photo fills the screen behind a dark scrim, the header over it; the headline in huge capitals low on the left, the phone as a registration plate beside it. */
export default definePreset({
  id: "composition/hero/workshop-door",
  tone: "inverse",
  tags: { mood: ["dark", "photo", "immersive", "plate"], trades: ["car-repair", "builder"], stances: ["registration-plate", "safety-signage", "workshop-docket"] },
  needs: ["copy.headline", "images[0]", "business.phone"],
  props: {
    intent: "hero",
    width: "wide",
    minHeight: "screen",
    rows: 4,
    headerOver: true,
    background: [{ kind: "photo", image: "{images[0]}", scrim: { role: "inverse", strength: 3 }, phone: "cover" }],
    elements: [
      { id: "e_where", kind: "text", paragraphs: ["{business.street}, {business.town}"], color: "onInverse", desk: { col: 1, span: 6, row: 1, alignY: "end" }, phone: { order: 0, span: "full" } },
      { id: "e_title", kind: "heading", text: "{copy.headline}", level: 1, size: 7, weight: 900, case: "uppercase", measure: "l", color: "onInverse", desk: { col: 1, span: 11, row: 2, rowSpan: 2, alignY: "end" }, phone: { order: 1, span: "full" } },
      { id: "e_lead", kind: "text", paragraphs: ["{copy.lead}"], color: "onInverse", desk: { col: 1, span: 6, row: 4, alignY: "start" }, phone: { order: 2, span: "full" } },
      { id: "e_plate", kind: "fact", value: "{business.phone}", label: "Najhitreje nas dobite po telefonu", labelAt: "before", treatment: "plate", plateCode: true, size: 6, color: "onInverse", link: { action: "call" }, desk: { col: 7, span: 6, row: 4, alignY: "start", alignX: "end" }, phone: { order: 3, span: "full" } },
    ],
  },
  note: "New (hero bar D), after M Tablica: the workshop photo as the whole screen, the capitals and the plate on it.",
});
