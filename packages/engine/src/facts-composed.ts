import { NUMBERED_LABEL, plateCode, isPlaceholder, type SiteSpec } from "@sb/spec";
import type { FactViolation } from "./facts.ts";
import { fold } from "./fact-pairing.ts";

/**
 * Fact rules of the composition language's v20 kinds (docs/plans/studio-phase1-design.md §1.8): quote, map, sticker,
 * ribbon, iconFacts, photos, list leads and the plate codes. Numbers, phones, prices and hours in their strings go
 * through the general copy check in facts.ts; this file holds what only these kinds need.
 */

type Obj = Record<string, unknown>;
type Violation = FactViolation;

/**
 * A text with whitespace, quotation marks, apostrophes and dashes normalised, so a quote copied out of a chat message
 * matches however it was typeset. Case and everything else stay as written: a quote is verbatim.
 */
export function normalizeVerbatim(s: string): string {
  return s
    .replace(/[„“”«»‟‹›"]/g, '"')
    .replace(/[‘’‚`'´]/g, "'")
    .replace(/[–—−‐‑]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["']+|["']+$/g, "")
    .trim();
}

/** What a sticker or ribbon may not say unless the client wrote it: a rating, award, certificate or superlative. Matched on folded text (no diacritics, lower case). */
const CLAIM_PATTERNS: readonly RegExp[] = [
  /[★☆⭐]/u,
  /\d\s*\/\s*5\b/, // 4.9/5
  /\bocen(?:a|e|i|o|u|am|ami|ah|jen\w*)\b/, // ocena, ocene, ocenjeno (not ocenitev, a free estimate)
  /nagrad|nagrajen/, // nagrada, nagrajeno, nagrajenec
  /priznanj/, // priznanje, priznanja
  /certifik|certificiran/, // certifikat, certificiran
  /najbolj/, // najboljši, najboljša, najbolje, najbolj priljubljen
  /\bst\.?\s*1\b/, // št. 1
  /#\s*1\b/,
  /\bno\.?\s*1\b|\bnumber\s+one\b/,
  /\b(?:award|certified|best)\b/,
];

/** Whether a sticker or ribbon text claims a rating, award, certificate or superlative. */
export function isClaim(text: string): boolean {
  const f = fold(text);
  return CLAIM_PATTERNS.some((re) => re.test(f));
}

/** Words that mark a photo as the before or the after of a before-after pair, in the client's captions. */
const BEFORE = /\b(?:prej|pred|before)\b/;
const AFTER = /\b(?:potem|po|after)\b/;

const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

/**
 * The §1.8 rules for the v20 kinds. `translated` is true for a locale's shown copy: only the text rules run then
 * (the structure was checked on the original, and a translated quote must still be the client's words).
 */
export function checkComposedKinds(spec: SiteSpec, corpus: string, translated: boolean): Violation[] {
  const out: Violation[] = [];
  const input = normalizeVerbatim(corpus);
  const inInput = (s: string) => input.includes(normalizeVerbatim(s));
  const inInputLoose = (s: string) => fold(input).includes(fold(normalizeVerbatim(s)));
  /** A short lead is the client's only as a whole word of the input ("01" is inside the phone number "041 555 301"). */
  const asWord = (s: string) => input.split(/[^\p{L}\p{N}./-]+/u).some((w) => w === normalizeVerbatim(s));
  const amenities = new Set<string>(spec.business.amenities ?? []);
  const city = isPlaceholder(spec.business.address) ? null : spec.business.address.city;
  const images = new Map((spec.assets?.images ?? []).map((i) => [i.id, i] as const));

  spec.pages.forEach((page, pi) =>
    page.sections.forEach((s, si) => {
      if (s.type !== "composed") return;
      const elements = ((s.props as unknown as Obj).elements as unknown[] | undefined) ?? [];
      elements.forEach((raw, ei) => {
        const e = obj(raw);
        if (!e) return;
        const at = (rest: string) => `/pages/${pi}/sections/${si}/props/elements/${ei}${rest}`;
        const add = (path: string, kind: Violation["kind"], value: string, detail?: string) => out.push({ path, kind, value, ...(detail ? { detail } : {}) });

        switch (e.kind) {
          case "quote": {
            for (const k of ["text", "by"] as const) {
              const v = str(e[k]);
              if (v && !inInput(v)) add(at(`/${k}`), "quote", v, k === "by" ? "the attribution is not in the client's input" : "a quote must appear word for word in the client's input");
            }
            break;
          }
          case "map": {
            for (const k of ["cross", "note"] as const) {
              const v = str(e[k]);
              if (v && !inInput(v)) add(at(`/${k}`), "verbatim", v, "the map's text must appear word for word in the client's input");
            }
            break;
          }
          case "sticker":
          case "ribbon": {
            const texts: [string, string][] =
              e.kind === "sticker"
                ? str(e.text) ? [["/text", e.text as string]] : []
                : ((e.items as unknown[] | undefined) ?? []).flatMap((t, i): [string, string][] => (typeof t === "string" ? [[`/items/${i}`, t]] : []));
            for (const [p, t] of texts) if (isClaim(t) && !inInputLoose(t)) add(at(p), "claim", t, "a sticker or ribbon may not claim a rating, award, certificate or superlative the client did not write");
            break;
          }
          case "iconFacts": {
            if (translated) break;
            ((e.items as unknown[] | undefined) ?? []).forEach((it, i) => {
              const fact = str(obj(it)?.fact);
              if (fact && !amenities.has(fact)) add(at(`/items/${i}/fact`), "amenity", fact, "not among the business's amenities");
            });
            break;
          }
          case "photos": {
            if (translated) break;
            const refs = ((e.images as unknown[] | undefined) ?? []).filter((x): x is string => typeof x === "string");
            refs.forEach((ref, i) => {
              if (images.get(ref)?.origin === "generated") add(at(`/images/${i}`), "photo", ref, "a generated image can't stand for the business's own work");
            });
            if (e.arrangement === "before-after") {
              const captions = ((e.captions as unknown[] | undefined) ?? []).map((c) => (typeof c === "string" ? c : ""));
              const label = (i: number) => fold(captions[i] || images.get(refs[i] ?? "")?.alt || "");
              if (refs.length !== 2) add(at("/images"), "photo", String(refs.length), "a before-after pair needs exactly two photos");
              else if (!BEFORE.test(label(0)) || !AFTER.test(label(1))) add(at("/captions"), "photo", refs.join(" "), "the client's captions must say which photo is before (prej) and which after (potem)");
            }
            break;
          }
          case "list": {
            ((e.items as unknown[] | undefined) ?? []).forEach((it, i) => {
              const lead = str(obj(it)?.lead);
              if (lead && NUMBERED_LABEL.test(lead) && !asWord(lead)) add(at(`/items/${i}/lead`), "label", lead, "a numbered label (01, 02 …) is not a date or number the client gave");
            });
            break;
          }
          case "fact":
          case "prices": {
            if (translated || e.plateCode !== true) break;
            if (!city || !plateCode(city)) add(at("/plateCode"), "plate", city ?? "", "the town has no registration code");
            break;
          }
        }
      });
    }),
  );
  return out;
}
