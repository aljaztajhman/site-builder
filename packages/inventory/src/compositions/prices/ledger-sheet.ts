import { definePreset } from "@sb/spec";

// No notes: on the light page in an inverse section a note keeps the section's muted colour (axe contrast), see the PR's gaps.
const priced = (i: number) => ({ name: `{brief.priced[${i}].name}`, price: `{brief.priced[${i}].price}` });

/** A ledger page on the surface colour, offset right and running off the page edge: the heading ruled off like a total, the priced offerings as its ruled sheet; the lead as a note in the margin left of the page. */
export default definePreset({
  id: "composition/prices/ledger-sheet",
  tags: { mood: ["ledger", "rule", "paper"], stances: ["account-ledger", "functional-catalogue"] },
  needs: ["copy.headline", "brief.priced[0].name"],
  props: {
    intent: "prices",
    width: "contained",
    rows: 2,
    background: [{ kind: "field", role: "surface", cols: { from: 5, to: 12 } }],
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 4, weight: 700, treatment: "ruled-total", desk: { col: 6, span: 6, row: 1 }, phone: { order: 0, span: "full" } },
      { id: "e_p", kind: "prices", style: "sheet", items: [priced(0), priced(1), priced(2), priced(3), priced(4), priced(5), priced(6), priced(7), priced(8), priced(9)], desk: { col: 6, span: 6, row: 2 }, phone: { order: 1, span: "full" } },
      { id: "e_t", kind: "text", paragraphs: ["{copy.lead}"], desk: { col: 1, span: 3, row: 2 }, phone: { order: 2, span: "full" } },
    ],
  },
  reflow: { e_t: {} },
  note: "From Računovodstvo Zorko (account-ledger: a ruled book, totals between rules): the price list as a ledger page laid on the paper, its heading ruled off as a total, a margin note beside it.",
});
