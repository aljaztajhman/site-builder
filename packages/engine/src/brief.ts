import { z } from "zod";
import { BusinessType, Day, toModelJsonSchema } from "@sb/spec";
import { clientHours, dayRange, fold, hoursPaired, priceMentions, pricePaired } from "./fact-pairing.ts";
import { Concept } from "./concept.ts";

const Time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const Classification = z.strictObject({
  businessType: BusinessType,
  confidence: z.number().min(0).max(1),
});
export type Classification = z.infer<typeof Classification>;

const PriceFact = z.strictObject({
  amount: z.number().nonnegative(),
  from: z.boolean(),
  unit: z.string().max(20).nullable(),
});

/**
 * Structured brief. Facts hold only what the client stated; `verifyBriefFacts` drops anything the
 * model produced that does not literally appear in the client's text.
 */
const BriefCore = z.strictObject({
  businessType: BusinessType,
  name: z.string().min(1).max(80),
  town: z.string().max(40).nullable(),
  summary: z.string().max(400).describe("Slovene, what the business does, only from the input"),
  audience: z.string().max(200),
  tone: z.enum(["friendly", "professional", "warm", "premium", "practical", "playful"]),
  offerings: z
    .array(
      z.strictObject({
        group: z.string().max(60).nullable(),
        name: z.string().max(80),
        description: z.string().max(240).nullable(),
        price: PriceFact.nullable(),
      }),
    )
    .max(60),
  highlights: z.array(z.string().max(160)).max(8).describe("Distinctive points the client actually stated"),
  facts: z.strictObject({
    phone: z.string().nullable().describe("E.164, e.g. +38641123456"),
    email: z.string().nullable(),
    address: z.strictObject({ street: z.string(), postalCode: z.string(), city: z.string() }).nullable(),
    hours: z
      .array(z.strictObject({ from: Day, to: Day, open: Time.nullable(), close: Time.nullable(), closed: z.boolean() }))
      .max(7)
      .nullable(),
    hoursNote: z.string().max(140).nullable(),
    bookingUrl: z.string().nullable(),
    social: z.array(z.strictObject({ network: z.enum(["facebook", "instagram", "tiktok", "youtube", "linkedin"]), url: z.string() })).max(5),
    legalName: z.string().nullable(),
    registrationNumber: z.string().nullable(),
    taxNumber: z.string().nullable(),
    vatPayer: z.boolean().nullable(),
    serviceArea: z.array(z.string().max(40)).max(20),
    people: z.array(z.strictObject({ name: z.string().max(60), role: z.string().max(60).nullable() })).max(12),
  }),
  pages: z
    .array(
      z.strictObject({
        kind: z.enum(["home", "standard"]),
        slug: z.string().regex(/^$|^[a-z0-9]+(-[a-z0-9]+)*$/),
        navLabel: z.string().max(24),
        purpose: z.string().max(200),
      }),
    )
    .min(1)
    .max(6),
  missing: z.array(z.string().max(80)).max(12).describe("Facts the client should still provide, in Slovene"),
  /**
   * Subjects for generated mood photos when the client gave too few (see BRIEF_SYSTEM). Never people,
   * premises or the client's own work. Optional so briefs recorded before it still parse.
   */
  imageIdeas: z
    .array(
      z.strictObject({
        subject: z.string().max(300).describe("One concrete scene, in English, for an image model"),
        alt: z.string().max(150).describe("The same picture described in Slovene, as alt text"),
      }),
    )
    .max(3)
    .default([]),
});
/** With config `variety.concept` the brief also carries the concept (concept.ts); a brief made without it has none. */
export const Brief = BriefCore.extend({ concept: Concept.optional() });
export type Brief = z.infer<typeof Brief>;

export const classificationJsonSchema = () => toModelJsonSchema(Classification);
/** The brief call's schema: today's, or with `concept` (config `variety.concept`) the concept added, required. */
export const briefJsonSchema = (concept = false) => toModelJsonSchema(concept ? BriefCore.extend({ concept: Concept }) : BriefCore);

const digits = (s: string) => s.replace(/\D/g, "");

/** Slovene phone forms in text ("041 123 456", "01/555 01 23", "+386 41 ...") to E.164. */
export function toE164(raw: string): string | null {
  let d = digits(raw);
  if (d.startsWith("00386")) d = d.slice(5);
  else if (d.startsWith("386")) d = d.slice(3);
  else if (d.startsWith("0")) d = d.slice(1);
  if (d.length < 7 || d.length > 9) return null;
  return `+386${d}`;
}

function normaliseText(s: string): string {
  return s.toLowerCase().normalize("NFKC").replace(/\s+/g, " ");
}

/** Numbers in the text in comparable form: "12,50" -> "12.5", "8.00" -> "8". */
export function numbersIn(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(/\d+(?:[.,]\d+)?/g)) {
    const n = Number(m[0].replace(",", "."));
    if (Number.isFinite(n)) out.add(String(n));
    out.add(m[0].replace(/[.,]\d+$/, ""));
  }
  // A number the client wrote as a word ("zadnja štiri leta") is the same fact as its digits ("4 leta").
  const words = fold(text);
  for (const [n, re] of NUMBER_WORDS) if (re.test(words)) out.add(String(n));
  return out;
}

/** Slovene number words two to twenty and the tens to fifty, in their common case forms (folded, no diacritics). */
const NUMBER_WORDS: [number, RegExp][] = (
  [
    [2, "dva|dve|dveh|dvema"],
    [3, "tri|trije|treh|trem|tremi"],
    [4, "stiri|stirje|stirih|stirim|stirimi"],
    // "pet" alone is also petek in day ranges ("pon–pet", "pet. 8–16"): not after a day and a dash, not before a dot or a dash.
    [5, "(?<!(?:pon|tor|sre|cet)\\.?\\s*[-–—]\\s*)pet(?!\\s*[-–—.])|petih|petim|petimi"],
    [6, "sest|sestih|sestim|sestimi"],
    [7, "sedem|sedmih|sedmim|sedmimi"],
    [8, "osem|osmih|osmim|osmimi"],
    [9, "devet|devetih|devetim|devetimi"],
    [10, "deset|desetih|desetim|desetimi"],
    [11, "enajst|enajstih"],
    [12, "dvanajst|dvanajstih"],
    [13, "trinajst|trinajstih"],
    [14, "stirinajst|stirinajstih"],
    [15, "petnajst|petnajstih"],
    [16, "sestnajst|sestnajstih"],
    [17, "sedemnajst|sedemnajstih"],
    [18, "osemnajst|osemnajstih"],
    [19, "devetnajst|devetnajstih"],
    [20, "dvajset|dvajsetih"],
    [30, "trideset|tridesetih"],
    [40, "stirideset|stiridesetih"],
    [50, "petdeset|petdesetih"],
  ] as [number, string][]
).map(([n, forms]) => [n, new RegExp(`(?<![\\p{L}\\p{N}])(?:${forms})(?![\\p{L}\\p{N}])`, "u")]);

/** Lower case without diacritics; lives with the fact pairing, exported here as before. */
export { fold };

/**
 * Every number-like run in the text ("041 555 906", "01/555 01 23", "SI12345678") as its own digit
 * string, plus its national phone form (without 00386/386/leading 0). Facts are matched against
 * whole runs, so digits from two different numbers can't combine into a match.
 */
export function numberTokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(/\+?\d[\d \t/.()-]*\d|\d/g)) {
    const d = m[0].replace(/\D/g, "");
    out.add(d);
    out.add(d.replace(/^(00)?386/, "").replace(/^0/, ""));
  }
  return out;
}

const HOURS_TERM = /\b(?:(?:delovn|ordinacijsk|uradn|odpiraln|poslovn)\w*\s+(?:cas|ur)\w*|urnik\w*)/;
const HOURS_WITHHELD = [
  // "delovnega časa ne bi pisali", "urnika ne objavljamo", "ne navajajte delovnega časa"
  /\bne\s+(?:bi\s+|bomo\s+|bo\s+|smo\s+|zelim\w*\s+|zelel\w*\s+)?(?:objav|pis|naved|navaj|prikaz|zapis|dajt|daja|kaz|omenj)\w*/,
  // "brez delovnega časa", "nimamo stalnega delovnega časa"
  /\b(?:brez|nimamo)\s+(?:objave\s+|stalnega\s+|fiksnega\s+|rednega\s+)?(?:delovn|ordinacijsk|uradn|urnik)/,
  // "delovni čas po dogovoru"
  /(?:cas|ure|urnik)\w*\s*(?:(?:je|so)\s+)?:?\s*(?:samo\s+|le\s+)?po\s+(?:predhodnem\s+)?dogovoru\b/,
];

/**
 * The client asked for no opening hours on the site ("Delovnega časa tudi ne bi pisali"), or has none
 * ("delovni čas po dogovoru"). Read from their own text, one sentence at a time, so the site gets no hours
 * placeholder to fill (businessFromBrief). Only matters when the brief has no hours: stated hours win.
 */
export function clientWithholdsHours(text: string): boolean {
  return fold(text)
    .split(/[.!?](?=\s|$)|\n/)
    .some((sentence) => HOURS_TERM.test(sentence) && HOURS_WITHHELD.some((re) => re.test(sentence)));
}

export interface Dropped {
  field: string;
  value: string;
}

/**
 * Removes facts the client did not state. Phones must match digits in the text, emails and URLs
 * must appear verbatim, addresses need their postal code and street name, prices the amount the
 * client gave for that offering, people their name, hours the times the client gave for those days.
 * Returns the cleaned brief and what was dropped.
 */
export function verifyBriefFacts(brief: Brief, sourceText: string): { brief: Brief; dropped: Dropped[] } {
  const text = normaliseText(sourceText);
  const tokens = numberTokens(sourceText);
  const nums = numbersIn(sourceText);
  const folded = fold(sourceText);
  const dropped: Dropped[] = [];
  const b: Brief = structuredClone(brief);
  const f = b.facts;

  if (f.phone) {
    const national = digits(f.phone).replace(/^386/, "");
    if (!tokens.has(national)) {
      dropped.push({ field: "phone", value: f.phone });
      f.phone = null;
    } else f.phone = toE164(f.phone) ?? f.phone;
  }
  if (f.email && !text.includes(f.email.toLowerCase())) {
    dropped.push({ field: "email", value: f.email });
    f.email = null;
  }
  if (f.bookingUrl && !text.includes(f.bookingUrl.toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, ""))) {
    dropped.push({ field: "bookingUrl", value: f.bookingUrl });
    f.bookingUrl = null;
  }
  if (f.address) {
    const streetWord = f.address.street.toLowerCase().split(/\s+/)[0] ?? "";
    if (!nums.has(f.address.postalCode) || !folded.includes(fold(f.address.city))) {
      dropped.push({ field: "address", value: `${f.address.street}, ${f.address.postalCode} ${f.address.city}` });
      f.address = null;
    } else if (!text.includes(streetWord)) {
      dropped.push({ field: "address", value: f.address.street });
      f.address = null;
    }
  }
  for (const k of ["registrationNumber", "taxNumber"] as const) {
    const v = f[k];
    if (v && !tokens.has(digits(v))) {
      dropped.push({ field: k, value: v });
      f[k] = null;
    }
  }
  if (f.legalName && !text.includes(f.legalName.toLowerCase().split(/[,\s]/)[0] ?? "")) {
    dropped.push({ field: "legalName", value: f.legalName });
    f.legalName = null;
  }
  if (f.hours) {
    // Every time must be one the client gave for those days (not a number from elsewhere in the text).
    const known = clientHours(sourceText);
    const times = f.hours.flatMap((h) => [h.open, h.close]).filter((t): t is string => !!t);
    const ok = f.hours.every((h) => {
      if (h.closed) return true;
      const r = hoursPaired(dayRange(h.from, h.to), h.open ?? undefined, h.close ?? undefined, known);
      return r.open && r.close;
    });
    if (!ok) {
      dropped.push({ field: "hours", value: times.join(",") });
      f.hours = null;
    }
  }
  f.people = f.people.filter((p) => {
    const keep = text.includes(p.name.toLowerCase().split(" ")[0] ?? "");
    if (!keep) dropped.push({ field: "people", value: p.name });
    return keep;
  });
  f.social = f.social.filter((s) => {
    const keep = text.includes(s.url.toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""));
    if (!keep) dropped.push({ field: "social", value: s.url });
    return keep;
  });
  // A price must be one the client gave for that offering ("moško striženje 15 €"), not any number.
  const mentions = priceMentions(sourceText);
  for (const o of b.offerings) {
    if (o.price && !pricePaired(o.price.amount, o.name, o.group ?? "", mentions)) {
      dropped.push({ field: `price:${o.name}`, value: String(o.price.amount) });
      o.price = null;
    }
  }
  return { brief: b, dropped };
}
