/**
 * Banned patterns from docs/PRODUCT.md that can be checked on the spec's copy.
 * Visual patterns (gradients, pills, glass, heavy shadows, italic accents, mono labels) are
 * impossible by construction: tokens cap radius and shadow, and components have no such variants.
 * tools and tests assert the shared stylesheet never contains them (see packages/components/test).
 */

/** Filler phrases, matched case-insensitively on word stems. */
export const BANNED_PHRASES: { pattern: RegExp; label: string }[] = [
  { pattern: /vrhunsk\p{L}* kakovost/iu, label: "vrhunska kakovost" },
  { pattern: /celovit\p{L}* rešit\p{L}*/iu, label: "celovite rešitve" },
  { pattern: /zanesljiv\p{L}* partner/iu, label: "vaš zanesljiv partner" },
  { pattern: /dolgoletn\p{L}* izkušnj\p{L}*/iu, label: "z dolgoletnimi izkušnjami" },
  { pattern: /strast\p{L}* do\b/iu, label: "strast do …" },
  { pattern: /\bs strastjo\b/iu, label: "s strastjo" },
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
      if (HEADLINE_KEYS.has(key)) for (const b of BANNED_HEADLINE) if (b.pattern.test(v)) out.push({ path: p, rule: b.label, text: v });
      if (LABEL_KEYS.has(key) && NUMBERED_LABEL.test(v)) out.push({ path: p, rule: "numbered label", text: v });
      return;
    }
    if (Array.isArray(v)) v.forEach((x, i) => visit(x, `${p}/${i}`, key));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) visit(x, `${p}/${escapePointer(k)}`, k);
  };
  visit(value, path, "");
  return out;
}

export function escapePointer(k: string): string {
  return k.replace(/~/g, "~0").replace(/\//g, "~1");
}
