import { definePreset } from "@sb/spec";

/** One of the client's photos as a wide band from page edge to page edge; under it the heading on the left and two tall photos stepped down on the right. */
export default definePreset({
  id: "composition/gallery/wide-then-pair",
  tags: { mood: ["photo", "wide", "rhythm"], stances: ["julian-alps", "editorial-magazine"] },
  needs: ["copy.headline", "images[0]"],
  props: {
    intent: "gallery",
    width: "wide",
    rows: 2,
    elements: [
      { id: "e_wide", kind: "image", image: "{images[0]}", ratio: "21:9", desk: { col: 1, span: 12, row: 1, bleedX: "both" }, phone: { order: 1, span: "bleed" } },
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 4, weight: 800, desk: { col: 1, span: 4, row: 2 }, phone: { order: 0, span: "full" } },
      { id: "e_p1", kind: "image", image: "{images[1]}", ratio: "4:5", desk: { col: 5, span: 4, row: 2 }, phone: { order: 2, span: "half" } },
      { id: "e_p2", kind: "image", image: "{images[2]}", ratio: "4:5", desk: { col: 9, span: 4, row: 2, shiftY: 3 }, phone: { order: 3, span: "half" } },
    ],
  },
  reflow: { e_p1: {}, e_p2: {} },
  note: "From fizioterapija-spik (one photo full bleed at 21:9) and J Skorja (photos that run off an edge): a wide band, then a stepped pair under it.",
});
