import { definePreset } from "@sb/spec";

/** The heading, then three of the client's photos in arches side by side, the middle one taller, the last one running off the right edge. */
export default definePreset({
  id: "composition/gallery/arch-row",
  tags: { mood: ["photo", "arch", "rhythm"], stances: ["portrait-first", "plecnik-classicism"] },
  needs: ["copy.headline", "images[1]"],
  props: {
    intent: "gallery",
    width: "wide",
    rows: 2,
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 5, weight: 800, desk: { col: 1, span: 6, row: 1 }, phone: { order: 0, span: "full" } },
      { id: "e_a", kind: "image", image: "{images[0]}", ratio: "4:5", mask: "arch", desk: { col: 1, span: 4, row: 2, alignY: "end" }, phone: { order: 1, span: "full" } },
      { id: "e_b", kind: "image", image: "{images[1]}", ratio: "3:4", mask: "arch", desk: { col: 5, span: 4, row: 2, alignY: "end" }, phone: { order: 2, span: "half" } },
      { id: "e_c", kind: "image", image: "{images[2]}", ratio: "4:5", mask: "arch", desk: { col: 9, span: 4, row: 2, alignY: "end", bleedX: "end" }, phone: { order: 3, span: "half" } },
    ],
  },
  reflow: { e_c: { e_a: { span: 6 }, e_b: { col: 7, span: 6 } } },
  note: "From L Ogledalo (three mirrors in arches of different heights): the photos as a row of arches standing on one line, the tallest in the middle, the last cut by the page edge.",
});
