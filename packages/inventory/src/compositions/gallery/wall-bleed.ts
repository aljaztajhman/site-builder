import { definePreset } from "@sb/spec";

/** The client's photos as a wall that runs to both page edges: a large and a smaller photo, then three in a row. */
export default definePreset({
  id: "composition/gallery/wall-bleed",
  tags: { mood: ["photo", "bleed", "bold"], stances: ["gallery-wall"] },
  needs: ["copy.headline", "images[2]"],
  props: {
    intent: "gallery",
    width: "full",
    rows: 3,
    gap: 1,
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 4, desk: { col: 1, span: 8, row: 1 }, phone: { order: 0, span: "full" } },
      { id: "e_p0", kind: "image", image: "{images[0]}", ratio: "4:3", desk: { col: 1, span: 7, row: 2, bleedX: "start" }, phone: { order: 1, span: "bleed" } },
      { id: "e_p1", kind: "image", image: "{images[1]}", ratio: "fill", desk: { col: 8, span: 5, row: 2, bleedX: "end" }, phone: { order: 2, span: "full" } },
      { id: "e_p2", kind: "image", image: "{images[2]}", ratio: "4:3", desk: { col: 1, span: 4, row: 3, bleedX: "start" }, phone: { order: 3, span: "half" } },
      { id: "e_p3", kind: "image", image: "{images[3]}", ratio: "4:3", desk: { col: 5, span: 4, row: 3 }, phone: { order: 4, span: "half" } },
      { id: "e_p4", kind: "image", image: "{images[4]}", ratio: "4:3", desk: { col: 9, span: 4, row: 3, bleedX: "end" }, phone: { order: 5, span: "half" } },
    ],
  },
  // Missing photos in the last row leave their cells empty.
  reflow: { e_p3: {}, e_p4: {} },
  note: "Re-expresses gallery:wall: edge-to-edge photos with a narrow gap.",
});
