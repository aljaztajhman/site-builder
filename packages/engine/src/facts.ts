import { isPlaceholder, setAt, walkStrings, type SiteSpec } from "@sb/spec";
import { numberTokens, numbersIn } from "./brief.ts";
import { clientHours, clockTimes, dayRange, fold, hoursPaired, parseHours, priceMentions, pricePaired, pricesFor, unnamedAmounts, type ClientHours, type PriceMention } from "./fact-pairing.ts";

export interface FactViolation {
  path: string;
  kind: "phone" | "email" | "address" | "hours" | "price" | "name" | "number" | "url";
  value: string;
  /** Why it failed when the value is in the input but for something else (another offering, other days). */
  detail?: string;
}

const digitsOf = (s: string) => s.replace(/\D/g, "");

/** Legal-form tokens that may be added to a name without being "invented". */
const LEGAL_FORMS = new Set(["d.o.o.", "d.o.o", "s.p.", "s.p", "d.d.", "d.d", "k.d.", "doo", "sp"]);

/** Street-type words the client may abbreviate or leave out ("Ljubljanska c. 8"). */
const STREET_KINDS = new Set(["cesta", "ulica", "trg", "pot", "nabrezje", "naselje"]);

/** Keys whose strings are structural, not visible copy; "date" is the accessibility statement's day, set in code (its digits would read as a phone). */
const NON_COPY_KEYS = new Set(["id", "type", "variant", "tone", "page", "section", "action", "kind", "slug", "image", "network", "src", "file", "$placeholder", "date"]);

const IMAGE_REF_RE = /^img_[a-z0-9_-]+$/;
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.]+/g;
const URL_RE = /https?:\/\/\S+|www\.\S+/g;
/** A phone or registration number in running text: at least seven digits in one run. */
const PHONE_RE = /(\+?\d[\d \t/-]{6,}\d)/g;

const PRICE_ELSEWHERE = "is a price the client gave for something else, not for this offering";
const PRICE_NONE = "is not a price the client gave";
const HOURS_DAYS = "is not a time the client gave for these days";
const HOURS_NONE = "is not a time the client gave";

/** The client's text, parsed once per check. */
interface Corpus {
  text: string;
  folded: string;
  tokens: Set<string>;
  /** Every number, for addresses and postal codes. */
  nums: Set<string>;
  /** Numbers outside phone numbers, e-mails and links: a number in copy can't come from those. */
  copyNums: Set<string>;
  prices: PriceMention[];
  priceAmounts: Set<number>;
  /** Prices given without saying what for; they count for any offering. */
  unnamed: Set<number>;
  hours: ClientHours;
}

function corpusOf(corpus: string): Corpus {
  const blank = (s: string) => " ".repeat(s.length);
  const masked = corpus
    .replace(EMAIL_RE, blank)
    .replace(URL_RE, blank)
    .replace(PHONE_RE, (m) => (digitsOf(m).length >= 8 ? blank(m) : m));
  const prices = priceMentions(corpus);
  return {
    text: corpus.toLowerCase(),
    folded: fold(corpus),
    tokens: numberTokens(corpus),
    nums: numbersIn(corpus),
    copyNums: numbersIn(masked),
    prices,
    priceAmounts: new Set(prices.map((p) => p.amount)),
    unnamed: unnamedAmounts(prices),
    hours: clientHours(corpus),
  };
}

/**
 * Checks that every phone number, email, address, opening hour, price, person's name and number
 * shown on the site comes from the client's input (brief text plus chat messages) or is a marked
 * placeholder. `corpus` is everything the client wrote.
 *
 * Prices and opening times are paired, not just found: a price must be one the client gave for that
 * offering, an opening time one the client gave for those days (see fact-pairing.ts). A number the
 * client wrote only in another role (a phone number, a year, an address, another day's hours) does
 * not count.
 */
export function checkFacts(spec: SiteSpec, corpus: string): FactViolation[] {
  return check(spec, corpusOf(corpus), false);
}

function check(spec: SiteSpec, c: Corpus, translated: boolean): FactViolation[] {
  const out: FactViolation[] = [];
  const { text, folded, tokens, nums } = c;
  const b = spec.business;

  // The business name is shown everywhere; every word of it (legal forms aside) must be the client's.
  const nameWords = fold(b.name)
    .split(/[\s,]+/)
    .map((w) => w.replace(/["'„“”«»]/g, ""))
    .filter((w) => w.length >= 3 && !LEGAL_FORMS.has(w));
  if (nameWords.some((w) => !folded.includes(w))) out.push({ path: "/business/name", kind: "name", value: b.name });

  if (!isPlaceholder(b.phone)) {
    const national = digitsOf(b.phone).replace(/^386/, "");
    if (!tokens.has(national)) out.push({ path: "/business/phone", kind: "phone", value: b.phone });
  }
  if (!isPlaceholder(b.email) && !text.includes(b.email.toLowerCase())) out.push({ path: "/business/email", kind: "email", value: b.email });
  if (!isPlaceholder(b.address)) {
    if (!nums.has(b.address.postalCode) || !folded.includes(fold(b.address.city))) {
      out.push({ path: "/business/address", kind: "address", value: `${b.address.postalCode} ${b.address.city}` });
    }
    const streetNum = /\d+\w?$/.exec(b.address.street)?.[0];
    const streetName = b.address.street.replace(/\s*\d+\w?$/, "").toLowerCase();
    // Every word of the street name, not only the first ("Cesta svobode" when the client wrote "Celjska cesta").
    const streetWords = fold(streetName).split(/\s+/).filter((w) => w.length >= 3 && !STREET_KINDS.has(w));
    if ((streetNum && !nums.has(streetNum.replace(/\D/g, ""))) || streetWords.some((w) => !folded.includes(w))) {
      out.push({ path: "/business/address/street", kind: "address", value: b.address.street });
    }
  }
  if (b.hours && !isPlaceholder(b.hours)) {
    // Each opening and closing time must be one the client gave for every day of the entry.
    b.hours.entries.forEach((e, i) => {
      if (e.closed) return;
      const ok = hoursPaired(dayRange(e.from, e.to), e.open, e.close, c.hours);
      for (const [t, fine] of [[e.open, ok.open], [e.close, ok.close]] as const) {
        if (t && !fine) out.push({ path: `/business/hours/entries/${i}`, kind: "hours", value: t, ...(c.hours.any.has(t) ? { detail: HOURS_DAYS } : {}) });
      }
    });
    if (b.hours.note) for (const f of copyFacts(b.hours.note, c, "hours")) out.push({ path: "/business/hours/note", ...f });
  }
  // The legal name fills a required ZEPT field: an invented one must not clear the publish gate.
  if (!isPlaceholder(b.provider.legalName)) {
    const legalWords = fold(b.provider.legalName).split(/[\s,]+/).filter((w) => w.length >= 3 && !LEGAL_FORMS.has(w));
    if (legalWords.some((w) => !folded.includes(w))) out.push({ path: "/business/provider/legalName", kind: "name", value: b.provider.legalName });
  }
  for (const k of ["registrationNumber", "taxNumber"] as const) {
    const v = b.provider[k];
    if (!isPlaceholder(v) && !tokens.has(digitsOf(v))) out.push({ path: `/business/provider/${k}`, kind: "number", value: v });
  }
  if (b.bookingUrl && !text.includes(b.bookingUrl.toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, ""))) {
    out.push({ path: "/business/bookingUrl", kind: "url", value: b.bookingUrl });
  }
  (b.social ?? []).forEach((so, i) => {
    if (!text.includes(so.url.toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""))) out.push({ path: `/business/social/${i}`, kind: "url", value: so.url });
  });

  // Structured prices: the price the client gave for that offering. A translation only changes the
  // names, never the amounts, so the translated pass leaves prices to the original.
  const visit = (v: unknown, p: string, owner: string) => {
    if (Array.isArray(v)) return v.forEach((x, i) => visit(x, `${p}/${i}`, owner));
    if (!v || typeof v !== "object") return;
    const o = v as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name : typeof o.title === "string" ? o.title : "";
    const price = o.price as { amount?: unknown } | undefined;
    if (!translated && price && typeof price.amount === "number") {
      const context = [owner, typeof o.note === "string" ? o.note : ""].join(" ");
      if (!pricePaired(price.amount, name, context, c.prices)) {
        const elsewhere = c.priceAmounts.has(Math.round(price.amount * 100) / 100);
        out.push({ path: `${p}/price`, kind: "price", value: String(price.amount), ...(elsewhere ? { detail: PRICE_ELSEWHERE } : {}) });
      }
    }
    for (const [k, x] of Object.entries(o)) visit(x, `${p}/${k}`, Array.isArray(x) && name ? name : owner);
  };
  visit(spec.pages, "/pages", "");
  spec.pages.forEach((page, pi) =>
    page.sections.forEach((s, si) => {
      if (s.type !== "team" && s.type !== "about") return;
      const props = s.props as Record<string, unknown>;
      const names: { path: string; name: unknown }[] =
        s.type === "team"
          ? ((props.members as { name: unknown }[] | undefined) ?? []).map((m, mi) => ({ path: `/pages/${pi}/sections/${si}/props/members/${mi}/name`, name: m.name }))
          : [{ path: `/pages/${pi}/sections/${si}/props/ownerName`, name: props.ownerName }];
      for (const n of names) {
        if (typeof n.name === "string" && !n.name.toLowerCase().split(/\s+/).every((w) => text.includes(w))) out.push({ path: n.path, kind: "name", value: n.name });
      }
    }),
  );

  // Free copy: phone numbers, emails, prices, times and any other number must come from the client.
  walkStrings(spec.pages, (s, p, key) => {
    if (NON_COPY_KEYS.has(key)) return;
    if (/^https?:\/\//.test(s)) return;
    // An image reference under any key (image, inset, …) is an id, not copy.
    if (IMAGE_REF_RE.test(s)) return;
    for (const f of copyFacts(s, c, "number")) out.push({ path: `/pages${p}`, ...f });
  });
  // Translations overlay any string of the spec when rendered; check each locale as it is shown.
  for (const [locale, map] of Object.entries(spec.translations ?? {})) {
    const shown = structuredClone({ ...spec, translations: undefined });
    for (const [ptr, value] of Object.entries(map ?? {})) {
      try {
        setAt(shown, ptr, value);
      } catch {
        // A pointer that doesn't resolve is a validation issue, reported there.
      }
    }
    const base = new Set(out.map((f) => `${f.path}|${f.value}`));
    for (const f of check(shown, c, true)) if (!base.has(`${f.path}|${f.value}`)) out.push({ ...f, path: `/translations/${locale}${f.path}` });
  }
  return dedupe(out);
}

/**
 * Facts in one string of copy. Each fact is blanked out once checked, so its digits aren't checked
 * again as plain numbers. `numberKind` is what a leftover number is reported as.
 */
function copyFacts(s: string, c: Corpus, numberKind: FactViolation["kind"]): Omit<FactViolation, "path">[] {
  const out: Omit<FactViolation, "path">[] = [];
  let f = fold(s);
  // Offsets from parsing `s` only line up with `f` when folding kept the length (it does for letters with diacritics).
  const source = f.length === s.length ? s : f;
  const blank = (start: number, end: number) => {
    f = f.slice(0, start) + " ".repeat(end - start) + f.slice(end);
  };
  for (const m of [...f.matchAll(EMAIL_RE)]) {
    if (!c.folded.includes(m[0])) out.push({ kind: "email", value: s.slice(m.index, m.index + m[0].length) });
    blank(m.index, m.index + m[0].length);
  }
  for (const m of [...f.matchAll(PHONE_RE)]) {
    const d = digitsOf(m[0]).replace(/^(00)?386/, "").replace(/^0/, "");
    if (d.length < 7) continue;
    if (!c.tokens.has(d)) out.push({ kind: "phone", value: m[0] });
    blank(m.index, m.index + m[0].length);
  }
  // Prices: paired with what the copy says they are for (the last three words before the price, so a
  // long sentence's other offerings don't count); copy that names nothing the client priced ("cene že
  // od 10 €", "nad 75 € brez poštnine", English copy) still needs an amount the client gave as a price.
  for (const m of priceMentions(f)) {
    const best = pricesFor(m.words.slice(-3).join(" "), "", c.prices);
    const ok = (best.size ? best.has(m.amount) : c.priceAmounts.has(m.amount)) || c.unnamed.has(m.amount);
    if (!ok) out.push({ kind: "price", value: m.raw, ...(c.priceAmounts.has(m.amount) ? { detail: PRICE_ELSEWHERE } : { detail: PRICE_NONE }) });
    blank(m.start, m.end);
  }
  // Opening times: with days, the client's times for those days; without, a time the client wrote.
  const { paired, unpaired } = parseHours(source);
  for (const { days, time } of paired) {
    const r = hoursPaired(days, time.open, time.close, c.hours);
    if (time.open && !r.open) out.push({ kind: "hours", value: time.openRaw ?? time.open, detail: HOURS_DAYS });
    if (time.close && !r.close) out.push({ kind: "hours", value: time.closeRaw ?? time.close, detail: HOURS_DAYS });
    if (time.at && !c.hours.any.has(time.at)) out.push({ kind: "hours", value: time.openRaw ?? time.at, detail: HOURS_NONE });
    blank(time.start, time.end);
  }
  for (const time of unpaired) {
    if (!time.explicit) continue;
    for (const [t, raw] of [[time.open, time.openRaw], [time.close, time.closeRaw], [time.at, time.openRaw]] as const) {
      if (t && !c.hours.any.has(t)) out.push({ kind: "hours", value: raw ?? t, detail: HOURS_NONE });
    }
    blank(time.start, time.end);
  }
  for (const t of clockTimes(f)) {
    if (!c.hours.any.has(t.time)) out.push({ kind: "hours", value: t.raw, detail: HOURS_NONE });
    blank(t.start, t.end);
  }
  for (const m of f.matchAll(/\d+(?:[.,]\d+)?/g)) {
    const n = String(Number(m[0].replace(",", ".")));
    if (!c.copyNums.has(n) && !c.copyNums.has(m[0])) out.push({ kind: numberKind, value: m[0] });
  }
  return out;
}

function dedupe(v: FactViolation[]): FactViolation[] {
  const seen = new Set<string>();
  return v.filter((x) => {
    const k = `${x.path}|${x.value}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
