import { definePreset } from "@sb/spec";

/** The client's photo tall on the left; the street and town, the headline, the lead and two actions beside it. */
export default definePreset({
  id: "composition/hero/photo-left",
  tags: { mood: ["split", "photo", "calm"] },
  needs: ["copy.headline"],
  props: {
    intent: "hero",
    width: "wide",
    minHeight: "m",
    rows: 4,
    elements: [
      { id: "e_photo", kind: "image", image: "{images[0]}", ratio: "4:5", desk: { col: 1, span: 6, row: 1, rowSpan: 4 }, phone: { order: 0, span: "full" } },
      { id: "e_where", kind: "text", paragraphs: ["{business.street}, {business.town}"], desk: { col: 8, span: 5, row: 1, alignY: "end" }, phone: { order: 1, span: "full" } },
      { id: "e_title", kind: "heading", text: "{copy.headline}", level: 1, size: 6, weight: 800, measure: "m", desk: { col: 8, span: 5, row: 2 }, phone: { order: 2, span: "full" } },
      { id: "e_lead", kind: "text", paragraphs: ["{copy.lead}"], size: 1, desk: { col: 8, span: 5, row: 3 }, phone: { order: 3, span: "full" } },
      { id: "e_call", kind: "action", action: "call", label: "Pokličite", style: "primary", desk: { col: 8, span: 2, row: 4, alignY: "start" }, phone: { order: 4, span: "half" } },
      { id: "e_dir", kind: "action", action: "directions", label: "Pot do nas", style: "secondary", desk: { col: 10, span: 3, row: 4, alignY: "start" }, phone: { order: 5, span: "half" } },
    ],
  },
  // Without a photo the words move to the left and take a long measure.
  reflow: { e_photo: { e_where: { col: 1, span: 6 }, e_title: { col: 1, span: 10 }, e_lead: { col: 1, span: 7 }, e_call: { col: 1 }, e_dir: { col: 3 } } },
  note: "Re-expresses hero-split:image-left: the photo first, the words beside it; the address line from the business, not an eyebrow.",
});
