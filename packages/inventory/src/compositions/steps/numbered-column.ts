import { definePreset } from "@sb/spec";

const step = (i: number) => ({ title: `{brief.steps[${i}].title}`, text: `{brief.steps[${i}].text}` });

/** The heading, then the business's own steps in one column: the ordered list's own numbers beside a title and a sentence each. */
export default definePreset({
  id: "composition/steps/numbered-column",
  tags: { mood: ["list", "plain"] },
  needs: ["copy.headline", "brief.steps[0].title", "brief.steps[1].title"],
  props: {
    intent: "steps",
    width: "contained",
    rows: 2,
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 4, desk: { col: 1, span: 8, row: 1 }, phone: { order: 0, span: "full" } },
      { id: "e_steps", kind: "steps", style: "numbered", items: [step(0), step(1), step(2), step(3), step(4), step(5)], desk: { col: 1, span: 8, row: 2 }, phone: { order: 1, span: "full" } },
    ],
  },
  note: "Re-expresses steps:vertical in the composition language: the steps are the client's own, never invented; without two of them the preset isn't used.",
});
