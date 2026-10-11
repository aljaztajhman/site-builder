import { definePreset } from "@sb/spec";

/** The heading, then two offerings as rows: a photo on the left, the name and description beside it; the call under them. */
export default definePreset({
  id: "composition/rooms/photo-rows",
  tags: { mood: ["photo", "rows"], trades: ["tourist-farm"] },
  needs: ["copy.headline", "brief.offerings[0].name"],
  props: {
    intent: "rooms",
    width: "contained",
    rows: 6,
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 4, desk: { col: 1, span: 8, row: 1 }, phone: { order: 0, span: "full" } },
      { id: "e_i0", kind: "image", image: "{images[0]}", ratio: "4:3", desk: { col: 1, span: 5, row: 2, rowSpan: 2 }, phone: { order: 1, span: "full" } },
      { id: "e_n0", kind: "heading", text: "{brief.offerings[0].name}", level: 3, size: 2, desk: { col: 7, span: 6, row: 2, alignY: "end" }, phone: { order: 2, span: "full" } },
      { id: "e_d0", kind: "text", paragraphs: ["{brief.offerings[0].description}"], desk: { col: 7, span: 6, row: 3 }, phone: { order: 3, span: "full" } },
      { id: "e_i1", kind: "image", image: "{images[1]}", ratio: "4:3", desk: { col: 1, span: 5, row: 4, rowSpan: 2 }, phone: { order: 4, span: "full" } },
      { id: "e_n1", kind: "heading", text: "{brief.offerings[1].name}", level: 3, size: 2, desk: { col: 7, span: 6, row: 4, alignY: "end" }, phone: { order: 5, span: "full" } },
      { id: "e_d1", kind: "text", paragraphs: ["{brief.offerings[1].description}"], desk: { col: 7, span: 6, row: 5 }, phone: { order: 6, span: "full" } },
      { id: "e_call", kind: "action", action: "call", label: "Pokličite", style: "secondary", desk: { col: 7, span: 3, row: 6, alignY: "start" }, phone: { order: 7, span: "full" } },
    ],
  },
  // A missing photo widens the words; a missing description lets the name hold both rows.
  reflow: { e_i0: { e_n0: { col: 1, span: 8 }, e_d0: { col: 1, span: 7 } }, e_d0: { e_n0: { rowSpan: 2, alignY: "start" } }, e_i1: { e_n1: { col: 1, span: 8 }, e_d1: { col: 1, span: 7 } }, e_d1: { e_n1: { rowSpan: 2, alignY: "start" } } },
  note: "Re-expresses rooms:rows: photo beside words per row, one call for the section.",
});
