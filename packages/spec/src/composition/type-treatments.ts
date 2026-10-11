/**
 * Heading type treatments beyond the starters (I6a; docs/plans/studio-phase1-design.md §2 G20): the limits each one needs
 * to stay legible, and the two text splits the renderer and the guard must agree on. The renderer never changes the
 * heading's words: a split only wraps a part of the same text in a span (the heading's accessible text is unchanged).
 */

/** G20 limits by treatment. Characters count the heading text as written. */
export const TYPE_TREATMENT_LIMITS = {
  /** Words on a circle: short, and big enough to read along a curve. */
  circle: { maxChars: 40, minSize: 2 },
  /**
   * Upright capitals stacked in one column, desktop only (phones set the line): one word, short, display sizes only, in
   * capitals (stacked lowercase letters don't share a height and read as a stutter; uppercase then needs weight 700+).
   */
  vertical: { maxChars: 10, minSize: 4, maxSize: 5 },
  /** The first word much larger on its own line: needs a second word, and a first word that fits a phone line. */
  "oversized-first-word": { maxFirstWord: 14 },
  /** Rules both sides of a centred line: short enough to stay one line with rules beside it. */
  "rule-flanked": { maxChars: 30 },
  /** Heavy rules over and under a centred heading: a display size. */
  masthead: { minSize: 3 },
  /** The number at twice the heading's size: up to size 6 (at 7 and 8 it would outgrow the screen's height). */
  "drop-numeral": { maxSize: 6 },
} as const;

const FIRST_WORD = /^(\S+)\s+(\S[\s\S]*)$/;
/** A number the heading starts with (a year, a price, a count; up to 7 characters, a € or % may follow), then the rest. */
const LEADING_NUMBER = /^(\d(?:[\d.,:/–-]{0,5}\d)?(?:\s?[€%])?)\s+(\S[\s\S]*)$/;

/** The heading's first word and the rest (oversized-first-word), or undefined for a one-word heading. */
export function splitFirstWord(text: string): { first: string; rest: string } | undefined {
  const m = FIRST_WORD.exec(text.trim());
  return m ? { first: m[1]!, rest: m[2]! } : undefined;
}

/** The number a heading starts with and the rest (drop-numeral), or undefined when it doesn't start with one. Never invents one. */
export function splitLeadingNumber(text: string): { number: string; rest: string } | undefined {
  const m = LEADING_NUMBER.exec(text.trim());
  return m ? { number: m[1]!, rest: m[2]! } : undefined;
}

/** Why a heading can't take its treatment (G20, beyond stacked and knockout), or undefined when it can. */
export function typeTreatmentProblem(h: { treatment?: string | undefined; text: string; size: number; case?: "normal" | "uppercase" | undefined }): string | undefined {
  const n = [...h.text].length;
  switch (h.treatment) {
    case "circle": {
      const l = TYPE_TREATMENT_LIMITS.circle;
      if (n > l.maxChars) return `circle takes at most ${l.maxChars} characters (has ${n})`;
      if (h.size < l.minSize) return `circle needs size ${l.minSize} or more`;
      return undefined;
    }
    case "vertical": {
      const l = TYPE_TREATMENT_LIMITS.vertical;
      if (/\s/.test(h.text.trim())) return "vertical takes one word";
      if (n > l.maxChars) return `vertical takes at most ${l.maxChars} characters (has ${n})`;
      if (h.size < l.minSize || h.size > l.maxSize) return `vertical needs size ${l.minSize}–${l.maxSize}`;
      if (h.case !== "uppercase") return "vertical needs case uppercase";
      return undefined;
    }
    case "oversized-first-word": {
      const s = splitFirstWord(h.text);
      if (!s) return "oversized-first-word needs at least two words";
      const max = TYPE_TREATMENT_LIMITS["oversized-first-word"].maxFirstWord;
      if ([...s.first].length > max) return `oversized-first-word needs a first word of at most ${max} characters`;
      return undefined;
    }
    case "rule-flanked": {
      const max = TYPE_TREATMENT_LIMITS["rule-flanked"].maxChars;
      return n > max ? `rule-flanked takes at most ${max} characters (has ${n})` : undefined;
    }
    case "masthead": {
      const min = TYPE_TREATMENT_LIMITS.masthead.minSize;
      return h.size < min ? `masthead needs size ${min} or more` : undefined;
    }
    case "drop-numeral": {
      const max = TYPE_TREATMENT_LIMITS["drop-numeral"].maxSize;
      if (h.size > max) return `drop-numeral takes size ${max} at most`;
      return splitLeadingNumber(h.text) ? undefined : "drop-numeral needs a heading that starts with a number from the client (up to 7 characters) and goes on";
    }
    default:
      return undefined;
  }
}
