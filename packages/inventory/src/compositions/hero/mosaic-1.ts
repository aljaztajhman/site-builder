import { definePreset } from "@sb/spec";

/** Mosaic: five unequal cells edge to edge, the headline as a solid band-colour tile, three client photos, and a dark tile with the lead, the address and the call. */
export default definePreset({
  id: "composition/hero/mosaic-1",
  structure: "mosaic",
  tags: { mood: ["photo", "grid", "tiles", "several-photos"] },
  needs: ["copy.headline", "photos[0]", "photos[1]", "photos[2]"],
  props: {
    intent: "hero",
    width: "full",
    minHeight: "tall",
    rows: 5,
    gap: 1,
    background: [
      { kind: "field", role: "band", cols: { from: 1, to: 5 }, rows: { from: 1, to: 2 } },
      { kind: "field", role: "inverse", cols: { from: 9, to: 12 }, rows: { from: 3, to: 5 } },
    ],
    elements: [
      { id: "e_title", kind: "heading", text: "{copy.headline}", level: 1, size: 6, weight: 800, desk: { col: 1, span: 5, row: 1, rowSpan: 2, alignY: "end" }, phone: { order: 0, span: "full" } },
      { id: "e_p1", kind: "image", image: "{photos[0]}", ratio: "fill", crop: "thirds", desk: { col: 6, span: 7, row: 1, rowSpan: 2, bleedX: "end" }, phone: { order: 4, span: "bleed" } },
      { id: "e_p2", kind: "image", image: "{photos[1]}", ratio: "fill", crop: "thirds", desk: { col: 1, span: 3, row: 3, rowSpan: 3, bleedX: "start" }, phone: { order: 5, span: "tile" } },
      { id: "e_p3", kind: "image", image: "{photos[2]}", ratio: "fill", crop: "thirds", desk: { col: 4, span: 5, row: 3, rowSpan: 3 }, phone: { order: 6, span: "tile" } },
      { id: "e_lead", kind: "text", paragraphs: ["{copy.lead}"], desk: { col: 9, span: 4, row: 3, alignY: "start" }, phone: { order: 3, span: "full" } },
      { id: "e_where", kind: "text", paragraphs: ["{business.street}, {business.town}"], desk: { col: 9, span: 4, row: 4, alignY: "end" }, phone: { order: 2, span: "full" } },
      { id: "e_call", kind: "action", action: "call", label: "Pokličite", style: "primary", desk: { col: 9, span: 4, row: 5, alignY: "end" }, phone: { order: 1, span: "full" } },
    ],
  },
  reflow: { e_call: {}, e_where: {} },
  note: "Design 5 structure 5 (mosaic): unequal cells, no frames, the headline a tile of colour among the client's photos; needs three photos.",
});
