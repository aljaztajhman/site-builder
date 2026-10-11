import { definePreset } from "@sb/spec";

/** The heading on the left, the opening hours as a table on the right, with the hours' note. */
export default definePreset({
  id: "composition/hours/heading-table",
  tags: { mood: ["practical", "quiet"] },
  needs: ["copy.headline"],
  props: {
    intent: "hours",
    width: "contained",
    rows: 1,
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 4, desk: { col: 1, span: 5, row: 1 }, phone: { order: 0, span: "full" } },
      { id: "e_hours", kind: "hours", style: "table", desk: { col: 7, span: 6, row: 1 }, phone: { order: 1, span: "full" } },
    ],
  },
  note: "Re-expresses opening-hours:table.",
});
