import { definePreset } from "@sb/spec";

/** The page's title and lead, then one of the client's photos as a wide strip across the head. */
export default definePreset({
  id: "composition/page-head/title-photo",
  tags: { mood: ["photo", "wide"] },
  needs: ["copy.headline"],
  props: {
    intent: "page-head",
    width: "contained",
    rows: 3,
    elements: [
      { id: "e_title", kind: "heading", text: "{copy.headline}", level: 1, size: 5, weight: 800, measure: "l", desk: { col: 1, span: 9, row: 1 }, phone: { order: 0, span: "full" } },
      { id: "e_t", kind: "text", paragraphs: ["{copy.lead}"], size: 1, desk: { col: 1, span: 7, row: 2 }, phone: { order: 1, span: "full" } },
      { id: "e_photo", kind: "image", image: "{images[0]}", ratio: "21:9", desk: { col: 1, span: 12, row: 3 }, phone: { order: 2, span: "full" } },
    ],
  },
  note: "Re-expresses page-header:with-image: the photo a 21:9 strip under the words; without a photo it is the plain head.",
});
