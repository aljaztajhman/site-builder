// The checks every fixture group shares: a brief's facts against its description (fixtures, twins, hard, final10).
import { expect, it } from "vitest";
import { MissingFact, type Fixture, type FixtureBrief } from "../src/fixtures/schema.ts";

export const ws = (s: string) => s.replace(/\s+/g, " ").trim();
export const lower = (s: string) => ws(s).toLowerCase();
export const noWs = (s: string) => s.replace(/\s+/g, "");

/** Slovene phone numbers as written by people ("041 555 213", "04 555 12 34", "+386 41 …") → E.164. */
export function phonesIn(text: string): string[] {
  const re = /(?<![\w+])(?:\+386[\s/.-]?|0)[1-9](?:[\s/.-]?\d){6,7}(?!\d)/g;
  return [...text.matchAll(re)].map((m) => {
    const d = m[0].replace(/\D/g, "");
    return d.startsWith("386") ? `+${d}` : `+386${d.slice(1)}`;
  });
}

/** Clock times ("8.00", "6.30", "19:00") → "HH:MM". Decimal commas ("3,5 t", "4,20 €") are not times. */
export function timesIn(text: string): string[] {
  const re = /(?<![\d,.])([01]?\d|2[0-3])[.:]([0-5]\d)(?!\d|[,.]\d)/g;
  return [...text.matchAll(re)].map((m) => `${m[1]!.padStart(2, "0")}:${m[2]}`);
}

/** Euro amounts ("28 €", "11,50 €", "30 eur") → numbers. */
export function eurosIn(text: string): number[] {
  const re = /(\d+(?:,\d{1,2})?)\s*(?:€|eur\b)/gi;
  return [...text.matchAll(re)].map((m) => Number(m[1]!.replace(",", ".")));
}

export const emailsIn = (text: string) => [...text.matchAll(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g)].map((m) => m[0]);
export const urlsIn = (text: string) => [...text.matchAll(/https?:\/\/[^\s),]+/g)].map((m) => m[0].replace(/\.$/, ""));
/** Registration (7/10 digit) and tax (8 digit, optional SI) numbers. */
export const legalNumbersIn = (text: string) =>
  [...noWs(text).matchAll(/(?<!\d)(?:SI)?\d{8}(?:\d{2})?(?!\d)/g)].map((m) => m[0]);

export function absent(b: FixtureBrief, key: MissingFact): boolean {
  if (key === "photos") return b.photos.length === 0;
  return b.facts[key] === undefined;
}

export function factTests(f: Fixture) {
  const b = f.brief;
  const d = b.description;

  it("marks exactly the absent facts as missing", () => {
      for (const key of MissingFact.options) {
        expect(b.missing.includes(key), `missing "${key}" vs facts`).toBe(absent(b, key));
      }
    });

    it("states every fact literally in the description", () => {
      expect(ws(d)).toContain(ws(b.facts.name));
      if (b.facts.phone) expect(phonesIn(d)).toContain(b.facts.phone);
      if (b.facts.email) expect(d).toContain(b.facts.email);
      if (b.facts.bookingUrl) expect(d).toContain(b.facts.bookingUrl);
      if (b.facts.address) {
        expect(ws(d)).toContain(b.facts.address.street);
        expect(ws(d)).toContain(`${b.facts.address.postalCode} ${b.facts.address.city}`);
      }
      const times = timesIn(d);
      for (const h of b.facts.hours ?? []) {
        if (h.open) expect(times).toContain(h.open);
        if (h.close) expect(times).toContain(h.close);
      }
      const euros = eurosIn(d);
      for (const p of b.facts.prices ?? []) {
        expect(lower(d)).toContain(lower(p.item));
        expect(euros).toContain(p.amount);
      }
      for (const p of b.facts.people ?? []) expect(ws(d)).toContain(p.name);
      for (const v of Object.values(b.facts.legal ?? {})) expect(noWs(d)).toContain(noWs(v));
      for (const o of b.facts.other ?? []) expect(lower(d)).toContain(lower(o));
    });

    it("lists every phone, email, URL, price, hour and legal number of the description in facts", () => {
      expect(new Set(phonesIn(d))).toEqual(new Set(b.facts.phone ? [b.facts.phone] : []));
      expect(new Set(emailsIn(d))).toEqual(new Set(b.facts.email ? [b.facts.email] : []));
      expect(new Set(urlsIn(d))).toEqual(new Set(b.facts.bookingUrl ? [b.facts.bookingUrl] : []));
      expect(new Set(eurosIn(d))).toEqual(new Set((b.facts.prices ?? []).map((p) => p.amount)));
      const known = new Set([
        ...(b.facts.hours ?? []).flatMap((h) => [h.open, h.close]),
        ...(b.facts.other ?? []).flatMap(timesIn),
      ]);
      for (const t of timesIn(d)) expect(known, `time ${t}`).toContain(t);
      const legal = b.facts.legal ?? {};
      expect(new Set(legalNumbersIn(d))).toEqual(
        new Set([legal.registrationNumber, legal.taxNumber].filter((v): v is string => Boolean(v))),
      );
    });
}
