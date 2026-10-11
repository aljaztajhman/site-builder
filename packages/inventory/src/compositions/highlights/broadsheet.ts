import { definePreset } from "@sb/spec";

/** The heading under a heavy rule across the section, then three of the client's highlights set as three column headlines of a front page. */
export default definePreset({
  id: "composition/highlights/broadsheet",
  tags: { mood: ["type", "editorial", "columns"], stances: ["market-broadsheet", "editorial-magazine"] },
  needs: ["copy.headline", "brief.highlights[1]"],
  props: {
    intent: "highlights",
    width: "wide",
    rows: 2,
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 4, weight: 800, treatment: "masthead", desk: { col: 1, span: 12, row: 1 }, phone: { order: 0, span: "full" } },
      { id: "e_c0", kind: "heading", text: "{brief.highlights[0]}", level: 3, size: 3, weight: 600, desk: { col: 1, span: 4, row: 2 }, phone: { order: 1, span: "full" } },
      { id: "e_c1", kind: "heading", text: "{brief.highlights[1]}", level: 3, size: 3, weight: 600, desk: { col: 5, span: 4, row: 2 }, phone: { order: 2, span: "full" } },
      { id: "e_c2", kind: "heading", text: "{brief.highlights[2]}", level: 3, size: 3, weight: 600, desk: { col: 9, span: 4, row: 2 }, phone: { order: 3, span: "full" } },
    ],
  },
  note: "From the market-broadsheet stance and L Ogledalo's masthead: the highlights read as three columns of a front page under a masthead heading, not as a list.",
});
