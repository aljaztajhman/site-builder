import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BusinessType, SECTION_DEFS } from "@sb/spec";
import { loadFixtures, loadHard, loadTwins } from "../src/fixtures/load.ts";
import { HARD_PROMPTS_FILE, fullPrompt, loadPhotoPrompts, photoKey } from "../src/fixtures/photo-prompts.ts";
import { HardCase, MissingFact, SECTION_TYPES, type Fixture, type FixtureBrief } from "../src/fixtures/schema.ts";

const fixtures = loadFixtures();

const ws = (s: string) => s.replace(/\s+/g, " ").trim();
const lower = (s: string) => ws(s).toLowerCase();
const noWs = (s: string) => s.replace(/\s+/g, "");

/** Slovene phone numbers as written by people ("041 555 213", "04 555 12 34", "+386 41 …") → E.164. */
function phonesIn(text: string): string[] {
  const re = /(?<![\w+])(?:\+386[\s/.-]?|0)[1-9](?:[\s/.-]?\d){6,7}(?!\d)/g;
  return [...text.matchAll(re)].map((m) => {
    const d = m[0].replace(/\D/g, "");
    return d.startsWith("386") ? `+${d}` : `+386${d.slice(1)}`;
  });
}

/** Clock times ("8.00", "6.30", "19:00") → "HH:MM". Decimal commas ("3,5 t", "4,20 €") are not times. */
function timesIn(text: string): string[] {
  const re = /(?<![\d,.])([01]?\d|2[0-3])[.:]([0-5]\d)(?!\d|[,.]\d)/g;
  return [...text.matchAll(re)].map((m) => `${m[1]!.padStart(2, "0")}:${m[2]}`);
}

/** Euro amounts ("28 €", "11,50 €", "30 eur") → numbers. */
function eurosIn(text: string): number[] {
  const re = /(\d+(?:,\d{1,2})?)\s*(?:€|eur\b)/gi;
  return [...text.matchAll(re)].map((m) => Number(m[1]!.replace(",", ".")));
}

const emailsIn = (text: string) => [...text.matchAll(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g)].map((m) => m[0]);
const urlsIn = (text: string) => [...text.matchAll(/https?:\/\/[^\s),]+/g)].map((m) => m[0].replace(/\.$/, ""));
/** Registration (7/10 digit) and tax (8 digit, optional SI) numbers. */
const legalNumbersIn = (text: string) =>
  [...noWs(text).matchAll(/(?<!\d)(?:SI)?\d{8}(?:\d{2})?(?!\d)/g)].map((m) => m[0]);

function absent(b: FixtureBrief, key: MissingFact): boolean {
  if (key === "photos") return b.photos.length === 0;
  return b.facts[key] === undefined;
}

describe("eval fixtures", () => {
  it("loads 10 valid fixtures, exactly one per business type", () => {
    expect(fixtures).toHaveLength(10);
    const types = fixtures.map((f) => f.brief.businessType).sort();
    expect(types).toEqual([...BusinessType.options].sort());
  });

  it("covers missing prices, hours and photos across at least 3 fixtures", () => {
    const withMissing = fixtures.filter((f) => f.brief.missing.length > 0);
    expect(withMissing.length).toBeGreaterThanOrEqual(3);
    const covered = new Set(fixtures.flatMap((f) => f.brief.missing));
    for (const k of ["prices", "hours", "photos"] as const) expect(covered).toContain(k);
  });

  it("varies photo counts (0, 1, 3, 5, 8) and ships 2–3 logos", () => {
    const counts = new Set(fixtures.map((f) => f.brief.photos.length));
    for (const n of [0, 1, 3, 5, 8]) expect(counts).toContain(n);
    const logos = fixtures.filter((f) => f.logoPath);
    expect(logos.length).toBeGreaterThanOrEqual(2);
    expect(logos.length).toBeLessThanOrEqual(3);
    for (const f of logos) expect(readFileSync(f.logoPath!, "utf8")).toMatch(/^<svg[\s>]/);
  });

  it("uses only fictional phone blocks and reserved email domains", () => {
    for (const f of fixtures) {
      const all = [f.brief.description, ...f.edits.map((e) => e.message)].join("\n");
      for (const p of phonesIn(all)) expect(p, `${f.id}: ${p}`).toMatch(/^\+386(\d555\d{4}|\d{2}555\d{3})$/);
      for (const e of emailsIn(all)) expect(e, `${f.id}: ${e}`).toMatch(/\.example$/);
    }
  });

  describe.each(fixtures.map((f) => [f.id, f] as const))("%s", (_id, f) => {
    factTests(f);

    it("has five edits with checks that fit the fixture", () => {
      const b = f.brief;
      expect(f.edits).toHaveLength(5);
      for (const e of f.edits) {
        const c = e.check;
        if (c.kind === "equals" && c.path === "/business/phone") {
          expect(phonesIn(e.message)).toContain(c.value);
          expect(c.value).not.toBe(b.facts.phone);
        }
        if (c.kind === "equals" && c.path === "/business/email") expect(e.message).toContain(c.value);
        if (c.kind === "equals" && c.path.startsWith("/business/provider/")) {
          expect(noWs(e.message)).toContain(String(c.value));
        }
        if (c.kind === "noSectionType" && c.type === "gallery") expect(b.photos.length).toBeGreaterThanOrEqual(3);
        // The amounts that must not land are the ones the message gives.
        if (c.kind === "pricePlaceholders") for (const a of c.amounts) expect(e.message).toContain(`${a} €`);
      }
    });

    it("has photo subjects for files that the generator writes", () => {
      f.brief.photos.forEach((p, i) => expect(p.file).toBe(`photos/${String(i + 1).padStart(2, "0")}.jpg`));
      expect(existsSync(f.dir)).toBe(true);
    });
  });

  it("names only section types that exist in the component catalogue", () => {
    const known = new Set(SECTION_DEFS.map((s) => s.type));
    for (const t of SECTION_TYPES) expect(known, t).toContain(t);
  });

  it("mixes Slovene and English edits (each at least 40 %)", () => {
    const edits = fixtures.flatMap((f) => f.edits);
    expect(edits).toHaveLength(50);
    const en = edits.filter((e) => e.lang === "en").length / edits.length;
    expect(en).toBeGreaterThanOrEqual(0.4);
    expect(1 - en).toBeGreaterThanOrEqual(0.4);
  });

  it("covers the required edit kinds across the suite", () => {
    const checks = fixtures.flatMap((f) => f.edits.map((e) => e.check));
    const kinds = new Set(checks.map((c) => c.kind));
    for (const k of ["colorWarmer", "colorDarker", "hasSectionType", "noSectionType", "equals", "textContains"]) {
      expect(kinds).toContain(k);
    }
    expect(checks.some((c) => c.kind === "hasSectionType" && c.type === "faq")).toBe(true);
    expect(checks.some((c) => c.kind === "noSectionType" && c.type === "gallery")).toBe(true);
    expect(checks.some((c) => c.kind === "equals" && c.path === "/business/phone")).toBe(true);
  });
});

/**
 * The twins (docs/plans/variety-engine.md, Step 0): 3 more car repair shops, hairdressers and restaurants, and an
 * electrician, a carpenter and a florist, each beside the fixture of its type; at least one without photos per group.
 */
describe("twin fixtures", () => {
  const twins = loadTwins();
  const byId = new Map(fixtures.map((f) => [f.id, f]));

  it("12 twins: 3 car repair, 3 hairdressers, 3 restaurants, an electrician, a carpenter and a florist", () => {
    expect(twins).toHaveLength(12);
    const count = (t: string) => twins.filter((x) => x.brief.businessType === t).length;
    expect([count("car-repair"), count("hairdresser"), count("restaurant"), count("builder"), count("shop")]).toEqual([3, 3, 3, 2, 1]);
    expect(twins.filter((x) => x.brief.businessType === "builder").map((x) => x.brief.trade).sort()).toEqual(["elektro", "mizar"]);
    expect(twins.find((x) => x.brief.businessType === "shop")?.brief.trade).toBe("cvetličarna");
  });

  it("each beside a fixture of its own type; a group without photos and one with a blue logo", () => {
    for (const t of twins) expect(byId.get(t.brief.twinOf!)?.brief.businessType, t.id).toBe(t.brief.businessType);
    for (const type of ["car-repair", "hairdresser", "restaurant", "builder", "shop"]) {
      expect(twins.some((t) => t.brief.businessType === type && t.photos.length === 0), type).toBe(true);
    }
    const logo = twins.find((t) => t.logoPath && t.brief.businessType === "car-repair");
    expect(readFileSync(logo!.logoPath!, "utf8")).toMatch(/fill="#1f4e9c"/);
  });

  it("reuses the fixtures' committed photos (no copies)", () => {
    for (const t of twins) {
      for (const p of t.photos) {
        expect(p.from, `${t.id} ${p.file}`).toBeDefined();
        expect(existsSync(p.path), `${t.id} ${p.path}`).toBe(true);
        expect(byId.get(p.from!)!.brief.photos.find((x) => x.file === p.file)?.subject).toBe(p.subject);
      }
    }
  });

  it("uses only fictional phone blocks and reserved email domains", () => {
    for (const t of twins) {
      for (const p of phonesIn(t.brief.description)) expect(p, `${t.id}: ${p}`).toMatch(/^\+386(\d555\d{4}|\d{2}555\d{3})$/);
      for (const e of emailsIn(t.brief.description)) expect(e, `${t.id}: ${e}`).toMatch(/\.example$/);
    }
  });

  describe.each(twins.map((f) => [f.id, f] as const))("%s", (_id, f) => {
    factTests(f);
  });
});

/**
 * The hard fixtures (docs/plans/design-studio.md §8, F6): 18 businesses for the weak cases, a group of their own like the
 * twins, so `pnpm eval --offline` and CI never load them. Their photos are a shot list until a paid run makes them.
 */
describe("hard fixtures", () => {
  const hard = loadHard();
  const twins = loadTwins();
  const prompts = loadPhotoPrompts(HARD_PROMPTS_FILE);
  const keys = hard.flatMap((f) => f.photos.map((p) => photoKey(f.id, p.file)));
  const withCase = (c: HardCase) => hard.filter((f) => f.brief.hard?.includes(c));
  const englishWords = (d: string) => (d.match(/\b(the|and|we|with|from|every|our|of|is|are)\b/gi) ?? []).length;

  it("18 of them, every one tagged, none sharing an id with a fixture or a twin", () => {
    expect(hard).toHaveLength(18);
    for (const f of hard) expect(f.brief.hard?.length, f.id).toBeGreaterThan(0);
    const ids = [...fixtures, ...twins, ...hard].map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(fixtures.length + twins.length + hard.length).toBe(40);
  });

  it("covers each weak case the plan names, as often as it asks", () => {
    const count = (c: HardCase) => withCase(c).length;
    expect(Object.fromEntries(HardCase.options.filter((c) => c !== "new-trade").map((c) => [c, count(c)]))).toEqual({
      "no-logo": 3,
      "no-photos": 3,
      "dark-photos": 2,
      "one-photo": 2,
      "long-name": 1,
      "many-prices": 1,
      english: 1,
    });
    const trades = withCase("new-trade").map((f) => f.brief.trade);
    for (const t of ["cvetličarna", "joga", "fotograf", "veterina", "avtošola", "čiščenje", "ključavničar", "inštrukcije"]) expect(trades).toContain(t);
  });

  it("each fixture is the case it is tagged with", () => {
    for (const f of withCase("no-logo")) expect(f.logoPath, f.id).toBeNull();
    for (const f of withCase("no-photos")) expect(f.photos, f.id).toHaveLength(0);
    for (const f of withCase("one-photo")) expect(f.photos, f.id).toHaveLength(1);
    for (const f of withCase("dark-photos")) {
      expect(f.photos.length, f.id).toBeGreaterThan(0);
      for (const p of f.photos) {
        expect(prompts.poor, `${f.id} ${p.file}`).toContain(photoKey(f.id, p.file));
        expect(p.subject).toMatch(/^temna fotografija s telefonom: /);
      }
    }
    for (const f of withCase("long-name")) expect(f.brief.facts.name.length, f.id).toBeGreaterThanOrEqual(40);
    for (const f of withCase("many-prices")) expect(f.brief.facts.prices?.length, f.id).toBeGreaterThanOrEqual(20);
    for (const f of withCase("english")) {
      expect(f.brief.businessType, f.id).toBe("tourist-farm");
      expect(englishWords(f.brief.description), f.id).toBeGreaterThanOrEqual(10);
    }
    // The others are Slovene: an English word now and then, no English paragraph.
    for (const f of hard.filter((x) => !x.brief.hard?.includes("english"))) expect(englishWords(f.brief.description), f.id).toBeLessThan(5);
    const trades = withCase("new-trade").map((f) => f.brief.trade);
    expect(new Set(trades).size).toBe(trades.length);
    for (const t of trades) expect(t).toBeDefined();
  });

  it("ships simple SVG logos where the owner has one", () => {
    const logos = hard.filter((f) => f.logoPath);
    expect(logos.length).toBeGreaterThanOrEqual(5);
    for (const f of logos) {
      const svg = readFileSync(f.logoPath!, "utf8");
      expect(svg, f.id).toMatch(/^<svg[\s>]/);
      expect(svg, f.id).not.toMatch(/href|<image|<script|url\(/);
    }
  });

  it("has a shot list prompt for every planned photo and nothing else; the dark ones get the poor style", () => {
    expect(Object.keys(prompts.photos).sort()).toEqual([...keys].sort());
    expect(prompts.compare).toEqual([]);
    for (const k of prompts.poor ?? []) expect(keys).toContain(k);
    const dark = prompts.poor![0]!;
    expect(fullPrompt(prompts, dark).endsWith(prompts.poorStyle!)).toBe(true);
    expect(prompts.poorStyle).toMatch(/dark/i);
    expect(prompts.poorStyle).toMatch(/no text/i);
    const fine = keys.find((k) => !prompts.poor!.includes(k))!;
    expect(fullPrompt(prompts, fine).endsWith(prompts.style)).toBe(true);
    // The paid step's size: what the shot list will cost at about €0.068 a picture.
    expect(keys).toHaveLength(32);
  });

  it("uses only fictional phone blocks and reserved email domains", () => {
    for (const f of hard) {
      for (const p of phonesIn(f.brief.description)) expect(p, `${f.id}: ${p}`).toMatch(/^\+386(\d555\d{4}|\d{2}555\d{3})$/);
      for (const e of emailsIn(f.brief.description)) expect(e, `${f.id}: ${e}`).toMatch(/\.example$/);
    }
  });

  describe.each(hard.map((f) => [f.id, f] as const))("%s", (_id, f) => {
    factTests(f);

    it("has no scripted edits and numbers its photos from 01", () => {
      expect(f.edits).toEqual([]);
      f.brief.photos.forEach((p, i) => expect(p.file).toBe(`photos/${String(i + 1).padStart(2, "0")}.jpg`));
      for (const p of f.photos) expect(p.from, `${f.id} ${p.file}`).toBeUndefined();
    });
  });
});

function factTests(f: Fixture) {
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
