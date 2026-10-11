import { definePreset } from "@sb/spec";

const person = (i: number) => ({ lead: `{brief.people[${i}].name}`, text: `{brief.people[${i}].role}` });

/** The whole section on the inverse ground: the heading at display size and the lead on the left, the people as a large ruled roster, name and role, on the right. */
export default definePreset({
  id: "composition/team/dark-roster",
  tags: { mood: ["dark", "type", "list"], stances: ["night-ground", "station-timetable"] },
  needs: ["copy.headline", "brief.people[0].name"],
  props: {
    intent: "team",
    width: "wide",
    rows: 2,
    background: [{ kind: "field", role: "inverse" }],
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 6, weight: 800, measure: "s", color: "onInverse", desk: { col: 1, span: 5, row: 1 }, phone: { order: 0, span: "full" } },
      { id: "e_t", kind: "text", paragraphs: ["{copy.lead}"], color: "onInverse", desk: { col: 1, span: 4, row: 2 }, phone: { order: 1, span: "full" } },
      { id: "e_l", kind: "list", items: [person(0), person(1), person(2), person(3), person(4), person(5)], marker: "rule", size: 2, color: "onInverse", desk: { col: 7, span: 6, row: 1, rowSpan: 2, alignY: "center" }, phone: { order: 2, span: "full" } },
    ],
  },
  reflow: { e_t: { e_h: { rowSpan: 2 } } },
  note: "From Zobna ambulanta Hribar (station-timetable: names read off a dark board) and J Skorja's dark band: the people as a roster on a dark ground, the heading poster size beside it.",
});
