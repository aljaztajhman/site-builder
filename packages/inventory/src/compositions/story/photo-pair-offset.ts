import { definePreset } from "@sb/spec";

/** Two of the client's photos as an offset pair on the left, the second overlapping the first; the heading, story and call on the right. */
export default definePreset({
  id: "composition/story/photo-pair-offset",
  tags: { mood: ["photo", "layered"] },
  needs: ["copy.headline", "photos[1]"],
  props: {
    intent: "story",
    width: "contained",
    rows: 3,
    elements: [
      { id: "e_pair", kind: "photos", images: ["{photos[0]}", "{photos[1]}"], arrangement: "offset-pair", desk: { col: 1, span: 6, row: 1, rowSpan: 3 }, phone: { order: 0, span: "full" } },
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 3, desk: { col: 8, span: 5, row: 1, alignY: "end" }, phone: { order: 1, span: "full" } },
      { id: "e_t", kind: "text", paragraphs: ["{copy.lead}"], desk: { col: 8, span: 5, row: 2, alignY: "center" }, phone: { order: 2, span: "full" } },
      { id: "e_call", kind: "action", action: "call", label: "Pokličite", style: "primary", desk: { col: 8, span: 2, row: 3, alignY: "start" }, phone: { order: 3, span: "full" } },
    ],
  },
  note: "Re-expresses image-text:pair: the two photos as one offset-pair element; the variant's big figure is left out (no figure slot).",
});
