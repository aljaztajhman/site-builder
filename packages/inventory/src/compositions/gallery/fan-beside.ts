import { definePreset } from "@sb/spec";

/** The heading large on the left; on the right, up to four of the client's photos fanned out like prints in a hand. */
export default definePreset({
  id: "composition/gallery/fan-beside",
  tags: { mood: ["photo", "playful", "overlap"], stances: ["still-life", "picture-postcard"] },
  needs: ["copy.headline", "images[1]"],
  props: {
    intent: "gallery",
    width: "contained",
    rows: 1,
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 5, weight: 800, measure: "s", desk: { col: 1, span: 4, row: 1, alignY: "center" }, phone: { order: 0, span: "full" } },
      { id: "e_fan", kind: "photos", images: ["{images[0]}", "{images[1]}", "{images[2]}", "{images[3]}"], arrangement: "fan", desk: { col: 5, span: 8, row: 1 }, phone: { order: 1, span: "full" } },
    ],
  },
  note: "From D Mirno (a small print laid over a photo) and the still-life stance: the photos fanned as prints beside one large heading, not a grid.",
});
