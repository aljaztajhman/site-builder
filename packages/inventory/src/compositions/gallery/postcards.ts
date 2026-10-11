import { definePreset } from "@sb/spec";

/** The heading, then three of the client's photos as postcards scattered at small angles, the third laid over the gap between the first two. */
export default definePreset({
  id: "composition/gallery/postcards",
  tags: { mood: ["photo", "playful", "tilt"], stances: ["picture-postcard", "hut-stamp-booklet"] },
  needs: ["copy.headline", "images[1]"],
  props: {
    intent: "gallery",
    width: "contained",
    rows: 3,
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 4, weight: 800, desk: { col: 1, span: 6, row: 1 }, phone: { order: 0, span: "full" } },
      { id: "e_p0", kind: "image", image: "{images[0]}", ratio: "3:2", mask: "postcard", desk: { col: 1, span: 6, row: 2, tilt: -3 }, phone: { order: 1, span: "full" } },
      { id: "e_p1", kind: "image", image: "{images[1]}", ratio: "3:2", mask: "postcard", desk: { col: 7, span: 5, row: 2, alignY: "end", tilt: 2 }, phone: { order: 2, span: "full" } },
      { id: "e_p2", kind: "image", image: "{images[2]}", ratio: "3:2", mask: "postcard", desk: { col: 4, span: 5, row: 3, tilt: -1, shiftY: -2, layer: 1 }, phone: { order: 3, span: "full" } },
    ],
  },
  reflow: { e_p2: {} },
  note: "From the picture-postcard stance and kmetija-kramar's tilted stamps: the photos as postcards on a table, tilted and overlapping, never a grid.",
});
