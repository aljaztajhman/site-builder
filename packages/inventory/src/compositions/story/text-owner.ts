import { definePreset } from "@sb/spec";

/** The heading and the story in a wide column, the owner's name and role under them after a rule. */
export default definePreset({
  id: "composition/story/text-owner",
  tags: { mood: ["type", "personal", "quiet"] },
  needs: ["copy.headline"],
  props: {
    intent: "story",
    width: "contained",
    rows: 3,
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 4, desk: { col: 1, span: 8, row: 1 }, phone: { order: 0, span: "full" } },
      { id: "e_t", kind: "text", paragraphs: ["{copy.lead}"], desk: { col: 1, span: 7, row: 2 }, phone: { order: 1, span: "full" } },
      { id: "e_owner", kind: "list", items: [{ lead: "{brief.people[0].name}", text: "{brief.people[0].role}" }], marker: "rule", desk: { col: 1, span: 4, row: 3 }, phone: { order: 2, span: "full" } },
    ],
  },
  note: "Re-expresses about:text-only: words first, the person who stands behind them last.",
});
