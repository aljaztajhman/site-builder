import { definePreset } from "@sb/spec";

/** The page's title on flat marker bands, the lead under it; one of the client's photos as a disc to the right. Without a photo the words stand alone. */
export default definePreset({
  id: "composition/page-head/marker-disc",
  tags: { mood: ["highlight", "bold", "round"], stances: ["photocopied-zine", "colour-block", "risograph"] },
  needs: ["copy.headline"],
  props: {
    intent: "page-head",
    width: "contained",
    rows: 2,
    elements: [
      { id: "e_title", kind: "heading", text: "{copy.headline}", level: 1, size: 6, weight: 800, measure: "m", treatment: "marker-highlight", desk: { col: 1, span: 8, row: 1, alignY: "end" }, phone: { order: 0, span: "full" } },
      { id: "e_t", kind: "text", paragraphs: ["{copy.lead}"], size: 1, desk: { col: 1, span: 6, row: 2 }, phone: { order: 1, span: "full" } },
      { id: "e_photo", kind: "image", image: "{images[2]}", ratio: "1:1", mask: "circle", desk: { col: 10, span: 3, row: 1, rowSpan: 2, alignY: "center" }, phone: { order: 2, span: "half" } },
    ],
  },
  reflow: { e_photo: {} },
  note: "From the photocopied-zine stance and O Nasmeh's round photo: the title highlighted with a marker, a photo disc beside it.",
});
