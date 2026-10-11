import { definePreset } from "@sb/spec";

/** One of the client's photos in a large circle on the left; the heading, the story and the call beside it. */
export default definePreset({
  id: "composition/story/round-photo",
  tags: { mood: ["round", "photo", "friendly"] },
  needs: ["copy.headline"],
  props: {
    intent: "story",
    width: "contained",
    rows: 3,
    elements: [
      { id: "e_photo", kind: "image", image: "{images[0]}", ratio: "1:1", mask: "circle", desk: { col: 1, span: 5, row: 1, rowSpan: 3 }, phone: { order: 0, span: "full" } },
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 3, desk: { col: 7, span: 6, row: 1, alignY: "end" }, phone: { order: 1, span: "full" } },
      { id: "e_t", kind: "text", paragraphs: ["{copy.lead}"], desk: { col: 7, span: 6, row: 2, alignY: "center" }, phone: { order: 2, span: "full" } },
      { id: "e_call", kind: "action", action: "call", label: "Pokličite", style: "primary", desk: { col: 7, span: 2, row: 3, alignY: "start" }, phone: { order: 3, span: "full" } },
    ],
  },
  // Without a photo the words move to the left.
  reflow: { e_photo: { e_h: { col: 1, span: 8 }, e_t: { col: 1, span: 7 }, e_call: { col: 1 } } },
  note: "Re-expresses image-text:round: the circle mask and the words with one action.",
});
