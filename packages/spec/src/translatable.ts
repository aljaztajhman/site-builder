import { COMPOSED_LAYOUT_KEYS } from "./composition/layout-keys.ts";
import { getAt, walkObjects, walkStrings } from "./pointer.ts";

/**
 * The texts of a site's pages a second language needs (it-editor-languages): what a visitor reads on the pages in
 * the default language and would read in the default language on the other one too, because the renderer falls
 * back to it where an overlay (spec.translations) is missing. A site can't be published while one of these has no
 * translation in an enabled language (validate.ts publishChecklist), like an unfilled placeholder.
 *
 * Counted: every page's menu label and search title and description, every section's copy, and the opening hours'
 * note. Not counted: ids, variants, links, picture references, dates and other values that aren't words, strings
 * without a letter ("2004", "40"), a composed section's layout values (composition/layout-keys.ts), people's and the
 * business's names (ownerName, team members' names, the hero's wordmark), a composed quote and map notes (verbatim,
 * VERBATIM_FIELDS) and placeholders (filled in the default language first). Collection entries keep their documented
 * fallback (the owner's own posts; the collection pane says the Slovene shows where there is no translation).
 *
 * No zod here: the editor imports it (`@sb/spec/translatable`).
 */
export interface TranslatableText {
  /** JSON Pointer of the default language's text in the spec (the overlay's key). */
  path: string;
  text: string;
}

/** Keys whose strings are values, not copy. */
const NOT_COPY = new Set([
  "id",
  "type",
  "variant",
  "tone",
  "page",
  "section",
  "action",
  "kind",
  "slug",
  "image",
  "images",
  "inset",
  "network",
  "src",
  "file",
  "url",
  "fact",
  "date",
  "endDate",
  "start",
  "end",
  // Names stay as they are in every language.
  "ownerName",
  "wordmark",
]);
const IMAGE_REF = /^img_[a-z0-9_-]+$/;
const LETTER = /\p{L}/u;

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);

/**
 * Fields of composed elements (spec v20) that are the client's words verbatim and stay as written in every language
 * (studio-phase1-design.md §1.8): a quote and its attribution (rendered with the source's `lang`), a map's cross street
 * and note. A translation would no longer be what the client said.
 */
export const VERBATIM_FIELDS: Readonly<Record<string, readonly string[]>> = { quote: ["text", "by"], map: ["cross", "note"] };

/** An element's own field inside a section's props: "/elements/3/text" → element 3, field "text". */
const ELEMENT_FIELD = /^\/elements\/(\d+)\/([^/]+)$/;

/** Whether `field` of the element at `index` of these composed props is verbatim (VERBATIM_FIELDS). */
function verbatimField(props: unknown, pointer: string): boolean {
  const m = ELEMENT_FIELD.exec(pointer);
  if (!m) return false;
  const kind = getAt(props, `/elements/${m[1]}/kind`);
  return typeof kind === "string" && (VERBATIM_FIELDS[kind] ?? []).includes(m[2]!);
}

/** Whether a JSON Pointer into the spec is a verbatim field of a composed element (VERBATIM_FIELDS): never translated. */
export function isVerbatimPointer(spec: unknown, pointer: string): boolean {
  const m = /^(\/pages\/\d+\/sections\/\d+)\/props(\/.*)$/.exec(pointer);
  if (!m || getAt(spec, `${m[1]}/type`) !== "composed") return false;
  return verbatimField(getAt(spec, `${m[1]}/props`), m[2]!);
}

/**
 * Whether a string at this pointer (inside a section's props), under this key, is copy a visitor reads. `composed` is
 * the section's props when it is a composed section: its elements' verbatim fields are not translated.
 */
function isCopy(s: string, pointer: string, key: string, composed?: unknown): boolean {
  if (NOT_COPY.has(key) || !s.trim() || !LETTER.test(s) || IMAGE_REF.test(s) || /^https?:\/\//i.test(s)) return false;
  if (composed !== undefined && verbatimField(composed, pointer)) return false;
  // A team member's name.
  return !(key === "name" && /\/members\/\d+\/name$/.test(pointer));
}

/** One page's own texts (menu label, search title and description) and its sections' copy, in the order shown. */
export function pageTexts(spec: unknown, pi: number): TranslatableText[] {
  const page = obj((obj(spec)?.pages as unknown[] | undefined)?.[pi]);
  if (!page) return [];
  const out: TranslatableText[] = [];
  for (const key of ["nav/label", "seo/title", "seo/description"]) {
    const v = getAt(page, `/${key}`);
    if (typeof v === "string" && v.trim()) out.push({ path: `/pages/${pi}/${key}`, text: v });
  }
  ((page.sections ?? []) as unknown[]).forEach((_s, si) => out.push(...sectionTexts(spec, pi, si)));
  return out;
}

/** A section's copy: the strings of its props a visitor reads. */
export function sectionTexts(spec: unknown, pi: number, si: number): TranslatableText[] {
  const base = `/pages/${pi}/sections/${si}/props`;
  const props = getAt(spec, base);
  if (!props || typeof props !== "object") return [];
  // Placeholders (and their notes, which are for the owner) are filled in the default language first.
  const placeholders: string[] = [];
  walkObjects(props, (o, p) => {
    if ("$placeholder" in o) placeholders.push(`${p}/`);
  });
  // A composed section's layout values (width, style, svg path data …) are not copy (composition/layout-keys.ts).
  const composed = getAt(spec, `/pages/${pi}/sections/${si}/type`) === "composed";
  const out: TranslatableText[] = [];
  walkStrings(props, (s, p, key) => {
    if (placeholders.some((at) => p.startsWith(at))) return;
    if (composed && COMPOSED_LAYOUT_KEYS.has(key)) return;
    if (isCopy(s, p, key, composed ? props : undefined)) out.push({ path: `${base}${p}`, text: s });
  });
  return out;
}

/** Every text of the site's pages a second language needs, page by page, then the opening hours' note. */
export function translatableTexts(spec: unknown): TranslatableText[] {
  const pages = (obj(spec)?.pages ?? []) as unknown[];
  const out = pages.flatMap((_p, pi) => pageTexts(spec, pi));
  const note = getAt(spec, "/business/hours/note");
  if (typeof note === "string" && note.trim() && LETTER.test(note)) out.push({ path: "/business/hours/note", text: note });
  return out;
}

/** The overlay of one language (pointer → text), or an empty one. */
export function overlayOf(spec: unknown, locale: string): Record<string, string> {
  return (obj(obj(obj(spec)?.translations)?.[locale]) ?? {}) as Record<string, string>;
}

/** The texts still without a translation in `locale` (an empty or blank overlay counts as missing). */
export function untranslated(spec: unknown, locale: string, texts: TranslatableText[] = translatableTexts(spec)): TranslatableText[] {
  const overlay = overlayOf(spec, locale);
  return texts.filter((t) => typeof overlay[t.path] !== "string" || !overlay[t.path]!.trim());
}

/** The site's languages besides its default one. */
export function secondLocales(spec: unknown): string[] {
  const l = obj(obj(spec)?.locales);
  const def = l?.default;
  return ((l?.enabled ?? []) as unknown[]).filter((x): x is string => typeof x === "string" && x !== def);
}
