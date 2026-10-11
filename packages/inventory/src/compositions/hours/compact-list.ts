import { definePreset } from "@sb/spec";

/** The heading, then the opening hours as a short list under it. */
export default definePreset({
  id: "composition/hours/compact-list",
  tags: { mood: ["practical", "compact"] },
  needs: ["copy.headline"],
  props: {
    intent: "hours",
    width: "contained",
    rows: 2,
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 4, desk: { col: 1, span: 6, row: 1 }, phone: { order: 0, span: "full" } },
      { id: "e_hours", kind: "hours", style: "compact", desk: { col: 1, span: 6, row: 2 }, phone: { order: 1, span: "full" } },
    ],
  },
  note: "Re-expresses opening-hours:compact.",
});
