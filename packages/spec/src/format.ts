/** Slovene formatting: dates 29. 9. 2026, times 8.00, prices 12,50 €, phones +386 41 123 456. */
import type { Address, Day, Hours, HoursEntry } from "./business.ts";
import type { Locale } from "./common.ts";

const NBSP = " ";

export function formatPrice(amount: number, locale: Locale = "sl"): string {
  const whole = Number.isInteger(amount);
  const n = new Intl.NumberFormat(localeTag(locale), {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
  // Slovene convention: amount, non-breaking space, euro sign.
  return `${n}${NBSP}€`;
}

export function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(":");
  return `${Number(h)}.${m}`;
}

export function formatDate(d: Date): string {
  return `${d.getDate()}.${NBSP}${d.getMonth() + 1}.${NBSP}${d.getFullYear()}`;
}

/** +38641123456 -> +386 41 123 456; +38612345678 -> +386 1 234 56 78 (Ljubljana landline). */
export function formatPhone(e164: string): string {
  if (!e164.startsWith("+386")) return e164;
  const rest = e164.slice(4);
  const groups =
    rest.length === 8 && /^[1-7]/.test(rest)
      ? [rest.slice(0, 1), rest.slice(1, 4), rest.slice(4, 6), rest.slice(6)]
      : [rest.slice(0, 2), rest.slice(2, 5), rest.slice(5)];
  return `+386 ${groups.filter(Boolean).join(" ")}`;
}

export function formatAddress(a: Address): string {
  return `${a.street}, ${a.postalCode} ${a.city}`;
}

export function mapsUrl(a: Address): string {
  const q = encodeURIComponent(`${a.street}, ${a.postalCode} ${a.city}, ${a.country ?? "Slovenija"}`);
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

export function localeTag(locale: Locale): string {
  return { sl: "sl-SI", en: "en-GB", de: "de-AT", hr: "hr-HR", it: "it-IT" }[locale];
}

const DAY_NAMES: Record<"sl" | "en", Record<Day, string>> = {
  sl: { mon: "ponedeljek", tue: "torek", wed: "sreda", thu: "četrtek", fri: "petek", sat: "sobota", sun: "nedelja" },
  en: { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" },
};

const SHORT_DAY: Record<"sl" | "en", Record<Day, string>> = {
  sl: { mon: "pon", tue: "tor", wed: "sre", thu: "čet", fri: "pet", sat: "sob", sun: "ned" },
  en: { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" },
};

function dayLocale(locale: Locale): "sl" | "en" {
  return locale === "sl" ? "sl" : "en";
}

export function dayName(d: Day, locale: Locale = "sl", short = false): string {
  return (short ? SHORT_DAY : DAY_NAMES)[dayLocale(locale)][d];
}

export function formatDayRange(e: HoursEntry, locale: Locale = "sl", short = false): string {
  const a = dayName(e.from, locale, short);
  if (e.from === e.to) return capitalize(a);
  return `${capitalize(a)}–${dayName(e.to, locale, short)}`;
}

export function formatHoursValue(e: HoursEntry, locale: Locale = "sl"): string {
  if (e.closed || !e.open || !e.close) return locale === "sl" ? "zaprto" : "closed";
  return `${formatTime(e.open)}–${formatTime(e.close)}`;
}

export function hoursRows(h: Hours, locale: Locale = "sl", short = false): { days: string; value: string }[] {
  return h.entries.map((e) => ({ days: formatDayRange(e, locale, short), value: formatHoursValue(e, locale) }));
}

export function capitalize(s: string): string {
  return s.charAt(0).toLocaleUpperCase("sl") + s.slice(1);
}

/** Slovene plurals via Intl.PluralRules: one, two, few, other. */
export function plural(n: number, forms: { one: string; two: string; few: string; other: string }, locale: Locale = "sl"): string {
  const rule = new Intl.PluralRules(localeTag(locale)).select(n) as keyof typeof forms;
  return forms[rule] ?? forms.other;
}
