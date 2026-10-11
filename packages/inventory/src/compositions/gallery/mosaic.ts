import { definePreset } from "@sb/spec";

/** The heading, then the client's photos as a mosaic: four landscape photos in two rows and a tall one beside them. */
export default definePreset({
  id: "composition/gallery/mosaic",
  tags: { mood: ["photo", "mosaic"] },
  needs: ["copy.headline", "images[2]"],
  props: {
    intent: "gallery",
    width: "contained",
    rows: 3,
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 4, desk: { col: 1, span: 8, row: 1 }, phone: { order: 0, span: "full" } },
      { id: "e_p0", kind: "image", image: "{images[0]}", ratio: "4:3", desk: { col: 1, span: 4, row: 2 }, phone: { order: 1, span: "half" } },
      { id: "e_p1", kind: "image", image: "{images[1]}", ratio: "4:3", desk: { col: 5, span: 4, row: 2 }, phone: { order: 2, span: "half" } },
      { id: "e_p2", kind: "image", image: "{images[2]}", ratio: "fill", desk: { col: 9, span: 4, row: 2, rowSpan: 2 }, phone: { order: 3, span: "full" } },
      { id: "e_p3", kind: "image", image: "{images[3]}", ratio: "4:3", desk: { col: 1, span: 4, row: 3 }, phone: { order: 4, span: "half" } },
      { id: "e_p4", kind: "image", image: "{images[4]}", ratio: "4:3", desk: { col: 5, span: 4, row: 3 }, phone: { order: 5, span: "half" } },
    ],
  },
  // Missing photos in the second row leave the mosaic one row shorter.
  reflow: { e_p3: {}, e_p4: {} },
  note: "Re-expresses gallery:mosaic: the tall photo fills the height of the two rows beside it.",
});
