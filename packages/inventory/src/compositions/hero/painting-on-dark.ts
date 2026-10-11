import { definePreset } from "@sb/spec";

/** A picture on the wall: the whole first screen in the deep band colour, the header over it; a painting large in a low arch on the right, the headline, the lead and the phone as a big number on the left. For a business whose picture is a painting (AI-made atmosphere) or a single strong photo. */
export default definePreset({
  id: "composition/hero/painting-on-dark",
  tone: "band",
  tags: { mood: ["dark", "painting", "arch", "warm"], stances: ["technical-drawing", "night-ground", "plecnik-classicism"] },
  needs: ["copy.headline", "images[0]"],
  props: {
    intent: "hero",
    width: "wide",
    minHeight: "screen",
    rows: 4,
    headerOver: true,
    background: [{ kind: "field", role: "band" }],
    elements: [
      { id: "e_where", kind: "text", paragraphs: ["{business.street}, {business.town}"], desk: { col: 1, span: 5, row: 1, alignY: "end" }, phone: { order: 0, span: "full" } },
      { id: "e_title", kind: "heading", text: "{copy.headline}", level: 1, size: 5, weight: 700, measure: "l", desk: { col: 1, span: 6, row: 2, alignY: "center" }, phone: { order: 1, span: "full" } },
      { id: "e_lead", kind: "text", paragraphs: ["{copy.lead}"], desk: { col: 1, span: 5, row: 3, alignY: "start" }, phone: { order: 3, span: "full" } },
      { id: "e_phone", kind: "fact", value: "{business.phone}", label: "Pokličite za ogled", labelAt: "before", treatment: "numeral", size: 6, link: { action: "call" }, desk: { col: 1, span: 6, row: 4, alignY: "start" }, phone: { order: 4, span: "full" } },
      { id: "e_paint", kind: "image", image: "{images[0]}", ratio: "4:3", mask: "arch-low", desk: { col: 7, span: 6, row: 1, rowSpan: 4, alignY: "center" }, phone: { order: 2, span: "inset" } },
    ],
  },
  reflow: { e_paint: { e_title: { span: 9 }, e_lead: { span: 7 } } },
  note: "New (hero bar H): a single picture hung on a deep ground; built for an AI painting when the client has no photos.",
});
