import { NUMBERED_LABEL, isPlaceholder, plateCode, type SiteSpec } from "@sb/spec";
import type { FactViolation } from "./facts.ts";

/**
 * The fact rules of the composition language v2 (spec v20, docs/plans/studio-phase1-design.md §1.8) that the
 * generic copy check (facts.ts: numbers, phones, prices, times in every string) can't express: where a composed
 * element's values may come from. Numbers in the new kinds' copy (sticker, ribbon, quote, map, captions, iconFacts
 * notes, list leads) are still checked by that generic walk; these rules come on top.
 */

/** Quote marks of every kind; dropped before a verbatim comparison. */
const QUOTES = /["'„“”«»‚‘’‹›`]/g;

/**
 * A string as compared for "verbatim from the input": whitespace runs collapsed, quote marks dropped, an excerpt's
 * leading or trailing ellipsis dropped. Case, diacritics and every other character stay as written.
 */
export function verbatimForm(s: string): string {
  return s
    .replace(QUOTES, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(?:…|\.\.\.)\s*/, "")
    .replace(/\s*(?:…|\.\.\.)$/, "")
    .trim();
}

/** Whether `s` appears in the client's input as written (see verbatimForm). An empty string never does. */
export function isVerbatim(s: string, input: string): boolean {
  const v = verbatimForm(s);
  return v.length > 0 && input.includes(v);
}

/** Matches `stem` only at the start of a word (JS \b is ASCII-only and misreads č, š, ž). */
const atWord = (stem: string) => `(?<![\\p{L}\\p{N}])${stem}`;

/**
 * A rating, award, certificate or superlative (§1.8: ★, /5, ocena, nagrad, priznanj, certifik, najboljš, št. 1, #1),
 * case-insensitive, any Slovene inflection (stems), plus the English words a translated sticker would use.
 */
export const CLAIM_WORDS = new RegExp(
  [
    "[★☆⭐]",
    "\\d\\s*/\\s*5(?![\\d.,]*\\d)",
    // The noun in every case (ocena, oceno, ocenami …) and "ocenjen", not the verb ("Ocenite nas" asks for one).
    atWord("ocen(?:a|e|i|o|am|ami|ah)?(?!\\p{L})"),
    atWord("ocenjen\\p{L}*"),
    atWord("nagrad\\p{L}*"),
    atWord("nagrajen\\p{L}*"),
    atWord("priznanj\\p{L}*"),
    atWord("certifi\\p{L}*"),
    atWord("najboljš\\p{L}*"),
    atWord("najbolj(?!\\p{L})"),
    atWord("št\\.?\\s*1(?!\\d)"),
    "#\\s*1(?!\\d)",
    atWord("no\\.?\\s*1(?!\\d)"),
    atWord("number one"),
    atWord("best(?!\\p{L})"),
    atWord("award\\p{L}*"),
    atWord("rat(?:ed|ing)s?(?!\\p{L})"),
    atWord("top-rated"),
  ].join("|"),
  "iu",
);

/** Photo captions that say which of a before-after pair is which. */
const BEFORE = new RegExp(atWord("(?:prej|pred|before)(?!\\p{L})"), "iu");
const AFTER = new RegExp(atWord("(?:potem|po|after)(?!\\p{L})"), "iu");

/** A registration-area code spelled out in copy ("LJ", "MB"): two capitals standing alone. */
const PLATE_TOKEN = /(?<![\p{L}\p{N}])[A-ZČŠŽ]{2}(?![\p{L}\p{N}])/gu;

/** A counter counts up to a plain whole number: digits only. */
const PLAIN_WHOLE = /^\d{1,9}$/;

type El = Record<string, unknown> & { kind?: unknown };
const str = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

export const QUOTE_VERBATIM = "is not the client's words as written (only whitespace and quote marks may differ)";
export const CLAIM = "is a rating, award, certificate or superlative the client didn't write";
export const NOT_AMENITY = "is not among business.amenities (the client's or the owner's practical facts)";
export const GENERATED_PHOTO = "is a generated picture; a photos element shows only the client's own photos";
export const BEFORE_AFTER_LABELS = "a before-after pair needs the client's captions saying which photo is before (prej) and which after (potem)";
export const PLATE = "is not the registration code of the business's town (the plate code is written by code from @sb/spec plateCode)";
export const COUNT = "a counter counts only to a plain whole number";
export const NUMBERED = "a numbered label (01, 02 /) is banned";

/**
 * Violations of §1.8 in a spec's composed sections. `input` is the client's text in verbatimForm. A translation is
 * checked as it is shown (facts.ts), so a translated quote or map note fails here like an invented one.
 */
export function composedFacts(spec: SiteSpec, input: string): FactViolation[] {
  const out: FactViolation[] = [];
  const b = spec.business;
  const amenities = new Set<string>(b.amenities ?? []);
  const town = isPlaceholder(b.address) ? null : plateCode(b.address.city);
  const origin = new Map(spec.assets?.images?.map((i) => [i.id, i.origin ?? "client"]) ?? []);

  spec.pages.forEach((page, pi) =>
    page.sections.forEach((s, si) => {
      if (s.type !== "composed") return;
      const els = ((s.props as { elements?: unknown }).elements ?? []) as El[];
      els.forEach((e, ei) => {
        const at = `/pages/${pi}/sections/${si}/props/elements/${ei}`;
        const verbatim = (field: string, kind: FactViolation["kind"]) => {
          const v = e[field];
          if (str(v) && !isVerbatim(v, input)) out.push({ path: `${at}/${field}`, kind, value: v, detail: QUOTE_VERBATIM });
        };
        const noClaim = (v: unknown, path: string) => {
          if (str(v) && CLAIM_WORDS.test(v) && !isVerbatim(v, input)) out.push({ path, kind: "claim", value: v, detail: CLAIM });
        };
        switch (e.kind) {
          case "quote":
            verbatim("text", "quote");
            verbatim("by", "name");
            break;
          case "map":
            verbatim("cross", "address");
            verbatim("note", "quote");
            break;
          case "sticker":
            noClaim(e.text, `${at}/text`);
            break;
          case "ribbon":
            ((e.items ?? []) as unknown[]).forEach((x, i) => noClaim(x, `${at}/items/${i}`));
            break;
          case "iconFacts":
            ((e.items ?? []) as { fact?: unknown }[]).forEach((x, i) => {
              if (typeof x.fact === "string" && !amenities.has(x.fact)) out.push({ path: `${at}/items/${i}/fact`, kind: "amenity", value: x.fact, detail: NOT_AMENITY });
            });
            break;
          case "list":
            ((e.items ?? []) as unknown[]).forEach((x, i) => {
              const lead = x && typeof x === "object" ? (x as { lead?: unknown }).lead : undefined;
              if (str(lead) && NUMBERED_LABEL.test(lead)) out.push({ path: `${at}/items/${i}/lead`, kind: "label", value: lead, detail: NUMBERED });
            });
            break;
          case "photos": {
            const images = ((e.images ?? []) as unknown[]).filter((x): x is string => typeof x === "string");
            images.forEach((id, i) => {
              if (origin.get(id) === "generated") out.push({ path: `${at}/images/${i}`, kind: "photo", value: id, detail: GENERATED_PHOTO });
            });
            if (e.arrangement === "before-after") {
              const caps = ((e.captions ?? []) as unknown[]).map((c) => (typeof c === "string" ? c : ""));
              const [first = "", second = ""] = caps;
              const said = BEFORE.test(first) && AFTER.test(second) && isVerbatim(first, input) && isVerbatim(second, input);
              if (!said) out.push({ path: `${at}/captions`, kind: "photo", value: caps.slice(0, 2).join(" | "), detail: BEFORE_AFTER_LABELS });
            }
            break;
          }
          case "fact": {
            if (e.count === true && str(e.value) && !PLAIN_WHOLE.test(e.value.trim())) out.push({ path: `${at}/value`, kind: "number", value: e.value, detail: COUNT });
            if (e.treatment === "plate" || e.plateCode === true) plates([e.value, e.label], [`${at}/value`, `${at}/label`]);
            break;
          }
          case "prices": {
            if (e.style === "plates" || e.plateCode === true) {
              const items = (e.items ?? []) as { name?: unknown; note?: unknown }[];
              items.forEach((x, i) => plates([x.name, x.note], [`${at}/items/${i}/name`, `${at}/items/${i}/note`]));
            }
            break;
          }
        }
      });
    }),
  );
  return out;

  /** Plate copy never spells out a registration code other than the town's own from the table. */
  function plates(values: unknown[], paths: string[]) {
    values.forEach((v, i) => {
      if (!str(v)) return;
      for (const m of v.matchAll(PLATE_TOKEN)) if (m[0] !== town) out.push({ path: paths[i]!, kind: "plate", value: m[0], detail: PLATE });
    });
  }
}
