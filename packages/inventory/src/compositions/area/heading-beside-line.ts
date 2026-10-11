import { definePreset } from "@sb/spec";

/** The heading on the left and one line on where the work is done beside it. */
export default definePreset({
  id: "composition/area/heading-beside-line",
  tags: { mood: ["type", "slim"] },
  needs: ["copy.headline"],
  props: {
    intent: "area",
    width: "contained",
    rows: 1,
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 4, desk: { col: 1, span: 5, row: 1 }, phone: { order: 0, span: "full" } },
      { id: "e_t", kind: "text", paragraphs: ["{copy.lead}"], size: 1, desk: { col: 7, span: 6, row: 1, alignY: "center" }, phone: { order: 1, span: "full" } },
    ],
  },
  note: "Re-expresses service-area:inline: heading and a single line.",
});
