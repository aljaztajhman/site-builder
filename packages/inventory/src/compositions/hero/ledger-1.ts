import { definePreset } from "@sb/spec";

/** Ledger: the headline, lead and call in columns 1–5; columns 7–12 a ruled register of what the business does, its contact lines and its hours, as the hero's picture. No photo. */
export default definePreset({
  id: "composition/hero/ledger-1",
  structure: "ledger",
  tags: { mood: ["list", "ruled", "practical", "no-photo"], stances: ["account-ledger", "station-timetable"] },
  needs: ["copy.headline"],
  props: {
    intent: "hero",
    width: "wide",
    minHeight: "l",
    rows: 4,
    elements: [
      { id: "e_title", kind: "heading", text: "{copy.headline}", level: 1, size: 6, weight: 800, desk: { col: 1, span: 5, row: 1, rowSpan: 2, alignY: "start" }, phone: { order: 0, span: "full" } },
      { id: "e_lead", kind: "text", paragraphs: ["{copy.lead}"], size: 1, desk: { col: 1, span: 5, row: 3, alignY: "start" }, phone: { order: 3, span: "full" } },
      { id: "e_call", kind: "action", action: "call", label: "Pokličite", style: "primary", desk: { col: 1, span: 3, row: 4, alignY: "start" }, phone: { order: 1, span: "full" } },
      {
        id: "e_offer",
        kind: "list",
        items: ["{brief.offerings[0].name}", "{brief.offerings[1].name}", "{brief.offerings[2].name}", "{brief.offerings[3].name}", "{brief.offerings[4].name}", "{brief.offerings[5].name}"],
        marker: "rule",
        size: 2,
        weight: "medium",
        desk: { col: 7, span: 6, row: 1, rowSpan: 2, alignY: "start" },
        phone: { order: 4, span: "full" },
      },
      {
        id: "e_facts",
        kind: "list",
        items: [
          { lead: "Naslov", text: "{business.street}, {business.town}" },
          { lead: "Telefon", text: "{business.phone}" },
          { lead: "E-pošta", text: "{business.email}" },
        ],
        marker: "rule",
        desk: { col: 7, span: 6, row: 3, alignY: "start" },
        phone: { order: 2, span: "full" },
      },
      { id: "e_hours", kind: "hours", style: "table", desk: { col: 7, span: 6, row: 4, alignY: "start" }, phone: { order: 5, span: "full" } },
    ],
  },
  // Without the brief's offerings the contact lines and the hours move up to the top of the register.
  reflow: { e_offer: { e_facts: { row: 1, rowSpan: 2 }, e_hours: { row: 3, rowSpan: 2 } }, e_call: {}, e_hours: {} },
  note: "Design 5 structure 7 (ledger): the offer as a ruled register beside the headline instead of a picture; every line from the brief or the business.",
});
