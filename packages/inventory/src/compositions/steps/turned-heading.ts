import { definePreset } from "@sb/spec";

const step = (i: number) => ({ title: `{brief.steps[${i}].title}`, text: `{brief.steps[${i}].text}` });

/** The steps wide on the left; the heading turned up the right edge on desktop, a plain heading first on phones. */
export default definePreset({
  id: "composition/steps/turned-heading",
  tags: { mood: ["type", "asymmetric", "process"], stances: ["swiss-grid", "station-timetable"] },
  needs: ["copy.headline", "brief.steps[0].title", "brief.steps[1].title"],
  props: {
    intent: "steps",
    width: "contained",
    rows: 1,
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 5, weight: 800, rotate: "-90", desk: { col: 11, span: 2, row: 1, alignX: "end" }, phone: { order: 0, span: "full" } },
      { id: "e_steps", kind: "steps", style: "numbered", items: [step(0), step(1), step(2), step(3), step(4), step(5)], desk: { col: 1, span: 9, row: 1, alignY: "center" }, phone: { order: 1, span: "full" } },
    ],
  },
  note: "From the station-timetable stance (Zobna ambulanta Hribar: the board's title runs up its side) and L Ogledalo: the heading turned up the edge so the steps own the width.",
});
