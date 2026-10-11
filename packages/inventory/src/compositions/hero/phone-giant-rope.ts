import { definePreset } from "@sb/spec";

/** No photo needed: a modest headline, then the phone number at display size as the sentence of the opener (it is the call), the lead and the way there; a rope ornament runs edge to edge at the foot. */
export default definePreset({
  id: "composition/hero/phone-giant-rope",
  tags: { mood: ["type", "numeral", "bold"], stances: ["oversized-type", "station-timetable"] },
  needs: ["copy.headline", "business.phone"],
  props: {
    intent: "hero",
    width: "wide",
    minHeight: "m",
    rows: 4,
    elements: [
      { id: "e_title", kind: "heading", text: "{copy.headline}", level: 1, size: 4, weight: 700, measure: "l", desk: { col: 1, span: 8, row: 1, alignY: "end" }, phone: { order: 0, span: "full" } },
      { id: "e_phone", kind: "fact", value: "{business.phone}", label: "Pokličite", labelAt: "before", treatment: "numeral", size: 8, link: { action: "call" }, desk: { col: 1, span: 10, row: 2 }, phone: { order: 1, span: "full" } },
      { id: "e_lead", kind: "text", paragraphs: ["{copy.lead}"], size: 1, desk: { col: 1, span: 6, row: 3 }, phone: { order: 2, span: "full" } },
      { id: "e_dir", kind: "action", action: "directions", label: "Pot do nas", style: "secondary", desk: { col: 8, span: 3, row: 3, alignY: "end" }, phone: { order: 3, span: "full" } },
      { id: "e_rope", kind: "decor", drawing: "ornament/rope-line", repeat: "x", fit: "fixed", size: 1, desk: { col: 1, span: 12, row: 4, alignY: "end", bleedX: "both" }, phone: { order: 4, span: "bleed" } },
    ],
  },
  note: "From B Proge (one fact set at 300 px as the sentence, the lane rope as the bottom edge): the phone is the display-size object, the rope a repeatable ornament strip bled to both edges.",
});
