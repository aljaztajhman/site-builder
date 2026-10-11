import { definePreset } from "@sb/spec";

const qa = (i: number) => ({ question: `{brief.faq[${i}].question}`, answer: `{brief.faq[${i}].answer}` });

/** The heading, then the business's own questions, each answer opening under its question (details, no script). */
export default definePreset({
  id: "composition/faq/toggle-list",
  tags: { mood: ["list", "plain"] },
  needs: ["copy.headline", "brief.faq[0].question", "brief.faq[0].answer"],
  props: {
    intent: "faq",
    width: "contained",
    rows: 2,
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 4, desk: { col: 1, span: 8, row: 1 }, phone: { order: 0, span: "full" } },
      { id: "e_qa", kind: "qa", style: "toggle", items: [qa(0), qa(1), qa(2), qa(3), qa(4), qa(5), qa(6), qa(7)], desk: { col: 1, span: 8, row: 2 }, phone: { order: 1, span: "full" } },
    ],
  },
  note: "Re-expresses faq:accordion in the composition language: the questions and answers are the client's own, never invented; without one the preset isn't used.",
});
