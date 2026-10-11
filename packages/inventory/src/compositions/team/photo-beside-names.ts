import { definePreset } from "@sb/spec";

/** The heading and the people list on the left; one of the client's photos on the right, a second one small over its corner. */
export default definePreset({
  id: "composition/team/photo-beside-names",
  tags: { mood: ["photo", "personal"] },
  needs: ["copy.headline", "brief.people[0].name"],
  props: {
    intent: "team",
    width: "contained",
    rows: 2,
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 4, desk: { col: 1, span: 6, row: 1, alignY: "end" }, phone: { order: 0, span: "full" } },
      {
        id: "e_l",
        kind: "list",
        items: [{ lead: "{brief.people[0].name}", text: "{brief.people[0].role}" }, { lead: "{brief.people[1].name}", text: "{brief.people[1].role}" }, { lead: "{brief.people[2].name}", text: "{brief.people[2].role}" }, { lead: "{brief.people[3].name}", text: "{brief.people[3].role}" }, { lead: "{brief.people[4].name}", text: "{brief.people[4].role}" }, { lead: "{brief.people[5].name}", text: "{brief.people[5].role}" }],
        marker: "rule",
        size: 1,
        desk: { col: 1, span: 6, row: 2, alignY: "start" },
        phone: { order: 1, span: "full" },
      },
      { id: "e_photo", kind: "image", image: "{images[0]}", ratio: "4:3", desk: { col: 8, span: 5, row: 1, rowSpan: 2 }, phone: { order: 2, span: "full" } },
      { id: "e_inset", kind: "image", image: "{images[1]}", ratio: "3:4", desk: { col: 11, span: 2, row: 2, layer: 1, alignY: "end", shiftX: 1 }, phone: { order: 3, span: "half", hidden: true } },
    ],
  },
  // Without a photo the list takes a longer measure.
  reflow: { e_photo: { e_h: { span: 8 }, e_l: { span: 8 } } },
  note: "Re-expresses team:photo: the people beside the client's photos.",
});
