import { definePreset } from "@sb/spec";

/** Band: the client's photo full bleed across most of the first screen; the headline, the address and the call on a dark band pinned under it. No lead: the photo says it. */
export default definePreset({
  id: "composition/hero/band-1",
  structure: "band",
  tags: { mood: ["photo", "full-bleed", "band", "place"] },
  needs: ["copy.headline", "photos[0]"],
  props: {
    intent: "hero",
    width: "full",
    minHeight: "tall",
    rows: 5,
    gap: 2,
    background: [{ kind: "field", role: "inverse", rows: { from: 4, to: 5 } }],
    elements: [
      { id: "e_photo", kind: "image", image: "{photos[0]}", ratio: "fill", crop: "thirds", desk: { col: 1, span: 12, row: 1, rowSpan: 3, bleedX: "both" }, phone: { order: 0, span: "bleed" } },
      { id: "e_title", kind: "heading", text: "{copy.headline}", level: 1, size: 6, weight: 800, desk: { col: 1, span: 8, row: 4, rowSpan: 2, alignY: "center" }, phone: { order: 1, span: "full" } },
      { id: "e_where", kind: "text", paragraphs: ["{business.street}, {business.town}"], desk: { col: 9, span: 4, row: 4, alignY: "end" }, phone: { order: 3, span: "full" } },
      { id: "e_call", kind: "action", action: "call", label: "Pokličite", style: "primary", desk: { col: 9, span: 4, row: 5, alignY: "start" }, phone: { order: 2, span: "full" } },
    ],
  },
  reflow: { e_call: {}, e_where: {} },
  note: "Design 5 structure 2 (band): a client photo as the whole upper screen, edge to edge, the type on a dark band pinned to its foot.",
});
