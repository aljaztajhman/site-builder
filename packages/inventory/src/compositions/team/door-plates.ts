import { definePreset } from "@sb/spec";

const plate = (i: number) => ({ value: `{brief.people[${i}].name}`, label: `{brief.people[${i}].role}` });

/** The heading and the lead on the left; each person's name and role on a door plate of their own on the right, stepped like plates beside a door. */
export default definePreset({
  id: "composition/team/door-plates",
  tags: { mood: ["sign", "personal", "calm"], stances: ["brass-door-plate"] },
  needs: ["copy.headline", "brief.people[0].name"],
  props: {
    intent: "team",
    width: "contained",
    rows: 3,
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 5, weight: 700, desk: { col: 1, span: 5, row: 1 }, phone: { order: 0, span: "full" } },
      { id: "e_t", kind: "text", paragraphs: ["{copy.lead}"], desk: { col: 1, span: 5, row: 2 }, phone: { order: 1, span: "full" } },
      { id: "e_p0", kind: "fact", ...plate(0), treatment: "door-plate", size: 4, desk: { col: 7, span: 5, row: 1 }, phone: { order: 2, span: "inset" } },
      { id: "e_p1", kind: "fact", ...plate(1), treatment: "door-plate", size: 4, desk: { col: 7, span: 5, row: 2 }, phone: { order: 3, span: "inset" } },
      { id: "e_p2", kind: "fact", ...plate(2), treatment: "door-plate", size: 4, desk: { col: 7, span: 5, row: 3 }, phone: { order: 4, span: "inset" } },
    ],
  },
  note: "From Računovodstvo Kovač (brass-door-plate: names on plates by the door): the people as a column of name plates, one per person the client named.",
});
