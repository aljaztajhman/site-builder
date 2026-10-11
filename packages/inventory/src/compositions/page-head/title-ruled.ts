import { definePreset } from "@sb/spec";

/** The page's title large, its lead under it, a full-width rule closing the head. */
export default definePreset({
  id: "composition/page-head/title-ruled",
  tags: { mood: ["type", "quiet"] },
  needs: ["copy.headline"],
  props: {
    intent: "page-head",
    width: "contained",
    rows: 3,
    elements: [
      { id: "e_title", kind: "heading", text: "{copy.headline}", level: 1, size: 5, weight: 800, measure: "l", desk: { col: 1, span: 9, row: 1 }, phone: { order: 0, span: "full" } },
      { id: "e_t", kind: "text", paragraphs: ["{copy.lead}"], size: 1, desk: { col: 1, span: 7, row: 2 }, phone: { order: 1, span: "full" } },
      { id: "e_rule", kind: "decor", svg: { width: 400, height: 8, paths: [{ d: "M0 4H400", fill: "none", stroke: "text", width: 1 }] }, desk: { col: 1, span: 12, row: 3 }, phone: { order: 2, span: "full" } },
    ],
  },
  note: "Re-expresses page-header:plain: title, lead and the closing rule (a drawn rule, not a border).",
});
