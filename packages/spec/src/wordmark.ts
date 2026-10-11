import type { Design } from "./design.ts";
import { WORDMARK_STYLES } from "./composition/vocab.ts";
import { FONT_PAIRS } from "./fonts.ts";

/**
 * The wordmark generator (design-studio.md §6.5, studio-phase1-design.md §1.6): the business name set as type in one of
 * WORDMARK_STYLES. Pure and deterministic: the same name, seed and design give the same answer. It only ever arranges
 * the letters of the name (the name itself, its words, its initials): never a word, a year, a tagline or a symbol, and
 * never a drawn mark. The stored result is `design.wordmark` (style, role); the options (lines, initials, case) are
 * derived from the name by `wordmarkLayout`, so the preview and the published site read the same thing.
 */
export type WordmarkStyle = (typeof WORDMARK_STYLES)[number];
/** Where the mark is set: a block of a page, or the header and footer (a line of the chrome, small, never a circle). */
export type WordmarkPlace = "block" | "header";

export interface WordmarkOptions {
  /** Letter case the style sets the name in (the CSS does it; the letters are the name's). */
  case: "normal" | "upper";
  /** The initials of the name, one or two capitals (monogram, circle). */
  monogram: string;
  /** The name cut into the lines the style stacks: lockup (first word, the rest), stacked-caps (the words); else the name. */
  lines: string[];
}

export interface WordmarkLayout {
  /** The style that is drawn: the requested one, or plain (monogram for a circle in the chrome) when the name does not fit it. */
  style: WordmarkStyle;
  requested: WordmarkStyle;
  options: WordmarkOptions;
}

export interface GeneratedWordmark {
  style: WordmarkStyle;
  /** The face: the text (body) face. Absent: the display (heading) face. */
  role?: "text";
  options: WordmarkOptions;
}

const words = (name: string): string[] => name.trim().split(/\s+/).filter((w) => w !== "");
const len = (s: string): number => [...s].length;

/** First letters of the first and last capitalised words (one letter for a single one): Pekarna Kvas -> PK. */
export function wordmarkInitials(name: string): string {
  const caps = words(name).filter((w) => /^\p{Lu}/u.test(w));
  const pick = caps.length >= 2 ? [caps[0]!, caps[caps.length - 1]!] : caps.length === 1 ? [caps[0]!] : words(name).slice(0, 1);
  return pick.map((w) => [...w][0]!.toLocaleUpperCase("sl")).join("");
}

/** Whether a style can set this name where it is set (the limits keep every style legible and inside 360 px). */
export function wordmarkFits(name: string, style: WordmarkStyle, place: WordmarkPlace = "block"): boolean {
  const w = words(name);
  const n = len(w.join(" "));
  const chrome = place === "header";
  switch (style) {
    case "plain":
      return n > 0;
    case "lockup":
      return w.length >= 2 && len(w[0]!) <= 18 && n - len(w[0]!) - 1 <= 30;
    case "stamp":
    case "plate":
      return n > 0 && n <= (chrome ? 20 : 24);
    case "circle":
      return !chrome && n >= 3 && n <= 14;
    case "monogram":
      return w.length >= 2 && wordmarkInitials(name) !== "";
    case "stacked-caps":
      return w.length >= 2 && w.length <= 3 && n <= (chrome ? 18 : 22) && w.every((x) => len(x) <= 12);
  }
}

/** The style drawn for a name, with its options. A style that does not fit falls back (circle in the chrome to monogram, the rest to plain). */
export function wordmarkLayout(name: string, style: WordmarkStyle, place: WordmarkPlace = "block"): WordmarkLayout {
  const w = words(name);
  let drawn: WordmarkStyle = style;
  if (!wordmarkFits(name, style, place)) drawn = style === "circle" && wordmarkFits(name, "monogram", place) ? "monogram" : "plain";
  const lines = drawn === "lockup" ? [w[0]!, w.slice(1).join(" ")] : drawn === "stacked-caps" ? w : [w.join(" ")];
  const upper = drawn === "stamp" || drawn === "plate" || drawn === "stacked-caps" || drawn === "circle";
  return { style: drawn, requested: style, options: { case: upper ? "upper" : "normal", monogram: wordmarkInitials(name), lines } };
}

/** FNV-1a, 32 bits: the same text always gives the same number. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (const c of s) {
    h ^= c.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/**
 * Picks a wordmark for a name: among the styles that fit it, weighted by the site's pairing (a serif display face
 * favours the lockup; a heavy sans, the plate and the stacked capitals; uppercase headings, the stamp and the stacked
 * capitals), then drawn by hash(name, seed). Signage styles (stamp, stacked capitals) take the text face when the pairing
 * is a serif over a sans.
 */
export function generateWordmark(name: string, seed: string, design: Pick<Design, "fontPair" | "headingWeight" | "headingCase">): GeneratedWordmark {
  const pair = FONT_PAIRS.find((p) => p.id === design.fontPair);
  const serif = pair?.heading.fallback === "serif";
  const weight: Record<WordmarkStyle, number> = { plain: 1, lockup: 3, stamp: 2, plate: 2, circle: 1, monogram: 2, "stacked-caps": 2 };
  if (serif) weight.lockup += 2;
  else if (design.headingWeight >= 700) {
    weight.plate += 2;
    weight["stacked-caps"] += 1;
  }
  if (design.headingCase === "uppercase") {
    weight.stamp += 1;
    weight["stacked-caps"] += 2;
  }
  if (words(name).length >= 5) weight.stamp = 0;
  const pool = WORDMARK_STYLES.filter((s) => wordmarkFits(name, s) && weight[s] > 0);
  const total = pool.reduce((n, s) => n + weight[s], 0);
  let at = hash(`${name}|${seed}`) % total;
  let style: WordmarkStyle = "plain";
  for (const s of pool) {
    if (at < weight[s]) {
      style = s;
      break;
    }
    at -= weight[s];
  }
  const signage = (style === "stamp" || style === "stacked-caps") && serif && pair?.body.fallback === "sans-serif";
  const { options } = wordmarkLayout(name, style);
  return { style, ...(signage ? { role: "text" as const } : {}), options };
}
