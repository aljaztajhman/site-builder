import { definePreset } from "@sb/spec";

/** The heading, then the client's highlights as ruled rows in one wide column. */
export default definePreset({
  id: "composition/highlights/ruled-rows",
  tags: { mood: ["list", "ruled", "calm"] },
  needs: ["copy.headline", "brief.highlights[1]"],
  props: {
    intent: "highlights",
    width: "contained",
    rows: 2,
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 4, desk: { col: 1, span: 8, row: 1 }, phone: { order: 0, span: "full" } },
      {
        id: "e_l",
        kind: "list",
        items: ["{brief.highlights[0]}", "{brief.highlights[1]}", "{brief.highlights[2]}", "{brief.highlights[3]}", "{brief.highlights[4]}", "{brief.highlights[5]}"],
        marker: "rule",
        size: 1,
        desk: { col: 1, span: 8, row: 2 },
        phone: { order: 1, span: "full" },
      },
    ],
  },
  note: "Re-expresses highlights:list: one ruled list.",
});
