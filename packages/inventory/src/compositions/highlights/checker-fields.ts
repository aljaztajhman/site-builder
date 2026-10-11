import { definePreset } from "@sb/spec";

/** The heading, then four of the client's highlights in a two-by-two checker: one cell on a band block bled to the left edge, the diagonal one on a primary block bled to the right. */
export default definePreset({
  id: "composition/highlights/checker-fields",
  tags: { mood: ["colour-block", "bold", "grid"], stances: ["colour-block", "bauhaus-geometry", "ljubljana-sixties-poster"] },
  needs: ["copy.headline", "brief.highlights[3]"],
  props: {
    intent: "highlights",
    width: "contained",
    rows: 3,
    gap: 5,
    minHeight: "m",
    background: [
      { kind: "field", role: "band", cols: { from: 1, to: 6 }, rows: { from: 2, to: 2 } },
      { kind: "field", role: "primary", cols: { from: 7, to: 12 }, rows: { from: 3, to: 3 } },
    ],
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 4, weight: 800, desk: { col: 1, span: 6, row: 1, alignY: "end" }, phone: { order: 0, span: "full" } },
      { id: "e_a", kind: "heading", text: "{brief.highlights[0]}", level: 3, size: 3, weight: 700, measure: "m", desk: { col: 2, span: 4, row: 2, alignY: "center" }, phone: { order: 1, span: "full" } },
      { id: "e_b", kind: "heading", text: "{brief.highlights[1]}", level: 3, size: 3, weight: 700, measure: "m", desk: { col: 8, span: 4, row: 2, alignY: "center" }, phone: { order: 2, span: "full" } },
      { id: "e_c", kind: "heading", text: "{brief.highlights[2]}", level: 3, size: 3, weight: 700, measure: "m", desk: { col: 2, span: 4, row: 3, alignY: "center" }, phone: { order: 3, span: "full" } },
      { id: "e_d", kind: "heading", text: "{brief.highlights[3]}", level: 3, size: 3, weight: 700, measure: "m", desk: { col: 8, span: 4, row: 3, alignY: "center" }, phone: { order: 4, span: "full" } },
    ],
  },
  note: "From frizerstvo-kroj (bauhaus figures, colour only as flat fields) and jedilnica-brin (two field layers side by side): the highlights as a checker of blocks that run off both page edges.",
});
