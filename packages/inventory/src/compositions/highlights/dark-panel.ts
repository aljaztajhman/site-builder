import { definePreset } from "@sb/spec";

/** On a dark panel that runs to the left page edge, the heading set large; beside it on the page, the client's highlights as a dashed list. */
export default definePreset({
  id: "composition/highlights/dark-panel",
  tags: { mood: ["band", "contrast", "list"], stances: ["colour-block", "night-ground", "split-screen"] },
  needs: ["copy.headline", "brief.highlights[1]"],
  props: {
    intent: "highlights",
    width: "wide",
    rows: 2,
    background: [{ kind: "field", role: "inverse", cols: { from: 1, to: 5 } }],
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 5, weight: 800, measure: "s", desk: { col: 1, span: 4, row: 1, rowSpan: 2, alignY: "center" }, phone: { order: 0, span: "full" } },
      {
        id: "e_l",
        kind: "list",
        items: ["{brief.highlights[0]}", "{brief.highlights[1]}", "{brief.highlights[2]}", "{brief.highlights[3]}", "{brief.highlights[4]}"],
        marker: "dash",
        size: 1,
        desk: { col: 7, span: 6, row: 1, rowSpan: 2, alignY: "center" },
        phone: { order: 1, span: "full" },
      },
    ],
  },
  note: "From J Skorja's dark roast ground and cvetlicarna-pirc's highlights (heading left, list right): the heading owns a dark panel bled to the page edge, the list stays on the page.",
});
