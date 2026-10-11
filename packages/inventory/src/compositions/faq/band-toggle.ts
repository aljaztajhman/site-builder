import { definePreset } from "@sb/spec";

const qa = (i: number) => ({ question: `{brief.faq[${i}].question}`, answer: `{brief.faq[${i}].answer}` });

/** The whole section on the band colour: the heading at display size on the left, the questions opening one by one on the right. */
export default definePreset({
  id: "composition/faq/band-toggle",
  tags: { mood: ["band", "type", "bold"], stances: ["colour-block", "oversized-type"] },
  needs: ["copy.headline", "brief.faq[0].question", "brief.faq[0].answer"],
  props: {
    intent: "faq",
    width: "wide",
    rows: 1,
    minHeight: "s",
    background: [{ kind: "field", role: "band" }],
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 6, weight: 800, measure: "s", color: "onBand", desk: { col: 1, span: 5, row: 1 }, phone: { order: 0, span: "full" } },
      { id: "e_qa", kind: "qa", style: "toggle", items: [qa(0), qa(1), qa(2), qa(3), qa(4), qa(5), qa(6), qa(7)], color: "onBand", desk: { col: 7, span: 6, row: 1 }, phone: { order: 1, span: "full" } },
    ],
  },
  note: "From A Globina (the questions on the deep-water band) and jedilnica-brin (a section that changes ground): a coloured band where the heading is poster size.",
});
