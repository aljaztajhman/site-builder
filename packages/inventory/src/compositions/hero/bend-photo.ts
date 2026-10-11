import { definePreset } from "@sb/spec";

/** The headline, lead and actions on the left; the client's photo with a cut corner on a soft band that runs to the right page edge. */
export default definePreset({
  id: "composition/hero/bend-photo",
  tags: { mood: ["photo", "soft", "care"], trades: ["physio", "dental", "hairdresser"] },
  needs: ["copy.headline", "images[0]"],
  props: {
    intent: "hero",
    width: "wide",
    minHeight: "m",
    rows: 4,
    background: [{ kind: "field", role: "surface", cols: { from: 8, to: 12 } }],
    elements: [
      { id: "e_where", kind: "text", paragraphs: ["{business.street}, {business.town}"], desk: { col: 1, span: 5, row: 1, alignY: "end" }, phone: { order: 0, span: "full" } },
      { id: "e_title", kind: "heading", text: "{copy.headline}", level: 1, size: 6, weight: 800, measure: "m", desk: { col: 1, span: 6, row: 2 }, phone: { order: 1, span: "full" } },
      { id: "e_lead", kind: "text", paragraphs: ["{copy.lead}"], desk: { col: 1, span: 6, row: 3 }, phone: { order: 2, span: "full" } },
      { id: "e_call", kind: "action", action: "call", label: "Pokličite", style: "primary", desk: { col: 1, span: 2, row: 4, alignY: "start" }, phone: { order: 3, span: "half" } },
      { id: "e_dir", kind: "action", action: "directions", label: "Pot do nas", style: "text", desk: { col: 3, span: 3, row: 4, alignY: "start" }, phone: { order: 4, span: "half" } },
      { id: "e_photo", kind: "image", image: "{images[0]}", ratio: "4:5", mask: "cut", desk: { col: 9, span: 4, row: 1, rowSpan: 4 }, phone: { order: 5, span: "full" } },
    ],
  },
  note: "Re-expresses hero-signature:bend: the cut-corner photo on a soft surface field bled to the right page edge.",
});
