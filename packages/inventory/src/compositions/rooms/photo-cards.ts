import { definePreset } from "@sb/spec";

/** The heading, then two offerings as cards side by side: a wide photo, the name and the description; the call under them. */
export default definePreset({
  id: "composition/rooms/photo-cards",
  tags: { mood: ["photo", "cards"], trades: ["tourist-farm"] },
  needs: ["copy.headline", "brief.offerings[0].name"],
  props: {
    intent: "rooms",
    width: "contained",
    rows: 5,
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 4, desk: { col: 1, span: 8, row: 1 }, phone: { order: 0, span: "full" } },
      { id: "e_i0", kind: "image", image: "{images[0]}", ratio: "3:2", desk: { col: 1, span: 6, row: 2 }, phone: { order: 1, span: "full" } },
      { id: "e_n0", kind: "heading", text: "{brief.offerings[0].name}", level: 3, size: 2, desk: { col: 1, span: 6, row: 3 }, phone: { order: 2, span: "full" } },
      { id: "e_d0", kind: "text", paragraphs: ["{brief.offerings[0].description}"], desk: { col: 1, span: 5, row: 4 }, phone: { order: 3, span: "full" } },
      { id: "e_i1", kind: "image", image: "{images[1]}", ratio: "3:2", desk: { col: 7, span: 6, row: 2 }, phone: { order: 4, span: "full" } },
      { id: "e_n1", kind: "heading", text: "{brief.offerings[1].name}", level: 3, size: 2, desk: { col: 7, span: 6, row: 3 }, phone: { order: 5, span: "full" } },
      { id: "e_d1", kind: "text", paragraphs: ["{brief.offerings[1].description}"], desk: { col: 7, span: 5, row: 4 }, phone: { order: 6, span: "full" } },
      { id: "e_call", kind: "action", action: "call", label: "Pokličite", style: "secondary", desk: { col: 1, span: 3, row: 5, alignY: "start" }, phone: { order: 7, span: "full" } },
    ],
  },
  // A missing description leaves the card shorter.
  reflow: { e_d0: {}, e_d1: {} },
  note: "Re-expresses rooms:cards: two cards, the call once for both (the variant's call per card would repeat it).",
});
