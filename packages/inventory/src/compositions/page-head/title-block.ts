import { definePreset } from "@sb/spec";

/** The page's title in a ruled frame as wide as its words, like a drawing's title block; the lead beside it to the right, on the frame's baseline. */
export default definePreset({
  id: "composition/page-head/title-block",
  tags: { mood: ["frame", "rule", "technical"], stances: ["technical-drawing", "axonometric", "functional-catalogue"] },
  needs: ["copy.headline"],
  props: {
    intent: "page-head",
    width: "contained",
    rows: 1,
    elements: [
      { id: "e_title", kind: "heading", text: "{copy.headline}", level: 1, size: 6, weight: 800, measure: "m", treatment: "title-block", desk: { col: 1, span: 7, row: 1, alignY: "end" }, phone: { order: 0, span: "full" } },
      { id: "e_t", kind: "text", paragraphs: ["{copy.lead}"], size: 1, desk: { col: 8, span: 5, row: 1, alignY: "end" }, phone: { order: 1, span: "full" } },
    ],
  },
  note: "From mizarstvo-rozman (its name set in a title-block frame) and the technical-drawing stance: the page title framed as a drawing's title block, the lead beside it.",
});
