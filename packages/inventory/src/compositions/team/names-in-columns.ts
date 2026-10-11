import { definePreset } from "@sb/spec";

/** The heading, then up to three people side by side: each name with the role under it. */
export default definePreset({
  id: "composition/team/names-in-columns",
  tags: { mood: ["type", "personal", "grid"] },
  needs: ["copy.headline", "brief.people[0].name"],
  props: {
    intent: "team",
    width: "contained",
    rows: 3,
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 4, desk: { col: 1, span: 8, row: 1 }, phone: { order: 0, span: "full" } },
      { id: "e_n0", kind: "heading", text: "{brief.people[0].name}", level: 3, size: 2, desk: { col: 1, span: 4, row: 2 }, phone: { order: 1, span: "full" } },
      { id: "e_r0", kind: "text", paragraphs: ["{brief.people[0].role}"], desk: { col: 1, span: 4, row: 3 }, phone: { order: 2, span: "full" } },
      { id: "e_n1", kind: "heading", text: "{brief.people[1].name}", level: 3, size: 2, desk: { col: 5, span: 4, row: 2 }, phone: { order: 3, span: "full" } },
      { id: "e_r1", kind: "text", paragraphs: ["{brief.people[1].role}"], desk: { col: 5, span: 4, row: 3 }, phone: { order: 4, span: "full" } },
      { id: "e_n2", kind: "heading", text: "{brief.people[2].name}", level: 3, size: 2, desk: { col: 9, span: 4, row: 2 }, phone: { order: 5, span: "full" } },
      { id: "e_r2", kind: "text", paragraphs: ["{brief.people[2].role}"], desk: { col: 9, span: 4, row: 3 }, phone: { order: 6, span: "full" } },
    ],
  },
  // Without a role the name holds both rows.
  reflow: { e_r0: { e_n0: { rowSpan: 2 } }, e_r1: { e_n1: { rowSpan: 2 } }, e_r2: { e_n2: { rowSpan: 2 } } },
  note: "Re-expresses team:grid: the people from the brief, names and roles only.",
});
