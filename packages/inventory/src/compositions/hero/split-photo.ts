import { definePreset } from "@sb/spec";

/** The section's headline large on the left, its lead and a call below, the client's first photo tall on the right. */
export default definePreset({
  id: "composition/hero/split-photo",
  tags: { mood: ["split", "photo"] },
  needs: ["copy.headline"],
  props: {
    intent: "hero",
    width: "wide",
    minHeight: "m",
    rows: 3,
    elements: [
      { id: "e_title", kind: "heading", text: "{copy.headline}", level: 1, size: 6, weight: 800, measure: "m", desk: { col: 1, span: 7, row: 1 }, phone: { order: 0, span: "full" } },
      { id: "e_lead", kind: "text", paragraphs: ["{copy.lead}"], size: 1, desk: { col: 1, span: 6, row: 2 }, phone: { order: 1, span: "full" } },
      { id: "e_call", kind: "action", action: "call", label: "Pokličite", style: "primary", desk: { col: 1, span: 3, row: 3, alignY: "start" }, phone: { order: 2, span: "full" } },
      { id: "e_photo", kind: "image", image: "{images[0]}", ratio: "4:5", desk: { col: 8, span: 5, row: 1, rowSpan: 3 }, phone: { order: 3, span: "full" } },
    ],
  },
  // Without a photo the headline takes the width and the lead a long measure.
  reflow: { e_photo: { e_title: { span: 10 }, e_lead: { span: 7 } } },
  note: "I3-0 format example; re-expresses hero-split:image-right: a split opener with the client's photo.",
});
