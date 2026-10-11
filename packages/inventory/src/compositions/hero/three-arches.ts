import { definePreset } from "@sb/spec";

/** The headline, lead and call on the left; three of the client's photos in arches of different heights on the right. */
export default definePreset({
  id: "composition/hero/three-arches",
  tags: { mood: ["arch", "photo", "rhythm"], stances: ["portrait-first", "plecnik-classicism"] },
  needs: ["copy.headline", "images[1]"],
  props: {
    intent: "hero",
    width: "wide",
    minHeight: "m",
    rows: 4,
    elements: [
      { id: "e_title", kind: "heading", text: "{copy.headline}", level: 1, size: 5, weight: 800, measure: "s", desk: { col: 1, span: 5, row: 1, rowSpan: 2, alignY: "end" }, phone: { order: 0, span: "full" } },
      { id: "e_lead", kind: "text", paragraphs: ["{copy.lead}"], desk: { col: 1, span: 4, row: 3 }, phone: { order: 1, span: "full" } },
      { id: "e_call", kind: "action", action: "call", label: "Pokličite", style: "primary", desk: { col: 1, span: 2, row: 4, alignY: "start" }, phone: { order: 2, span: "full" } },
      { id: "e_a", kind: "image", image: "{images[0]}", ratio: "3:4", mask: "arch", desk: { col: 6, span: 2, row: 2, rowSpan: 2, alignY: "end" }, phone: { order: 3, span: "half" } },
      { id: "e_b", kind: "image", image: "{images[1]}", ratio: "3:4", mask: "arch", desk: { col: 8, span: 3, row: 1, rowSpan: 3 }, phone: { order: 4, span: "half" } },
      { id: "e_c", kind: "image", image: "{images[2]}", ratio: "3:4", mask: "arch", desk: { col: 11, span: 2, row: 2, rowSpan: 3 }, phone: { order: 5, span: "half", hidden: true } },
    ],
  },
  note: "Re-expresses hero-signature:mirrors: two or three arches stepped in height; the wall-sized name behind them is left out (it can't hold contrast).",
});
