import { definePreset } from "@sb/spec";

/** One of the client's photos tall in a low arch on the left; the heading and the client's highlights as ruled rows beside it. Without a photo the words take the width. */
export default definePreset({
  id: "composition/highlights/photo-list",
  tags: { mood: ["photo", "list", "calm"], stances: ["portrait-first", "plecnik-classicism"] },
  needs: ["copy.headline", "brief.highlights[1]"],
  props: {
    intent: "highlights",
    width: "contained",
    rows: 2,
    elements: [
      { id: "e_photo", kind: "image", image: "{images[1]}", ratio: "4:5", mask: "arch-low", desk: { col: 1, span: 5, row: 1, rowSpan: 2 }, phone: { order: 2, span: "inset" } },
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 4, weight: 800, desk: { col: 7, span: 6, row: 1, alignY: "end" }, phone: { order: 0, span: "full" } },
      {
        id: "e_l",
        kind: "list",
        items: ["{brief.highlights[0]}", "{brief.highlights[1]}", "{brief.highlights[2]}", "{brief.highlights[3]}", "{brief.highlights[4]}"],
        marker: "rule",
        desk: { col: 7, span: 6, row: 2, alignY: "start" },
        phone: { order: 1, span: "full" },
      },
    ],
  },
  reflow: { e_photo: { e_h: { col: 1, span: 8 }, e_l: { col: 1, span: 8 } } },
  note: "From kmetija-ravnjak's highlights (a photo standing beside the season's lines) with the arch-low mask: a photo and a list side by side, the list closing to the left when there is no photo.",
});
