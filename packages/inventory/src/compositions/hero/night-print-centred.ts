import { definePreset } from "@sb/spec";

/** A print on the night ground: the whole first screen in the ink colour, the header over it; the headline centred across the top, the linocut of the oven at night centred under it and running into the ground (its block is the same ink), the lead on its left and the phone on its right. */
export default definePreset({
  id: "composition/hero/night-print-centred",
  tone: "inverse",
  tags: { mood: ["dark", "linocut", "poster", "centred", "no-photo"], trades: ["bakery"], stances: ["woodcut", "letterpress-proof", "pratika-almanac"] },
  needs: ["copy.headline"],
  props: {
    intent: "hero",
    width: "wide",
    minHeight: "screen",
    rows: 3,
    headerOver: true,
    background: [{ kind: "field", role: "inverse" }],
    elements: [
      { id: "e_title", kind: "heading", text: "{copy.headline}", level: 1, size: 7, weight: 800, measure: "m", desk: { col: 1, span: 12, row: 1, alignX: "center" }, phone: { order: 0, span: "full" } },
      { id: "e_art", kind: "decor", drawing: "motif/bakery/oven-night-linocut-solid", fit: "cell", desk: { col: 4, span: 6, row: 2, rowSpan: 2, alignY: "start" }, phone: { order: 1, span: "bleed" } },
      { id: "e_lead", kind: "text", paragraphs: ["{copy.lead}"], desk: { col: 1, span: 3, row: 2, alignY: "end" }, phone: { order: 2, span: "full" } },
      { id: "e_phone", kind: "fact", value: "{business.phone}", label: "Naročila po telefonu", labelAt: "before", treatment: "numeral", size: 5, link: { action: "call" }, desk: { col: 10, span: 3, row: 2, alignY: "end", alignX: "end" }, phone: { order: 3, span: "full" } },
    ],
  },
  reflow: { e_phone: { e_art: { span: 6 } } },
  note: "New (hero bar C): a two-colour linocut as the picture, centred like a print on the shop door, on a ground of the same ink.",
});
