import { definePreset } from "@sb/spec";

/** One of the client's photos on the left; the heading, the story and the owner's name and role beside it. */
export default definePreset({
  id: "composition/story/photo-owner",
  tags: { mood: ["photo", "personal"] },
  needs: ["copy.headline"],
  props: {
    intent: "story",
    width: "contained",
    rows: 3,
    elements: [
      { id: "e_photo", kind: "image", image: "{images[0]}", ratio: "4:5", desk: { col: 1, span: 5, row: 1, rowSpan: 3 }, phone: { order: 0, span: "full" } },
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 3, desk: { col: 7, span: 6, row: 1, alignY: "end" }, phone: { order: 1, span: "full" } },
      { id: "e_t", kind: "text", paragraphs: ["{copy.lead}"], desk: { col: 7, span: 6, row: 2, alignY: "center" }, phone: { order: 2, span: "full" } },
      {
        id: "e_owner",
        kind: "list",
        items: [{ lead: "{brief.people[0].name}", text: "{brief.people[0].role}" }],
        marker: "rule",
        size: 0,
        desk: { col: 7, span: 4, row: 3, alignY: "start" },
        phone: { order: 3, span: "full" },
      },
    ],
  },
  // Without a photo the words move to the left.
  reflow: { e_photo: { e_h: { col: 1, span: 8 }, e_t: { col: 1, span: 7 }, e_owner: { col: 1 } } },
  note: "Re-expresses about:image-side: the owner from the brief's people, never invented.",
});
