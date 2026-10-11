import { definePreset } from "@sb/spec";

/** The heading and the lead as a dark note on the left; the offerings as a ruled list on the right. */
export default definePreset({
  id: "composition/services/aside-note",
  tags: { mood: ["list", "panel"] },
  needs: ["copy.headline", "brief.offerings[1].name"],
  props: {
    intent: "services",
    width: "contained",
    rows: 2,
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 4, desk: { col: 1, span: 5, row: 1 }, phone: { order: 0, span: "full" } },
      { id: "e_t", kind: "text", paragraphs: ["{copy.lead}"], fill: "inverse", desk: { col: 1, span: 5, row: 2, alignY: "start" }, phone: { order: 1, span: "full" } },
      {
        id: "e_l",
        kind: "list",
        items: ["{brief.offerings[0].name}", "{brief.offerings[1].name}", "{brief.offerings[2].name}", "{brief.offerings[3].name}", "{brief.offerings[4].name}", "{brief.offerings[5].name}"],
        marker: "rule",
        weight: "medium",
        size: 1,
        desk: { col: 7, span: 6, row: 1, rowSpan: 2 },
        phone: { order: 2, span: "full" },
      },
    ],
  },
  // Without a lead the heading holds both rows.
  reflow: { e_t: { e_h: { rowSpan: 2 } } },
  note: "Re-expresses services-list:aside: the variant's dark note box is the lead with its own inverse ground.",
});
