import { definePreset } from "@sb/spec";

/** Split, gated: the client's photo takes 60 % and bleeds to the right page edge; the headline runs from the 40 % column over the photo's edge on its own ground. */
export default definePreset({
  id: "composition/hero/split-1",
  structure: "split",
  tags: { mood: ["photo", "split", "overlap", "asymmetric"] },
  needs: ["copy.headline", "photos[0]"],
  props: {
    intent: "hero",
    width: "wide",
    minHeight: "tall",
    rows: 4,
    elements: [
      { id: "e_photo", kind: "image", image: "{photos[0]}", ratio: "fill", crop: "thirds", desk: { col: 6, span: 7, row: 1, rowSpan: 4, bleedX: "end" }, phone: { order: 0, span: "bleed" } },
      { id: "e_where", kind: "text", paragraphs: ["{business.street}, {business.town}"], desk: { col: 1, span: 4, row: 1, alignY: "end" }, phone: { order: 3, span: "full" } },
      { id: "e_title", kind: "heading", text: "{copy.headline}", level: 1, size: 6, weight: 800, fill: "background", desk: { col: 1, span: 6, row: 2, layer: 1, alignY: "center", shiftX: 3 }, phone: { order: 1, span: "full" } },
      { id: "e_lead", kind: "text", paragraphs: ["{copy.lead}"], size: 1, desk: { col: 1, span: 4, row: 3, alignY: "start" }, phone: { order: 4, span: "full" } },
      { id: "e_call", kind: "action", action: "call", label: "Pokličite", style: "primary", desk: { col: 1, span: 3, row: 4, alignY: "start" }, phone: { order: 2, span: "full" } },
    ],
  },
  reflow: { e_call: {}, e_where: {} },
  note: "Design 5 structure 8 (split, gated): 60/40, the photo to the page edge, the headline crossing onto it by two columns on the page's own ground.",
});
