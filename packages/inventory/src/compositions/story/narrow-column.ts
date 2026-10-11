import { definePreset } from "@sb/spec";

/** The heading and the story in one narrow column at the left, the rest of the width left empty. */
export default definePreset({
  id: "composition/story/narrow-column",
  tags: { mood: ["type", "quiet", "airy"] },
  needs: ["copy.headline", "copy.lead"],
  props: {
    intent: "story",
    width: "contained",
    rows: 2,
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 4, desk: { col: 1, span: 7, row: 1 }, phone: { order: 0, span: "full" } },
      { id: "e_t", kind: "text", paragraphs: ["{copy.lead}"], size: 1, desk: { col: 1, span: 6, row: 2 }, phone: { order: 1, span: "full" } },
    ],
  },
  note: "Re-expresses text:narrow: one short measure, nothing beside it.",
});
