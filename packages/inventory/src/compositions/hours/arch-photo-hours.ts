import { definePreset } from "@sb/spec";

/** One of the client's photos in an arch on the left with a second one round over its corner; the heading and the hours table on the right. */
export default definePreset({
  id: "composition/hours/arch-photo-hours",
  tags: { mood: ["photo", "arch", "warm"] },
  needs: ["copy.headline", "images[0]"],
  props: {
    intent: "hours",
    width: "contained",
    rows: 2,
    elements: [
      { id: "e_photo", kind: "image", image: "{images[0]}", ratio: "4:5", mask: "arch", desk: { col: 1, span: 5, row: 1, rowSpan: 2 }, phone: { order: 0, span: "full" } },
      { id: "e_inset", kind: "image", image: "{images[1]}", ratio: "1:1", mask: "circle", desk: { col: 5, span: 2, row: 2, layer: 1, alignY: "end" }, phone: { order: 1, span: "half", hidden: true } },
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 3, desk: { col: 7, span: 6, row: 1, alignY: "end" }, phone: { order: 2, span: "full" } },
      { id: "e_hours", kind: "hours", style: "table", desk: { col: 7, span: 6, row: 2 }, phone: { order: 3, span: "full" } },
    ],
  },
  note: "Re-expresses opening-hours:photo: the arch and the round inset are the client's photos.",
});
