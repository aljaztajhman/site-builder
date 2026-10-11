import { definePreset } from "@sb/spec";

/** On the dark ground: a light card with the headline, lead and call; the client's photo in an arch beside it, a second photo round over its edge. */
export default definePreset({
  id: "composition/hero/label-card-arch",
  tone: "inverse",
  tags: { mood: ["card", "arch", "crafted"], stances: ["bottle-label", "hang-tag", "seed-packet"] },
  needs: ["copy.headline", "images[0]"],
  props: {
    intent: "hero",
    width: "wide",
    minHeight: "m",
    rows: 4,
    background: [{ kind: "field", role: "background", cols: { from: 1, to: 6 }, rows: { from: 1, to: 4 } }],
    elements: [
      { id: "e_where", kind: "text", paragraphs: ["{business.street}, {business.town}"], desk: { col: 2, span: 4, row: 1, alignY: "end" }, phone: { order: 0, span: "full" } },
      { id: "e_title", kind: "heading", text: "{copy.headline}", level: 1, size: 5, weight: 800, measure: "s", desk: { col: 2, span: 4, row: 2 }, phone: { order: 1, span: "full" } },
      { id: "e_lead", kind: "text", paragraphs: ["{copy.lead}"], desk: { col: 2, span: 4, row: 3 }, phone: { order: 2, span: "full" } },
      { id: "e_call", kind: "action", action: "call", label: "Pokličite", style: "primary", desk: { col: 2, span: 2, row: 4, alignY: "start" }, phone: { order: 3, span: "full" } },
      { id: "e_photo", kind: "image", image: "{images[0]}", ratio: "4:5", mask: "arch", desk: { col: 8, span: 5, row: 1, rowSpan: 4 }, phone: { order: 4, span: "inset" } },
      { id: "e_inset", kind: "image", image: "{images[1]}", ratio: "1:1", mask: "circle", desk: { col: 7, span: 2, row: 4, layer: 1, alignY: "end" }, phone: { order: 5, span: "half", hidden: true } },
    ],
  },
  note: "Re-expresses hero-signature:label: the label card is a field the words sit inside; the arch and the round inset are the client's photos.",
});
