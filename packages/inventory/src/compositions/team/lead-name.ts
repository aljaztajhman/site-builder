import { definePreset } from "@sb/spec";

const person = (i: number) => ({ lead: `{brief.people[${i}].name}`, text: `{brief.people[${i}].role}` });

/** The heading small; the first person's name at display size across the section, the role under it; everyone else as a ruled list stepped in beside the role. */
export default definePreset({
  id: "composition/team/lead-name",
  tags: { mood: ["type", "scale-contrast", "personal"], stances: ["oversized-type", "editorial-magazine"] },
  needs: ["copy.headline", "brief.people[0].name"],
  props: {
    intent: "team",
    width: "wide",
    rows: 3,
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 2, weight: 700, desk: { col: 1, span: 6, row: 1 }, phone: { order: 0, span: "full" } },
      { id: "e_n0", kind: "heading", text: "{brief.people[0].name}", level: 3, size: 7, weight: 800, measure: "m", desk: { col: 1, span: 12, row: 2 }, phone: { order: 1, span: "full" } },
      { id: "e_r0", kind: "text", paragraphs: ["{brief.people[0].role}"], size: 1, desk: { col: 1, span: 4, row: 3 }, phone: { order: 2, span: "full" } },
      { id: "e_rest", kind: "list", items: [person(1), person(2), person(3), person(4), person(5)], marker: "rule", size: 1, desk: { col: 6, span: 7, row: 3 }, phone: { order: 3, span: "full" } },
    ],
  },
  // With one person the role keeps its short measure.
  reflow: { e_rest: {} },
  note: "From L Ogledalo (the name as the largest type on the page) and P Pregib (one thing set huge, the rest small): the first person the client named is the section's one big line, everyone else listed under them.",
});
