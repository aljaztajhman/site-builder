import { definePreset } from "@sb/spec";

/** The heading, then the opening hours as a week chart across the width. */
export default definePreset({
  id: "composition/hours/week-chart",
  tags: { mood: ["practical", "chart"], stances: ["station-timetable", "transit-diagram"] },
  needs: ["copy.headline"],
  props: {
    intent: "hours",
    width: "contained",
    rows: 2,
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 4, desk: { col: 1, span: 8, row: 1 }, phone: { order: 0, span: "full" } },
      { id: "e_hours", kind: "hours", style: "week", desk: { col: 1, span: 12, row: 2 }, phone: { order: 1, span: "full" } },
    ],
  },
  note: "Re-expresses opening-hours:week: a bar per day on one time scale.",
});
