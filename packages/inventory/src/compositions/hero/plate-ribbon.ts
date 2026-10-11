import { definePreset } from "@sb/spec";

/** No photo needed: the address line, headline and lead on the left; the phone as a registration plate tilted on the right (it is the call); the offerings run in a strip on a dark band at the foot. */
export default definePreset({
  id: "composition/hero/plate-ribbon",
  tags: { mood: ["sign", "bold", "strip"], trades: ["car-repair"], stances: ["registration-plate", "safety-signage"] },
  needs: ["copy.headline", "business.phone"],
  props: {
    intent: "hero",
    width: "wide",
    minHeight: "m",
    rows: 4,
    background: [{ kind: "field", role: "inverse", rows: { from: 4, to: 4 } }],
    elements: [
      { id: "e_where", kind: "text", paragraphs: ["{business.street}, {business.town}"], desk: { col: 1, span: 6, row: 1, alignY: "end" }, phone: { order: 0, span: "full" } },
      { id: "e_title", kind: "heading", text: "{copy.headline}", level: 1, size: 5, weight: 900, measure: "m", desk: { col: 1, span: 8, row: 2 }, phone: { order: 1, span: "full" } },
      { id: "e_lead", kind: "text", paragraphs: ["{copy.lead}"], size: 1, desk: { col: 1, span: 6, row: 3, alignY: "start" }, phone: { order: 3, span: "full" } },
      { id: "e_plate", kind: "fact", value: "{business.phone}", label: "Pokličite", treatment: "plate", plateCode: true, size: 7, link: { action: "call" }, desk: { col: 9, span: 4, row: 1, rowSpan: 3, alignY: "center", alignX: "center", tilt: -4 }, phone: { order: 2, span: "full" } },
      {
        id: "e_run",
        kind: "ribbon",
        items: ["{brief.offerings[0].name}", "{brief.offerings[1].name}", "{brief.offerings[2].name}", "{brief.offerings[3].name}", "{brief.offerings[4].name}", "{brief.offerings[5].name}"],
        move: "still",
        color: "onInverse",
        desk: { col: 1, span: 12, row: 4, alignY: "center" },
        phone: { order: 4, span: "full" },
      },
    ],
  },
  note: "From M Tablica (the phone as a registration plate that is the call link, the accent fact strip under the hero) and avtoservis-golob's ribbon band: the strip is the client's offerings on an inverse field.",
});
