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

/** The sites' own time zone: the day a statement is dated and the footer's year are Slovenian days. */
export const SITE_TIME_ZONE = "Europe/Ljubljana";

/** `d` as YYYY-MM-DD on the sites' calendar. */
export function isoDay(d: Date, timeZone: string = SITE_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** A YYYY-MM-DD day as a local Date (noon, so no time zone moves it to another day). */
export function dayDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d, 12);
}

export function formatDate(d: Date): string {
  return `${d.getDate()}.${NBSP}${d.getMonth() + 1}.${NBSP}${d.getFullYear()}`;
}

/** Slovene mobile and non-geographic prefixes (two digits after +386). */
export const MOBILE_PREFIXES: ReadonlySet<string> = new Set(["30", "31", "40", "41", "49", "50", "51", "64", "65", "68", "69", "70", "71", "80", "81", "82", "83", "89", "90"]);

/** +38641123456 -> +386 41 123 456 (mobile); +38615550123 -> +386 1 555 01 23 (landline, one-digit area code). */
export function formatPhone(e164: string): string {
  if (!e164.startsWith("+386")) return e164;
  const rest = e164.slice(4);
  const groups = MOBILE_PREFIXES.has(rest.slice(0, 2))
    ? [rest.slice(0, 2), rest.slice(2, 5), rest.slice(5)]
    : [rest.slice(0, 1), rest.slice(1, 4), rest.slice(4, 6), rest.slice(6)];
  return `+386 ${groups.filter(Boolean).join(" ")}`;
}

/**
 * The number as people dial it at home, for numbers set at poster size: +38641555730 -> 041 555 730,
 * +38642123456 -> 04 212 34 56. Numbers outside Slovenia keep the international form.
 */
export function formatPhoneNational(e164: string): string {
  if (!e164.startsWith("+386")) return formatPhone(e164);
  const rest = e164.slice(4);
  const groups = MOBILE_PREFIXES.has(rest.slice(0, 2))
    ? [`0${rest.slice(0, 2)}`, rest.slice(2, 5), rest.slice(5)]
    : [`0${rest.slice(0, 1)}`, rest.slice(1, 4), rest.slice(4, 6), rest.slice(6)];
  return groups.filter(Boolean).join(" ");
}

/** Registration-area codes of Slovenian number plates, by the area's seat. Other towns get no code. */
const PLATE_CODES: Record<string, string> = {
  ljubljana: "LJ",
  maribor: "MB",
  celje: "CE",
  kranj: "KR",
  "novo mesto": "NM",
  koper: "KP",
  "nova gorica": "GO",
  "murska sobota": "MS",
  postojna: "PO",
  "slovenj gradec": "SG",
  "krško": "KK",
};

/** The plate code of the town in an address ("Kranj" -> "KR"), or null when the town is not an area seat. */
export function plateCode(city: string): string | null {
  return PLATE_CODES[city.trim().toLocaleLowerCase("sl")] ?? null;
}

const DAY_ORDER: Day[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

/**
 * The earliest opening time of the week and the days it holds for, for a seal like "pon–sob odprto od 6.30":
 * { time: "6.30", days: "pon–sob" }. Days are "every day" when all seven open then. Null without open days.
 */
export function earliestOpening(h: Hours, locale: Locale = "sl"): { time: string; days: string; everyDay: boolean } | null {
  const open = h.entries.filter((e) => !e.closed && e.open);
  if (!open.length) return null;
  const min = open.map((e) => e.open!).sort()[0]!;
  const days = new Set<number>();
  for (const e of open.filter((x) => x.open === min)) {
    const a = DAY_ORDER.indexOf(e.from);
    const b = DAY_ORDER.indexOf(e.to);
    for (let i = a; i <= (b < a ? a : b); i++) days.add(i);
  }
  const sorted = [...days].sort((x, y) => x - y);
  const runs: [number, number][] = [];
  for (const d of sorted) {
    const last = runs[runs.length - 1];
    if (last && d === last[1] + 1) last[1] = d;
    else runs.push([d, d]);
  }
  const name = (i: number) => dayName(DAY_ORDER[i]!, locale, true);
  const text = runs.map(([a, b]) => (a === b ? name(a) : `${name(a)}–${name(b)}`)).join(", ");
  return { time: formatTime(min), days: text, everyDay: sorted.length === 7 };
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

export interface WeekChart {
  /** First and last whole hour on the scale (the earliest opening floored, the latest closing ceiled). */
  start: number;
  end: number;
  days: { day: Day; closed: boolean; bars: { from: number; to: number; label: string }[] }[];
}

/** Week order (business.ts has it as DAYS, but this module stays free of zod for the editor bundle). */
const WEEK: readonly Day[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/**
 * Opening hours as a week chart (opening-hours week): one row per day the hours mention, in week order, each
 * with its opening spans in minutes and their labels; a day marked closed has no bars. Null when nothing opens.
 */
export function weekChart(h: Hours): WeekChart | null {
  const rows = new Map<Day, { closed: boolean; bars: { from: number; to: number; label: string }[] }>();
  for (const e of h.entries) {
    const a = WEEK.indexOf(e.from);
    const b = WEEK.indexOf(e.to);
    for (let i = a; i <= (b >= a ? b : a); i++) {
      const day = WEEK[i]!;
      const row = rows.get(day) ?? { closed: false, bars: [] };
      if (e.closed || !e.open || !e.close) row.closed = row.bars.length === 0;
      else row.bars.push({ from: minutes(e.open), to: minutes(e.close), label: `${formatTime(e.open)}–${formatTime(e.close)}` });
      if (row.bars.length) row.closed = false;
      rows.set(day, row);
    }
  }
  const bars = [...rows.values()].flatMap((r) => r.bars);
  if (!bars.length) return null;
  const start = Math.floor(Math.min(...bars.map((x) => x.from)) / 60);
  const end = Math.ceil(Math.max(...bars.map((x) => x.to)) / 60);
  return {
    start,
    end,
    days: WEEK.filter((d) => rows.has(d)).map((day) => ({ day, ...rows.get(day)!, bars: rows.get(day)!.bars.sort((x, y) => x.from - y.from) })),
  };
}

export function capitalize(s: string): string {
  return s.charAt(0).toLocaleUpperCase("sl") + s.slice(1);
}

/** Slovene plurals via Intl.PluralRules: one, two, few, other. */
export function plural(n: number, forms: { one: string; two: string; few: string; other: string }, locale: Locale = "sl"): string {
  const rule = new Intl.PluralRules(localeTag(locale)).select(n) as keyof typeof forms;
  return forms[rule] ?? forms.other;
}

const MONTHS: Record<"sl" | "en", string[]> = {
  // Slovene dates take the month in the genitive: "3. oktobra 2026".
  sl: ["januarja", "februarja", "marca", "aprila", "maja", "junija", "julija", "avgusta", "septembra", "oktobra", "novembra", "decembra"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
};
const MONTHS_SHORT: Record<"sl" | "en", string[]> = {
  sl: ["jan.", "feb.", "mar.", "apr.", "maj", "jun.", "jul.", "avg.", "sep.", "okt.", "nov.", "dec."],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};

const ymd = (iso: string) => iso.split("-").map(Number) as [number, number, number];

/** A YYYY-MM-DD day in words: "3. oktobra 2026" (sl), "3 October 2026" (en). */
export function formatLongDate(iso: string, locale: Locale = "sl"): string {
  const [y, m, d] = ymd(iso);
  const month = MONTHS[dayLocale(locale)][m - 1]!;
  return locale === "sl" ? `${d}.${NBSP}${month} ${y}` : `${d}${NBSP}${month} ${y}`;
}

/**
 * A run of days, the shared parts once: "3.–5. oktobra 2026", "30. septembra – 2. oktobra 2026",
 * "30. decembra 2026 – 2. januarja 2027". One day, or an end before the start, is that one day.
 */
export function formatDateRange(start: string, end: string | undefined, locale: Locale = "sl"): string {
  if (!end || end <= start) return formatLongDate(start, locale);
  const [y1, m1, d1] = ymd(start);
  const [y2, m2, d2] = ymd(end);
  const sl = locale === "sl";
  const dot = sl ? "." : "";
  if (y1 === y2 && m1 === m2) return `${d1}${dot}–${d2}${dot}${NBSP}${MONTHS[dayLocale(locale)][m2 - 1]} ${y2}`;
  const month = (m: number) => MONTHS[dayLocale(locale)][m - 1]!;
  if (y1 === y2) return `${d1}${dot}${NBSP}${month(m1)} – ${d2}${dot}${NBSP}${month(m2)} ${y2}`;
  return `${formatLongDate(start, locale)} – ${formatLongDate(end, locale)}`;
}

/** Day number and short month of a date, for a calendar badge: { day: "3", month: "okt." }. */
export function dateBadge(iso: string, locale: Locale = "sl"): { day: string; month: string } {
  const [, m, d] = ymd(iso);
  return { day: String(d), month: MONTHS_SHORT[dayLocale(locale)][m - 1]! };
}

/** "19.00–21.00", or "19.00" without an end. */
export function formatTimeRange(start: string, end?: string): string {
  return end ? `${formatTime(start)}–${formatTime(end)}` : formatTime(start);
}

/** Minutes to read paragraphs at ~200 words a minute, at least one. */
export function readingMinutes(paragraphs: readonly string[]): number {
  const words = paragraphs.join(" ").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}
