import { definePreset } from "@sb/spec";

/** On the band colour: the heading large and the line on where the work is done on the left; the base town on a direction board and the call on the right. */
export default definePreset({
  id: "composition/area/signpost-band",
  tags: { mood: ["band", "sign", "arrow"], stances: ["direction-sign", "trail-marker"] },
  needs: ["copy.headline", "business.town"],
  props: {
    intent: "area",
    width: "wide",
    rows: 2,
    background: [{ kind: "field", role: "band" }],
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 6, weight: 800, measure: "s", color: "onBand", desk: { col: 1, span: 6, row: 1 }, phone: { order: 0, span: "full" } },
      { id: "e_t", kind: "text", paragraphs: ["{copy.lead}"], size: 1, color: "onBand", desk: { col: 1, span: 5, row: 2 }, phone: { order: 1, span: "full" } },
      { id: "e_sign", kind: "fact", value: "{business.town}", label: "Sedež", labelAt: "before", treatment: "signpost", size: 5, desk: { col: 8, span: 5, row: 1, alignY: "end", tilt: -4 }, phone: { order: 2, span: "inset" } },
      { id: "e_call", kind: "action", action: "call", label: "Pokličite", style: "secondary", desk: { col: 8, span: 5, row: 2 }, phone: { order: 3, span: "full" } },
    ],
  },
  reflow: { e_t: { e_h: { rowSpan: 2 } } },
  note: "From N Markacija (destinations hung on a red trail signpost) and S Cevi (the service-area map): the base town on a direction board, on a band that changes the page's ground.",
});
