import { definePreset } from "@sb/spec";

/** Magazine: the headline set large in columns 1–7; a tall portrait crop of the client's photo in 9–12, raised off the top line; the lead with a drop cap and the call under it. */
export default definePreset({
  id: "composition/hero/magazine-1",
  structure: "magazine",
  tone: "alt",
  tags: { mood: ["editorial", "portrait", "photo", "columns"], stances: ["editorial-magazine"] },
  needs: ["copy.headline", "photos[0]"],
  props: {
    intent: "hero",
    width: "wide",
    rows: 4,
    elements: [
      { id: "e_where", kind: "text", paragraphs: ["{business.name}, {business.town}"], desk: { col: 1, span: 5, row: 1, alignY: "start" }, phone: { order: 0, span: "full" } },
      { id: "e_title", kind: "heading", text: "{copy.headline}", level: 1, size: 7, weight: 500, desk: { col: 1, span: 7, row: 2, rowSpan: 2, alignY: "start" }, phone: { order: 1, span: "full" } },
      { id: "e_photo", kind: "image", image: "{photos[0]}", ratio: "3:4", desk: { col: 9, span: 4, row: 1, rowSpan: 3, shiftY: -2 }, phone: { order: 3, span: "inset" } },
      { id: "e_lead", kind: "text", paragraphs: ["{copy.lead}"], size: 1, dropCap: true, desk: { col: 9, span: 4, row: 4, alignY: "start" }, phone: { order: 4, span: "full" } },
      { id: "e_call", kind: "action", action: "call", label: "Pokličite", style: "primary", desk: { col: 1, span: 3, row: 4, alignY: "end" }, phone: { order: 2, span: "full" } },
    ],
  },
  reflow: { e_call: {} },
  note: "Design 5 structure 3 (magazine): two columns that don't line up, a portrait crop of the client's photo raised against the headline, a drop-cap lead.",
});
