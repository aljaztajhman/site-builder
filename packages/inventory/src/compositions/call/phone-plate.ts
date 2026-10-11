import { definePreset } from "@sb/spec";

/** The heading and the line on the left; the phone number as a registration plate with the town's code on the right, set at a slight angle: the plate is the call. */
export default definePreset({
  id: "composition/call/phone-plate",
  tags: { mood: ["sign", "bold", "plate"], stances: ["registration-plate"], trades: ["car-repair"] },
  needs: ["copy.headline", "business.phone"],
  props: {
    intent: "call",
    width: "contained",
    rows: 2,
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 5, weight: 900, measure: "m", desk: { col: 1, span: 6, row: 1, alignY: "end" }, phone: { order: 0, span: "full" } },
      { id: "e_t", kind: "text", paragraphs: ["{copy.lead}"], size: 1, desk: { col: 1, span: 5, row: 2 }, phone: { order: 1, span: "full" } },
      { id: "e_plate", kind: "fact", value: "{business.phone}", label: "Pokličite", treatment: "plate", plateCode: true, size: 6, link: { action: "call" }, desk: { col: 8, span: 5, row: 1, rowSpan: 2, alignY: "center", tilt: -3 }, phone: { order: 2, span: "full" } },
    ],
  },
  reflow: { e_t: { e_h: { rowSpan: 2, alignY: "center" } } },
  note: "From M Tablica and avtomehanika-sever (the phone number as a Slovenian registration plate with the town's code, the plate is the call link): the closing call as one plate.",
});
