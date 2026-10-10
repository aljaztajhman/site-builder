/**
 * Slot markers of composition presets (docs/plans/studio-phase1-design.md §5, I3): a preset's copy says where the
 * client's facts go (`{business.name}`, `{brief.offerings[0].name}`, `{images[1]}`), and `fillPreset` (./preset.ts)
 * replaces each marker with the value from the business, the brief or the section's copy, or drops what has none.
 * A marker never reaches a site: validateComposition rejects any composed string that still holds one.
 *
 * Its own module (no imports) so the guards can read the marker pattern without an import cycle through ./preset.ts.
 */

/** A slot marker, as the design states it: `{` a lower-case letter, then letters, digits, dots and brackets, `}`. */
export const SLOT_MARKER = /\{[a-z][a-z0-9.[\]]*\}/;
/** Every slot marker in a string (global). */
const SLOT_MARKERS = new RegExp(SLOT_MARKER.source, "g");
/** Anything in braces: a malformed marker (`{Business.Name}`, `{ business.name }`) is reported by validatePreset. */
const BRACES = /\{[^{}]*\}/g;

/** An index in a list slot runs 0–MAX_SLOT_INDEX (12 items: the longest composed list, prices and photos). */
export const MAX_SLOT_INDEX = 11;

/**
 * What a slot fills: `text` a string (inline in copy, or the whole string); `price` a Price object (a prices item's
 * `price`; an offering without a price gives the spec's marked price placeholder); `image` an image id (image, images,
 * fillImage); `amenity` a PRACTICAL_FACTS name (an iconFacts item's `fact`). Only text slots may sit inside other copy.
 */
export type SlotType = "text" | "price" | "image" | "amenity";

/**
 * The slot vocabulary: a fixed list. `[]` is an index 0–11 (`brief.offerings[2].name`). Where each comes from:
 *
 * - `business.*`: SiteSpec.business. `town` and `street` are the address's city and street, `address` the one-line
 *   address ("Šutna 30, 1241 Kamnik"), `phone` the number as dialled at home ("041 555 906"), `hours.note` the hours'
 *   note. A placeholder fact (the client didn't give it) has no value.
 * - `brief.*`: the engine's Brief (engine brief.ts): `summary`, `highlights[]`, `offerings[]` (name, description,
 *   group, price), `priced[]` (the offerings that have a price, in order), `people[]` (brief.facts.people: name, role).
 * - `copy.*`: the copy the content stage wrote for this section (its headline and lead paragraph).
 * - `images[]`: spec.assets.images in order; `photos[]` only the client's own photos (origin client), for the photo
 *   arrangements that must be the client's (strip, before-after).
 * - `amenities[]`: business.amenities (practical facts, only from the client or the owner).
 */
export const SLOTS: Readonly<Record<string, SlotType>> = {
  "business.name": "text",
  "business.town": "text",
  "business.street": "text",
  "business.address": "text",
  "business.phone": "text",
  "business.email": "text",
  "business.hours.note": "text",
  "brief.summary": "text",
  "brief.highlights[]": "text",
  "brief.offerings[].name": "text",
  "brief.offerings[].description": "text",
  "brief.offerings[].group": "text",
  "brief.offerings[].price": "price",
  "brief.priced[].name": "text",
  "brief.priced[].description": "text",
  "brief.priced[].group": "text",
  "brief.priced[].price": "price",
  "brief.people[].name": "text",
  "brief.people[].role": "text",
  "copy.headline": "text",
  "copy.lead": "text",
  "images[]": "image",
  "photos[]": "image",
  "amenities[]": "amenity",
};

/** A marker's slot name with its indices: "{brief.offerings[2].name}" → { pattern: "brief.offerings[].name", indices: [2] }. */
export function parseSlot(name: string): { pattern: string; indices: number[] } {
  const indices: number[] = [];
  const pattern = name.replace(/\[(\d+)\]/g, (_, n: string) => {
    indices.push(Number(n));
    return "[]";
  });
  return { pattern, indices };
}

/** Why a slot name (without braces) isn't in the vocabulary, or null when it is. */
export function slotProblem(name: string): string | null {
  const { pattern, indices } = parseSlot(name);
  if (!(pattern in SLOTS)) return `unknown slot {${name}}`;
  const bad = indices.find((i) => i > MAX_SLOT_INDEX);
  if (bad !== undefined) return `slot {${name}}: index ${bad} is past ${MAX_SLOT_INDEX}`;
  return null;
}

/** The slot type of a slot name, or undefined when the name isn't in the vocabulary. */
export const slotType = (name: string): SlotType | undefined => (slotProblem(name) ? undefined : SLOTS[parseSlot(name).pattern]);

/** The slot names (without braces) of every marker in a string, in order. */
export const slotsIn = (s: string): string[] => [...s.matchAll(SLOT_MARKERS)].map((m) => m[0].slice(1, -1));

/** Every braced token in a string, well-formed or not ("{business.name}", "{Business}"). */
export const bracedIn = (s: string): string[] => [...s.matchAll(BRACES)].map((m) => m[0]);

/** Whether a string still holds a slot marker. */
export const hasSlotMarker = (s: string): boolean => SLOT_MARKER.test(s);

/** Replaces every marker in a string by `fn(name)`. */
export const replaceSlots = (s: string, fn: (name: string) => string): string => s.replace(SLOT_MARKERS, (m) => fn(m.slice(1, -1)));
