/**
 * Deterministic Slovene copy lint for the eval (HQ it-slovene-copy): rules that can be checked without a model and
 * with few false positives, over every visible string of a site spec (pages, collections, image alt texts). Report
 * only: it never fails a fixture. The model-based counterpart is the opt-in Slovene judge (slovene-judge.ts).
 *
 * What it never flags: the business's own name, town, street and people (masked before any rule runs), links,
 * e-mail addresses and domains, and brand names in ALLOWED_NAMES. A finding whose quote also appears in the client's
 * own text is kept but marked `echoed` and left out of the counts: the client wrote it that way (a product name, a
 * term), so the report lists it apart and nobody "fixes" the client's facts.
 */
import { walkStrings, type SiteSpec } from "@sb/spec";

export type RuleId =
  | "english"
  | "ti-form"
  | "dual-we"
  | "quotes"
  | "decimal-point"
  | "euro-before"
  | "unit-space"
  | "range-hyphen"
  | "spaced-hyphen"
  | "ellipsis"
  | "em-dash"
  | "space-before-punct"
  | "missing-space"
  | "doubled-word"
  | "tripled-letter"
  | "roman-artefact"
  | "english-format"
  | "title-case";

export interface Rule {
  id: RuleId;
  label: string;
  /** Counted and listed, but not an error here (the em dash is already repaired in code). */
  countOnly?: boolean;
}

export const RULES: Rule[] = [
  { id: "english", label: "English word or phrase where Slovene has one" },
  { id: "ti-form", label: "informal (ti) address; visitors are addressed with vi" },
  { id: "dual-we", label: "dual with the visitor (\"skupaj poiščeva\"); with vi it is plural" },
  { id: "quotes", label: "straight or English quotes; Slovene uses „…“ or »…«" },
  { id: "decimal-point", label: "decimal point in an amount (4,20 €, not 4.20 €)" },
  { id: "euro-before", label: "€ before the amount (20 €, not €20)" },
  { id: "unit-space", label: "no space before a unit, € or % (20 €, 5 km, 10 %)" },
  { id: "range-hyphen", label: "hyphen in a number range (8–16, en dash)" },
  { id: "spaced-hyphen", label: "spaced hyphen used as a dash (\" – \")" },
  { id: "ellipsis", label: "three dots instead of …" },
  { id: "em-dash", label: "em dash (repaired in code; count only)", countOnly: true },
  { id: "space-before-punct", label: "space before punctuation" },
  { id: "missing-space", label: "no space after punctuation" },
  { id: "doubled-word", label: "the same word twice in a row" },
  { id: "tripled-letter", label: "a letter three times in a row" },
  { id: "roman-artefact", label: "lowercase Roman-numeral artefact (ii, iii, (iv))" },
  { id: "english-format", label: "English number format (1st, 8 am/pm)" },
  { id: "title-case", label: "English Title Case in a heading (Slovene headings are sentence case)" },
];

/**
 * English words and phrases with the Slovene a site should use (`source` is a regex source, matched as whole words,
 * case-insensitive). Curated: only words that are not also Slovene words or names. Accepted loanwords are not here
 * (ALLOWED_LOANWORDS).
 */
export const ENGLISH_TERMS: { source: string; slovene: string }[] = [
  { source: "click\\s*(?:&|and|in)\\s*collect", slovene: "prevzem v trgovini" },
  { source: "take\\s?-?away", slovene: "za s seboj" },
  { source: "to go", slovene: "za s seboj" },
  { source: "online", slovene: "na spletu, spletno" },
  { source: "e-?mail\\p{L}*", slovene: "e-pošta" },
  { source: "(?<!-)mail(?:a|u|om|i)?", slovene: "e-pošta" },
  { source: "shop\\p{L}*", slovene: "trgovina" },
  { source: "gift\\s?box\\p{L}*", slovene: "darilni paket" },
  { source: "gift\\s?card\\p{L}*", slovene: "darilna kartica" },
  { source: "voucher\\p{L}*", slovene: "darilni bon" },
  { source: "booking", slovene: "rezervacija" },
  { source: "book now", slovene: "rezervirajte" },
  { source: "check-?in", slovene: "prijava" },
  { source: "check-?out", slovene: "odjava" },
  { source: "check-?up", slovene: "pregled" },
  { source: "feedback\\p{L}*", slovene: "odziv, mnenje" },
  { source: "team", slovene: "ekipa" },
  { source: "workshop\\p{L}*", slovene: "delavnica" },
  { source: "events?", slovene: "dogodek" },
  { source: "newsletter\\p{L}*", slovene: "e-novice" },
  { source: "weekend\\p{L}*", slovene: "konec tedna, vikend" },
  { source: "about us", slovene: "o nas" },
  { source: "contact(?: us)?", slovene: "kontakt" },
  { source: "welcome", slovene: "pozdravljeni" },
  { source: "(?:read|learn) more", slovene: "preberite več" },
  { source: "more info", slovene: "več o tem" },
  { source: "follow us", slovene: "sledite nam" },
  { source: "home\\s?-?made", slovene: "domač" },
  { source: "hand\\s?-?made", slovene: "ročno izdelan" },
  { source: "fresh", slovene: "svež" },
  { source: "free", slovene: "brezplačno, brez" },
  { source: "best\\s?-?seller\\p{L}*", slovene: "najbolj prodajan" },
  { source: "know-?how", slovene: "znanje" },
  { source: "styling\\p{L}*", slovene: "oblikovanje" },
  { source: "delivery", slovene: "dostava" },
  { source: "lunch", slovene: "kosilo" },
  { source: "breakfast", slovene: "zajtrk" },
  { source: "dinner", slovene: "večerja" },
  { source: "coffee", slovene: "kava" },
  { source: "daily", slovene: "dnevni" },
  { source: "last minute", slovene: "zadnji trenutek" },
  { source: "all inclusive", slovene: "vse vključeno" },
  { source: "self-?service", slovene: "samopostrežno" },
  { source: "parking\\p{L}*", slovene: "parkirišče" },
  { source: "service", slovene: "servis, storitev" },
  { source: "detailing\\p{L}*", slovene: "temeljito čiščenje" },
  { source: "car\\s?wash\\p{L}*", slovene: "avtopralnica" },
  { source: "dry needling\\p{L}*", slovene: "suho iglanje" },
  { source: "kinesio\\s?taping\\p{L}*", slovene: "kineziološko trakovanje" },
];

/** Loanwords Slovene has taken in: never flagged (documented here and asserted by the tests). */
export const ALLOWED_LOANWORDS = ["wellness", "fitness", "spa", "catering", "brunch", "pizza", "burger", "espresso", "smoothie", "jazz", "golf", "tenis", "vikend", "fitnes"];
const LOANWORDS = new Set(ALLOWED_LOANWORDS);

/** Brand and service names that contain a listed word; masked before the rules run. */
export const ALLOWED_NAMES: RegExp[] = [/Booking(?:\.com|a|u|om)?(?![\p{L}])/gu, /Google(?: Maps| zemljevid\p{L}*)?/gu, /Wi-?Fi/giu, /Facebook\p{L}*/gu, /Instagram\p{L}*/gu, /WhatsApp\p{L}*/gu, /Viber\p{L}*/gu, /PayPal\p{L}*/gu];

const L = "\\p{L}";
const before = `(?<![${L}\\p{N}])`;
const after = `(?![${L}\\p{N}])`;
const wordRe = (source: string, flags = "giu") => new RegExp(`${before}(?:${source})${after}`, flags);

/** ti imperatives that are never another word form (3rd person, a noun): flagged anywhere. */
const TI_IMPERATIVES = [
  "pokliči", "piši", "napiši", "rezerviraj", "obišči", "pridi", "poglej", "oglej", "kontaktiraj", "izberi", "odkrij", "spoznaj", "preberi", "vpiši", "poišči", "pošlji", "vprašaj", "zaupaj", "uživaj", "začni", "ostani", "pokaži", "povej", "vzemi", "daj", "pojdi", "glej",
];
/** ti imperatives that are also a 3rd-person form or a noun ("naroči", "kupi"): flagged only opening a short label. */
const TI_IMPERATIVES_LABEL_ONLY = ["naroči", "kupi", "preveri", "privošči", "prijavi", "dobi", "poskusi", "pusti", "javi", "sprosti", "stopi"];
/** ti pronouns and 2nd person singular verbs. */
const TI_WORDS = ["tvoj\\p{L}*", "tebi", "tebe", "zate", "s tabo", "s teboj", "imaš", "boš", "želiš", "potrebuješ", "najdeš", "dobiš", "moraš", "veš", "greš", "pokličeš", "rezerviraš", "naročiš", "prideš", "izbereš", "plačaš", "prevzameš", "poskusiš", "uživaš"];
const TI_RE = wordRe([...TI_IMPERATIVES, ...TI_WORDS, "lahko (?:tudi |že |še )?\\p{L}{2,}(?:aš|eš|iš)"].join("|"));
const TI_LABEL_RE = new RegExp(`^\\s*(?:${TI_IMPERATIVES_LABEL_ONLY.join("|")})${after}`, "iu");
/** vi forms, counted to tell a site that mixes address from one that is consistently informal. */
const VI_IMPERATIVES = [
  "pokličite", "pišite", "napišite", "rezervirajte", "obiščite", "pridite", "poglejte", "oglejte", "kontaktirajte", "izberite", "odkrijte", "spoznajte", "preberite", "vpišite", "poiščite", "pošljite", "vprašajte", "zaupajte", "uživajte", "začnite", "ostanite", "pokažite", "povejte", "vzemite", "dajte", "pojdite", "glejte", "naročite", "kupite", "preverite", "privoščite", "prijavite", "dobite", "poskusite", "pustite", "javite", "sprostite", "stopite",
];
const VI_RE = wordRe(["vaš\\p{L}*", "vam", "vas", "vami", ...VI_IMPERATIVES, "lahko (?:tudi |že |še )?\\p{L}{2,}(?:ate|ete|ite)"].join("|"));

interface Hit {
  index: number;
  text: string;
}
const hits = (re: RegExp, s: string, group = 0): Hit[] =>
  [...s.matchAll(re)].map((m) => ({ index: m.index + (group ? m[0].indexOf(m[group]!) : 0), text: m[group]! }));

const UNITS = "€|%|km|kg|cm|mm|ml|dl|m²|m2|min|m|g|l|t";
const HEADING_KEYS = new Set(["headline", "title", "heading", "name", "label", "eyebrow", "question", "factLabel"]);

/** Context for one site: the business's own names (masked) and proper names (never flagged as Title Case). */
export interface LintContext {
  /** The business's name, street, town and people, masked before the rules run. */
  names?: string[];
  /** Words written with a capital in the client's text or the business facts. */
  properNames: Set<string>;
}

/**
 * The rules over one string. `key` is the spec key holding it ("headline", "label", …). Links, e-mail addresses,
 * domains, brand names and `ctx.names` are masked first; `index` points into `s` (masking keeps the length).
 */
export function lintText(raw: string, key: string, ctx: LintContext = { properNames: new Set() }): { rule: RuleId; quote: string; index: number }[] {
  const s = maskString(raw, ctx.names ?? []);
  const out: { rule: RuleId; quote: string; index: number }[] = [];
  const add = (rule: RuleId, list: Hit[]) => {
    for (const h of list) {
      const index = h.index + h.text.length - h.text.trimStart().length;
      const quote = h.text.trim();
      // One finding per place: a hit inside a longer hit of the same rule ("rezerviraš" in "lahko rezerviraš") is dropped.
      const overlapping = out.findIndex((o) => o.rule === rule && index < o.index + o.quote.length && o.index < index + quote.length);
      if (overlapping < 0) out.push({ rule, quote, index });
      else if (quote.length > out[overlapping]!.quote.length) out[overlapping] = { rule, quote, index };
    }
  };
  for (const t of ENGLISH_TERMS) add("english", hits(wordRe(t.source), s).filter((h) => !LOANWORDS.has(h.text.toLowerCase())));
  add("ti-form", hits(TI_RE, s));
  const label = TI_LABEL_RE.exec(s);
  if (label && s.trim().split(/\s+/).length <= 4) add("ti-form", [{ index: label.index, text: label[0] }]);
  add("dual-we", hits(wordRe(`skupaj \\p{L}{3,}(?:va|ve)`), s));
  add("quotes", hits(/"[^"\n]{1,80}"|“[^“”"\n]{1,80}”|"|”|(?<=^|[\s(])“(?=\S)/gu, s));
  add("decimal-point", [...hits(new RegExp(`(?<![\\d.,])\\d+\\.\\d{1,2}\\s?(?:${UNITS}|EUR|eur)(?![\\p{L}\\d])`, "gu"), s), ...hits(/€\s?\d+\.\d{1,2}(?!\d)/gu, s)]);
  add("euro-before", hits(/€\s?\d+(?:[.,]\d+)?/gu, s));
  add("unit-space", hits(new RegExp(`(?<![\\p{L}\\d.,])\\d+(?:[.,]\\d+)?(?:${UNITS})(?![\\p{L}\\d])`, "gu"), s));
  add("range-hyphen", hits(/(?<![\p{L}\d\-./,])\d{1,4}(?:[.,]\d{1,2})?-\d{1,4}(?:[.,]\d{1,2})?(?![\d\-./]|,\d)/gu, s));
  add("spaced-hyphen", hits(/[\p{L}\d]+ - [\p{L}\d]+/gu, s));
  add("ellipsis", hits(/[\p{L}\d]*\.\.\./gu, s));
  add("em-dash", hits(/[\p{L}\d]*\s*—\s*[\p{L}\d]*/gu, s));
  add("space-before-punct", hits(/[\p{L}\d]+ +[,.;:!?](?=\s|$)/gu, s));
  add("missing-space", [...hits(/\p{L}+[,;!?](?=\p{L})/gu, s), ...hits(/\p{L}*\p{Ll}\.(?=\p{Lu}\p{Ll})/gu, s)]);
  add("doubled-word", hits(/(?<![\p{L}\p{N}])(\p{L}{2,})\s+\1(?![\p{L}\p{N}])/giu, s));
  add("tripled-letter", hits(/(\p{Ll})\1\1/gu, s).filter((h) => h.text[0] !== "i"));
  add("roman-artefact", [...hits(wordRe("ii|iii", "gu"), s), ...hits(/(?<![\p{L}\p{N}])\(?(?:i{1,3}|iv)\)/gu, s)]);
  add("english-format", [...hits(/(?<![\p{L}\d])\d+(?:st|nd|rd|th)(?![\p{L}\d])/giu, s), ...hits(/\d\s?(?:am|pm|a\.m\.|p\.m\.)(?![\p{L}])/giu, s)]);
  if (HEADING_KEYS.has(key)) for (const seg of titleCaseSegments(s, ctx)) out.push({ rule: "title-case", quote: seg.text, index: seg.index });
  return out;
}

/** Heading segments (split at " | ", " – ", ",") written in English Title Case: 3+ words, every word after the first capitalised, 2+ of them not proper names. */
function titleCaseSegments(s: string, ctx: LintContext): Hit[] {
  const out: Hit[] = [];
  let offset = 0;
  for (const seg of s.split(/( \| | – |, )/)) {
    const words = [...seg.matchAll(/\p{L}[\p{L}'-]*/gu)].map((m) => m[0]).filter((w) => w.length >= 3);
    const rest = words.slice(1);
    const capitalised = rest.filter((w) => /^\p{Lu}\p{Ll}/u.test(w));
    const acronyms = rest.filter((w) => w === w.toUpperCase());
    const common = capitalised.filter((w) => !ctx.properNames.has(w));
    if (words.length >= 3 && capitalised.length + acronyms.length === rest.length && common.length >= 2) out.push({ index: offset, text: seg.trim() });
    offset += seg.length;
  }
  return out;
}

/** Counts vi and ti address in one string (for the per-site "mixed" note). */
export function addressCounts(s: string): { ti: number; vi: number } {
  const label = TI_LABEL_RE.test(s) && s.trim().split(/\s+/).length <= 4 ? 1 : 0;
  return { ti: [...s.matchAll(TI_RE)].length + label, vi: [...s.matchAll(VI_RE)].length };
}

// ---------- the site ----------

/** Keys whose strings are structural, not visible copy (engine facts.ts NON_COPY_KEYS, plus enums and links). */
const NON_COPY_KEYS = new Set(["id", "type", "variant", "tone", "page", "section", "action", "kind", "slug", "image", "network", "src", "file", "$placeholder", "date", "endDate", "start", "end", "url", "cta", "fact", "tags", "origin", "inset"]);
const IMAGE_REF_RE = /^img_[a-z0-9_-]+$/;

export interface VisibleString {
  path: string;
  key: string;
  text: string;
}

/** Every string a visitor can read or hear (alt text) on the default-locale site: pages, collections, image alt texts. */
export function visibleStrings(spec: SiteSpec): VisibleString[] {
  const out: VisibleString[] = [];
  const take = (root: unknown, prefix: string) =>
    walkStrings(root, (text, p, key) => {
      if (NON_COPY_KEYS.has(key) || IMAGE_REF_RE.test(text) || /^https?:\/\//.test(text) || !text.trim()) return;
      out.push({ path: `${prefix}${p}`, key, text });
    });
  take(spec.pages, "/pages");
  take(spec.collections ?? {}, "/collections");
  spec.assets.images.forEach((img, i) => {
    if (img.alt.trim()) out.push({ path: `/assets/images/${i}/alt`, key: "alt", text: img.alt });
  });
  return out;
}

const MASK = "\uE000";
const maskAll = (s: string, re: RegExp) => s.replace(re, (m) => MASK.repeat(m.length));
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** A link up to the punctuation that ends its sentence. */
const URL_RE = /(?:https?:\/\/|www\.)\S+?(?=[.,;:!?)]*(?:\s|$))/giu;
const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/gu;
const DOMAIN_RE = /(?<![\p{L}\d])[\p{L}\d-]+(?:\.[\p{L}\d-]+)*\.(?:si|com|eu|net|org|example|info)(?![\p{L}\d])/giu;

/** The business's own names (name, street, town, people), from the facts and the copy's name fields. */
function ownNames(spec: SiteSpec): string[] {
  const names = new Set<string>();
  const add = (v: unknown) => typeof v === "string" && v.trim().length >= 2 && names.add(v.trim());
  add(spec.business.name);
  const address = spec.business.address as { street?: unknown; city?: unknown } | undefined;
  add(address?.street);
  add(address?.city);
  walkStrings({ pages: spec.pages, collections: spec.collections ?? {} }, (s, _p, key) => {
    if (key === "ownerName") add(s);
  });
  for (const page of spec.pages)
    for (const s of page.sections) {
      const members = (s.props as { members?: { name?: unknown }[] }).members;
      if (Array.isArray(members)) for (const m of members) add(m?.name);
    }
  for (const m of spec.collections?.team?.items ?? []) add(m.name);
  return [...names].sort((a, b) => b.length - a.length);
}

/** Masks what is never linted: links, e-mail addresses, domains, brand names, the business's own names. */
export function maskString(s: string, names: string[]): string {
  let m = maskAll(maskAll(maskAll(s, URL_RE), EMAIL_RE), DOMAIN_RE);
  for (const re of ALLOWED_NAMES) m = maskAll(m, new RegExp(re.source, re.flags));
  for (const n of names) m = maskAll(m, new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(n)}(?![\\p{L}\\p{N}])`, "gu"));
  return m;
}

/** Whether `quote` is in the client's own text as whole words (case and spacing ignored). */
export function inClientText(quote: string, corpus: string): boolean {
  const q = quote.trim().replace(/\s+/g, " ");
  // Punctuation alone ("-", "…") says nothing about where it came from.
  if (!/[\p{L}\p{N}]/u.test(q)) return false;
  const edge = (c: string) => /[\p{L}\p{N}]/u.test(c);
  const re = new RegExp(`${edge(q[0]!) ? "(?<![\\p{L}\\p{N}])" : ""}${escapeRe(q).replace(/ /g, "\\s+")}${edge(q.at(-1)!) ? "(?![\\p{L}\\p{N}])" : ""}`, "iu");
  return re.test(corpus);
}

export interface LintFinding {
  rule: RuleId;
  path: string;
  /** The offending text as it appears on the site. */
  quote: string;
  /** The whole string, for context. */
  text: string;
  /** The quote is also in the client's own text (not counted). */
  echoed: boolean;
}

export interface SloveneLint {
  /** Visible strings checked. */
  strings: number;
  findings: LintFinding[];
  /** Findings per rule, echoed ones left out (count-only rules included under their id). */
  counts: Partial<Record<RuleId, number>>;
  /** Findings that echo the client's own text, per rule. */
  echoed: Partial<Record<RuleId, number>>;
  /** Errors: every counted finding except count-only rules. */
  total: number;
  /** vi and ti address on the whole site: both above 0 means the site mixes them. */
  address: { ti: number; vi: number };
}

/** Lints every visible string of `spec`. `corpus` is the client's own text (intake description and chat requests). */
export function lintSpec(spec: SiteSpec, corpus: string): SloveneLint {
  const empty: SloveneLint = { strings: 0, findings: [], counts: {}, echoed: {}, total: 0, address: { ti: 0, vi: 0 } };
  if (spec.locales.default !== "sl") return empty;
  const names = ownNames(spec);
  const properNames = new Set([...`${corpus} ${names.join(" ")}`.matchAll(/\p{Lu}[\p{L}'-]*/gu)].map((m) => m[0]));
  const strings = visibleStrings(spec);
  const out: SloveneLint = { ...empty, strings: strings.length, address: { ti: 0, vi: 0 } };
  for (const v of strings) {
    const a = addressCounts(maskString(v.text, names));
    out.address.ti += a.ti;
    out.address.vi += a.vi;
    for (const f of lintText(v.text, v.key, { names, properNames })) {
      const quote = v.text.slice(f.index, f.index + f.quote.length);
      out.findings.push({ rule: f.rule, path: v.path, quote, text: v.text, echoed: inClientText(quote, corpus) });
    }
  }
  const countOnly = new Set(RULES.filter((r) => r.countOnly).map((r) => r.id));
  for (const f of out.findings) {
    const bucket = f.echoed ? out.echoed : out.counts;
    bucket[f.rule] = (bucket[f.rule] ?? 0) + 1;
    if (!f.echoed && !countOnly.has(f.rule)) out.total++;
  }
  return out;
}
