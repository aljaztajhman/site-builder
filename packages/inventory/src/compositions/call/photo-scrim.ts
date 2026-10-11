import { definePreset } from "@sb/spec";

/** One of the client's photos behind the whole section under a flat dark scrim; the heading large at the lower left, the line and the call beside it. */
export default definePreset({
  id: "composition/call/photo-scrim",
  tags: { mood: ["photo", "dark", "immersive"], stances: ["documentary-monochrome", "night-ground"] },
  needs: ["copy.headline", "images[0]"],
  props: {
    intent: "call",
    width: "wide",
    rows: 2,
    minHeight: "m",
    background: [{ kind: "photo", image: "{images[0]}", scrim: { role: "inverse", strength: 4 }, phone: "cover" }],
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 6, weight: 800, measure: "m", color: "onInverse", desk: { col: 1, span: 7, row: 1, rowSpan: 2, alignY: "end" }, phone: { order: 0, span: "full" } },
      { id: "e_t", kind: "text", paragraphs: ["{copy.lead}"], size: 1, color: "onInverse", desk: { col: 9, span: 4, row: 1, alignY: "end" }, phone: { order: 1, span: "full" } },
      { id: "e_call", kind: "action", action: "call", label: "Pokličite", style: "primary", desk: { col: 9, span: 3, row: 2, alignY: "end" }, phone: { order: 2, span: "full" } },
    ],
  },
  reflow: { e_t: { e_call: { row: 1, rowSpan: 2 } } },
  note: "From A Globina (the contact panel on a full-bleed photo under one flat overlay, no gradient): the call to action over the client's own photo.",
});
