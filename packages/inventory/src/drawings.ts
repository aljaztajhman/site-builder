/**
 * The inventory's drawings (spec DRAWINGS, the Drawing format: docs/plans/studio-phase1-design.md §3.1, §5 batch I5):
 * motifs and ornaments drawn as path data in @sb/components. Each is registered as a draft until the owner rates it in
 * the gallery (decisions.json); tags name the trades and stances it was drawn for, and the mood carries its style.
 */
import { DRAWINGS, REPEATABLE, type Drawing } from "@sb/spec";
// @sb/components doesn't export its drawing data yet (F1b-A checklist); the data files import only types.
import { DRAWING_DATA } from "../../components/src/groups/composed/drawings/index.ts";
import type { Asset, AssetTags } from "./schema.ts";

export { DRAWING_DATA };

interface DrawingMeta {
  trades: string[];
  stances: string[];
  /** Words beyond the style (the style itself is added from the id). */
  mood?: string[];
  /** For ornaments: "Provenance: …", the tradition it draws on. */
  note: string;
}

/** Per drawing: what it was drawn for. Every id in DRAWINGS has a row (drawings.test.ts). */
export const DRAWING_META: Readonly<Record<(typeof DRAWINGS)[number], DrawingMeta>> = {
  "motif/bakery/wheat-ear-line": { trades: ["bakery"], stances: ["seed-packet", "kitchen-index-card", "line-drawing"], note: "F1b sample: an ear of wheat, stem and grains." },
  "ornament/rope-line": { trades: [], stances: [], mood: ["band"], note: "F1b sample: a twisted rope between two edges, repeatable. Provenance: a generic rope border, no tradition named." },
  "motif/bakery/peel-loaf-line": {
    trades: ["bakery"],
    stances: ["line-drawing", "seed-packet", "kitchen-index-card", "still-life"],
    note: "I5-p: a baker's peel with a scored batard on the blade.",
  },
  "motif/car-repair/torque-wrench-line": {
    trades: ["car-repair", "car-repair/repair", "car-repair/tyres"],
    stances: ["line-drawing", "workshop-docket", "tool-shadow-board", "technical-drawing"],
    note: "I5-p: a click torque wrench on a wheel nut of a hub (flange, bore, nuts).",
  },
  "motif/plumbing/ball-valve-line": {
    trades: ["builder", "builder/plumbing"],
    stances: ["line-drawing", "technical-drawing", "tool-shadow-board", "workshop-docket"],
    note: "I5-p: a ball valve with a union and a lever handle, the outlet turning down through an elbow.",
  },
  "motif/hairdresser/shears-comb-line": {
    trades: ["hairdresser"],
    stances: ["line-drawing", "tool-shadow-board", "hang-tag", "sewing-pattern"],
    note: "I5-p: offset hair-cutting shears with a finger rest, a cutting comb below.",
  },
  "motif/dental/mirror-probe-line": {
    trades: ["dental"],
    stances: ["line-drawing", "dispensary-label", "brass-door-plate", "wayfinding"],
    note: "I5-p: a mouth mirror and an explorer probe side by side (no tooth).",
  },
  "motif/physio/spine-model-line": {
    trades: ["physio"],
    stances: ["line-drawing", "dispensary-label", "functional-catalogue", "wayfinding"],
    note: "I5-p: a lumbar spine model on its stand, side view.",
  },
  "motif/tourist-farm/milk-can-line": {
    trades: ["tourist-farm"],
    stances: ["line-drawing", "hayrack", "picture-postcard", "meadow-orchard"],
    note: "I5-p: a milk churn with a mushroom lid, handles and hoops, on the ground line.",
  },
  "motif/restaurant/ladle-pot-line": {
    trades: ["restaurant", "tourist-farm"],
    stances: ["line-drawing", "kitchen-index-card", "enamel-kitchenware", "still-life"],
    note: "I5-p: a cooking pot with ear handles, a ladle standing in it.",
  },
  "motif/accountant/ledger-pen-line": {
    trades: ["accountant"],
    stances: ["line-drawing", "account-ledger", "brass-door-plate"],
    note: "I5-p: an open ledger with an amounts column, a fountain pen across it. Ruled lines never cross a column rule.",
  },
  "motif/florist/secateurs-stem-line": {
    trades: ["shop", "shop/florist"],
    stances: ["line-drawing", "herbarium-sheet", "still-life"],
    note: "I5-p: bypass secateurs open round a rose stem with leaves and a bud.",
  },
  "motif/deli/olive-salt-line": {
    trades: ["shop", "shop/deli"],
    stances: ["line-drawing", "bottle-label", "still-life", "salt-pans"],
    note: "I5-p: a footed salt cellar with a wooden spoon, an olive twig with three olives.",
  },
  "motif/electrical/cable-coil-line": {
    trades: ["builder", "builder/electrical"],
    stances: ["line-drawing", "technical-drawing", "tool-shadow-board", "workshop-docket"],
    note: "I5-p: a coil of cable bound with a tie, the end stripped to three conductors.",
  },
  "ornament/beehive-panel-line": {
    trades: ["bakery", "tourist-farm", "shop", "restaurant"],
    stances: ["beehive-panel", "painted-chest"],
    mood: ["frame", "slovene"],
    note: "Provenance: drawn new after the painted beehive front boards (panjske končnice) of Slovene apiaries, 18th–19th century: the board, its flight entrance and a painted border; no scene copied.",
  },
  "ornament/idrija-lace-line": {
    trades: ["bakery", "shop", "restaurant", "hairdresser", "tourist-farm"],
    stances: ["idrija-lace"],
    mood: ["band", "slovene"],
    note: "Provenance: drawn new after Idrija bobbin lace (idrijska čipka), whose narrow tape (ris) and scalloped edgings are its signature; no pattern copied.",
  },
  "ornament/gorenjska-rosette-line": {
    trades: ["bakery", "tourist-farm", "restaurant", "shop", "builder", "builder/carpentry"],
    stances: ["painted-chest", "ribnica-woodenware", "woodcut"],
    mood: ["slovene"],
    note: "Provenance: drawn new after the compass-set, chip-carved whirl rosettes on Gorenjska woodwork (chests, cradles, distaffs, mangle boards), 18th–19th century; no piece copied.",
  },
  "ornament/trail-blaze-line": {
    trades: ["tourist-farm", "physio", "shop", "restaurant"],
    stances: ["trail-marker", "hut-stamp-booklet", "julian-alps"],
    mood: ["border", "slovene"],
    note: "Provenance: drawn new after the Knafelc trail blaze (Knafelčeva markacija), the red ring with a white centre on Slovene mountain paths since 1922; the mark itself on a rock, no sign or emblem copied.",
  },
  "ornament/pisanica-band-line": {
    trades: ["bakery", "shop", "tourist-farm", "restaurant"],
    stances: ["pisanice"],
    mood: ["band", "slovene"],
    note: "Provenance: drawn new after the wax-resist Easter eggs of Bela krajina (belokranjske pisanice), whose belts of waves and stylus drops divide the egg; no egg copied.",
  },
  "ornament/prekmurje-pottery-band-line": {
    trades: ["restaurant", "bakery", "shop", "tourist-farm"],
    stances: ["prekmurje-pottery"],
    mood: ["band", "slovene"],
    note: "Provenance: drawn new after the combed wave bands on Prekmurje pottery (Filovci and the Pannonian potters' villages); no vessel copied.",
  },
};

/** The style a drawing's name ends in (`…-line` → line). */
export const drawingStyleOf = (id: string): string => id.slice(id.lastIndexOf("-") + 1);

/**
 * What a drawing adds to a page: its inline SVG as DrawingSvg (components drawing.tsx) writes it, in roles (the longer
 * form; as ink every role is `currentColor`). A strip adds a `<pattern>` and a rect around the same paths.
 */
export function drawingBytes(d: Drawing): number {
  const role = (r: string | undefined) => (!r || r === "none" ? "none" : `var(--c-${r.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)})`);
  const paths = d.paths
    .map((p) => {
      const line = d.style === "line";
      const w = line ? Math.max(1.5, p.width ?? 1.5) : (p.width ?? 1);
      return `<path d="${p.d}" style="fill:${role(p.fill)};stroke:${role(p.stroke)};stroke-width:${w};stroke-linecap:round;stroke-linejoin:round${line ? ";vector-effect:non-scaling-stroke" : ""}"></path>`;
    })
    .join("");
  return Buffer.byteLength(`<svg class="cx-dw cx-dw--${d.style}" viewBox="0 0 ${d.viewBox[0]} ${d.viewBox[1]}" aria-hidden="true" focusable="false">${paths}</svg>`, "utf8");
}

/** The drawings in DRAWINGS as draft assets of kind motif or ornament (the owner's decisions apply in inventory()). */
export function drawingAssets(): Asset[] {
  return DRAWINGS.map((id) => {
    const d = DRAWING_DATA[id];
    if (!d) throw new Error(`No drawing data for ${id} (packages/components/src/groups/composed/drawings)`);
    const meta = DRAWING_META[id];
    const kind = id.startsWith("motif/") ? "motif" : "ornament";
    const style = drawingStyleOf(id);
    const tags: AssetTags = {
      trades: meta.trades,
      stances: meta.stances,
      intents: [],
      mood: [style, ...(meta.mood ?? []), ...((REPEATABLE as readonly string[]).includes(id) ? ["repeatable"] : [])],
      ground: ["white", "tint", "dark"],
      density: ["compact", "regular", "airy"],
    };
    return { id, kind, tags, phone: "ok", bytes: drawingBytes(d), license: "own", status: "draft", note: meta.note } satisfies Asset;
  });
}
