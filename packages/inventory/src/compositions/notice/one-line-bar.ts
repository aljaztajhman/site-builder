import { definePreset } from "@sb/spec";

/** A slim notice on one line: a short heading, the message and a call at the end. */
export default definePreset({
  id: "composition/notice/one-line-bar",
  tone: "alt",
  tags: { mood: ["slim", "notice"] },
  needs: ["copy.headline"],
  props: {
    intent: "notice",
    width: "wide",
    rows: 1,
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 1, weight: 700, desk: { col: 1, span: 3, row: 1, alignY: "center" }, phone: { order: 0, span: "full" } },
      { id: "e_t", kind: "text", paragraphs: ["{copy.lead}"], desk: { col: 4, span: 7, row: 1, alignY: "center" }, phone: { order: 1, span: "full" } },
      { id: "e_call", kind: "action", action: "call", label: "Pokličite", style: "text", desk: { col: 11, span: 2, row: 1, alignY: "center", alignX: "end" }, phone: { order: 2, span: "full" } },
    ],
  },
  note: "Re-expresses announcement:bar: heading, message and link on one desktop line.",
});
