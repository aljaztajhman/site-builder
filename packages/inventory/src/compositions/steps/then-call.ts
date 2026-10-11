import { definePreset } from "@sb/spec";

const step = (i: number) => ({ title: `{brief.steps[${i}].title}`, text: `{brief.steps[${i}].text}` });

/** The heading and the steps side by side; under the steps a rule, then the phone number split from its label: the way to start. */
export default definePreset({
  id: "composition/steps/then-call",
  tags: { mood: ["process", "action", "rule"], stances: ["swiss-grid", "workshop-docket"] },
  needs: ["copy.headline", "brief.steps[0].title", "brief.steps[1].title"],
  props: {
    intent: "steps",
    width: "contained",
    rows: 2,
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 4, weight: 800, measure: "m", desk: { col: 1, span: 4, row: 1 }, phone: { order: 0, span: "full" } },
      { id: "e_steps", kind: "steps", style: "numbered", items: [step(0), step(1), step(2), step(3), step(4), step(5)], desk: { col: 6, span: 7, row: 1 }, phone: { order: 1, span: "full" } },
      { id: "e_phone", kind: "fact", value: "{business.phone}", label: "Pokličite", treatment: "split", size: 4, link: { action: "call" }, desk: { col: 6, span: 7, row: 2 }, phone: { order: 2, span: "full" } },
    ],
  },
  note: "From S Cevi ('od klica do pisne ponudbe': the steps end in a call) and the swiss-grid stance: the process closes on the phone number, split from its label by a rule.",
});
