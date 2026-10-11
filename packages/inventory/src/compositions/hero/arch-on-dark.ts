import { definePreset } from "@sb/spec";

/** On the dark ground: the headline, the lead and the phone as a big number on the left, the client's photo in an arch on the right. */
export default definePreset({
  id: "composition/hero/arch-on-dark",
  tone: "inverse",
  tags: { mood: ["dark", "arch", "photo"], stances: ["night-ground", "plecnik-classicism"] },
  needs: ["copy.headline"],
  props: {
    intent: "hero",
    width: "wide",
    minHeight: "m",
    rows: 3,
    elements: [
      { id: "e_title", kind: "heading", text: "{copy.headline}", level: 1, size: 6, weight: 800, measure: "m", desk: { col: 1, span: 7, row: 1, alignY: "end" }, phone: { order: 0, span: "full" } },
      { id: "e_lead", kind: "text", paragraphs: ["{copy.lead}"], desk: { col: 1, span: 6, row: 2 }, phone: { order: 1, span: "full" } },
      { id: "e_phone", kind: "fact", value: "{business.phone}", label: "Pokličite", labelAt: "before", treatment: "numeral", size: 5, link: { action: "call" }, desk: { col: 1, span: 5, row: 3, alignY: "start" }, phone: { order: 2, span: "full" } },
      { id: "e_photo", kind: "image", image: "{images[0]}", ratio: "4:5", mask: "arch", desk: { col: 8, span: 5, row: 1, rowSpan: 3 }, phone: { order: 3, span: "inset" } },
    ],
  },
  reflow: { e_photo: { e_title: { span: 10 }, e_lead: { span: 7 } } },
  note: "Re-expresses hero-signature:arch: the inverse ground, the photo in an arch mask, the phone number as the call object.",
});
