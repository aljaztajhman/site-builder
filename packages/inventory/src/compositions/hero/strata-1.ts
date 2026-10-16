import { definePreset } from "@sb/spec";

/** Strata: three full-width layers, a thin strip of facts on the band colour, the headline at display size, and a panorama crop of a picture bled to both edges. */
export default definePreset({
  id: "composition/hero/strata-1",
  structure: "strata",
  tags: { mood: ["layers", "bands", "type", "panorama"], stances: ["wayfinding", "swiss-grid"] },
  needs: ["copy.headline"],
  props: {
    intent: "hero",
    width: "wide",
    rows: 4,
    gap: 3,
    background: [{ kind: "field", role: "band", rows: { from: 1, to: 1 } }],
    elements: [
      { id: "e_facts", kind: "ribbon", items: ["{business.street}, {business.town}", "{business.phone}", "{business.hours.note}"], move: "still", desk: { col: 1, span: 12, row: 1 }, phone: { order: 0, span: "full" } },
      { id: "e_title", kind: "heading", text: "{copy.headline}", level: 1, size: 7, weight: 900, desk: { col: 1, span: 12, row: 2 }, phone: { order: 1, span: "full" } },
      { id: "e_lead", kind: "text", paragraphs: ["{copy.lead}"], size: 1, desk: { col: 1, span: 6, row: 3, alignY: "start" }, phone: { order: 3, span: "full" } },
      { id: "e_call", kind: "action", action: "call", label: "Pokličite", style: "primary", desk: { col: 10, span: 3, row: 3, alignY: "start", alignX: "end" }, phone: { order: 2, span: "full" } },
      { id: "e_strip", kind: "image", image: "{images[0]}", ratio: "21:9", desk: { col: 1, span: 12, row: 4, bleedX: "both" }, phone: { order: 4, span: "bleed" } },
    ],
  },
  reflow: { e_call: {}, e_strip: {} },
  note: "Design 5 structure 4 (strata): facts strip, headline band, picture ribbon, each the page's full width; works without a photo (the ribbon drops).",
});
