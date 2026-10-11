import { definePreset } from "@sb/spec";

/** No photo needed: the headline, lead and two actions on the left; the town and the street on two direction boards hung on a drawn pole on the right. */
export default definePreset({
  id: "composition/hero/signpost-pole",
  tags: { mood: ["sign", "wayfinding", "practical"], stances: ["direction-sign", "wayfinding", "trail-marker"] },
  needs: ["copy.headline", "business.town"],
  props: {
    intent: "hero",
    width: "wide",
    minHeight: "m",
    rows: 4,
    elements: [
      { id: "e_title", kind: "heading", text: "{copy.headline}", level: 1, size: 6, weight: 800, measure: "m", desk: { col: 1, span: 7, row: 1, rowSpan: 2, alignY: "end" }, phone: { order: 0, span: "full" } },
      { id: "e_lead", kind: "text", paragraphs: ["{copy.lead}"], size: 1, desk: { col: 1, span: 6, row: 3 }, phone: { order: 1, span: "full" } },
      { id: "e_call", kind: "action", action: "call", label: "Pokličite", style: "primary", desk: { col: 1, span: 3, row: 4, alignY: "start" }, phone: { order: 2, span: "half" } },
      { id: "e_dir", kind: "action", action: "directions", label: "Pot do nas", style: "text", desk: { col: 4, span: 3, row: 4, alignY: "start" }, phone: { order: 3, span: "half" } },
      { id: "e_pole", kind: "decor", svg: { width: 400, height: 400, paths: [{ d: "M48 0V400", fill: "none", stroke: "text", width: 6 }] }, desk: { col: 9, span: 4, row: 1, rowSpan: 4, alignY: "stretch" }, phone: { order: 4, span: "full", hidden: true } },
      { id: "e_town", kind: "fact", value: "{business.town}", label: "Kraj", treatment: "signpost", size: 5, desk: { col: 9, span: 4, row: 2, alignY: "center", tilt: -3, layer: 1 }, phone: { order: 5, span: "full" } },
      { id: "e_street", kind: "fact", value: "{business.street}", label: "Naslov", treatment: "signpost", size: 3, desk: { col: 9, span: 4, row: 3, alignY: "start", tilt: 2, layer: 1 }, phone: { order: 6, span: "full" } },
    ],
  },
  // Without a street the town's board hangs alone; the pole stays.
  reflow: { e_street: {} },
  note: "From N Markacija (the trail signpost with arrow boards) and the direction-sign stance: the address as wayfinding boards on a drawn pole, no photo.",
});
