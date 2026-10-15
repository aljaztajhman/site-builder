import type { SiteSpec } from "./site.ts";
import { isPlaceholder } from "./common.ts";
import { escapeToken, getAt, setAt } from "./pointer.ts";
import { issueKeys, noNewIssues, removeAt } from "./repair-util.ts";

/**
 * A sentence at most once per page (the outside review, 2026-10-15: an opening-hours note printed in the hours list
 * and again under it, a hero intro's sentence repeated word for word in a later section). Like images-once.ts this is
 * not part of validateSite: an owner who writes a sentence twice keeps it. Generation repairs it in code (engine
 * stages), the renderer leaves out a note that repeats the hours note in the same section (OpeningHours), and the
 * browser check (engine repeatedSentences) holds whatever is left.
 */

/** A sentence counts from this many words: shorter lines (labels, buttons, "Pokličite nas") may repeat. */
export const REPEATED_SENTENCE_MIN_WORDS = 6;

/** The sentences of a text: split after a full stop, question or exclamation mark or ellipsis. */
export function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** A sentence for comparing: case, spacing, quotes and the closing stop ignored (the browser check reads it the same way). */
export function sentenceKey(sentence: string): string {
  return sentence
    .normalize("NFC")
    .toLowerCase()
    .replace(/[„“”‘’«»"']/g, "")
    .replace(/\s+/g, " ")
    .replace(/[\s.!?…:;,]+$/, "")
    .trim();
}

const counts = (key: string) => key.split(" ").length >= REPEATED_SENTENCE_MIN_WORDS;

/**
 * `text` without the sentences `shown` already says (compared by sentenceKey, short ones too: they stand side by side
 * in one section), or undefined when nothing is left. The renderer's guard for a note beside text the same section prints (the hours note).
 */
export function withoutShown(text: string, shown: readonly (string | undefined)[]): string | undefined {
  const said = new Set(shown.flatMap((s) => (s ? sentences(s).map(sentenceKey) : [])));
  const kept = sentences(text).filter((s) => !said.has(sentenceKey(s)));
  return kept.length ? kept.join(" ") : undefined;
}

/** A page's visible text as the renderer draws it, one block per line (the engine renders it; link and button labels left out). */
export type PageText = (spec: SiteSpec, pageIndex: number) => string;

/** The sentence keys of a page's visible text, block by block. */
const keysOf = (text: string): string[] => text.split("\n").flatMap((line) => sentences(line.replace(/\s+/g, " ").trim()).map(sentenceKey));

const occurrences = (keys: readonly string[], key: string) => keys.filter((k) => k === key).length;

interface Use {
  section: number;
  /** Pointer inside the section's props. */
  at: string;
  key: string;
  /** The list item the text belongs to (a dish, a service, a question), when it is a field of one. */
  item?: string;
}

/** The list item a field belongs to (`/items/2` for `/items/2/description`), if it is a field of one. */
function itemOf(at: string): string | undefined {
  const keys = at.split("/").slice(1);
  if (/^\d+$/.test(keys.at(-1) ?? "")) keys.pop(); // an entry of a list of strings
  keys.pop(); // the field
  return /^\d+$/.test(keys.at(-1) ?? "") ? `/${keys.join("/")}` : undefined;
}

/**
 * Every counted sentence of a section's text fields (not link targets, an action's label beside its href, or
 * placeholders' notes), in order.
 */
function usesIn(props: unknown, section: number): Use[] {
  const out: Use[] = [];
  const walk = (v: unknown, at: string, key: string, parent?: object): void => {
    if (typeof v === "string") {
      if (key === "href" || (key === "label" && parent && "href" in parent)) return;
      const item = itemOf(at);
      for (const s of sentences(v)) if (counts(sentenceKey(s))) out.push({ section, at, key: sentenceKey(s), ...(item ? { item } : {}) });
    } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${at}/${i}`, key));
    else if (v && typeof v === "object" && !isPlaceholder(v)) for (const [k, x] of Object.entries(v)) walk(x, `${at}/${escapeToken(k)}`, k, v);
  };
  walk(props, "", "");
  return out;
}

/**
 * Items of one section's lists may share a fact on purpose ("Na voljo ob petkih in sobotah" on two pastries): such a
 * copy is the item's own and never goes, and copies that are only that don't count as a repeat (the browser check
 * reads them the same way).
 */
const hasMate = (u: Use, uses: readonly Use[]) => u.item !== undefined && uses.some((o) => o !== u && o.section === u.section && o.item !== undefined && o.item !== u.item);
const onlyMates = (g: { shown: number; uses: Use[] }) =>
  g.uses.every((u) => hasMate(u, g.uses) && u.section === g.uses[0]!.section) && g.shown <= g.uses.length;

/** The section sentences the rendered page shows more than once, with how often, and their uses in page order. */
function repeatsOn(spec: SiteSpec, pi: number, pageText: PageText): { key: string; shown: number; uses: Use[] }[] {
  const keys = keysOf(pageText(spec, pi));
  const byKey = new Map<string, Use[]>();
  spec.pages[pi]!.sections.forEach((s, si) => {
    for (const u of usesIn(s.props, si)) byKey.set(u.key, [...(byKey.get(u.key) ?? []), u]);
  });
  return [...byKey].map(([key, uses]) => ({ key, shown: occurrences(keys, key), uses })).filter((g) => g.shown > 1 && !onlyMates(g));
}

const shortKey = (key: string) => (key.length > 60 ? `${key.slice(0, 59)}…` : key);

/**
 * Takes the sentence out of the text at `use` (the whole field when it was all it said; never a list entry), kept only
 * if the spec stays as valid as it was and `accept` agrees (the page now shows it once less).
 */
function dropSentence(spec: SiteSpec, pi: number, use: Use, accept: () => boolean): boolean {
  const section = spec.pages[pi]!.sections[use.section]!;
  const text = getAt(section.props, use.at);
  if (typeof text !== "string") return false;
  const parts = sentences(text);
  const i = parts.findIndex((s) => sentenceKey(s) === use.key);
  if (i < 0) return false;
  // A list entry that would be left empty (a paragraph that only said this) stays: removing it would move the
  // entries after it, and pointers into the spec (the critique's patches, the editor's selection) address by index.
  if (parts.length === 1 && /\/\d+$/.test(use.at)) return false;
  const before = issueKeys(spec);
  const snapshot = structuredClone(section.props);
  parts.splice(i, 1);
  if (parts.length) setAt(section.props, use.at, parts.join(" "));
  else removeAt(section.props, use.at);
  try {
    if (noNewIssues(before, issueKeys(spec)) && accept()) return true;
  } catch {
    // a spec the renderer can't draw after the drop: put it back
  }
  (section as { props: unknown }).props = snapshot;
  return false;
}

/**
 * The hours section's note without what the hours note says (the hours print it, all variants but the poster): the
 * spec says what the renderer shows (OpeningHours leaves the same sentences out).
 */
function repairHoursNotes(spec: SiteSpec): string[] {
  const log: string[] = [];
  const hours = spec.business.hours;
  if (!hours || isPlaceholder(hours) || !hours.note) return log;
  spec.pages.forEach((p, pi) =>
    p.sections.forEach((s, si) => {
      if (s.type !== "opening-hours" || s.variant === "poster" || !s.props.note) return;
      const note = withoutShown(s.props.note, [hours.note]);
      if (note === s.props.note) return;
      if (note) s.props.note = note;
      else delete s.props.note;
      log.push(`/pages/${pi}/sections/${si}/props/note: the hours note says it already; ${note ? "left out its sentences" : "dropped the note"}`);
    }),
  );
  return log;
}

/**
 * The safe repair, in place. First the hours section's note leaves out what the hours note says. Then a sentence of
 * the sections' text that the rendered page (`pageText`) shows more than once keeps one copy: the later copies go first
 * (the sentence out of its text, or the whole field when it was all it said), an earlier one when a later
 * can't (a required field), and only a copy whose removal makes the page show the sentence once less (a field the
 * section's variant doesn't draw is never the one that goes). Text the sections don't own (the hours note) stays, and
 * their copies of it go. The spec stays as valid as it was. What can't be repaired is left and the returned line says
 * so; the browser check holds it. Returns what was repaired (and what was left).
 */
export function repairRepeatedSentences(spec: SiteSpec, pageText: PageText): string[] {
  const log = repairHoursNotes(spec);
  for (let pi = 0; pi < spec.pages.length; pi++) {
    // One drop at a time, then count again on the rendered page.
    for (let changed = true; changed; ) {
      changed = false;
      for (const g of repeatsOn(spec, pi, pageText)) {
        for (const u of [...g.uses].reverse().filter((x) => !hasMate(x, g.uses))) {
          if (dropSentence(spec, pi, u, () => occurrences(keysOf(pageText(spec, pi)), g.key) === g.shown - 1)) {
            log.push(`/pages/${pi}/sections/${u.section}/props${u.at}: "${shortKey(g.key)}" was shown twice on the page; dropped it here`);
            changed = true;
            break;
          }
        }
        if (changed) break;
      }
    }
    for (const g of repeatsOn(spec, pi, pageText)) log.push(`/pages/${pi}: "${shortKey(g.key)}" is shown ${g.shown} times; left it (no copy can go and keep the page valid)`);
  }
  return log;
}
