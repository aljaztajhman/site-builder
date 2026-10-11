import { definePreset } from "@sb/spec";

/** The heading, then each offering on its own row: its name bold on the left, its description beside it. */
export default definePreset({
  id: "composition/services/named-rows",
  tags: { mood: ["list", "practical", "rows"], stances: ["functional-catalogue", "station-timetable"] },
  needs: ["copy.headline", "brief.offerings[0].name"],
  props: {
    intent: "services",
    width: "contained",
    rows: 6,
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 4, desk: { col: 1, span: 8, row: 1 }, phone: { order: 0, span: "full" } },
      { id: "e_n0", kind: "heading", text: "{brief.offerings[0].name}", level: 3, size: 1, weight: 700, desk: { col: 1, span: 4, row: 2 }, phone: { order: 1, span: "full" } },
      { id: "e_d0", kind: "text", paragraphs: ["{brief.offerings[0].description}"], desk: { col: 5, span: 6, row: 2 }, phone: { order: 2, span: "full" } },
      { id: "e_n1", kind: "heading", text: "{brief.offerings[1].name}", level: 3, size: 1, weight: 700, desk: { col: 1, span: 4, row: 3 }, phone: { order: 3, span: "full" } },
      { id: "e_d1", kind: "text", paragraphs: ["{brief.offerings[1].description}"], desk: { col: 5, span: 6, row: 3 }, phone: { order: 4, span: "full" } },
      { id: "e_n2", kind: "heading", text: "{brief.offerings[2].name}", level: 3, size: 1, weight: 700, desk: { col: 1, span: 4, row: 4 }, phone: { order: 5, span: "full" } },
      { id: "e_d2", kind: "text", paragraphs: ["{brief.offerings[2].description}"], desk: { col: 5, span: 6, row: 4 }, phone: { order: 6, span: "full" } },
      { id: "e_n3", kind: "heading", text: "{brief.offerings[3].name}", level: 3, size: 1, weight: 700, desk: { col: 1, span: 4, row: 5 }, phone: { order: 7, span: "full" } },
      { id: "e_d3", kind: "text", paragraphs: ["{brief.offerings[3].description}"], desk: { col: 5, span: 6, row: 5 }, phone: { order: 8, span: "full" } },
      { id: "e_n4", kind: "heading", text: "{brief.offerings[4].name}", level: 3, size: 1, weight: 700, desk: { col: 1, span: 4, row: 6 }, phone: { order: 9, span: "full" } },
      { id: "e_d4", kind: "text", paragraphs: ["{brief.offerings[4].description}"], desk: { col: 5, span: 6, row: 6 }, phone: { order: 10, span: "full" } },
    ],
  },
  note: "Re-expresses services-list:rows: name and description per row (a description the client didn't give leaves the name alone).",
});
