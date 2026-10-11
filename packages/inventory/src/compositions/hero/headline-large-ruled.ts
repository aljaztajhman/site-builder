import { definePreset } from "@sb/spec";

/** Type only: a very large headline across the opener, then a rule with the lead and two actions set in to the right. */
export default definePreset({
  id: "composition/hero/headline-large-ruled",
  tags: { mood: ["type", "editorial", "quiet"], stances: ["oversized-type", "swiss-grid", "editorial-magazine"] },
  needs: ["copy.headline"],
  props: {
    intent: "hero",
    width: "wide",
    minHeight: "m",
    rows: 4,
    elements: [
      { id: "e_where", kind: "text", paragraphs: ["{business.name}, {business.town}"], desk: { col: 1, span: 5, row: 1, alignY: "end" }, phone: { order: 0, span: "full" } },
      { id: "e_title", kind: "heading", text: "{copy.headline}", level: 1, size: 7, weight: 800, measure: "l", desk: { col: 1, span: 10, row: 2 }, phone: { order: 1, span: "full" } },
      { id: "e_rule", kind: "decor", svg: { width: 400, height: 8, paths: [{ d: "M0 4H400", fill: "none", stroke: "text", width: 1 }] }, desk: { col: 6, span: 7, row: 3, alignY: "start" }, phone: { order: 2, span: "full" } },
      { id: "e_lead", kind: "text", paragraphs: ["{copy.lead}"], size: 1, desk: { col: 6, span: 6, row: 3 }, phone: { order: 3, span: "full" } },
      { id: "e_call", kind: "action", action: "call", label: "Pokličite", style: "primary", desk: { col: 6, span: 2, row: 4, alignY: "start" }, phone: { order: 4, span: "half" } },
      { id: "e_dir", kind: "action", action: "directions", label: "Pot do nas", style: "text", desk: { col: 8, span: 3, row: 4, alignY: "start" }, phone: { order: 5, span: "half" } },
    ],
  },
  note: "Re-expresses hero-type:large: the display headline alone, the rule and lead stepped in under it (a drawn rule, not a border).",
});
