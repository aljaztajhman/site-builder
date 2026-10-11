import { definePreset } from "@sb/spec";

/** The client's photo across the opener; the headline overlaps its foot on a dark block that runs on below it with the lead and the call. */
export default definePreset({
  id: "composition/hero/photo-bottom-band",
  tags: { mood: ["photo", "panel", "grounded"] },
  needs: ["copy.headline", "images[0]"],
  props: {
    intent: "hero",
    width: "wide",
    rows: 5,
    gap: 0,
    background: [{ kind: "field", role: "inverse", cols: { from: 2, to: 7 }, rows: { from: 3, to: 5 } }],
    elements: [
      { id: "e_photo", kind: "image", image: "{images[0]}", ratio: "16:9", desk: { col: 1, span: 12, row: 1, rowSpan: 3 }, phone: { order: 0, span: "bleed" } },
      { id: "e_title", kind: "heading", text: "{copy.headline}", level: 1, size: 5, weight: 800, measure: "l", desk: { col: 2, span: 6, row: 3, layer: 1 }, phone: { order: 1, span: "full" } },
      { id: "e_lead", kind: "text", paragraphs: ["{copy.lead}"], desk: { col: 2, span: 6, row: 4 }, phone: { order: 2, span: "full" } },
      { id: "e_call", kind: "action", action: "call", label: "Pokličite", style: "secondary", desk: { col: 2, span: 6, row: 5 }, phone: { order: 3, span: "full" } },
    ],
  },
  note: "Re-expresses hero-image:overlay-bottom: the dark block over the photo's lower edge is a field under it, the headline's backing panel where they meet.",
});
