/**
 * Entity pairing for the fact check: which price the client gave for which offering, and which
 * opening times for which days. Deterministic text parsing, no model calls.
 *
 * Prices: every amount next to a currency marker (€, EUR, "evrov", ...) in the client's text is a
 * price mention; the words before it (back to the previous price, a line break, a colon or a
 * sentence end) name what it is for. A price on the site passes when its offering's name matches
 * the mention(s) that fit that name best, with Slovene inflection tolerated (malica ~ malico).
 *
 * Hours: day words and ranges ("pon–pet", "od ponedeljka do petka", "ob sobotah", "med tednom",
 * "Saturday") are paired with the time ranges that follow them ("8.00–16.00", "od 8:00 do 16:00",
 * "8h–16h", "do 15.00"). A time on the site passes when the client gave it for every day it is shown for.
 */
import type { Day } from "@sb/spec";

/** Lower case without diacritics, for tolerant comparisons ("Škofja" ~ "skofja"). */
export function fold(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d");
}

export const WEEK: readonly Day[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

// ---------- Words ----------

/** Words that never identify an offering: price talk, units, function words. */
const STOP = new Set(
  (
    "cena cene ceno cen ceni cenik cenika ceniku cenah stane stanejo znasa eur euro evro evra evri evrov " +
    "nekaj tudi samo kot ali ter pri pod nad vsak vsaka vsako vsi vse imamo imate smo ste nas nasa nase nasi vas vam " +
    "kar ker tem teh tej pred med brez nova novo novi nov dodaj dodajte dodajmo osebo oseba osebe osebi " +
    "min minut ure uro ura uri let leta kom kos " +
    "the and for per price prices from with new add our"
  ).split(" "),
);

/** Words of a text that can name an offering, folded. */
export function words(text: string): string[] {
  return (fold(text).match(/[a-z]+/g) ?? []).filter((w) => w.length >= 3 && !STOP.has(w));
}

/**
 * Same word up to Slovene inflection: the ending changes (malica ~ malico, kruh ~ kruha, gum ~ gume),
 * longer words may also lose a vowel (rogljiček ~ rogljički, nočitev ~ nočitve); kos !~ kosilo,
 * terapija !~ terasa.
 */
export function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  const min = Math.min(a.length, b.length);
  const max = Math.max(a.length, b.length);
  if (min < 3) return false;
  let cp = 0;
  while (cp < min && a[cp] === b[cp]) cp++;
  if (min === 3) return cp === 3 && max <= 5;
  return cp >= Math.max(3, min >= 7 ? min - 2 : min - 1) && cp >= Math.ceil(max / 2);
}

const hits = (label: string[], clause: string[]) => label.filter((w) => clause.some((c) => sameWord(w, c))).length;

// ---------- Prices ----------

export interface PriceMention {
  amount: number;
  /** Words naming what the price is for. */
  words: string[];
  start: number;
  end: number;
  /** The amount as written. */
  raw: string;
}

const AMT = String.raw`(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)(?:,-)?`;
const CUR = String.raw`(?:€|eur(?:o|a|ov|ih|e)?\b|evr(?:o|a|ov|ih|i|e|u)?\b)`;
/** "18 €", "4,20 EUR", "20–30 evrov", "€ 18". Applied to folded text. */
const PRICE_RE = new RegExp(String.raw`(?<![\d.,])(?:${AMT}\s*[-–—]\s*)?${AMT}\s*${CUR}|${CUR}\s*${AMT}`, "g");

export function parseAmount(raw: string): number {
  const s = raw.replace(/,-$/, "");
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) return Number(s.replace(/\./g, "").replace(",", "."));
  return Number(s.replace(",", "."));
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Price segments: lines and sentences. A clause never reaches over one. */
function priceSegments(text: string): { start: number; text: string }[] {
  const out: { start: number; text: string }[] = [];
  const re = /\n|[.!?;](?=\s+\S)/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    // A full stop between digits ("8.00") or right after a digit followed by more digits isn't an end.
    if (m[0] === "." && /\d/.test(text[m.index - 1] ?? "") && /\s\d/.test(text.slice(m.index + 1, m.index + 3))) continue;
    out.push({ start: last, text: text.slice(last, m.index + 1) });
    last = m.index + 1;
  }
  out.push({ start: last, text: text.slice(last) });
  return out;
}

/**
 * The words naming each price in a text: the clause before it, else the clause after it, else the
 * line before when that line has no price of its own ("Moško striženje\nCena: 15 €").
 */
export function priceMentions(text: string): PriceMention[] {
  const out: PriceMention[] = [];
  const folded = fold(text);
  let previous: { text: string; priced: boolean } | null = null;
  for (const seg of priceSegments(folded)) {
    const found = [...seg.text.matchAll(PRICE_RE)];
    const prior = previous;
    found.forEach((m, i) => {
      const prevEnd = i > 0 ? found[i - 1]!.index + found[i - 1]![0].length : 0;
      const before = seg.text.slice(prevEnd, m.index);
      const colon = before.lastIndexOf(":");
      let w = colon >= 0 ? words(before.slice(colon + 1)) : [];
      if (!w.length) w = words(before);
      if (!w.length) w = words(seg.text.slice(m.index + m[0].length, found[i + 1]?.index ?? seg.text.length).split(/[,;:]/)[0] ?? "");
      if (!w.length && i === 0 && prior && !prior.priced) w = words(prior.text);
      const amounts = [m[1], m[2], m[3]].filter((x): x is string => !!x);
      for (const a of amounts) out.push({ amount: round2(parseAmount(a)), words: w, start: seg.start + m.index, end: seg.start + m.index + m[0].length, raw: a });
    });
    // A blank line ends the "line before": "\n\nCena: 0,90 €" names nothing.
    previous = seg.text.trim() ? { text: seg.text, priced: found.length > 0 } : null;
  }
  return out;
}

/**
 * The amounts the client gave for an offering: those of the mentions that fit its name best (name
 * words count ten times more than context words such as the group or a note). Empty when no mention
 * shares a word with it.
 */
export function pricesFor(name: string, context: string, mentions: PriceMention[]): Set<number> {
  const nameW = words(name);
  const ctxW = words(context);
  const label = [...nameW, ...ctxW];
  // Score, then fewest words the label doesn't explain: "Terapija" is "terapija 45 €", not "paket 5 terapij 200 €".
  let best: [number, number] = [0, Infinity];
  const amounts = new Set<number>();
  for (const m of mentions) {
    const s = 10 * hits(nameW, m.words) + hits(ctxW, m.words);
    if (s === 0) continue;
    const extra = m.words.filter((w) => !label.some((l) => sameWord(l, w))).length;
    if (s < best[0] || (s === best[0] && extra > best[1])) continue;
    if (s > best[0] || extra < best[1]) amounts.clear();
    best = [s, extra];
    amounts.add(m.amount);
  }
  return amounts;
}

/**
 * A price the client gave without saying what for ("Cene: 15 €, 28 €", or a price the owner typed
 * straight into a price field) can't be paired either way, so it counts for any offering.
 */
export function unnamedAmounts(mentions: PriceMention[]): Set<number> {
  return new Set(mentions.filter((m) => m.words.length === 0).map((m) => m.amount));
}

export function pricePaired(amount: number, name: string, context: string, mentions: PriceMention[]): boolean {
  const a = round2(amount);
  return pricesFor(name, context, mentions).has(a) || unnamedAmounts(mentions).has(a);
}

// ---------- Hours ----------

const FULL: [Day, string][] = [
  ["mon", "ponedelj(?:ek|ka|ku|kom|ki|kih|ke)|mondays?"],
  ["tue", "tor(?:ek|ka|ku|kom|ki|kih|ke)|tuesdays?"],
  ["wed", "sred(?:a|e|o|ah|ami)|wednesdays?"],
  ["thu", "cetrt(?:ek|ka|ku|kom|ki|kih|ke)|thursdays?"],
  ["fri", "pet(?:ek|ka|ku|kom|ki|kih|ke)|fridays?"],
  ["sat", "sobot(?:a|e|o|i|ah|ami)|saturdays?"],
  ["sun", "nedelj(?:a|e|o|i|ah|ami)|sundays?"],
];
const ABBR: Record<string, Day> = {
  pon: "mon", tor: "tue", sre: "wed", cet: "thu", pet: "fri", sob: "sat", ned: "sun",
  mon: "mon", tue: "tue", tues: "tue", wed: "wed", thu: "thu", thur: "thu", thurs: "thu", fri: "fri", sat: "sat", sun: "sun",
};

const FULL_EXACT = FULL.map(([d, re]) => [d, new RegExp(`^(?:${re})$`)] as const);

function dayOf(word: string): Day | null {
  const w = word.replace(/\.$/, "");
  if (ABBR[w]) return ABBR[w];
  for (const [d, re] of FULL_EXACT) if (re.test(w)) return d;
  return null;
}

function dayRange(a: Day, b: Day): Day[] {
  const i = WEEK.indexOf(a);
  const j = WEEK.indexOf(b);
  if (j < i) return [...WEEK.slice(i), ...WEEK.slice(0, j + 1)];
  return WEEK.slice(i, j + 1);
}

const FULL_ALT = FULL.map(([, re]) => re).join("|");
const ABBR_ALT = Object.keys(ABBR).join("|");
const DAY_ANY = `(?:${FULL_ALT}|${ABBR_ALT})`;
/** An hour with optional minutes: 8, 8.00, 08:00, 8h, 8. (as in "od 8. do 16. ure"). */
const T = String.raw`(?<![\d.,:])(\d{1,2})(?:[.:](\d{2}))?(?!\d)(\s?h\b|\.(?![\d]))?(?:\s*ur[aei]\b)?`;
const TIME_TO = String.raw`\s*(?:[-–—]|\bdo\b|\bto\b|\btill\b|\buntil\b)\s*`;
/** Not an amount, an age, a duration or a quantity ("20–30 €", "od 3 do 6 let", "2–3 dni", "do 3,5 t"). */
const NOT_PRICE = String.raw`(?!\s*(?:€|eur|evr|let\b|leta\b|letih\b|dni\b|dan\b|dneh\b|min\b|minut|kg\b|km\b|oseb|%|t\b|l\b|m\b))`;

const HOURS_RE = new RegExp(
  [
    // 1–2: day range
    String.raw`(?:\b(?:od|from)\s+)?\b(${DAY_ANY})\b\.?\s*(?:[-–—]|\bdo\b|\bto\b|\bthrough\b|\btill\b|\buntil\b)\s*\b(${DAY_ANY})\b\.?`,
    // 3: day groups
    String.raw`\b(med tednom|(?:ob )?delavnik\w*|delovn\w* dn\w*|delovni dan|vikend\w*|kon(?:ec|cu|cih|ce) tedna|vsak dan|vse dni|vsak(?:i|o)? dan v tednu|every day|daily|weekdays?|weekends?)\b`,
    // 4: one day, written out
    String.raw`\b(${FULL_ALT})\b`,
    // 5: one day, abbreviated (pet and sob are also words, so only right before a time)
    String.raw`\b(pon|tor|sre|cet|ned)\b\.?|\b(pet|sob)\b\.?(?=\s*:?\s*\d)`,
    // 7–12: time range
    String.raw`(?:\b(?:od|from)\s+)?${T}${TIME_TO}${T}(?:\s*(?:h|ure|uri|ura)\b)?${NOT_PRICE}`,
    // 13–16: one time with "od"/"do" (from/until); needs minutes, h or "ure"
    String.raw`\b(od|from|do|until|till|ob|at)\s+(?<![\d.,:])(\d{1,2})(?:[.:](\d{2})|(\s?h\b)|\.?\s*ur[aei]\b)(?!\d)${NOT_PRICE}`,
    // 17: closed or by appointment
    String.raw`\b(zaprt\w*|closed|ne delamo|ne obratujemo|po dogovoru|po narocilu|by appointment)\b`,
  ].join("|"),
  "g",
);

const pad = (h: string, m: string | undefined) => `${h.padStart(2, "0")}:${m ?? "00"}`;
const validTime = (h: string, m: string | undefined) => Number(h) <= 24 && Number(m ?? 0) <= 59;

export interface TimeStatement {
  open?: string;
  close?: string;
  /** "ob 7.00": a time, neither clearly opening nor closing. */
  at?: string;
  /** Minutes or an "h" were written, so it reads as a time without a day next to it. */
  explicit: boolean;
  start: number;
  end: number;
  raw: string;
  /** The opening and closing time as written ("9", "8.00"), for messages. */
  openRaw?: string;
  closeRaw?: string;
}

export interface HoursParse {
  /** Times paired with the days they were given for. */
  paired: { days: Day[]; time: TimeStatement }[];
  /** Times without a day. */
  unpaired: TimeStatement[];
}

type HoursEvent = { kind: "days"; days: Day[] } | { kind: "time"; time: TimeStatement } | { kind: "closed" };

/** Hours segments: sentences and paragraphs (a day list and its times may span a line break). */
function hoursSegments(text: string): { start: number; text: string }[] {
  const out: { start: number; text: string }[] = [];
  const re = /\n\s*\n|[.!?](?=\s+[A-ZČŠŽĆĐ])/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    out.push({ start: last, text: text.slice(last, m.index + m[0].length) });
    last = m.index + m[0].length;
  }
  out.push({ start: last, text: text.slice(last) });
  return out;
}

function events(seg: string, offset: number): HoursEvent[] {
  const out: HoursEvent[] = [];
  for (const m of fold(seg).matchAll(HOURS_RE)) {
    const g = m.slice(1);
    if (g[0] && g[1]) {
      const a = dayOf(g[0]);
      const b = dayOf(g[1]);
      if (a && b) out.push({ kind: "days", days: dayRange(a, b) });
    } else if (g[2]) {
      const w = g[2];
      out.push({ kind: "days", days: /vikend|kon\w* tedna|weekend/.test(w) ? ["sat", "sun"] : /vsak|vse dni|every|daily/.test(w) ? [...WEEK] : WEEK.slice(0, 5) });
    } else if (g[3] || g[4] || g[5]) {
      const d = dayOf(g[3] ?? g[4] ?? g[5]!);
      if (d) out.push({ kind: "days", days: [d] });
    } else if (g[6]) {
      const [h1, m1, s1, h2, m2, s2] = [g[6], g[7], g[8], g[9], g[10], g[11]];
      if (!validTime(h1, m1) || !validTime(h2!, m2)) continue;
      const explicit = !!(m1 || m2 || /h/.test(s1 ?? "") || /h/.test(s2 ?? "") || /\b(ure|uri|ura)\b/.test(m[0]));
      const time: TimeStatement = { open: pad(h1, m1), close: pad(h2!, m2), explicit, start: offset + m.index, end: offset + m.index + m[0].length, raw: m[0].trim() };
      time.openRaw = m1 ? `${h1}.${m1}` : h1;
      time.closeRaw = m2 ? `${h2}.${m2}` : h2;
      out.push({ kind: "time", time });
    } else if (g[12]) {
      const [word, h, mm] = [g[12], g[13]!, g[14]];
      if (!validTime(h, mm)) continue;
      const t = pad(h, mm);
      const raw = m[0].slice(word.length).trim();
      const time: TimeStatement = { explicit: true, start: offset + m.index + m[0].length - raw.length, end: offset + m.index + m[0].length, raw };
      const written = mm ? `${h}.${mm}` : h;
      if (/^(od|from)$/.test(word)) [time.open, time.openRaw] = [t, written];
      else if (/^(do|until|till)$/.test(word)) [time.close, time.closeRaw] = [t, written];
      else [time.at, time.openRaw] = [t, written];
      out.push({ kind: "time", time });
    } else if (g[16]) {
      out.push({ kind: "closed" });
    }
  }
  return out;
}

/**
 * Times in a text and the days they belong to. Days come before their times ("pon–pet 8–16,
 * sob 8–12"; "ponedeljek in sreda od 12.00 do 19.00"); a time right after another one keeps the
 * same days (split shifts). A text that starts with a time pairs each day list with the time before it.
 */
export function parseHours(text: string): HoursParse {
  const paired: HoursParse["paired"] = [];
  const unpaired: TimeStatement[] = [];
  for (const seg of hoursSegments(text)) {
    const ev = events(seg.text, seg.start);
    const first = ev.find((e) => e.kind !== "closed");
    if (first?.kind === "time") {
      let last: TimeStatement | null = null;
      let used = false;
      for (const e of ev) {
        if (e.kind === "time") {
          if (last && !used) unpaired.push(last);
          last = e.time;
          used = false;
        } else if (e.kind === "days") {
          if (last) {
            paired.push({ days: e.days, time: last });
            used = true;
          }
        } else last = null;
      }
      if (last && !used) unpaired.push(last);
      continue;
    }
    let pending: Day[] = [];
    let current: Day[] = [];
    for (const e of ev) {
      if (e.kind === "days") pending = [...new Set([...pending, ...e.days])];
      else if (e.kind === "closed") {
        pending = [];
        current = [];
      } else {
        const days = pending.length ? pending : current;
        if (days.length) paired.push({ days, time: e.time });
        else unpaired.push(e.time);
        current = days;
        pending = [];
      }
    }
  }
  return { paired, unpaired };
}

export interface ClientHours {
  starts: Map<Day, Set<string>>;
  ends: Map<Day, Set<string>>;
  /** Every time the client wrote with minutes or an "h", paired or not. */
  any: Set<string>;
}

export function clientHours(corpus: string): ClientHours {
  const starts = new Map<Day, Set<string>>(WEEK.map((d) => [d, new Set<string>()]));
  const ends = new Map<Day, Set<string>>(WEEK.map((d) => [d, new Set<string>()]));
  const any = new Set<string>();
  const { paired, unpaired } = parseHours(corpus);
  for (const p of paired) {
    for (const d of p.days) {
      if (p.time.open) starts.get(d)!.add(p.time.open);
      if (p.time.close) ends.get(d)!.add(p.time.close);
    }
    for (const t of [p.time.open, p.time.close, p.time.at]) if (t) any.add(t);
  }
  for (const u of unpaired) if (u.explicit) for (const t of [u.open, u.close, u.at]) if (t) any.add(t);
  for (const t of clockTimes(corpus)) any.add(t.time);
  return { starts, ends, any };
}

/** Plain clock times anywhere ("prihod je od 14.00", "ob 7.30", "8h"): minutes or an "h" needed. */
export function clockTimes(text: string): { time: string; start: number; end: number; raw: string }[] {
  const f = fold(text);
  const out: { time: string; start: number; end: number; raw: string }[] = [];
  for (const m of f.matchAll(new RegExp(`${T}${NOT_PRICE}`, "g"))) {
    if (!(m[2] || /h/.test(m[3] ?? "")) || !validTime(m[1]!, m[2]) || /^\.\d/.test(f.slice(m.index + m[0].length))) continue;
    out.push({ time: pad(m[1]!, m[2]), start: m.index, end: m.index + m[0].length, raw: m[0].trim() });
  }
  return out;
}

/** Whether the client gave this opening (and closing) time for every one of these days. */
export function hoursPaired(days: Day[], open: string | undefined, close: string | undefined, h: ClientHours): { open: boolean; close: boolean } {
  return {
    open: !open || days.every((d) => h.starts.get(d)!.has(open)),
    close: !close || days.every((d) => h.ends.get(d)!.has(close)),
  };
}

export { dayRange };
