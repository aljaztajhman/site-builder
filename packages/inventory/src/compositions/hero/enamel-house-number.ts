import { definePreset } from "@sb/spec";

/** No photo needed: the headline, lead and the phone as a big number on the left; the street on an enamel house-number plate hung on a plain wall block that runs to the right page edge, the way there under it. */
export default definePreset({
  id: "composition/hero/enamel-house-number",
  tags: { mood: ["sign", "enamel", "practical"], trades: ["car-repair", "builder", "shop"], stances: ["enamel-house-plate", "registration-plate"] },
  needs: ["copy.headline", "business.street"],
  props: {
    intent: "hero",
    width: "wide",
    minHeight: "m",
    rows: 4,
    background: [{ kind: "field", role: "surface", cols: { from: 9, to: 12 } }],
    elements: [
      { id: "e_title", kind: "heading", text: "{copy.headline}", level: 1, size: 5, weight: 800, measure: "m", desk: { col: 1, span: 7, row: 1, rowSpan: 2, alignY: "end" }, phone: { order: 0, span: "full" } },
      { id: "e_lead", kind: "text", paragraphs: ["{copy.lead}"], size: 1, desk: { col: 1, span: 6, row: 3 }, phone: { order: 1, span: "full" } },
      { id: "e_phone", kind: "fact", value: "{business.phone}", label: "Pokličite", labelAt: "before", treatment: "numeral", size: 5, link: { action: "call" }, desk: { col: 1, span: 6, row: 4, alignY: "start" }, phone: { order: 2, span: "full" } },
      { id: "e_plate", kind: "fact", value: "{business.street}", label: "{business.town}", treatment: "house-number", size: 8, desk: { col: 9, span: 4, row: 1, rowSpan: 3, alignY: "center", alignX: "center" }, phone: { order: 3, span: "full" } },
      { id: "e_dir", kind: "action", action: "directions", label: "Pot do nas", style: "text", desk: { col: 9, span: 4, row: 4, alignY: "start", alignX: "center" }, phone: { order: 4, span: "full" } },
    ],
  },
  note: "From avtoservis-golob (the house number as the hero object, which had to be faked with a field) and the enamel-house-plate stance: the fact object now owns its rim and ground.",
});
