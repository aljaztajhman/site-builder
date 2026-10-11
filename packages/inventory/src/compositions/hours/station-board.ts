import { definePreset } from "@sb/spec";

/** The whole section on the inverse ground, like a station's departure board: the heading in capitals on the left, the opening hours as the board's table, the phone split from its label under the heading. */
export default definePreset({
  id: "composition/hours/station-board",
  tags: { mood: ["dark", "board", "rule"], stances: ["station-timetable", "transit-diagram"] },
  needs: ["copy.headline"],
  props: {
    intent: "hours",
    width: "wide",
    rows: 2,
    background: [{ kind: "field", role: "inverse" }],
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 5, weight: 800, case: "uppercase", measure: "s", color: "onInverse", desk: { col: 1, span: 4, row: 1 }, phone: { order: 0, span: "full" } },
      { id: "e_hours", kind: "hours", style: "table", color: "onInverse", desk: { col: 6, span: 7, row: 1, rowSpan: 2 }, phone: { order: 1, span: "full" } },
      { id: "e_phone", kind: "fact", value: "{business.phone}", label: "Pokličite", treatment: "split", size: 3, link: { action: "call" }, color: "onInverse", desk: { col: 1, span: 4, row: 2, alignY: "end" }, phone: { order: 2, span: "full" } },
    ],
  },
  reflow: { e_phone: { e_h: { rowSpan: 2 } } },
  note: "From Zobna ambulanta Hribar (station-timetable: the surgery hours read like a departure board): the hours on a dark board across the page, the phone ruled off beside them.",
});
