/**
 * Banned patterns from docs/PRODUCT.md that can be checked on the spec's copy.
 * Visual patterns (gradients, pills, glass, heavy shadows, italic accents, mono labels, accent stripes on
 * one side of a box, tracked-out eyebrows) are impossible by construction: tokens cap radius and shadow,
 * and components have no such variants. Tests assert the shared stylesheet never contains them (see
 * packages/render/test/shared.test.ts and packages/components/test).
 */
import { escapeToken } from "./pointer.ts";

/** Matches `stem` only at the start of a word (JS \b is ASCII-only and misreads č, š, ž). */
const word = (source: string) => new RegExp(`(?<![\\p{L}\\p{N}])${source}`, "iu");

/** Filler phrases, matched case-insensitively on word stems. */
export const BANNED_PHRASES: { pattern: RegExp; label: string }[] = [
  { pattern: /vrhunsk\p{L}* kakovost/iu, label: "vrhunska kakovost" },
  { pattern: /celovit\p{L}* rešit\p{L}*/iu, label: "celovite rešitve" },
  { pattern: /zanesljiv\p{L}* partner/iu, label: "vaš zanesljiv partner" },
  { pattern: /dolgoletn\p{L}* izkušnj\p{L}*/iu, label: "z dolgoletnimi izkušnjami" },
  { pattern: /strast\p{L}* do\b/iu, label: "strast do …" },
  { pattern: /\bs strastjo\b/iu, label: "s strastjo" },
  // Owner decision sb-giveaway-additions (2026-10-02), list from docs/design/ideas.html.
  { pattern: word("brezhibn\\p{L}*"), label: "brezhibno" },
  { pattern: word("celovit\\p{L}* pristop\\p{L}*"), label: "celovit pristop" },
  { pattern: word("na višj\\p{L}* rav\\p{L}*"), label: "na višjo raven" },
  { pattern: word("odklenite(?!\\p{L})"), label: "odklenite" },
  { pattern: word("opolnomoč\\p{L}*"), label: "opolnomočimo" },
  { pattern: word("inovativn\\p{L}* rešit\\p{L}*"), label: "inovativne rešitve" },
  // "vrhunska kakovost" has its own label above; this catches every other use of the word.
  { pattern: word("vrhunsk\\p{L}*(?!\\p{L})(?! kakovost)"), label: "vrhunski" },
  { pattern: word("po meri vaših potreb"), label: "po meri vaših potreb" },
  { pattern: word("na vsakem koraku"), label: "z vami na vsakem koraku" },
  { pattern: word("v današnjem hitrem tempu"), label: "v današnjem hitrem tempu" },
  { pattern: word("(sanj\\p{L}* (se )?uresniči\\p{L}*|uresniči\\p{L}* (svoje |vaše )?sanj\\p{L}*)"), label: "sanje se uresničijo" },
  { pattern: word("izkusite(?!\\p{L})"), label: "izkusite" },
];

export const BANNED_HEADLINE: { pattern: RegExp; label: string }[] = [
  { pattern: /\bdobrodošl\p{L}*/iu, label: '"Dobrodošli" headline' },
  { pattern: /\bwelcome to\b/iu, label: '"Welcome to" headline' },
  { pattern: /\bwillkommen\b/iu, label: '"Willkommen" headline' },
];

/** Emoji and pictographs. The typographic ©, ® and ™ are Extended_Pictographic too but are allowed. */
export const EMOJI = /(?![©®™])\p{Extended_Pictographic}/u;

/** "01", "01 /", "02." style numbered labels. */
export const NUMBERED_LABEL = /^\s*0\d(\s*[/.–-]|\s|$)/;

/** U+2014, the canonical AI-copy tell. Slovene uses the spaced en dash (pomišljaj) instead. */
export const EM_DASH = /—/;

/**
 * An eyebrow typed in capitals ("PEKARNA V LJUBLJANI"): at least 6 letters and none lowercase. Short
 * acronyms ("BIO", "DDV") stay allowed. Eyebrows are sentence case; uppercase is a heading token.
 */
export function isAllCapsLabel(s: string): boolean {
  const letters = s.match(/\p{L}/gu) ?? [];
  return letters.length >= 6 && !letters.some((l) => l !== l.toUpperCase());
}

export interface CopyViolation {
  path: string;
  rule: string;
  text: string;
}

/** Keys where a greeting ("Dobrodošli", "Welcome to …") is banned: the headline and the line above it. */
const HEADLINE_KEYS = new Set(["headline", "title", "eyebrow"]);
const LABEL_KEYS = new Set(["eyebrow", "label"]);

/** Walks every string in `value` and reports banned copy. `path` is a JSON Pointer. */
export function findBannedCopy(value: unknown, path = ""): CopyViolation[] {
  const out: CopyViolation[] = [];
  const visit = (v: unknown, p: string, key: string) => {
    if (typeof v === "string") {
      for (const b of BANNED_PHRASES) if (b.pattern.test(v)) out.push({ path: p, rule: `filler: ${b.label}`, text: v });
      if (EMOJI.test(v)) out.push({ path: p, rule: "emoji", text: v });
      if (EM_DASH.test(v)) out.push({ path: p, rule: "em dash", text: v });
      if (HEADLINE_KEYS.has(key)) for (const b of BANNED_HEADLINE) if (b.pattern.test(v)) out.push({ path: p, rule: b.label, text: v });
      if (LABEL_KEYS.has(key) && NUMBERED_LABEL.test(v)) out.push({ path: p, rule: "numbered label", text: v });
      if (key === "eyebrow" && isAllCapsLabel(v)) out.push({ path: p, rule: "all-caps eyebrow", text: v });
      return;
    }
    if (Array.isArray(v)) v.forEach((x, i) => visit(x, `${p}/${i}`, key));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) visit(x, `${p}/${escapeToken(k)}`, k);
  };
  visit(value, path, "");
  return out;
}

/**
 * Replaces every em dash with what Slovene uses: the en dash, unspaced between two numbers ("8.00–16.00"),
 * spaced everywhere else ("Kruh – vsak dan"). A dash that opens or closes the text is dropped with its space.
 */
export function replaceEmDashes(s: string): string {
  if (!EM_DASH.test(s)) return s;
  return s
    .replace(/(\d)\s*—\s*(?=\d)/g, "$1–")
    .replace(/^\s*—\s*/, "")
    .replace(/\s*—\s*$/, "")
    .replace(/[ \t]*—[ \t]*/g, " – ");
}

/**
 * In place: replaces em dashes in every string of `value` (copy is repaired, not rejected). Returns one
 * line per changed string with its JSON Pointer under `path`. Object keys are never changed.
 */
export function repairEmDashes(value: unknown, path = ""): string[] {
  const repairs: string[] = [];
  const visit = (v: unknown, p: string): unknown => {
    if (typeof v === "string") {
      const fixed = replaceEmDashes(v);
      if (fixed !== v) repairs.push(`${p}: em dash replaced`);
      return fixed;
    }
    if (Array.isArray(v)) v.forEach((x, i) => (v[i] = visit(x, `${p}/${i}`)));
    else if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      for (const [k, x] of Object.entries(o)) o[k] = visit(x, `${p}/${escapeToken(k)}`);
    }
    return v;
  };
  visit(value, path);
  return repairs;
}

/** The copy of a site (pages and translation overlays), repaired in place. Business facts are the client's own. */
export function repairSiteCopy(spec: unknown): string[] {
  if (!spec || typeof spec !== "object") return [];
  const s = spec as { pages?: unknown; translations?: unknown; collections?: unknown };
  return [...repairEmDashes(s.pages, "/pages"), ...repairEmDashes(s.collections, "/collections"), ...repairEmDashes(s.translations, "/translations")];
}
