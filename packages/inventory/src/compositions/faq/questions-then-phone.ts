import { definePreset } from "@sb/spec";

const qa = (i: number) => ({ question: `{brief.faq[${i}].question}`, answer: `{brief.faq[${i}].answer}` });

/** The heading across, the questions opening under it, and beside them, small and low, the phone for any other question. */
export default definePreset({
  id: "composition/faq/questions-then-phone",
  tags: { mood: ["list", "practical", "asymmetric"], stances: ["functional-catalogue", "swiss-grid"] },
  needs: ["copy.headline", "brief.faq[0].question", "brief.faq[0].answer"],
  props: {
    intent: "faq",
    width: "contained",
    rows: 2,
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 5, weight: 800, measure: "l", desk: { col: 1, span: 9, row: 1 }, phone: { order: 0, span: "full" } },
      { id: "e_qa", kind: "qa", style: "toggle", items: [qa(0), qa(1), qa(2), qa(3), qa(4), qa(5), qa(6), qa(7)], desk: { col: 1, span: 8, row: 2 }, phone: { order: 1, span: "full" } },
      { id: "e_phone", kind: "fact", value: "{business.phone}", label: "Pokličite", labelAt: "before", treatment: "split", size: 3, link: { action: "call" }, desk: { col: 10, span: 3, row: 2, alignY: "end" }, phone: { order: 2, span: "full" } },
    ],
  },
  reflow: { e_phone: { e_qa: { span: 8 } } },
  note: "From C Val and H Deska (the parents' questions, then the contact) and the functional-catalogue stance: the answers first, the phone waiting low beside them for anything they don't cover.",
});
