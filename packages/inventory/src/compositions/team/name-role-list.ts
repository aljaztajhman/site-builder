import { definePreset } from "@sb/spec";

/** The heading, then the people as a ruled list: each name with the role beside it. */
export default definePreset({
  id: "composition/team/name-role-list",
  tags: { mood: ["list", "personal"] },
  needs: ["copy.headline", "brief.people[0].name"],
  props: {
    intent: "team",
    width: "contained",
    rows: 2,
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 4, desk: { col: 1, span: 8, row: 1 }, phone: { order: 0, span: "full" } },
      {
        id: "e_l",
        kind: "list",
        items: [{ lead: "{brief.people[0].name}", text: "{brief.people[0].role}" }, { lead: "{brief.people[1].name}", text: "{brief.people[1].role}" }, { lead: "{brief.people[2].name}", text: "{brief.people[2].role}" }, { lead: "{brief.people[3].name}", text: "{brief.people[3].role}" }, { lead: "{brief.people[4].name}", text: "{brief.people[4].role}" }, { lead: "{brief.people[5].name}", text: "{brief.people[5].role}" }],
        marker: "rule",
        size: 1,
        desk: { col: 1, span: 8, row: 2 },
        phone: { order: 1, span: "full" },
      },
    ],
  },
  note: "Re-expresses team:list: a name column and a role column.",
});
