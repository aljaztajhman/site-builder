import { getAt, walkObjects, walkStrings } from "./pointer.ts";

/**
 * The texts of a site's pages a second language needs (it-editor-languages): what a visitor reads on the pages in
 * the default language and would read in the default language on the other one too, because the renderer falls
 * back to it where an overlay (spec.translations) is missing. A site can't be published while one of these has no
 * translation in an enabled language (validate.ts publishChecklist), like an unfilled placeholder.
 *
 * Counted: every page's menu label and search title and description, every section's copy, and the opening hours'
 * note. Not counted: ids, variants, links, picture references, dates and other values that aren't words, strings
 * without a letter ("2004", "40"), people's and the business's names (ownerName, team members' names, the hero's
 * wordmark) and placeholders (filled in the default language first). Collection entries keep their documented
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

/** Whether a string at this pointer (inside a section's props), under this key, is copy a visitor reads. */
function isCopy(s: string, pointer: string, key: string): boolean {
  if (NOT_COPY.has(key) || !s.trim() || !LETTER.test(s) || IMAGE_REF.test(s) || /^https?:\/\//i.test(s)) return false;
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
  const out: TranslatableText[] = [];
  walkStrings(props, (s, p, key) => {
    if (placeholders.some((at) => p.startsWith(at))) return;
    if (isCopy(s, p, key)) out.push({ path: `${base}${p}`, text: s });
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
