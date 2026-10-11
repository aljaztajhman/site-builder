import { definePreset } from "@sb/spec";

/** The heading, then four offerings in two columns, each a bold name with its description under it. */
export default definePreset({
  id: "composition/services/two-column-named",
  tags: { mood: ["list", "grid", "practical"] },
  needs: ["copy.headline", "brief.offerings[0].name"],
  props: {
    intent: "services",
    width: "contained",
    rows: 5,
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 4, desk: { col: 1, span: 8, row: 1 }, phone: { order: 0, span: "full" } },
      { id: "e_n0", kind: "heading", text: "{brief.offerings[0].name}", level: 3, size: 1, weight: 700, desk: { col: 1, span: 6, row: 2 }, phone: { order: 1, span: "full" } },
      { id: "e_d0", kind: "text", paragraphs: ["{brief.offerings[0].description}"], desk: { col: 1, span: 5, row: 3 }, phone: { order: 2, span: "full" } },
      { id: "e_n1", kind: "heading", text: "{brief.offerings[1].name}", level: 3, size: 1, weight: 700, desk: { col: 7, span: 6, row: 2 }, phone: { order: 3, span: "full" } },
      { id: "e_d1", kind: "text", paragraphs: ["{brief.offerings[1].description}"], desk: { col: 7, span: 5, row: 3 }, phone: { order: 4, span: "full" } },
      { id: "e_n2", kind: "heading", text: "{brief.offerings[2].name}", level: 3, size: 1, weight: 700, desk: { col: 1, span: 6, row: 4 }, phone: { order: 5, span: "full" } },
      { id: "e_d2", kind: "text", paragraphs: ["{brief.offerings[2].description}"], desk: { col: 1, span: 5, row: 5 }, phone: { order: 6, span: "full" } },
      { id: "e_n3", kind: "heading", text: "{brief.offerings[3].name}", level: 3, size: 1, weight: 700, desk: { col: 7, span: 6, row: 4 }, phone: { order: 7, span: "full" } },
      { id: "e_d3", kind: "text", paragraphs: ["{brief.offerings[3].description}"], desk: { col: 7, span: 5, row: 5 }, phone: { order: 8, span: "full" } },
    ],
  },
  // Without a description the name holds both rows of its cell.
  reflow: { e_d0: { e_n0: { rowSpan: 2 } }, e_d1: { e_n1: { rowSpan: 2 } }, e_d2: { e_n2: { rowSpan: 2 } }, e_d3: { e_n3: { rowSpan: 2 } } },
  note: "Re-expresses services-list:two-column: name over description, two to a row.",
});
