/**
 * Batch I6 (docs/plans/studio-phase1-design.md §5): heading type treatments (I6a) and fact objects (I6b) beyond the
 * starters, registered as drafts. The names are the spec vocabularies' (TYPE_TREATMENTS, FACT_OBJECTS); their CSS is one
 * partial per name in packages/components/styles/vocab/<family>/ (the family sheet a page links only when it uses one of
 * its names); what each one needs to stay legible is G20 (type treatments) and G9 with factObjectGround or
 * typeTreatmentGround (own grounds). The director curates, the owner approves in the gallery; nothing here approves.
 *
 * Tags: stances the asset was drawn for (STANCES ids, a hint for the shortlist), mood words that describe what the CSS
 * draws, every ground (the inks are the palette's guaranteed pairs, or the text colour).
 */
import { FACT_OBJECTS, TYPE_TREATMENTS } from "@sb/spec";
import { STARTER_NAMES } from "@sb/render";
import { composedRuleBytes, word } from "./bytes.ts";
import type { Asset } from "./schema.ts";

interface Draft {
  stances: string[];
  mood: string[];
  /** adapted: the treatment changes its form on phones (circle smaller, vertical set on one line, split stacked). */
  phone: "ok" | "adapted";
  note: string;
}

export const TYPE_TREATMENT_DRAFTS: Readonly<Record<string, Draft>> = {
  circle: { stances: ["hut-stamp-booklet", "bottle-label"], mood: ["curved", "short"], phone: "adapted", note: "The words along a circle (inline SVG, aria-hidden; the real text stays in the heading, visually hidden). G20: at most 40 characters, size 2 or more." },
  vertical: { stances: ["shopfront-fascia", "bracket-sign"], mood: ["vertical", "one-word"], phone: "adapted", note: "One word in upright letters stacked in a column, desktop only; phones set it on one line. G20: one word of at most 10 characters, size 4-6." },
  "oversized-first-word": { stances: ["oversized-type", "editorial-magazine"], mood: ["scale-contrast"], phone: "ok", note: "The first word on its own line at nearly twice the size, sized down to fit a narrow cell or a phone. G20: two words or more, a first word of at most 14 characters." },
  "ruled-total": { stances: ["till-receipt", "account-ledger"], mood: ["rule", "double-rule"], phone: "ok", note: "A thin rule over the heading and a double rule under it, as wide as its longest line (a receipt's or a ledger's total)." },
  "title-block": { stances: ["technical-drawing"], mood: ["frame", "rule"], phone: "ok", note: "The heading in one ruled frame as wide as its words (a drawing's title block)." },
  masthead: { stances: ["market-broadsheet", "editorial-magazine"], mood: ["rule", "centred"], phone: "ok", note: "A heavy rule over and a thin rule under, the heading centred between them across its box. G20: size 3 or more." },
  "typed-line": { stances: ["workshop-docket"], mood: ["rule"], phone: "ok", note: "The words, then a rule on the last line's baseline to the end of the box (an entry on a form's line)." },
  "rule-flanked": { stances: ["dispensary-label", "bottle-label"], mood: ["rule", "centred", "short"], phone: "ok", note: "The heading centred between two rules running to the edges of its box. G20: at most 30 characters." },
  "fascia-lettering": { stances: ["shopfront-fascia", "department-store-letters"], mood: ["own-ground", "sign", "centred"], phone: "ok", note: "The heading on a band-coloured sign board across its box (a shopfront fascia); flipped on a band section. Own ground: typeTreatmentGround (G9)." },
  "marker-highlight": { stances: ["photocopied-zine", "colour-block"], mood: ["own-ground", "highlight"], phone: "ok", note: "A flat primary band behind every line of the heading, the primary's text colour on it; flipped on a band section. No gradient. Own ground: typeTreatmentGround (G9)." },
  "drop-numeral": { stances: ["station-timetable", "account-ledger"], mood: ["numeral", "scale-contrast"], phone: "ok", note: "The number the heading starts with set large at its start, the words beside and under it. Only a heading that starts with a number (the client's; never added), size 6 at most. G20 drops it otherwise." },
  "corner-marks": { stances: ["letterpress-proof", "technical-drawing"], mood: ["frame", "corners"], phone: "ok", note: "Two corner marks, top left and bottom right, round a heading as wide as its words." },
};

export const FACT_OBJECT_DRAFTS: Readonly<Record<string, Draft>> = {
  "house-number": { stances: ["enamel-house-plate"], mood: ["own-ground", "sign", "enamel"], phone: "ok", note: "An enamel house-number plate: the value on the primary colour with an inset rim, the street under it. Own ground: factObjectGround (G9)." },
  signpost: { stances: ["direction-sign", "wayfinding", "trail-marker"], mood: ["own-ground", "sign", "arrow"], phone: "ok", note: "A pointed direction board in the band colour for a town or a street; it never claims a distance. Own ground: factObjectGround (G9)." },
  timetable: { stances: ["station-timetable", "transit-diagram"], mood: ["own-ground", "board", "rule"], phone: "ok", note: "A station board on the inverse ground, a rule between the value and its label: opening hours with a day. Own ground: factObjectGround (G9)." },
  receipt: { stances: ["till-receipt"], mood: ["own-ground", "paper", "leader"], phone: "adapted", note: "One receipt line, label and value joined by a dotted leader on a paper strip with a torn edge; the value goes to the next line in a narrow cell. Own ground: factObjectGround (G9)." },
  total: { stances: ["account-ledger", "till-receipt"], mood: ["rule", "double-rule"], phone: "ok", note: "The value between a thin rule and a double one (a ledger's total). No ground of its own." },
  dimension: { stances: ["technical-drawing", "axonometric"], mood: ["rule", "measure"], phone: "ok", note: "The value on a dimension line with end ticks across the cell; a measure line only, the value is the client's (a length, a weight, a load)." },
  "index-tab": { stances: ["kitchen-index-card", "functional-catalogue"], mood: ["own-ground", "card", "tab"], phone: "ok", note: "A card of a card index in the primary colour, the label on its tab (on top with labelAt before). Own ground: factObjectGround (G9)." },
  calendar: { stances: ["pratika-almanac"], mood: ["own-ground", "paper", "frame"], phone: "ok", note: "A tear-off calendar leaf: a day and its hours (or a date the client gave) on paper under a heavy binding bar. Own ground: factObjectGround (G9)." },
  split: { stances: ["swiss-grid", "station-timetable"], mood: ["rule"], phone: "adapted", note: "The value and its label side by side with a rule between; stacked in a cell under 28 rem. No ground of its own." },
  "door-plate": { stances: ["brass-door-plate"], mood: ["own-ground", "sign"], phone: "ok", note: "A name plate by a door in the band colour, two screw heads drawn in its own ink: a person or a business the client named. Own ground: factObjectGround (G9)." },
  ruler: { stances: ["technical-drawing", "sewing-pattern"], mood: ["measure", "ticks"], phone: "ok", note: "The value over a rule with tick marks (a mask over the text colour); no numbers on the rule and no scale claimed." },
};

const ALL_GROUNDS = ["dark", "tint", "white"] as const;
const tags = (d: Draft) => ({ trades: [], stances: [...d.stances].sort(), intents: [], mood: [...d.mood].sort(), ground: [...ALL_GROUNDS], density: [] });

/** The names a family's batch added: the vocabulary minus the starters (whose rules are in composed.css / composed-v2.css). */
const added = (list: readonly string[], starters: readonly string[]) => list.filter((n) => !starters.includes(n));

export function typeTreatmentDraftAssets(): Asset[] {
  return added(TYPE_TREATMENTS, STARTER_NAMES["type-treatments"]).map((name) => {
    const d = TYPE_TREATMENT_DRAFTS[name];
    if (!d) throw new Error(`type-treatment/${name}: no draft record (packages/inventory/src/type-and-facts.ts)`);
    return { id: `type-treatment/${name}`, kind: "typeTreatment", tags: tags(d), phone: d.phone, bytes: composedRuleBytes(word(`.cx-tt-${name}`)), license: "own", status: "draft", note: d.note } satisfies Asset;
  });
}

export function factObjectDraftAssets(): Asset[] {
  return added(FACT_OBJECTS, STARTER_NAMES["fact-objects"]).map((name) => {
    const d = FACT_OBJECT_DRAFTS[name];
    if (!d) throw new Error(`fact/${name}: no draft record (packages/inventory/src/type-and-facts.ts)`);
    return {
      id: `fact/${name}`,
      kind: "factObject",
      tags: tags(d),
      phone: d.phone,
      bytes: composedRuleBytes(word(`.cx-fact--${name}`)),
      license: "own",
      status: "draft",
      note: `${d.note} The value always comes from the client's facts.`,
    } satisfies Asset;
  });
}
