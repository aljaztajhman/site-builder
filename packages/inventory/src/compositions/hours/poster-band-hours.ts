import { definePreset } from "@sb/spec";

/** The heading very large on the left; the opening hours on a coloured block of their own on the right. */
export default definePreset({
  id: "composition/hours/poster-band-hours",
  tags: { mood: ["bold", "poster"], stances: ["shopfront-fascia", "ljubljana-sixties-poster"] },
  needs: ["copy.headline"],
  props: {
    intent: "hours",
    width: "wide",
    rows: 1,
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 6, weight: 800, measure: "s", desk: { col: 1, span: 6, row: 1, alignY: "center" }, phone: { order: 0, span: "full" } },
      { id: "e_hours", kind: "hours", style: "table", fill: "band", desk: { col: 8, span: 5, row: 1 }, phone: { order: 1, span: "full" } },
    ],
  },
  note: "Re-expresses opening-hours:poster: the heading at poster size, the hours as their own band-coloured object.",
});
