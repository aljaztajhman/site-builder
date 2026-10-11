import { definePreset } from "@sb/spec";

/** The shop window: the client's product photo large on the right, bled to the page edge, the real prices hung over its left edge as hang tags; the headline big on the left. */
export default definePreset({
  id: "composition/hero/shop-window-tags",
  tags: { mood: ["photo", "product", "prices", "warm"], trades: ["bakery", "shop", "restaurant"], stances: ["hang-tag", "market-stall-cards", "shopfront-fascia"] },
  needs: ["copy.headline", "images[0]", "brief.priced[0].name"],
  props: {
    intent: "hero",
    width: "wide",
    minHeight: "screen",
    rows: 5,
    background: [{ kind: "field", role: "primary", cols: { from: 1, to: 6 } }],
    elements: [
      { id: "e_where", kind: "text", paragraphs: ["{business.street}, {business.town}"], desk: { col: 1, span: 5, row: 1, alignY: "end" }, phone: { order: 0, span: "full" } },
      { id: "e_title", kind: "heading", text: "{copy.headline}", level: 1, size: 6, weight: 800, measure: "m", desk: { col: 1, span: 6, row: 2, rowSpan: 2, alignY: "center" }, phone: { order: 1, span: "full" } },
      { id: "e_lead", kind: "text", paragraphs: ["{copy.lead}"], size: 1, desk: { col: 1, span: 5, row: 4, alignY: "start" }, phone: { order: 2, span: "full" } },
      { id: "e_phone", kind: "fact", value: "{business.phone}", label: "Naročila po telefonu", labelAt: "before", treatment: "numeral", size: 5, link: { action: "call" }, desk: { col: 1, span: 5, row: 5, alignY: "start" }, phone: { order: 3, span: "full" } },
      { id: "e_photo", kind: "image", image: "{images[0]}", ratio: "fill", desk: { col: 7, span: 6, row: 1, rowSpan: 5, bleedX: "end" }, phone: { order: 4, span: "bleed" } },
      {
        id: "e_tags",
        kind: "prices",
        style: "tags",
        items: [
          { name: "{brief.priced[0].name}", price: "{brief.priced[0].price}" },
          { name: "{brief.priced[1].name}", price: "{brief.priced[1].price}" },
          { name: "{brief.priced[2].name}", price: "{brief.priced[2].price}" },
          { name: "{brief.priced[3].name}", price: "{brief.priced[3].price}" },
        ],
        desk: { col: 7, span: 3, row: 2, rowSpan: 3, layer: 2, alignY: "center" },
        phone: { order: 5, span: "full" },
      },
    ],
  },
  reflow: { e_tags: { e_title: { span: 6 } } },
  note: "New (hero bar A): the product as the hero, the counter's price tags over the photo; prices only from the brief.",
});
