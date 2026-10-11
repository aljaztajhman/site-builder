import { definePreset } from "@sb/spec";

/** The notice in a light block on the left: a heading, the message and a call. */
export default definePreset({
  id: "composition/notice/framed-card",
  tags: { mood: ["notice", "panel"] },
  needs: ["copy.headline"],
  props: {
    intent: "notice",
    width: "contained",
    rows: 3,
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 2, fill: "surface", desk: { col: 1, span: 6, row: 1 }, phone: { order: 0, span: "full" } },
      { id: "e_t", kind: "text", paragraphs: ["{copy.lead}"], fill: "surface", desk: { col: 1, span: 6, row: 2 }, phone: { order: 1, span: "full" } },
      { id: "e_call", kind: "action", action: "call", label: "Pokličite", style: "secondary", desk: { col: 1, span: 2, row: 3, alignY: "start" }, phone: { order: 2, span: "full" } },
    ],
  },
  note: "Re-expresses announcement:card: the card as the words' own surface ground.",
});
