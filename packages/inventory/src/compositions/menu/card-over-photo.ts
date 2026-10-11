import { definePreset } from "@sb/spec";

const item = (i: number) => ({ name: `{brief.offerings[${i}].name}`, price: `{brief.offerings[${i}].price}` });

/** One of the client's photos across the whole section; a menu card on the paper colour laid over it in the middle, the heading and the dishes with dotted leaders on the card. */
export default definePreset({
  id: "composition/menu/card-over-photo",
  tags: { mood: ["photo", "card", "classic"], stances: ["bottle-label", "letterpress-proof"], trades: ["restaurant", "tourist-farm", "bakery"] },
  needs: ["copy.headline", "brief.offerings[0].name", "images[0]"],
  props: {
    intent: "menu",
    width: "contained",
    rows: 2,
    gap: 2,
    background: [
      { kind: "photo", image: "{images[0]}", scrim: { role: "inverse", strength: 2 }, phone: "band" },
      { kind: "field", role: "background", cols: { from: 3, to: 10 } },
    ],
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 5, weight: 700, desk: { col: 4, span: 6, row: 1 }, phone: { order: 0, span: "full" } },
      { id: "e_p", kind: "prices", style: "leaders", items: [item(0), item(1), item(2), item(3), item(4), item(5), item(6), item(7), item(8), item(9)], desk: { col: 4, span: 6, row: 2 }, phone: { order: 1, span: "full" } },
    ],
  },
  note: "From K Jedilnik (a framed menu card laid over a full-bleed photo of the house): the menu as a paper card standing on the client's photo.",
});
