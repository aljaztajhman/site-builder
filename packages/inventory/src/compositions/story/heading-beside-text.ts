import { definePreset } from "@sb/spec";

/** The heading on the left, the story beside it on the right, starting on the heading's first line. */
export default definePreset({
  id: "composition/story/heading-beside-text",
  tags: { mood: ["type", "editorial"] },
  needs: ["copy.headline", "copy.lead"],
  props: {
    intent: "story",
    width: "contained",
    rows: 1,
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 4, desk: { col: 1, span: 5, row: 1 }, phone: { order: 0, span: "full" } },
      { id: "e_t", kind: "text", paragraphs: ["{copy.lead}"], desk: { col: 7, span: 6, row: 1 }, phone: { order: 1, span: "full" } },
    ],
  },
  // Without a story the heading takes a long measure.
  reflow: { e_t: { e_h: { span: 8 } } },
  note: "Re-expresses text:two-column: heading and text side by side.",
});
