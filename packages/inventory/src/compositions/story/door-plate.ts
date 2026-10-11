import { definePreset } from "@sb/spec";

/** The heading and the story on the left; on the right, the owner's name and role on a door plate, standing alone on the page. */
export default definePreset({
  id: "composition/story/door-plate",
  tags: { mood: ["sign", "personal", "calm"], stances: ["brass-door-plate", "plecnik-classicism"] },
  needs: ["copy.headline", "copy.lead"],
  props: {
    intent: "story",
    width: "contained",
    rows: 2,
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 5, weight: 700, measure: "m", desk: { col: 1, span: 7, row: 1 }, phone: { order: 0, span: "full" } },
      { id: "e_t", kind: "text", paragraphs: ["{copy.lead}"], size: 1, desk: { col: 1, span: 6, row: 2 }, phone: { order: 1, span: "full" } },
      { id: "e_plate", kind: "fact", value: "{brief.people[0].name}", label: "{brief.people[0].role}", treatment: "door-plate", size: 4, desk: { col: 9, span: 4, row: 1, rowSpan: 2, alignY: "center" }, phone: { order: 2, span: "inset" } },
    ],
  },
  note: "From Računovodstvo Kovač (brass-door-plate: the person named on the plate by the door): the story beside the owner's own name plate, the one object on a quiet page.",
});
