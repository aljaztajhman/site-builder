import { definePreset } from "@sb/spec";

// No notes: the list sits on the band, where a note's muted colour doesn't read (G9 note check).
const priced = (i: number) => ({ name: `{brief.priced[${i}].name}`, price: `{brief.priced[${i}].price}` });

/** The whole section on the band colour: the heading at display size and the lead on the left, the priced offerings as large ruled rows on the right. */
export default definePreset({
  id: "composition/prices/band-large-rows",
  tags: { mood: ["band", "bold", "scale-contrast"], stances: ["colour-block", "shopfront-fascia"] },
  needs: ["copy.headline", "brief.priced[0].name"],
  props: {
    intent: "prices",
    width: "wide",
    rows: 2,
    minHeight: "s",
    background: [{ kind: "field", role: "band" }],
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 6, weight: 800, measure: "s", color: "onBand", desk: { col: 1, span: 5, row: 1 }, phone: { order: 0, span: "full" } },
      { id: "e_t", kind: "text", paragraphs: ["{copy.lead}"], color: "onBand", desk: { col: 1, span: 4, row: 2 }, phone: { order: 1, span: "full" } },
      { id: "e_p", kind: "prices", style: "rows", size: 2, items: [priced(0), priced(1), priced(2), priced(3), priced(4), priced(5), priced(6), priced(7)], color: "onBand", desk: { col: 7, span: 6, row: 1, rowSpan: 2 }, phone: { order: 2, span: "full" } },
    ],
  },
  reflow: { e_t: { e_h: { rowSpan: 2 } } },
  note: "From K Jedilnik (the daily offers and their prices set big on the green band) and the colour-block stance: the price list as the band itself, prices at heading size.",
});
