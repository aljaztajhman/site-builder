import { definePreset } from "@sb/spec";

/** On the band: the heading and a line on the left, the call and directions on the right. */
export default definePreset({
  id: "composition/call/heading-actions-band",
  tone: "band",
  tags: { mood: ["band", "direct"] },
  needs: ["copy.headline"],
  props: {
    intent: "call",
    width: "contained",
    rows: 2,
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 4, desk: { col: 1, span: 8, row: 1 }, phone: { order: 0, span: "full" } },
      { id: "e_t", kind: "text", paragraphs: ["{copy.lead}"], desk: { col: 1, span: 7, row: 2 }, phone: { order: 1, span: "full" } },
      { id: "e_call", kind: "action", action: "call", label: "Pokličite", style: "primary", desk: { col: 10, span: 3, row: 1, alignY: "center", alignX: "end" }, phone: { order: 2, span: "half" } },
      { id: "e_dir", kind: "action", action: "directions", label: "Pot do nas", style: "text", desk: { col: 10, span: 3, row: 2, alignY: "start", alignX: "end" }, phone: { order: 3, span: "half" } },
    ],
  },
  note: "Re-expresses cta:band: one strip, words left, actions right; the band tone is the designer's.",
});
