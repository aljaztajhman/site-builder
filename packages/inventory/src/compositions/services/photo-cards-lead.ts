import { definePreset } from "@sb/spec";

/** The heading, then three offerings: the first large with a wide photo, the other two stacked beside it with small square photos. */
export default definePreset({
  id: "composition/services/photo-cards-lead",
  tags: { mood: ["photo", "cards", "grid"] },
  needs: ["copy.headline", "brief.offerings[2].name"],
  props: {
    intent: "services",
    width: "contained",
    rows: 5,
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 4, desk: { col: 1, span: 8, row: 1 }, phone: { order: 0, span: "full" } },
      { id: "e_i0", kind: "image", image: "{images[0]}", ratio: "4:3", desk: { col: 1, span: 6, row: 2, rowSpan: 2 }, phone: { order: 1, span: "full" } },
      { id: "e_n0", kind: "heading", text: "{brief.offerings[0].name}", level: 3, size: 2, desk: { col: 1, span: 6, row: 4 }, phone: { order: 2, span: "full" } },
      { id: "e_d0", kind: "text", paragraphs: ["{brief.offerings[0].description}"], desk: { col: 1, span: 6, row: 5 }, phone: { order: 3, span: "full" } },
      { id: "e_i1", kind: "image", image: "{images[1]}", ratio: "1:1", desk: { col: 7, span: 2, row: 2, rowSpan: 2 }, phone: { order: 4, span: "half" } },
      { id: "e_n1", kind: "heading", text: "{brief.offerings[1].name}", level: 3, size: 1, weight: 700, desk: { col: 9, span: 4, row: 2, alignY: "end" }, phone: { order: 5, span: "full" } },
      { id: "e_d1", kind: "text", paragraphs: ["{brief.offerings[1].description}"], desk: { col: 9, span: 4, row: 3, alignY: "start" }, phone: { order: 6, span: "full" } },
      { id: "e_i2", kind: "image", image: "{images[2]}", ratio: "1:1", desk: { col: 7, span: 2, row: 4, rowSpan: 2 }, phone: { order: 7, span: "half" } },
      { id: "e_n2", kind: "heading", text: "{brief.offerings[2].name}", level: 3, size: 1, weight: 700, desk: { col: 9, span: 4, row: 4, alignY: "end" }, phone: { order: 8, span: "full" } },
      { id: "e_d2", kind: "text", paragraphs: ["{brief.offerings[2].description}"], desk: { col: 9, span: 4, row: 5, alignY: "start" }, phone: { order: 9, span: "full" } },
    ],
  },
  // A missing photo or description: the name moves up or holds both rows.
  reflow: { e_i0: { e_n0: { row: 2 }, e_d0: { row: 3, rowSpan: 3 } }, e_i1: { e_n1: { col: 7, span: 6 }, e_d1: { col: 7, span: 6 } }, e_i2: { e_n2: { col: 7, span: 6 }, e_d2: { col: 7, span: 6 } }, e_d0: { e_n0: { rowSpan: 2 } }, e_d1: { e_n1: { rowSpan: 2 } }, e_d2: { e_n2: { rowSpan: 2 } } },
  note: "Re-expresses services-cards:grid: one large card and two small ones; photos are the client's, in order.",
});
