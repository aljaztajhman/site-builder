import { definePreset } from "@sb/spec";

const step = (i: number) => ({ title: `{brief.steps[${i}].title}`, text: `{brief.steps[${i}].text}` });

/** The whole section on the inverse ground: the heading at display size over the left half, the lead and the steps on a line beside it. */
export default definePreset({
  id: "composition/steps/inverse-band",
  tags: { mood: ["dark", "type", "process"], stances: ["oversized-type", "brutalist-minimal"] },
  needs: ["copy.headline", "brief.steps[0].title", "brief.steps[1].title"],
  props: {
    intent: "steps",
    width: "wide",
    rows: 2,
    minHeight: "m",
    background: [{ kind: "field", role: "inverse" }],
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 6, weight: 800, measure: "s", color: "onInverse", desk: { col: 1, span: 6, row: 1, rowSpan: 2 }, phone: { order: 0, span: "full" } },
      { id: "e_t", kind: "text", paragraphs: ["{copy.lead}"], size: 1, color: "onInverse", desk: { col: 8, span: 5, row: 1 }, phone: { order: 1, span: "full" } },
      { id: "e_steps", kind: "steps", style: "line", items: [step(0), step(1), step(2), step(3), step(4), step(5)], color: "onInverse", desk: { col: 8, span: 5, row: 2 }, phone: { order: 2, span: "full" } },
    ],
  },
  reflow: { e_t: { e_steps: { row: 1, rowSpan: 2 } } },
  note: "From J Skorja's dark 'how we bake' band and P Pregib (one thing set huge): a dark band where the heading is poster size and the steps run down a line beside it.",
});
