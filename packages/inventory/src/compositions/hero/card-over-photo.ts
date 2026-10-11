import { definePreset } from "@sb/spec";

/** The client's photo from page edge to page edge; a light card low on its left holds the address line, the headline, the lead and the call. */
export default definePreset({
  id: "composition/hero/card-over-photo",
  tags: { mood: ["photo", "card", "warm"], stances: ["picture-postcard", "enamel-house-plate"] },
  needs: ["copy.headline", "images[0]"],
  props: {
    intent: "hero",
    width: "wide",
    rows: 6,
    gap: 0,
    background: [{ kind: "field", role: "background", cols: { from: 2, to: 5 }, rows: { from: 2, to: 5 } }],
    elements: [
      { id: "e_photo", kind: "image", image: "{images[0]}", ratio: "16:9", desk: { col: 1, span: 12, row: 1, rowSpan: 6, bleedX: "both" }, phone: { order: 0, span: "bleed" } },
      { id: "e_where", kind: "text", paragraphs: ["{business.street}, {business.town}"], desk: { col: 2, span: 4, row: 2, layer: 1 }, phone: { order: 1, span: "full" } },
      { id: "e_title", kind: "heading", text: "{copy.headline}", level: 1, size: 5, weight: 800, measure: "s", desk: { col: 2, span: 4, row: 3, layer: 1 }, phone: { order: 2, span: "full" } },
      { id: "e_lead", kind: "text", paragraphs: ["{copy.lead}"], desk: { col: 2, span: 4, row: 4, layer: 1 }, phone: { order: 3, span: "full" } },
      { id: "e_call", kind: "action", action: "call", label: "Pokličite", style: "secondary", desk: { col: 2, span: 4, row: 5, layer: 1 }, phone: { order: 4, span: "full" } },
    ],
  },
  note: "Re-expresses hero-signature:card: a bled photo, the card the words' backing panels closing into one light block (gap 0, on a field).",
});
