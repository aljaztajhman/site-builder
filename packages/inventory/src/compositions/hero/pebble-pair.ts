import { definePreset } from "@sb/spec";

/** The address line, headline, lead and the phone as a number on the left; the client's photo as a large pebble on the right, a second photo as a smaller pebble resting against its foot. */
export default definePreset({
  id: "composition/hero/pebble-pair",
  tags: { mood: ["photo", "soft", "calm"], trades: ["physio", "hairdresser", "dental"], stances: ["soca-green", "karst-stone"] },
  needs: ["copy.headline", "images[0]"],
  props: {
    intent: "hero",
    width: "contained",
    minHeight: "m",
    rows: 4,
    elements: [
      { id: "e_where", kind: "text", paragraphs: ["{business.street}, {business.town}"], desk: { col: 1, span: 5, row: 1, alignY: "end" }, phone: { order: 0, span: "full" } },
      { id: "e_title", kind: "heading", text: "{copy.headline}", level: 1, size: 6, weight: 700, measure: "m", desk: { col: 1, span: 6, row: 2 }, phone: { order: 1, span: "full" } },
      { id: "e_lead", kind: "text", paragraphs: ["{copy.lead}"], size: 1, desk: { col: 1, span: 5, row: 3 }, phone: { order: 2, span: "full" } },
      { id: "e_phone", kind: "fact", value: "{business.phone}", label: "Pokličite", labelAt: "before", treatment: "numeral", size: 4, link: { action: "call" }, desk: { col: 1, span: 5, row: 4, alignY: "start" }, phone: { order: 3, span: "full" } },
      { id: "e_big", kind: "image", image: "{images[0]}", ratio: "4:5", mask: "pebble", desk: { col: 8, span: 5, row: 1, rowSpan: 3, alignY: "end" }, phone: { order: 4, span: "full" } },
      { id: "e_small", kind: "image", image: "{images[1]}", ratio: "1:1", mask: "pebble", desk: { col: 7, span: 3, row: 3, rowSpan: 2, alignY: "end", layer: 1 }, phone: { order: 5, span: "half", hidden: true } },
    ],
  },
  reflow: { e_small: {} },
  note: "From fizioterapija-kobal (the photo in a pebble, the stones it rests on had to be a hand-drawn svg): two of the client's photos as pebbles of different sizes, the gap its note named.",
});
