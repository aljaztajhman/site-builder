import { definePreset } from "@sb/spec";

const qa = (i: number) => ({ question: `{brief.faq[${i}].question}`, answer: `{brief.faq[${i}].answer}` });

/** The heading and the lead in a column that stays in view on desktop; every answer open beside it. */
export default definePreset({
  id: "composition/faq/pinned-open",
  tags: { mood: ["editorial", "reading", "asymmetric"], stances: ["editorial-magazine", "swiss-grid"] },
  needs: ["copy.headline", "brief.faq[0].question", "brief.faq[0].answer"],
  props: {
    intent: "faq",
    width: "contained",
    rows: 3,
    pin: { col: 1, span: 4 },
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 5, weight: 800, measure: "s", desk: { col: 1, span: 4, row: 1 }, phone: { order: 0, span: "full" } },
      { id: "e_t", kind: "text", paragraphs: ["{copy.lead}"], desk: { col: 1, span: 4, row: 2 }, phone: { order: 1, span: "full" } },
      { id: "e_qa", kind: "qa", style: "open", items: [qa(0), qa(1), qa(2), qa(3), qa(4), qa(5), qa(6), qa(7)], desk: { col: 6, span: 7, row: 1, rowSpan: 3 }, phone: { order: 2, span: "full" } },
    ],
  },
  reflow: { e_t: { e_h: { rowSpan: 2 } } },
  note: "From A Globina (the parents' questions read as a list, not hidden) and the editorial-magazine stance: every answer open, the heading pinned beside them while they scroll.",
});
