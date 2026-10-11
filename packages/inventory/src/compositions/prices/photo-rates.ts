import { definePreset } from "@sb/spec";

/** One of the client's photos on the left; the heading, lead and two priced offerings set large on the right. */
export default definePreset({
  id: "composition/prices/photo-rates",
  tags: { mood: ["prices", "photo"] },
  needs: ["copy.headline", "brief.priced[0].name"],
  props: {
    intent: "prices",
    width: "contained",
    rows: 3,
    elements: [
      { id: "e_photo", kind: "image", image: "{images[0]}", ratio: "3:4", desk: { col: 1, span: 4, row: 1, rowSpan: 3 }, phone: { order: 0, span: "full" } },
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 3, desk: { col: 6, span: 7, row: 1, alignY: "end" }, phone: { order: 1, span: "full" } },
      { id: "e_t", kind: "text", paragraphs: ["{copy.lead}"], desk: { col: 6, span: 6, row: 2 }, phone: { order: 2, span: "full" } },
      {
        id: "e_p",
        kind: "prices",
        items: [{ name: "{brief.priced[0].name}", price: "{brief.priced[0].price}" }, { name: "{brief.priced[1].name}", price: "{brief.priced[1].price}" }],
        style: "tags",
        size: 2,
        desk: { col: 6, span: 7, row: 3 },
        phone: { order: 3, span: "full" },
      },
    ],
  },
  // Without a photo the words move to the left; without a lead the heading holds both rows.
  reflow: { e_photo: { e_h: { col: 1, span: 8 }, e_t: { col: 1, span: 7 }, e_p: { col: 1, span: 8 } }, e_t: { e_h: { rowSpan: 2 } } },
  note: "Re-expresses price-list:rates: a photo beside two large rates.",
});
