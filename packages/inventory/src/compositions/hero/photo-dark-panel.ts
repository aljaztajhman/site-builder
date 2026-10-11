import { definePreset } from "@sb/spec";

/** The client's photo across the opener; a dark panel over its left side holds the headline, the lead and the call. */
export default definePreset({
  id: "composition/hero/photo-dark-panel",
  tags: { mood: ["photo", "panel", "bold"] },
  needs: ["copy.headline", "images[0]"],
  props: {
    intent: "hero",
    width: "wide",
    rows: 5,
    gap: 0,
    background: [{ kind: "field", role: "inverse", cols: { from: 2, to: 5 }, rows: { from: 2, to: 4 } }],
    elements: [
      { id: "e_photo", kind: "image", image: "{images[0]}", ratio: "16:9", desk: { col: 1, span: 12, row: 1, rowSpan: 5 }, phone: { order: 0, span: "bleed" } },
      { id: "e_title", kind: "heading", text: "{copy.headline}", level: 1, size: 5, weight: 800, measure: "s", desk: { col: 2, span: 4, row: 2, layer: 1 }, phone: { order: 1, span: "full" } },
      { id: "e_lead", kind: "text", paragraphs: ["{copy.lead}"], desk: { col: 2, span: 4, row: 3, layer: 1 }, phone: { order: 2, span: "full" } },
      { id: "e_call", kind: "action", action: "call", label: "Pokličite", style: "secondary", desk: { col: 2, span: 4, row: 4, layer: 1 }, phone: { order: 3, span: "full" } },
    ],
  },
  note: "Re-expresses hero-image:overlay-left: the words over the photo on backing panels that close into one dark block (gap 0, on an inverse field).",
});
