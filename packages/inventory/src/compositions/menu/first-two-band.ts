import { definePreset } from "@sb/spec";

const item = (i: number) => ({ name: `{brief.offerings[${i}].name}`, note: `{brief.offerings[${i}].description}`, price: `{brief.offerings[${i}].price}` });
// No notes on the band: a note keeps the muted colour, which doesn't read on a band field (G9 note check).
const onBand = (i: number) => ({ name: `{brief.offerings[${i}].name}`, price: `{brief.offerings[${i}].price}` });

/** A band block bled to the left edge holds the heading and the first two offerings set large; the rest of the menu runs beside it with dotted leaders. */
export default definePreset({
  id: "composition/menu/first-two-band",
  tags: { mood: ["band", "scale-contrast", "menu"], stances: ["colour-block", "market-stall-cards"], trades: ["restaurant", "bakery", "tourist-farm"] },
  needs: ["copy.headline", "brief.offerings[2].name"],
  props: {
    intent: "menu",
    width: "contained",
    rows: 2,
    background: [{ kind: "field", role: "band", cols: { from: 1, to: 6 } }],
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 5, weight: 800, color: "onBand", desk: { col: 1, span: 5, row: 1 }, phone: { order: 0, span: "full" } },
      { id: "e_big", kind: "prices", style: "rows", size: 2, items: [onBand(0), onBand(1)], color: "onBand", desk: { col: 1, span: 5, row: 2 }, phone: { order: 1, span: "full" } },
      { id: "e_rest", kind: "prices", style: "leaders", items: [item(2), item(3), item(4), item(5), item(6), item(7), item(8), item(9), item(10), item(11)], desk: { col: 8, span: 5, row: 1, rowSpan: 2, alignY: "center" }, phone: { order: 2, span: "full" } },
    ],
  },
  note: "From K Jedilnik (a green band with the two daily offers set huge) and jedilnica-brin (colour as a block bled to the edge): the first two dishes on a band of their own, the rest of the menu beside it.",
});
