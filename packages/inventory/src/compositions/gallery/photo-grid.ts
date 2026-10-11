import { definePreset } from "@sb/spec";

/** The heading, then up to six of the client's photos in an even grid of three. */
export default definePreset({
  id: "composition/gallery/photo-grid",
  tags: { mood: ["photo", "grid"] },
  needs: ["copy.headline", "images[1]"],
  props: {
    intent: "gallery",
    width: "contained",
    rows: 3,
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 4, desk: { col: 1, span: 8, row: 1 }, phone: { order: 0, span: "full" } },
      { id: "e_p0", kind: "image", image: "{images[0]}", ratio: "4:3", desk: { col: 1, span: 4, row: 2 }, phone: { order: 1, span: "half" } },
      { id: "e_p1", kind: "image", image: "{images[1]}", ratio: "4:3", desk: { col: 5, span: 4, row: 2 }, phone: { order: 2, span: "half" } },
      { id: "e_p2", kind: "image", image: "{images[2]}", ratio: "4:3", desk: { col: 9, span: 4, row: 2 }, phone: { order: 3, span: "half" } },
      { id: "e_p3", kind: "image", image: "{images[3]}", ratio: "4:3", desk: { col: 1, span: 4, row: 3 }, phone: { order: 4, span: "half" } },
      { id: "e_p4", kind: "image", image: "{images[4]}", ratio: "4:3", desk: { col: 5, span: 4, row: 3 }, phone: { order: 5, span: "half" } },
      { id: "e_p5", kind: "image", image: "{images[5]}", ratio: "4:3", desk: { col: 9, span: 4, row: 3 }, phone: { order: 6, span: "half" } },
    ],
  },
  // A missing photo leaves its cell empty at the end of the grid.
  reflow: { e_p1: {}, e_p2: {}, e_p3: {}, e_p4: {}, e_p5: {} },
  note: "Re-expresses gallery:grid: an even grid; fewer photos leave a shorter grid, never a hole.",
});
