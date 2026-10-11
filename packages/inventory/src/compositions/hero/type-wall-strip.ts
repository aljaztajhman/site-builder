import { definePreset } from "@sb/spec";

/** A type poster: the headline in capitals across the whole width in the signal colour, the client's photo as one wide strip under it bled to both edges, the offerings in a strip and the call. */
export default definePreset({
  id: "composition/hero/type-wall-strip",
  tags: { mood: ["type", "poster", "signal", "strip"], trades: ["car-repair", "builder", "shop"], stances: ["safety-signage", "department-store-letters", "wayfinding"] },
  needs: ["copy.headline", "images[2]"],
  props: {
    intent: "hero",
    width: "wide",
    rows: 3,
    gap: 2,
    background: [{ kind: "field", role: "background" }],
    elements: [
      { id: "e_title", kind: "heading", text: "{copy.headline}", level: 1, size: 8, weight: 900, case: "uppercase", measure: "l", color: "primary", desk: { col: 1, span: 12, row: 1 }, phone: { order: 0, span: "full" } },
      { id: "e_lead", kind: "text", paragraphs: ["{copy.lead}"], size: 1, desk: { col: 1, span: 6, row: 2, alignY: "start" }, phone: { order: 1, span: "full" } },
      { id: "e_call", kind: "action", action: "call", label: "Pokličite", style: "primary", desk: { col: 9, span: 4, row: 2, alignY: "start", alignX: "end" }, phone: { order: 2, span: "full" } },
      { id: "e_photo", kind: "image", image: "{images[2]}", ratio: "21:9", treatment: "mono-contrast", desk: { col: 1, span: 12, row: 3, bleedX: "both" }, phone: { order: 3, span: "bleed" } },
      {
        id: "e_run",
        kind: "ribbon",
        items: ["{brief.offerings[0].name}", "{brief.offerings[1].name}", "{brief.offerings[2].name}", "{brief.offerings[3].name}", "{brief.offerings[4].name}", "{brief.offerings[5].name}"],
        move: "still",
        desk: { col: 1, span: 12, row: 3, layer: 2, alignY: "start" },
        phone: { order: 4, span: "full" },
      },
    ],
  },
  note: "New (hero bar F): type as the image, the photo reduced to one wide strip; a Swiss signal poster.",
});
