/**
 * The I4 imagery drafts (docs/plans/studio-phase1-design.md §5: I4a masks and frames, I4b composed treatments): the names
 * the batch appended to the spec's MASKS and IMAGE_TREATMENTS, registered as drafts until the owner decides in the
 * gallery (decisions.json). Their CSS is one partial per name under packages/components/styles/vocab/<family>/; bytes
 * are the rules naming the class, measured in the shipped sheets like every composed asset.
 *
 * Tags are the asset maker's reading of each shape or treatment (a stance id where the deck's pitch names the device),
 * reviewed in the gallery with the rest of the draft. Ground: the grounds the asset reads on (absent: all three); every
 * draft here reads on all of them, because each colour it uses is a role that keeps its job in every palette (inverse
 * stays dark, onInverse light).
 */
import { IMAGE_TREATMENTS, MASKS } from "@sb/spec";
import { STARTER_NAMES } from "@sb/render";
import { composedRuleBytes, word } from "./bytes.ts";
import type { Asset, Ground } from "./schema.ts";

export interface ImageryDraft {
  trades: string[];
  stances: string[];
  mood: string[];
  /** Absent: every ground. */
  ground?: Ground[];
  note: string;
}

const ALL: Ground[] = ["dark", "tint", "white"];

export const MASK_DRAFTS: Record<string, ImageryDraft> = {
  window: { trades: ["tourist-farm", "builder/carpentry", "restaurant"], stances: ["shopfront-fascia", "yugoslav-modernism", "old-town-roofs"], mood: ["architectural", "framed"], note: "Casement window with a transom: a glazing bar under the top fifth, the top light split; the main pane is never crossed" },
  "arch-low": { trades: ["restaurant", "tourist-farm", "bakery", "shop"], stances: ["karst-stone", "old-town-roofs", "plecnik-classicism"], mood: ["architectural", "soft"], note: "Shallow elliptical arch rising a fifth of the height (border-radius)" },
  "arch-pointed": { trades: ["restaurant", "tourist-farm", "shop/deli"], stances: ["karst-stone", "karst-cave"], mood: ["architectural"], note: "Pointed arch over the top third, each side five chords of an arc" },
  stepped: { trades: ["accountant", "builder", "shop"], stances: ["plecnik-classicism", "ljubljana-secession", "department-store-letters"], mood: ["architectural", "geometric"], note: "Top corners step in twice, like a stepped stone cornice" },
  gable: { trades: ["tourist-farm", "builder/roofing", "builder/carpentry"], stances: ["hayrack", "meadow-orchard", "axonometric"], mood: ["architectural", "geometric"], note: "House front: a roof over the top fifth" },
  oval: { trades: ["hairdresser", "dental", "physio", "shop/boutique"], stances: ["portrait-first", "bottle-label", "brass-door-plate"], mood: ["soft", "classic"], note: "Cameo ellipse in the frame's own ratio (circle forces a square)" },
  barrel: { trades: ["restaurant", "shop/deli", "tourist-farm"], stances: ["prekmurje-pottery", "ribnica-woodenware", "enamel-kitchenware"], mood: ["rounded", "soft"], note: "Sides bowed out like staves, top and bottom straight" },
  bowl: { trades: ["restaurant", "bakery", "shop/deli", "tourist-farm"], stances: ["prekmurje-pottery", "ribnica-woodenware"], mood: ["rounded", "soft"], note: "An arch upside down: the foot rounded over the lower third" },
  leaf: { trades: ["shop/florist", "tourist-farm", "physio"], stances: ["meadow-orchard", "soca-green", "cut-paper"], mood: ["organic", "soft"], note: "Two opposite corners rounded deep, the other two square" },
  pebble: { trades: ["physio", "tourist-farm", "shop/florist", "hairdresser"], stances: ["soca-green", "julian-alps"], mood: ["organic", "rounded"], note: "A river pebble, rounder on one side than the other (eight-value border-radius)" },
  chamfer: { trades: ["car-repair", "builder", "shop"], stances: ["enamel-house-plate", "registration-plate", "direction-sign", "safety-signage"], mood: ["signage", "geometric"], note: "Enamel plate: all four corners cut small (0.9 rem)" },
  label: { trades: ["shop/deli", "bakery", "restaurant", "dental"], stances: ["bottle-label", "dispensary-label", "seed-packet", "yugoslav-packaging"], mood: ["print", "classic"], note: "Printed label with scooped (concave) corners, each a quarter circle in three chords" },
  tab: { trades: ["accountant", "builder", "car-repair"], stances: ["account-ledger", "kitchen-index-card", "technical-drawing", "workshop-docket"], mood: ["print", "office"], note: "File-folder tab on the left of the top edge" },
  notch: { trades: ["builder", "accountant", "shop/boutique"], stances: ["swiss-grid", "colour-block", "brutalist-minimal", "bauhaus-geometry"], mood: ["geometric", "modernist"], note: "A square bite out of the top left corner: room for a fact or heading to overlap" },
  slant: { trades: ["car-repair", "builder", "shop"], stances: ["yugoslav-modernism", "ljubljana-sixties-poster", "stencil-crate"], mood: ["dynamic", "geometric"], note: "Parallelogram leaning right by a tenth of the width" },
  slope: { trades: ["car-repair", "builder", "physio"], stances: ["colour-block", "yugoslav-modernism", "julian-alps"], mood: ["dynamic", "geometric"], note: "Top edge falling from right to left, as a section's cut edge does" },
  arrow: { trades: ["car-repair", "tourist-farm", "builder"], stances: ["direction-sign", "wayfinding", "trail-marker", "transit-diagram"], mood: ["signage"], note: "Direction sign: the right end pointed (2.5 rem)" },
  bookmark: { trades: ["shop", "bakery", "accountant"], stances: ["hang-tag", "seed-packet", "pratika-almanac"], mood: ["print"], note: "Ribbon end: a shallow V cut into the foot" },
  torn: { trades: ["bakery", "restaurant", "shop"], stances: ["till-receipt", "photocopied-zine", "market-broadsheet"], mood: ["paper", "handmade"], note: "Paper torn along the foot, short uneven steps up to 3.6 % of the height" },
  scallop: { trades: ["bakery", "restaurant", "shop/deli"], stances: ["yugoslav-packaging", "seed-packet"], mood: ["paper", "playful"], note: "Eight shallow scallops along the foot, each arc in four chords" },
  "cut-paper": { trades: ["shop/florist", "bakery", "hairdresser"], stances: ["cut-paper", "colour-block", "photocopied-zine"], mood: ["handmade", "paper"], note: "Cut with scissors: each edge two slightly uneven straight cuts" },
  triptych: { trades: ["restaurant", "tourist-farm", "builder"], stances: ["beehive-panel", "painted-chest", "hayrack", "glazed-tile"], mood: ["panelled"], note: "One photo as three equal panels with narrow gaps at the thirds" },
  postcard: { trades: ["tourist-farm", "restaurant", "shop"], stances: ["picture-postcard", "gallery-wall", "herbarium-sheet"], mood: ["print", "framed"], note: "Frame: a paper border (surface role) with a hairline edge (border role); the photo set in 0.75 rem" },
  ruled: { trades: ["shop/deli", "dental", "accountant", "restaurant"], stances: ["bottle-label", "dispensary-label", "brass-door-plate", "technical-drawing"], mood: ["framed", "fine"], note: "Frame: a double hairline in the section's text colour (currentColor, so it follows the tone)" },
  crop: { trades: ["builder", "accountant", "shop/boutique"], stances: ["technical-drawing", "swiss-grid", "functional-catalogue", "gallery-wall"], mood: ["technical", "framed"], note: "Frame: crop marks at two opposite corners in the section's text colour, the photo set in 0.75 rem" },
};

export const TREATMENT_DRAFTS: Record<string, ImageryDraft> = {
  "mono-contrast": { trades: ["car-repair", "builder", "hairdresser"], stances: ["documentary-monochrome", "photocopied-zine", "brutalist-minimal"], mood: ["monochrome", "contrast"], note: "Hard black-and-white print (filter only, no colour of its own)" },
  bleach: { trades: ["car-repair", "builder"], stances: ["documentary-monochrome", "brutalist-minimal", "yugoslav-modernism"], mood: ["muted", "contrast"], note: "Most colour washed out, contrast up (filter only)" },
  "high-key": { trades: ["dental", "physio", "hairdresser"], stances: ["functional-catalogue", "gallery-wall", "swiss-grid"], mood: ["light", "airy"], note: "Brighter and a little softer (filter only)" },
  "low-key": { trades: ["restaurant", "car-repair", "builder"], stances: ["night-ground", "karst-cave", "woodcut"], mood: ["dark"], note: "Darker and firmer (filter only)" },
  faded: { trades: ["tourist-farm", "bakery", "restaurant"], stances: ["pratika-almanac", "kitchen-index-card", "picture-postcard"], mood: ["muted", "soft"], note: "Softer contrast, less colour, lifted a little (filter only)" },
  matte: { trades: ["restaurant", "hairdresser", "tourist-farm"], stances: ["editorial-magazine", "still-life", "portrait-first"], mood: ["soft"], note: "Shadows lifted to the palette's inverse colour (lighten); colour and highlights kept" },
  toned: { trades: ["tourist-farm", "restaurant", "shop/deli"], stances: ["herbarium-sheet", "picture-postcard", "bottle-label"], mood: ["monochrome"], note: "Toned print: the photo's light and shade in the primary role's hue (blend mode color at 60 %)" },
  newsprint: { trades: ["restaurant", "shop", "car-repair"], stances: ["market-broadsheet", "photocopied-zine", "documentary-monochrome"], mood: ["print", "monochrome"], note: "Grey on paper (onInverse), blacks lifted to the palette's inverse colour; works on every palette" },
  grade: { trades: ["restaurant", "hairdresser", "tourist-farm"], stances: ["night-ground", "adriatic-resort-modernism", "editorial-magazine"], mood: ["colour"], note: "Colour grade toward the accent role (soft-light at 45 %): warm palettes warm, cool ones cool" },
  overprint: { trades: ["shop", "bakery", "hairdresser"], stances: ["letterpress-proof", "risograph", "colour-block"], mood: ["print", "bold"], note: "A block of accent ink multiplied over the left third (70 %); the photo shows through" },
  field: { trades: ["shop", "bakery", "shop/florist"], stances: ["still-life", "functional-catalogue", "colour-block"], mood: ["bold", "flat"], note: "The photo set on a flat primary field (1.25 rem); image and photos frames only, not with the frame masks" },
  dim: { trades: [], stances: ["night-ground", "oversized-type", "split-screen"], mood: ["dark"], note: "A photo light text can sit on: every pixel at most mix(inverse, grey 50 %, .3), so onInverse holds 4.5:1 (imagery.test.ts)" },
};

/** The names of a vocab list beyond its starters (the names the batches add), in list order. */
export function addedNames(list: readonly string[], starters: readonly string[]): string[] {
  return list.filter((n) => !starters.includes(n));
}

function draftAssets(kind: "mask" | "treatment", list: readonly string[], starters: readonly string[], table: Record<string, ImageryDraft>, cls: string): Asset[] {
  return addedNames(list, starters).flatMap((name) => {
    const d = table[name];
    if (!d) return [];
    return [
      {
        id: `${kind}/${name}`,
        kind,
        tags: { trades: [...d.trades], stances: [...d.stances], intents: [], mood: [...d.mood], ground: [...(d.ground ?? ALL)], density: [] },
        phone: "ok",
        bytes: composedRuleBytes(word(`.${cls}${name}`)),
        license: "own",
        status: "draft",
        note: d.note,
      } satisfies Asset,
    ];
  });
}

/** Masks and treatments the I4 batch added, as drafts, in vocab order (a name without a table entry is not registered: imagery.test.ts fails on it). */
export function imageryDraftAssets(): Asset[] {
  return [...draftAssets("treatment", IMAGE_TREATMENTS, STARTER_NAMES.treatments, TREATMENT_DRAFTS, "cx-tr-"), ...draftAssets("mask", MASKS, STARTER_NAMES.masks, MASK_DRAFTS, "cx-mask-")];
}
