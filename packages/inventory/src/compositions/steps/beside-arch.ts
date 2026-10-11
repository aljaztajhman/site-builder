import { definePreset } from "@sb/spec";

const step = (i: number) => ({ title: `{brief.steps[${i}].title}`, text: `{brief.steps[${i}].text}` });

/** The heading, the lead and one of the client's photos in a tall arch on the left; the steps in a column on the right. */
export default definePreset({
  id: "composition/steps/beside-arch",
  tags: { mood: ["photo", "arch", "process"], stances: ["woodcut"] },
  needs: ["copy.headline", "brief.steps[0].title", "brief.steps[1].title"],
  props: {
    intent: "steps",
    width: "contained",
    rows: 3,
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 4, weight: 800, measure: "m", desk: { col: 1, span: 5, row: 1 }, phone: { order: 0, span: "full" } },
      { id: "e_t", kind: "text", paragraphs: ["{copy.lead}"], desk: { col: 1, span: 4, row: 2 }, phone: { order: 1, span: "full" } },
      { id: "e_photo", kind: "image", image: "{images[0]}", ratio: "3:4", mask: "arch", desk: { col: 1, span: 4, row: 3 }, phone: { order: 3, span: "inset" } },
      { id: "e_steps", kind: "steps", style: "numbered", items: [step(0), step(1), step(2), step(3), step(4), step(5)], desk: { col: 7, span: 6, row: 1, rowSpan: 3, alignY: "center" }, phone: { order: 2, span: "full" } },
    ],
  },
  reflow: { e_photo: { e_steps: { rowSpan: 2, alignY: "start" } } },
  note: "From J Skorja (the oven-arch photo beside the dark 'how we bake') and the woodcut stance: the process beside a photo of the work in an arch.",
});
