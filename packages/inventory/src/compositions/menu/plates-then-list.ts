import { definePreset } from "@sb/spec";

const item = (i: number) => ({ name: `{brief.offerings[${i}].name}`, note: `{brief.offerings[${i}].description}`, price: `{brief.offerings[${i}].price}` });

/** The heading, three of the client's photos as round plates in a row, then the whole menu in two columns with dotted leaders. */
export default definePreset({
  id: "composition/menu/plates-then-list",
  tags: { mood: ["photo", "round", "menu"], stances: ["still-life", "enamel-kitchenware"], trades: ["restaurant", "bakery", "tourist-farm"] },
  needs: ["copy.headline", "brief.offerings[0].name"],
  props: {
    intent: "menu",
    width: "contained",
    rows: 3,
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 5, weight: 800, desk: { col: 1, span: 8, row: 1 }, phone: { order: 0, span: "full" } },
      { id: "e_i0", kind: "image", image: "{images[0]}", ratio: "1:1", mask: "circle", desk: { col: 1, span: 4, row: 2 }, phone: { order: 1, span: "half" } },
      { id: "e_i1", kind: "image", image: "{images[1]}", ratio: "1:1", mask: "circle", desk: { col: 5, span: 4, row: 2, shiftY: 2 }, phone: { order: 2, span: "half" } },
      { id: "e_i2", kind: "image", image: "{images[2]}", ratio: "1:1", mask: "circle", desk: { col: 9, span: 4, row: 2 }, phone: { order: 3, span: "half", hidden: true } },
      { id: "e_a", kind: "prices", style: "leaders", items: [item(0), item(1), item(2), item(3), item(4), item(5)], desk: { col: 1, span: 6, row: 3 }, phone: { order: 4, span: "full" } },
      { id: "e_b", kind: "prices", style: "leaders", items: [item(6), item(7), item(8), item(9), item(10), item(11)], desk: { col: 7, span: 6, row: 3 }, phone: { order: 5, span: "full" } },
    ],
  },
  reflow: { e_b: { e_a: { span: 8 } }, e_i2: { e_i0: { col: 2, span: 4 }, e_i1: { col: 7, span: 4 } } },
  note: "From K Jedilnik (dishes as round plate photos, the rest as a ruled list): the photos laid out as plates on a table, the menu under them.",
});
