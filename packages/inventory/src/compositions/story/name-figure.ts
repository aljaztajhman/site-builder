import { definePreset } from "@sb/spec";

/** The owner's name set as a large figure with their role under it on the left; the heading and the story on the right. */
export default definePreset({
  id: "composition/story/name-figure",
  tags: { mood: ["type", "personal", "bold"] },
  needs: ["copy.headline", "brief.people[0].name"],
  props: {
    intent: "story",
    width: "contained",
    rows: 2,
    elements: [
      { id: "e_name", kind: "fact", value: "{brief.people[0].name}", label: "{brief.people[0].role}", treatment: "numeral", size: 6, desk: { col: 1, span: 5, row: 1, rowSpan: 2, alignY: "center" }, phone: { order: 0, span: "full" } },
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 3, desk: { col: 7, span: 6, row: 1, alignY: "end" }, phone: { order: 1, span: "full" } },
      { id: "e_t", kind: "text", paragraphs: ["{copy.lead}"], desk: { col: 7, span: 6, row: 2, alignY: "start" }, phone: { order: 2, span: "full" } },
    ],
  },
  note: "Re-expresses about:figure: the big figure is the owner's name (no number slot); a fact object, never a number nobody gave.",
});
