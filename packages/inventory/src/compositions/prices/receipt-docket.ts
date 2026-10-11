import { definePreset } from "@sb/spec";

const priced = (i: number) => ({ name: `{brief.priced[${i}].name}`, price: `{brief.priced[${i}].price}` });

/** The heading large and the lead on the left; the priced offerings as a till receipt in a narrow column on the right. */
export default definePreset({
  id: "composition/prices/receipt-docket",
  tags: { mood: ["paper", "receipt", "narrow"], stances: ["till-receipt", "workshop-docket"] },
  needs: ["copy.headline", "brief.priced[0].name"],
  props: {
    intent: "prices",
    width: "contained",
    rows: 2,
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 6, weight: 800, measure: "s", desk: { col: 1, span: 6, row: 1 }, phone: { order: 0, span: "full" } },
      { id: "e_t", kind: "text", paragraphs: ["{copy.lead}"], desk: { col: 1, span: 5, row: 2 }, phone: { order: 1, span: "full" } },
      { id: "e_p", kind: "prices", style: "docket", items: [priced(0), priced(1), priced(2), priced(3), priced(4), priced(5), priced(6), priced(7)], desk: { col: 8, span: 4, row: 1, rowSpan: 2 }, phone: { order: 2, span: "inset" } },
    ],
  },
  reflow: { e_t: { e_h: { rowSpan: 2 } } },
  note: "From R Račun (the hero object is a paper receipt listing what the office does) and the till-receipt stance: the price list as one narrow receipt, not a table.",
});
