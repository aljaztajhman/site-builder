import { definePreset } from "@sb/spec";

/** The craft: a tall photo of the work in hand runs the full height of the screen on the left, bled to the page edge; on the dark ground beside it the headline stacked large and the week's opening hours as the object. */
export default definePreset({
  id: "composition/hero/hands-and-hours",
  tone: "inverse",
  tags: { mood: ["dark", "photo", "craft", "hours"], trades: ["bakery", "restaurant", "shop", "hairdresser"], stances: ["station-timetable", "kitchen-index-card", "woodcut"] },
  needs: ["copy.headline", "images[1]"],
  props: {
    intent: "hero",
    width: "wide",
    minHeight: "screen",
    rows: 4,
    headerOver: true,
    background: [{ kind: "field", role: "inverse" }],
    elements: [
      { id: "e_photo", kind: "image", image: "{images[1]}", ratio: "fill", desk: { col: 1, span: 5, row: 1, rowSpan: 4, bleedX: "start" }, phone: { order: 3, span: "bleed" } },
      { id: "e_where", kind: "text", paragraphs: ["{business.street}, {business.town}"], desk: { col: 7, span: 6, row: 1, alignY: "end" }, phone: { order: 0, span: "full" } },
      { id: "e_title", kind: "heading", text: "{copy.headline}", level: 1, size: 6, weight: 800, measure: "m", desk: { col: 7, span: 6, row: 2, alignY: "center" }, phone: { order: 1, span: "full" } },
      { id: "e_lead", kind: "text", paragraphs: ["{copy.lead}"], desk: { col: 7, span: 5, row: 3, alignY: "start" }, phone: { order: 2, span: "full" } },
      { id: "e_hours", kind: "hours", style: "compact", desk: { col: 7, span: 3, row: 4, alignY: "start" }, phone: { order: 4, span: "full" } },
      { id: "e_phone", kind: "fact", value: "{business.phone}", label: "Naročila po telefonu", labelAt: "before", treatment: "numeral", size: 5, link: { action: "call" }, desk: { col: 10, span: 3, row: 4, alignY: "start" }, phone: { order: 5, span: "full" } },
    ],
  },
  reflow: { e_photo: { e_title: { col: 1, span: 10 }, e_lead: { col: 1, span: 7 } } },
  note: "New (hero bar B): the hands at work as the hero, the hours beside the headline as the second fact on a dark ground.",
});
