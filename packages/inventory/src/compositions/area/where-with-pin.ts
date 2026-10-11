import { definePreset } from "@sb/spec";

/** The heading, a line on where the work is done and the call on the left; a drawn pin map of the base on the right. */
export default definePreset({
  id: "composition/area/where-with-pin",
  tags: { mood: ["map", "practical"], trades: ["builder", "car-repair"] },
  needs: ["copy.headline"],
  props: {
    intent: "area",
    width: "contained",
    rows: 3,
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 4, desk: { col: 1, span: 5, row: 1, alignY: "end" }, phone: { order: 0, span: "full" } },
      { id: "e_t", kind: "text", paragraphs: ["{copy.lead}"], desk: { col: 1, span: 5, row: 2, alignY: "center" }, phone: { order: 1, span: "full" } },
      { id: "e_call", kind: "action", action: "call", label: "Pokličite", style: "primary", desk: { col: 1, span: 2, row: 3, alignY: "start" }, phone: { order: 2, span: "full" } },
      { id: "e_map", kind: "map", style: "pin", desk: { col: 7, span: 6, row: 1, rowSpan: 3 }, phone: { order: 3, span: "full" } },
    ],
  },
  // Without a line the call moves up.
  reflow: { e_t: { e_call: { row: 2 } } },
  note: "Re-expresses service-area:list: the place list has no slot yet, so the base is shown as a pin map with the call.",
});
