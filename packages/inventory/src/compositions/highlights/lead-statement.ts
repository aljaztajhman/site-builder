import { definePreset } from "@sb/spec";

/** The heading small, the client's first highlight set as one large statement across the section, the next ones as ruled rows stepped in under it. */
export default definePreset({
  id: "composition/highlights/lead-statement",
  tags: { mood: ["type", "scale-contrast", "bold"], stances: ["oversized-type", "brutalist-minimal"] },
  needs: ["copy.headline", "brief.highlights[1]"],
  props: {
    intent: "highlights",
    width: "wide",
    rows: 3,
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 2, weight: 700, desk: { col: 1, span: 4, row: 1 }, phone: { order: 0, span: "full" } },
      { id: "e_big", kind: "heading", text: "{brief.highlights[0]}", level: 3, size: 5, weight: 800, measure: "l", desk: { col: 1, span: 10, row: 2 }, phone: { order: 1, span: "full" } },
      {
        id: "e_rest",
        kind: "list",
        items: ["{brief.highlights[1]}", "{brief.highlights[2]}", "{brief.highlights[3]}", "{brief.highlights[4]}"],
        marker: "rule",
        size: 1,
        desk: { col: 6, span: 7, row: 3 },
        phone: { order: 2, span: "full" },
      },
    ],
  },
  note: "From R Račun (who it is for set at 136 px) and P Pregib (one number set huge): the strongest highlight is the section's one big line, the rest step in under it.",
});
