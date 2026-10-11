import { definePreset } from "@sb/spec";

/** The heading, then offerings two to a row, each a small square photo beside its name and description. */
export default definePreset({
  id: "composition/services/small-cards",
  tags: { mood: ["photo", "cards", "compact"] },
  needs: ["copy.headline", "brief.offerings[1].name"],
  props: {
    intent: "services",
    width: "contained",
    rows: 5,
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 4, desk: { col: 1, span: 8, row: 1 }, phone: { order: 0, span: "full" } },
      { id: "e_i0", kind: "image", image: "{images[0]}", ratio: "1:1", desk: { col: 1, span: 2, row: 2, rowSpan: 2 }, phone: { order: 1, span: "half" } },
      { id: "e_n0", kind: "heading", text: "{brief.offerings[0].name}", level: 3, size: 1, weight: 700, desk: { col: 3, span: 4, row: 2, alignY: "end" }, phone: { order: 2, span: "full" } },
      { id: "e_d0", kind: "text", paragraphs: ["{brief.offerings[0].description}"], desk: { col: 3, span: 4, row: 3, alignY: "start" }, phone: { order: 3, span: "full" } },
      { id: "e_i1", kind: "image", image: "{images[1]}", ratio: "1:1", desk: { col: 7, span: 2, row: 2, rowSpan: 2 }, phone: { order: 4, span: "half" } },
      { id: "e_n1", kind: "heading", text: "{brief.offerings[1].name}", level: 3, size: 1, weight: 700, desk: { col: 9, span: 4, row: 2, alignY: "end" }, phone: { order: 5, span: "full" } },
      { id: "e_d1", kind: "text", paragraphs: ["{brief.offerings[1].description}"], desk: { col: 9, span: 4, row: 3, alignY: "start" }, phone: { order: 6, span: "full" } },
      { id: "e_i2", kind: "image", image: "{images[2]}", ratio: "1:1", desk: { col: 1, span: 2, row: 4, rowSpan: 2 }, phone: { order: 7, span: "half" } },
      { id: "e_n2", kind: "heading", text: "{brief.offerings[2].name}", level: 3, size: 1, weight: 700, desk: { col: 3, span: 4, row: 4, alignY: "end" }, phone: { order: 8, span: "full" } },
      { id: "e_d2", kind: "text", paragraphs: ["{brief.offerings[2].description}"], desk: { col: 3, span: 4, row: 5, alignY: "start" }, phone: { order: 9, span: "full" } },
    ],
  },
  // A missing photo widens the words; a missing description lets the name hold both rows.
  reflow: { e_i0: { e_n0: { col: 1, span: 6 }, e_d0: { col: 1, span: 5 } }, e_d0: { e_n0: { rowSpan: 2 } }, e_i1: { e_n1: { col: 7, span: 6 }, e_d1: { col: 7, span: 5 } }, e_d1: { e_n1: { rowSpan: 2 } }, e_i2: { e_n2: { col: 1, span: 6 }, e_d2: { col: 1, span: 5 } }, e_d2: { e_n2: { rowSpan: 2 } } },
  note: "Re-expresses services-cards:compact: small photo beside the words, two cards to a row.",
});
