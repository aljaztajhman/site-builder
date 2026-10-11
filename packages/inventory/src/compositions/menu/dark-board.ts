import { definePreset } from "@sb/spec";

const item = (i: number) => ({ name: `{brief.offerings[${i}].name}`, price: `{brief.offerings[${i}].price}` });

/** The whole section on the inverse ground: the heading at display size on the left, the offerings as a menu board on the right. */
export default definePreset({
  id: "composition/menu/dark-board",
  tags: { mood: ["dark", "board", "bold"], stances: ["night-ground", "shopfront-fascia"], trades: ["restaurant", "bakery", "tourist-farm"] },
  needs: ["copy.headline", "brief.offerings[0].name"],
  props: {
    intent: "menu",
    width: "wide",
    rows: 1,
    minHeight: "m",
    background: [{ kind: "field", role: "inverse" }],
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 6, weight: 900, measure: "m", color: "onInverse", desk: { col: 1, span: 5, row: 1, alignY: "start" }, phone: { order: 0, span: "full" } },
      { id: "e_p", kind: "prices", style: "board", items: [item(0), item(1), item(2), item(3), item(4), item(5), item(6), item(7), item(8), item(9)], color: "onInverse", desk: { col: 6, span: 7, row: 1 }, phone: { order: 1, span: "full" } },
    ],
  },
  note: "From J Skorja (the dark roast ground, prices on a ruled board): the menu as the shop's board on a dark wall, its name set as large as the wall allows.",
});
