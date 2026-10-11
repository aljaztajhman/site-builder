import { definePreset } from "@sb/spec";

/** One of the client's photos tall on the left, running off the page edge; the heading, the lead and the offerings as a ruled list beside it. */
export default definePreset({
  id: "composition/services/photo-bleed-list",
  tags: { mood: ["photo", "bleed", "list"], stances: ["julian-alps", "documentary-monochrome"] },
  needs: ["copy.headline", "brief.offerings[1].name"],
  props: {
    intent: "services",
    width: "contained",
    rows: 3,
    elements: [
      { id: "e_photo", kind: "image", image: "{images[0]}", ratio: "fill", desk: { col: 1, span: 5, row: 1, rowSpan: 3, bleedX: "start" }, phone: { order: 2, span: "bleed" } },
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 4, weight: 800, measure: "m", desk: { col: 7, span: 6, row: 1 }, phone: { order: 0, span: "full" } },
      { id: "e_t", kind: "text", paragraphs: ["{copy.lead}"], desk: { col: 7, span: 5, row: 2 }, phone: { order: 1, span: "full" } },
      {
        id: "e_l",
        kind: "list",
        items: ["{brief.offerings[0].name}", "{brief.offerings[1].name}", "{brief.offerings[2].name}", "{brief.offerings[3].name}", "{brief.offerings[4].name}", "{brief.offerings[5].name}", "{brief.offerings[6].name}", "{brief.offerings[7].name}"],
        marker: "rule",
        size: 1,
        desk: { col: 7, span: 6, row: 3 },
        phone: { order: 3, span: "full" },
      },
    ],
  },
  reflow: { e_photo: { e_h: { col: 1, span: 7 }, e_t: { col: 1, span: 6 }, e_l: { col: 1, span: 9 } }, e_t: { e_h: { rowSpan: 2 } } },
  note: "From J Skorja and fizioterapija-spik (a photo that runs off the page edge): the work as a tall photo bled to the left, the offerings as a list beside it.",
});
