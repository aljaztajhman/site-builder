import { definePreset } from "@sb/spec";

/** The name and town, the headline, lead and call on the left; the client's photo wide to the right page edge, a second photo as a small tilted print laid over its lower corner. */
export default definePreset({
  id: "composition/hero/bleed-print",
  tags: { mood: ["photo", "editorial", "overlap"], stances: ["editorial-magazine", "still-life", "picture-postcard"] },
  needs: ["copy.headline", "images[0]"],
  props: {
    intent: "hero",
    width: "wide",
    minHeight: "m",
    rows: 4,
    elements: [
      { id: "e_where", kind: "text", paragraphs: ["{business.name}, {business.town}"], desk: { col: 1, span: 4, row: 1, alignY: "end" }, phone: { order: 0, span: "full" } },
      { id: "e_title", kind: "heading", text: "{copy.headline}", level: 1, size: 6, weight: 700, measure: "s", desk: { col: 1, span: 5, row: 2 }, phone: { order: 1, span: "full" } },
      { id: "e_lead", kind: "text", paragraphs: ["{copy.lead}"], size: 1, desk: { col: 1, span: 5, row: 3 }, phone: { order: 2, span: "full" } },
      { id: "e_call", kind: "action", action: "call", label: "Pokličite", style: "primary", desk: { col: 1, span: 3, row: 4, alignY: "start" }, phone: { order: 3, span: "full" } },
      { id: "e_photo", kind: "image", image: "{images[0]}", ratio: "fill", desk: { col: 7, span: 6, row: 1, rowSpan: 3, bleedX: "end" }, phone: { order: 4, span: "bleed" } },
      { id: "e_print", kind: "image", image: "{images[1]}", ratio: "4:5", treatment: "matte", desk: { col: 6, span: 3, row: 3, rowSpan: 2, alignY: "end", tilt: -4, layer: 1 }, phone: { order: 5, span: "half", hidden: true } },
    ],
  },
  reflow: { e_print: {} },
  note: "From D Mirno (a wide photo bleeding right, a small print overlapping it, the type editorial): the print is the client's second photo, hidden on phones.",
});
