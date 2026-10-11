import { definePreset } from "@sb/spec";

/** One of the client's photos behind the whole section under a flat dark scrim; the heading at the lower left, the highlights as a ruled list on the right. */
export default definePreset({
  id: "composition/highlights/over-photo",
  tags: { mood: ["photo", "dark", "immersive"], stances: ["documentary-monochrome", "julian-alps"] },
  needs: ["copy.headline", "brief.highlights[1]", "images[0]"],
  props: {
    intent: "highlights",
    width: "wide",
    rows: 1,
    minHeight: "m",
    background: [{ kind: "photo", image: "{images[0]}", scrim: { role: "inverse", strength: 4 }, phone: "cover" }],
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 6, weight: 800, measure: "s", color: "onInverse", desk: { col: 1, span: 5, row: 1, alignY: "end" }, phone: { order: 0, span: "full" } },
      {
        id: "e_l",
        kind: "list",
        items: ["{brief.highlights[0]}", "{brief.highlights[1]}", "{brief.highlights[2]}", "{brief.highlights[3]}", "{brief.highlights[4]}", "{brief.highlights[5]}"],
        marker: "rule",
        size: 1,
        weight: "medium",
        color: "onInverse",
        desk: { col: 7, span: 6, row: 1, alignY: "end" },
        phone: { order: 1, span: "full" },
      },
    ],
  },
  note: "From A Globina (the facts on a dark band that starts under a photo, one flat overlay, no gradient): the highlights read off the client's own photo.",
});
