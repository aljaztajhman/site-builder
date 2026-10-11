import { definePreset } from "@sb/spec";

/** The heading, then the client's highlights in two ruled columns. */
export default definePreset({
  id: "composition/highlights/two-columns",
  tags: { mood: ["list", "ruled", "grid"] },
  needs: ["copy.headline", "brief.highlights[1]"],
  props: {
    intent: "highlights",
    width: "contained",
    rows: 2,
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 4, desk: { col: 1, span: 8, row: 1 }, phone: { order: 0, span: "full" } },
      {
        id: "e_a",
        kind: "list",
        items: ["{brief.highlights[0]}", "{brief.highlights[1]}", "{brief.highlights[2]}"],
        marker: "rule",
        size: 1,
        desk: { col: 1, span: 6, row: 2 },
        phone: { order: 1, span: "full" },
      },
      {
        id: "e_b",
        kind: "list",
        items: ["{brief.highlights[3]}", "{brief.highlights[4]}", "{brief.highlights[5]}"],
        marker: "rule",
        size: 1,
        desk: { col: 7, span: 6, row: 2 },
        phone: { order: 2, span: "full" },
      },
    ],
  },
  // With three highlights or fewer the first column takes the width.
  reflow: { e_b: { e_a: { span: 8 } } },
  note: "Re-expresses highlights:columns: the list split into two columns.",
});
