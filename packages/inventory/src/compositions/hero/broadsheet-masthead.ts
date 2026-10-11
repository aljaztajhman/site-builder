import { definePreset } from "@sb/spec";

/** No photo needed: the headline between a heavy and a thin rule across the page, then three columns under it: the lead, the client's highlights and the phone with the way there. */
export default definePreset({
  id: "composition/hero/broadsheet-masthead",
  tags: { mood: ["type", "editorial", "columns"], stances: ["market-broadsheet", "editorial-magazine", "swiss-grid"] },
  needs: ["copy.headline", "brief.highlights[1]"],
  props: {
    intent: "hero",
    width: "wide",
    rows: 3,
    elements: [
      { id: "e_title", kind: "heading", text: "{copy.headline}", level: 1, size: 6, weight: 800, treatment: "masthead", desk: { col: 1, span: 12, row: 1 }, phone: { order: 0, span: "full" } },
      { id: "e_lead", kind: "text", paragraphs: ["{copy.lead}"], size: 1, desk: { col: 1, span: 4, row: 2, rowSpan: 2 }, phone: { order: 1, span: "full" } },
      { id: "e_list", kind: "list", items: ["{brief.highlights[0]}", "{brief.highlights[1]}", "{brief.highlights[2]}"], marker: "rule", desk: { col: 5, span: 4, row: 2, rowSpan: 2 }, phone: { order: 2, span: "full" } },
      { id: "e_phone", kind: "fact", value: "{business.phone}", label: "Pokličite", treatment: "split", size: 4, link: { action: "call" }, desk: { col: 9, span: 4, row: 2 }, phone: { order: 3, span: "full" } },
      { id: "e_dir", kind: "action", action: "directions", label: "Pot do nas", style: "secondary", desk: { col: 9, span: 3, row: 3, alignY: "start" }, phone: { order: 4, span: "full" } },
    ],
  },
  note: "From the market-broadsheet stance and L Ogledalo's masthead price list (kmetija-ravnjak sets its hero title the same way): a newspaper front page, the facts in three columns under the masthead.",
});
