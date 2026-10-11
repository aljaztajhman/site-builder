import { definePreset } from "@sb/spec";

const step = (i: number) => ({ title: `{brief.steps[${i}].title}`, text: `{brief.steps[${i}].text}` });

/** The heading large on the left with the lead under it; the steps on a line, on a surface card that runs off the right page edge. */
export default definePreset({
  id: "composition/steps/recipe-card",
  tags: { mood: ["card", "line", "process"], stances: ["kitchen-index-card", "transit-diagram"] },
  needs: ["copy.headline", "brief.steps[0].title", "brief.steps[1].title"],
  props: {
    intent: "steps",
    width: "contained",
    rows: 3,
    background: [{ kind: "field", role: "surface", cols: { from: 7, to: 12 }, rows: { from: 1, to: 3 } }],
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 5, weight: 800, measure: "s", desk: { col: 1, span: 5, row: 1 }, phone: { order: 0, span: "full" } },
      { id: "e_t", kind: "text", paragraphs: ["{copy.lead}"], size: 1, desk: { col: 1, span: 5, row: 2 }, phone: { order: 1, span: "full" } },
      { id: "e_steps", kind: "steps", style: "line", items: [step(0), step(1), step(2), step(3), step(4), step(5)], desk: { col: 8, span: 4, row: 1, rowSpan: 3, alignY: "center" }, phone: { order: 2, span: "full" } },
    ],
  },
  note: "From Pekarna Zrno (kitchen-index-card: the recipe written on a card) and S Cevi's step line: the steps on a card of their own that runs off the page edge.",
});
