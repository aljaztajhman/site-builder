import { definePreset } from "@sb/spec";

/** The heading small, then four of the client's highlights set large and bold, two to a row. */
export default definePreset({
  id: "composition/highlights/large-lines",
  tags: { mood: ["type", "bold"], stances: ["oversized-type"] },
  needs: ["copy.headline", "brief.highlights[1]"],
  props: {
    intent: "highlights",
    width: "wide",
    rows: 3,
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 2, desk: { col: 1, span: 6, row: 1 }, phone: { order: 0, span: "full" } },
      { id: "e_l0", kind: "heading", text: "{brief.highlights[0]}", level: 3, size: 3, weight: 700, measure: "l", desk: { col: 1, span: 5, row: 2 }, phone: { order: 1, span: "full" } },
      { id: "e_l1", kind: "heading", text: "{brief.highlights[1]}", level: 3, size: 3, weight: 700, measure: "l", desk: { col: 7, span: 5, row: 2 }, phone: { order: 2, span: "full" } },
      { id: "e_l2", kind: "heading", text: "{brief.highlights[2]}", level: 3, size: 3, weight: 700, measure: "l", desk: { col: 1, span: 5, row: 3 }, phone: { order: 3, span: "full" } },
      { id: "e_l3", kind: "heading", text: "{brief.highlights[3]}", level: 3, size: 3, weight: 700, measure: "l", desk: { col: 7, span: 5, row: 3 }, phone: { order: 4, span: "full" } },
    ],
  },
  // A missing highlight leaves its cell empty.
  reflow: { e_l2: {}, e_l3: {} },
  note: "Re-expresses highlights:figures: the emphasis is the type size (no number slot, so each highlight is a large line of its own).",
});
