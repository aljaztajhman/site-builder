import { definePreset } from "@sb/spec";

/** One of the client's photos on the left; the heading and the story beside it, set low against the photo. */
export default definePreset({
  id: "composition/story/photo-left-text",
  tags: { mood: ["photo", "split", "calm"] },
  needs: ["copy.headline"],
  props: {
    intent: "story",
    width: "contained",
    rows: 2,
    elements: [
      { id: "e_photo", kind: "image", image: "{images[0]}", ratio: "4:3", desk: { col: 1, span: 6, row: 1, rowSpan: 2 }, phone: { order: 0, span: "full" } },
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 3, desk: { col: 8, span: 5, row: 1, alignY: "end" }, phone: { order: 1, span: "full" } },
      { id: "e_t", kind: "text", paragraphs: ["{copy.lead}"], desk: { col: 8, span: 5, row: 2 }, phone: { order: 2, span: "full" } },
    ],
  },
  // Without a photo the words take a readable measure.
  reflow: { e_photo: { e_h: { col: 1, span: 8 }, e_t: { col: 1, span: 7 } } },
  note: "Re-expresses image-text:image-left: photo and words in two halves.",
});
