import { definePreset } from "@sb/spec";

/** The heading, then four of the client's highlights stepping down and to the right like a staircase, each written on its own ruled line. */
export default definePreset({
  id: "composition/highlights/staircase",
  tags: { mood: ["type", "rhythm", "rule"], stances: ["workshop-docket", "swiss-grid"] },
  needs: ["copy.headline", "brief.highlights[2]"],
  props: {
    intent: "highlights",
    width: "wide",
    rows: 5,
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 4, weight: 800, desk: { col: 1, span: 6, row: 1 }, phone: { order: 0, span: "full" } },
      { id: "e_l0", kind: "heading", text: "{brief.highlights[0]}", level: 3, size: 3, weight: 600, measure: "l", treatment: "typed-line", desk: { col: 1, span: 6, row: 2 }, phone: { order: 1, span: "full" } },
      { id: "e_l1", kind: "heading", text: "{brief.highlights[1]}", level: 3, size: 3, weight: 600, measure: "l", treatment: "typed-line", desk: { col: 3, span: 6, row: 3 }, phone: { order: 2, span: "full" } },
      { id: "e_l2", kind: "heading", text: "{brief.highlights[2]}", level: 3, size: 3, weight: 600, measure: "l", treatment: "typed-line", desk: { col: 5, span: 6, row: 4 }, phone: { order: 3, span: "full" } },
      { id: "e_l3", kind: "heading", text: "{brief.highlights[3]}", level: 3, size: 3, weight: 600, measure: "l", treatment: "typed-line", desk: { col: 7, span: 6, row: 5 }, phone: { order: 4, span: "full" } },
    ],
  },
  // Three highlights end the staircase a step early.
  reflow: { e_l3: {} },
  note: "From kmetija-ravnjak's highlights (short headed lines walking down the page) and the workshop-docket stance's typed line: the lines step across the grid instead of stacking in a column.",
});
