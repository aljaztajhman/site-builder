import { definePreset } from "@sb/spec";

/** The heading on the left with a small square photo under it; on the right, one of the client's photos cut into three panels like a triptych. */
export default definePreset({
  id: "composition/gallery/triptych-aside",
  tags: { mood: ["photo", "panels", "calm"], stances: ["plecnik-classicism", "gallery-wall"] },
  needs: ["copy.headline", "images[0]"],
  props: {
    intent: "gallery",
    width: "contained",
    rows: 2,
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 4, weight: 800, desk: { col: 1, span: 4, row: 1, alignY: "end" }, phone: { order: 0, span: "full" } },
      { id: "e_side", kind: "image", image: "{images[1]}", ratio: "1:1", desk: { col: 1, span: 3, row: 2, alignY: "start" }, phone: { order: 2, span: "half" } },
      { id: "e_tri", kind: "image", image: "{images[0]}", ratio: "16:9", mask: "triptych", desk: { col: 5, span: 8, row: 1, rowSpan: 2 }, phone: { order: 1, span: "full" } },
    ],
  },
  reflow: { e_side: {} },
  note: "From the triptych mask and L Ogledalo's three mirrors: one photo read as three panels beside a heading, a second photo small under it.",
});
