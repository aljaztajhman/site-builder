import { getAt } from "../pointer.ts";

/**
 * Keys of a composed section (spec v19, ./schema.ts) whose strings are layout, not copy: the intent, aspect ratios
 * ("4:5"), rotations ("-90"), mask and treatment names, size and placement enums (desk.alignX, phone.span …), contact
 * parts, and decor drawings (svg path data and its colour roles). Only meaningful inside a composed section, where the
 * strict schema fixes what each key means; everything else there (heading text, paragraphs, list items, fact value
 * and label, action and link labels, price names, notes and units) is copy.
 *
 * One list for the fact check (engine facts.ts: path data would read as numbers and phones), the second language's
 * texts (translatable.ts) and the overlay check (validate.ts, render localizeSpec). No zod here: the editor imports
 * translatable.ts.
 */
export const COMPOSED_LAYOUT_KEYS: ReadonlySet<string> = new Set([
  "intent",
  "width",
  "minHeight",
  "texture",
  "divider",
  "span",
  "alignX",
  "alignY",
  "ratio",
  "mask",
  "treatment",
  "style",
  "marker",
  "case",
  "rotate",
  "measure",
  "motif",
  "show",
  "d",
  "fill",
  "stroke",
  // Spec v20 (composition language v2, studio-phase1-design.md §1.5): section layers, edges, motion, pin, the new
  // kinds' styles, colour roles, bleed and tilt, vocabulary names and drawing ids. Numbers and booleans among them
  // (rise, scale, strength, tilt …) are listed too, so the list reads as the layout fields whatever their type.
  "kind",
  "arrangement",
  "edge",
  "rise",
  "motion",
  "pin",
  "headerOver",
  "role",
  "cols",
  "rows",
  "scale",
  "anchor",
  "strength",
  "fit",
  "repeat",
  "labelAt",
  "plateCode",
  "count",
  "phoneColumns",
  "weight",
  "shape",
  "move",
  "icons",
  "color",
  "bleedX",
  "bleedY",
  "tilt",
  "drawing",
  "separator",
  // A photo layer's phone treatment ("band", "cover"); an element's `phone` is an object, walked by its own keys.
  "phone",
  // A practical-fact key (PRACTICAL_FACTS); `fact` is a key only in iconFacts items.
  "fact",
]);

const IN_SECTION_PROPS = /^\/pages\/(\d+)\/sections\/(\d+)\/props(\/.*)$/;

/**
 * Whether a JSON Pointer into the spec is a layout value of a composed section (a string under one of
 * COMPOSED_LAYOUT_KEYS, or an item of such an array, e.g. show/0). Such a value is never translated.
 */
export function isComposedLayoutPointer(spec: unknown, pointer: string): boolean {
  const m = IN_SECTION_PROPS.exec(pointer);
  if (!m) return false;
  if (getAt(spec, `/pages/${m[1]}/sections/${m[2]}/type`) !== "composed") return false;
  const key = m[3]!
    .split("/")
    .filter((t) => t && !/^\d+$/.test(t))
    .pop();
  return key !== undefined && COMPOSED_LAYOUT_KEYS.has(key);
}
