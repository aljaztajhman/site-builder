import { definePreset } from "@sb/spec";

const name = (i: number, row: number, right: boolean) => ({
  id: `e_o${i}`,
  kind: "heading" as const,
  text: `{brief.offerings[${i}].name}`,
  level: 3 as const,
  size: 4,
  weight: 800,
  measure: "m" as const,
  desk: { col: right ? 7 : 1, span: 6, row },
  phone: { order: 2 + i, span: "full" as const },
});

/** The heading small and the lead beside it on one line; then the offerings' names set large and bold, two to a line, as the poster itself. */
export default definePreset({
  id: "composition/services/poster-names",
  tags: { mood: ["type", "scale-contrast", "bold"], stances: ["brutalist-minimal", "oversized-type"] },
  needs: ["copy.headline", "brief.offerings[1].name"],
  props: {
    intent: "services",
    width: "wide",
    rows: 5,
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 2, weight: 700, desk: { col: 1, span: 5, row: 1 }, phone: { order: 0, span: "full" } },
      { id: "e_t", kind: "text", paragraphs: ["{copy.lead}"], desk: { col: 7, span: 5, row: 1 }, phone: { order: 1, span: "full" } },
      name(0, 2, false),
      name(1, 2, true),
      name(2, 3, false),
      name(3, 3, true),
      name(4, 4, false),
      name(5, 4, true),
      name(6, 5, false),
      name(7, 5, true),
    ],
  },
  note: "From zidarstvo-cok (brutalist-minimal: nothing but the words, set big) and R Račun (what the office does at display size): the offerings' names are the poster, the heading only labels it.",
});
