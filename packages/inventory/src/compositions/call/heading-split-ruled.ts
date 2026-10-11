import { definePreset } from "@sb/spec";

/** A rule over the section; the heading large on the left, the line and the call on the right. */
export default definePreset({
  id: "composition/call/heading-split-ruled",
  tags: { mood: ["type", "direct", "editorial"] },
  needs: ["copy.headline"],
  props: {
    intent: "call",
    width: "contained",
    rows: 3,
    elements: [
      { id: "e_rule", kind: "decor", svg: { width: 400, height: 8, paths: [{ d: "M0 4H400", fill: "none", stroke: "text", width: 1 }] }, desk: { col: 1, span: 12, row: 1 }, phone: { order: 0, span: "full" } },
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 5, weight: 800, desk: { col: 1, span: 6, row: 2, rowSpan: 2 }, phone: { order: 1, span: "full" } },
      { id: "e_t", kind: "text", paragraphs: ["{copy.lead}"], desk: { col: 8, span: 5, row: 2 }, phone: { order: 2, span: "full" } },
      { id: "e_call", kind: "action", action: "call", label: "Pokličite", style: "primary", desk: { col: 8, span: 2, row: 3, alignY: "start" }, phone: { order: 3, span: "full" } },
    ],
  },
  // Without a line the call moves up beside the heading.
  reflow: { e_t: { e_call: { row: 2, alignY: "end" } } },
  note: "Re-expresses cta:split: the ruled top, a big heading against a short line and one button.",
});
