import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Day, SiteSpec } from "@sb/spec";
import { checkFacts, typedText } from "../src/index.ts";
import { clientHours, dayRange, hoursPaired, parseHours, priceMentions, pricePaired, sameWord } from "../src/fact-pairing.ts";

const evalDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../tools/eval");

/** A minimal valid-shaped spec: business facts plus one home page with the given sections. */
function spec(over: { business?: Partial<SiteSpec["business"]>; sections?: unknown[]; translations?: unknown } = {}): SiteSpec {
  return {
    business: {
      name: "Frizerstvo Lana",
      type: "hairdresser",
      phone: { $placeholder: "phone" },
      email: { $placeholder: "email" },
      address: { $placeholder: "address" },
      provider: { legalName: { $placeholder: "legalName" }, registrationNumber: { $placeholder: "registrationNumber" }, taxNumber: { $placeholder: "taxNumber" } },
      ...over.business,
    },
    pages: [{ id: "p_home", kind: "home", slug: "", sections: over.sections ?? [] }],
    ...(over.translations ? { locales: { default: "sl", enabled: ["sl", "en"] }, translations: over.translations } : {}),
  } as unknown as SiteSpec;
}

const priceList = (items: { name: string; amount: number; note?: string }[], group?: string) => ({
  id: "s_prices",
  type: "price-list",
  props: { title: "Cenik", groups: [{ ...(group ? { name: group } : {}), items: items.map((i) => ({ name: i.name, ...(i.note ? { note: i.note } : {}), price: { amount: i.amount } })) }] },
});
const text = (...paragraphs: string[]) => ({ id: "s_text", type: "text", props: { title: "O nas", paragraphs } });
const hours = (...entries: { from: Day; to: Day; open?: string; close?: string; closed?: boolean }[]) => ({ entries });
const found = (s: SiteSpec, corpus: string) => checkFacts(s, corpus).map((v) => `${v.kind}:${v.value}`);

describe("price pairing", () => {
  it("rejects €16 that only appears in the hours 8–16", () => {
    const corpus = "Frizerstvo Lana. Odprto pon–pet 8–16. Moško striženje 15 €.";
    expect(found(spec({ sections: [priceList([{ name: "Moško striženje", amount: 16 }])] }), corpus)).toContain("price:16");
    expect(found(spec({ sections: [text("Moško striženje že za 16 €.")] }), corpus)).toContain("price:16");
    // The same text's real price and hours pass.
    expect(found(spec({ business: { hours: hours({ from: "mon", to: "fri", open: "08:00", close: "16:00" }) }, sections: [priceList([{ name: "Moško striženje", amount: 15 }])] }), corpus)).toEqual([]);
  });

  it("rejects a price the client gave for another offering", () => {
    const corpus = "Frizerstvo Lana. Cene: žensko striženje s fenom 28 €, moško striženje 15 €, otroško striženje (do 10 let) 10 €.";
    const wrong = checkFacts(spec({ sections: [priceList([{ name: "Moško striženje", amount: 28 }])] }), corpus);
    expect(wrong.map((v) => `${v.kind}:${v.value}`)).toEqual(["price:28"]);
    expect(wrong[0]!.detail).toMatch(/something else/);
    expect(found(spec({ sections: [text("Moško striženje stane 28 €.")] }), corpus)).toContain("price:28");
    // Each at its own price, group name and inflection tolerated.
    const right = priceList(
      [
        { name: "Žensko", amount: 28, note: "s fenom" },
        { name: "Moško", amount: 15 },
        { name: "Otroško striženje", amount: 10, note: "do 10 let" },
      ],
      "Striženje",
    );
    expect(found(spec({ sections: [right, text("Moško striženje za 15 €, žensko s fenom 28 €.")] }), corpus)).toEqual([]);
  });

  it("rejects a price for an offering the client priced nowhere, and numbers from other roles", () => {
    const corpus = "Avtoservis Mrak, Savska cesta 52, 4000 Kranj, od leta 2008. Tel. 041 555 730. Diagnostika 30 eur.";
    const s = spec({
      business: { name: "Avtoservis Mrak" },
      sections: [
        priceList([
          { name: "Diagnostika", amount: 30 },
          { name: "Menjava olja", amount: 52 },
          { name: "Polnjenje klime", amount: 730 },
          { name: "Vulkanizerstvo", amount: 2008 },
          { name: "Hramba gum", amount: 40 },
        ]),
        text("Več kot 730 zadovoljnih strank."),
      ],
    });
    expect(found(s, corpus).sort()).toEqual(["number:730", "price:2008", "price:40", "price:52", "price:730"]);
  });

  it("reads Slovene price formats and inflected offering names", () => {
    const corpus = [
      "Gostilna. Vsak dan pripravimo dnevno malico (juha, glavna jed, solata) za 11,50 €, ob nedeljah pa nedeljsko kosilo za 19 EUR.",
      "Ajdove žgance z ocvirki dobite za 9,80 evrov, ričet za € 7.",
      "Pogostitev za skupino 1.200 €. Jabolčni zavitek 3,- €.",
      "Nekaj cen:\nnočitev z zajtrkom 38 € na osebo\npolpenzion 45–52 € na osebo",
    ].join("\n");
    const items = [
      { name: "Dnevna malica", amount: 11.5 },
      { name: "Nedeljsko kosilo", amount: 19 },
      { name: "Ajdovi žganci z ocvirki", amount: 9.8 },
      { name: "Ričet", amount: 7 },
      { name: "Pogostitev za skupine", amount: 1200 },
      { name: "Jabolčni zavitek", amount: 3 },
      { name: "Nočitev z zajtrkom", amount: 38 },
      { name: "Polpenzion", amount: 52 },
      { name: "Polpenzion (otroci)", amount: 45 },
    ];
    expect(found(spec({ business: { name: "Gostilna" }, sections: [priceList(items)] }), corpus)).toEqual([]);
    expect(priceMentions(corpus).map((m) => m.amount)).toEqual([11.5, 19, 9.8, 7, 1200, 3, 38, 45, 52]);
  });

  it("takes the name after the price when nothing names it before", () => {
    const m = priceMentions("Cenik:\n15 € moško striženje\n28 € žensko striženje");
    expect(m.map((x) => `${x.amount}:${x.words.join(" ")}`)).toEqual(["15:mosko strizenje", "28:zensko strizenje"]);
    expect(pricePaired(28, "Žensko striženje", "", m)).toBe(true);
    expect(pricePaired(15, "Žensko striženje", "", m)).toBe(false);
    const lines = priceMentions("Cenik\nMoško striženje\nCena: 15 €\nŽensko striženje\nCena: 28 €");
    expect(lines.map((x) => `${x.amount}:${x.words.join(" ")}`)).toEqual(["15:mosko strizenje", "28:zensko strizenje"]);
  });

  it("lets copy that names nothing the client priced use only the client's amounts", () => {
    const corpus = "Frizerstvo Lana. Moško striženje 15 €, žensko 28 €.";
    expect(found(spec({ sections: [text("Cene že od 15 €.")] }), corpus)).toEqual([]);
    expect(found(spec({ sections: [text("Cene že od 12 €.")] }), corpus)).toEqual(["price:12"]);
  });

  it("checks English translations of priced items by amount, not by the translated name", () => {
    const corpus = "Frizerstvo Lana. Moško striženje 15 €.";
    const s = spec({
      sections: [priceList([{ name: "Moško striženje", amount: 15 }]), text("Moško striženje 15 €.")],
      translations: { en: { "/pages/0/sections/0/props/groups/0/items/0/name": "Men's haircut", "/pages/0/sections/1/props/paragraphs/0": "Men's haircut 15 €, colouring 40 €." } },
    });
    expect(found(s, corpus)).toEqual(["price:40"]);
  });

  it("matches words up to Slovene inflection, not unrelated words that share a start", () => {
    for (const [a, b] of [["malica", "malico"], ["dnevna", "dnevno"], ["kruh", "kruha"], ["gum", "gume"], ["olje", "olja"], ["rogljicek", "rogljicki"], ["terapija", "terapij"], ["nocitev", "nocitve"], ["zensko", "zenske"]]) expect(sameWord(a!, b!), `${a} ${b}`).toBe(true);
    for (const [a, b] of [["kos", "kosilo"], ["terapija", "terasa"], ["polnjenje", "polnozrnate"], ["sol", "solata"], ["paket", "pasta"], ["terapija", "terapevtske"]]) expect(sameWord(a!, b!), `${a} ${b}`).toBe(false);
  });
});

describe("hours pairing", () => {
  const corpus = "Frizerstvo Lana. Odprto od ponedeljka do petka od 8.00 do 16.00, v soboto od 8.00 do 12.00, ob nedeljah zaprto.";

  it("rejects hours the client gave for another day", () => {
    const sat = checkFacts(spec({ business: { hours: hours({ from: "sat", to: "sat", open: "08:00", close: "16:00" }) } }), corpus);
    expect(sat.map((v) => `${v.path}:${v.value}`)).toEqual(["/business/hours/entries/0:16:00"]);
    expect(sat[0]!.detail).toMatch(/these days/);
    expect(found(spec({ business: { hours: hours({ from: "mon", to: "sat", open: "08:00", close: "16:00" }) } }), corpus)).toEqual(["hours:16:00"]);
    expect(found(spec({ business: { hours: hours({ from: "sun", to: "sun", open: "08:00", close: "12:00" }) } }), corpus)).toEqual(["hours:08:00", "hours:12:00"]);
    expect(found(spec({ sections: [text("Ob sobotah smo odprti od 8.00 do 16.00.")] }), corpus)).toEqual(["hours:16.00"]);
  });

  it("accepts the client's day range, also split into smaller ranges", () => {
    const right = hours(
      { from: "mon", to: "wed", open: "08:00", close: "16:00" },
      { from: "thu", to: "fri", open: "08:00", close: "16:00" },
      { from: "sat", to: "sat", open: "08:00", close: "12:00" },
      { from: "sun", to: "sun", closed: true },
    );
    expect(found(spec({ business: { hours: right }, sections: [text("Med tednom od 8.00 do 16.00, v soboto do 12.00.", "Odprto od 8.00.")] }), corpus)).toEqual([]);
  });

  it("rejects an hour that only appears in a phone number, an address or a year", () => {
    const other = "Frizerstvo Lana, Cesta 9, od leta 2019. Tel. 041 555 717. Odprto pon–pet od 8.00 do 16.00.";
    expect(found(spec({ business: { hours: hours({ from: "mon", to: "fri", open: "09:00", close: "17:00" }) } }), other)).toEqual(["hours:09:00", "hours:17:00"]);
  });

  it("reads Slovene and English day and time formats", () => {
    const cases: [string, Day[], string, string][] = [
      ["Odprto pon–pet 8.00–16.00.", ["mon", "tue", "wed", "thu", "fri"], "08:00", "16:00"],
      ["Odprto pon-pet od 7.00 do 16.00, sobota po dogovoru.", ["mon", "fri"], "07:00", "16:00"],
      ["Delamo od ponedeljka do četrtka 8:00–15:30.", ["mon", "thu"], "08:00", "15:30"],
      ["Ponedeljek–petek 8h–16h.", ["mon", "fri"], "08:00", "16:00"],
      ["Ob sobotah in nedeljah od 8. do 12. ure.", ["sat", "sun"], "08:00", "12:00"],
      ["V soboto od 7. ure do 13. ure.", ["sat"], "07:00", "13:00"],
      ["Delovni čas:\nPon–Pet: 8:00–16:00\nSob: 8:00–12:00\nNed: zaprto", ["sat"], "08:00", "12:00"],
      ["Odprto: PON-PET 7-15h", ["thu"], "07:00", "15:00"],
      ["Ordinacija: ponedeljek in sreda od 12.00 do 19.00, torek, četrtek in petek od 7.00 do 14.00.", ["mon", "wed"], "12:00", "19:00"],
      ["Ordinacija: ponedeljek in sreda od 12.00 do 19.00, torek, četrtek in petek od 7.00 do 14.00.", ["tue", "thu", "fri"], "07:00", "14:00"],
      ["Med tednom 6.30–18.00, ob vikendih 7.00–12.00.", ["mon", "fri"], "06:30", "18:00"],
      ["Med tednom 6.30–18.00, ob vikendih 7.00–12.00.", ["sat", "sun"], "07:00", "12:00"],
      ["8.00–16.00 od ponedeljka do petka, 8.00–12.00 ob sobotah.", ["sat"], "08:00", "12:00"],
      ["Pon–pet 8–12 in 13–17.", ["tue"], "13:00", "17:00"],
      ["Change the Saturday hours to 6.30–13.00.", ["sat"], "06:30", "13:00"],
      ["Open Monday to Friday from 9.00 to 17.00.", ["wed"], "09:00", "17:00"],
    ];
    for (const [t, days, open, close] of cases) expect(hoursPaired(days, open, close, clientHours(t)), t).toEqual({ open: true, close: true });
    // Days written out never pair with the wrong group.
    expect(hoursPaired(["sat"], "08:00", "16:00", clientHours("8.00–16.00 od ponedeljka do petka, 8.00–12.00 ob sobotah."))).toEqual({ open: true, close: false });
    expect(hoursPaired(["mon"], "08:00", "16:00", clientHours("Ob ponedeljkih zaprto, sicer od 8.00 do 16.00."))).toEqual({ open: false, close: false });
    // "do 15.00" for one day changes only that day's closing time.
    const later = clientHours("Torek, četrtek in petek od 7.00 do 14.00. Ob petkih smo po novem odprti do 15.00.");
    expect(hoursPaired(["fri"], "07:00", "15:00", later)).toEqual({ open: true, close: true });
    expect(hoursPaired(["thu"], "07:00", "15:00", later)).toEqual({ open: true, close: false });
  });

  it("does not read prices, ages, dates or phone numbers as hours", () => {
    const t = "Pon–pet: otroci od 3 do 6 let 20–30 €, ob petkih 12.10.2026, kliči 041 555 730, kombiji do 3,5 t, dostava v 2–3 dneh.";
    expect(parseHours(t)).toEqual({ paired: [], unpaired: [] });
    expect([...clientHours(t).any]).toEqual([]);
  });

  it("drops the day pairing at a sentence or paragraph break", () => {
    const h = clientHours("Ob sobotah pečemo potico. Odprto od 7.00 do 12.00.");
    expect(hoursPaired(["sat"], "07:00", "12:00", h).open).toBe(false);
    expect(h.any.has("07:00")).toBe(true);
  });
});

describe("owner-typed facts", () => {
  it("pairs a price and an hours row saved in the editor", () => {
    const ops = [
      { op: "replace" as const, path: "/pages/0/sections/0/props", value: { title: "Cenik", groups: [{ items: [{ name: "Barvanje", price: { amount: 45 } }] }] } },
      { op: "replace" as const, path: "/business", value: { hours: { entries: [{ from: "sat", to: "sat", open: "09:00", close: "12:00" }, { from: "sun", to: "sun", closed: true }] } } },
    ];
    const corpus = ["Frizerstvo Lana. Moško striženje 15 €.", "Zaprto ob nedeljah", ...typedText(ops)].join("\n");
    const s = spec({ business: { hours: hours({ from: "sat", to: "sat", open: "09:00", close: "12:00" }, { from: "sun", to: "sun", closed: true }) }, sections: [priceList([{ name: "Barvanje", amount: 45 }])] });
    expect(found(s, corpus)).toEqual([]);
  });

  it("accepts a price the owner typed straight into a price field, also as a correction", () => {
    const corpus = ["Frizerstvo Lana. Moško striženje 15 €.", "Nov naslov strani", ...typedText([{ op: "replace", path: "/pages/0/sections/0/props/groups/0/items/0/price", value: { amount: 17 } }])].join("\n");
    expect(found(spec({ sections: [priceList([{ name: "Moško striženje", amount: 17 }])] }), corpus)).toEqual([]);
    expect(found(spec({ sections: [priceList([{ name: "Moško striženje", amount: 18 }])] }), corpus)).toEqual(["price:18"]);
  });
});

// ---------- The eval fixtures and their golden specs ----------

interface FixtureFacts {
  prices?: { item: string; amount: number }[];
  hours?: { from: Day; to: Day; open?: string; close?: string; closed?: boolean }[];
}
const fixtures = readdirSync(path.join(evalDir, "fixtures"), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => {
    const b = JSON.parse(readFileSync(path.join(evalDir, "fixtures", d.name, "brief.json"), "utf8")) as { description: string; facts: FixtureFacts };
    const golden = JSON.parse(readFileSync(path.join(evalDir, "golden", `${d.name}.json`), "utf8")) as SiteSpec;
    return { id: d.name, description: b.description, facts: b.facts, golden };
  });

/** Every structured price in a spec, with a pointer to its amount. */
function pricesIn(s: SiteSpec): { path: string; amount: number }[] {
  const out: { path: string; amount: number }[] = [];
  const visit = (v: unknown, p: string) => {
    if (Array.isArray(v)) return v.forEach((x, i) => visit(x, `${p}/${i}`));
    if (!v || typeof v !== "object") return;
    const o = v as Record<string, unknown>;
    const price = o.price as { amount?: unknown } | undefined;
    if (price && typeof price.amount === "number") out.push({ path: `${p}/price`, amount: price.amount });
    for (const [k, x] of Object.entries(o)) visit(x, `${p}/${k}`);
  };
  visit(s.pages, "/pages");
  return out;
}

function setAmount(s: SiteSpec, pointer: string, amount: number): SiteSpec {
  const copy = structuredClone(s);
  let o: Record<string, unknown> = copy as unknown as Record<string, unknown>;
  for (const k of pointer.split("/").slice(1)) o = o[k] as Record<string, unknown>;
  o.amount = amount;
  return copy;
}

describe("fact pairing on the ten eval fixtures", () => {
  it("covers all ten", () => expect(fixtures).toHaveLength(10));

  for (const f of fixtures) {
    it(`${f.id}: every price and opening time the client gave pairs with its offering and days`, () => {
      const mentions = priceMentions(f.description);
      for (const p of f.facts.prices ?? []) expect(pricePaired(p.amount, p.item, "", mentions), `${p.item} ${p.amount}`).toBe(true);
      const h = clientHours(f.description);
      for (const e of f.facts.hours ?? []) if (!e.closed) expect(hoursPaired(dayRange(e.from, e.to), e.open, e.close, h), `${e.from}-${e.to}`).toEqual({ open: true, close: true });
    });

    it(`${f.id}: the golden spec has no unchecked fact`, () => {
      expect(checkFacts(f.golden, f.description)).toEqual([]);
    });

    it(`${f.id}: a golden price moved to another offering is rejected`, () => {
      const prices = pricesIn(f.golden);
      const amounts = [...new Set(prices.map((p) => p.amount))];
      for (const p of prices) {
        for (const other of amounts.filter((a) => a !== p.amount)) {
          const wrong = setAmount(f.golden, p.path, other);
          expect(checkFacts(wrong, f.description).map((v) => v.path), `${p.path} = ${other}`).toContain(p.path);
        }
      }
    });

    it(`${f.id}: golden opening times moved to other days are rejected`, () => {
      const h = f.golden.business.hours;
      if (!h || "$placeholder" in h) return;
      const open = h.entries.filter((e) => !e.closed && e.open && e.close);
      for (const [i, e] of h.entries.entries()) {
        for (const o of open.filter((x) => x.open !== e.open || x.close !== e.close)) {
          const moved = structuredClone(f.golden);
          const entries = (moved.business.hours as { entries: typeof h.entries }).entries;
          entries[i] = { from: e.from, to: e.to, open: o.open, close: o.close };
          expect(checkFacts(moved, f.description).map((v) => v.path), `${e.from}-${e.to} ${o.open}-${o.close}`).toContain(`/business/hours/entries/${i}`);
        }
      }
    });
  }
});

describe("fact pairing on the fixtures' scripted edits", () => {
  const corpusOf = (id: string, message: string) => `${fixtures.find((f) => f.id === id)!.description}\n${message}`;
  const golden = (id: string) => structuredClone(fixtures.find((f) => f.id === id)!.golden);

  it("passes the prices and hours the edits give", () => {
    const priced = (id: string, msg: string, name: string, amount: number) => {
      const mentions = priceMentions(corpusOf(id, msg));
      return pricePaired(amount, name, "", mentions);
    };
    expect(priced("avtoservis-mrak", "Dodajte se ceno za menjavo akumulatorja: od 90 eur z montazo.", "Menjava akumulatorja", 90)).toBe(true);
    expect(priced("fizioterapija-pregib", "Nova cena za dry needling kot dodatek je 38 €.", "Dry needling", 38)).toBe(true);
    expect(priced("gostilna-zlata-zlica", "Na jedilni list dodaj še jagodne cmoke za 6,40 €.", "Jagodni cmoki", 6.4)).toBe(true);

    const pekarna = golden("pekarna-kvas");
    (pekarna.business.hours as { entries: { open?: string; close?: string }[] }).entries[1]!.close = "13:00";
    expect(checkFacts(pekarna, corpusOf("pekarna-kvas", "Change the Saturday hours to 6.30–13.00."))).toEqual([]);

    const racun = golden("racunovodstvo-seliskar");
    racun.business.hours = hours({ from: "mon", to: "thu", open: "08:00", close: "16:00" }, { from: "fri", to: "fri", open: "08:00", close: "13:00" });
    expect(checkFacts(racun, corpusOf("racunovodstvo-seliskar", "Dodaj uradne ure: od ponedeljka do četrtka od 8.00 do 16.00, v petek od 8.00 do 13.00."))).toEqual([]);

    const zobo = golden("zobozdravstvo-lebar");
    const entries = (zobo.business.hours as { entries: { from: Day; to: Day; open?: string; close?: string }[] }).entries;
    entries.splice(3, 1, { from: "thu", to: "thu", open: "07:00", close: "14:00" }, { from: "fri", to: "fri", open: "07:00", close: "15:00" });
    expect(checkFacts(zobo, corpusOf("zobozdravstvo-lebar", "Ob petkih smo po novem odprti do 15.00."))).toEqual([]);

    const oljka = golden("trgovina-oljka-in-sol");
    (oljka.pages[0]!.sections[0]!.props as Record<string, unknown>).headline = "Darilne pakete pošljemo po vsej Sloveniji, nad 75 € brez poštnine";
    expect(checkFacts(oljka, corpusOf("trgovina-oljka-in-sol", "Mention on the homepage that we now ship gift boxes across Slovenia, free shipping over 75 €."))).toEqual([]);
  });

  it("can't pair an English price with a Slovene offering name (known limit: the price becomes an unchecked fact)", () => {
    const mentions = priceMentions(corpusOf("zobozdravstvo-lebar", "We decided to publish two prices after all: check-up 45 €, teeth whitening 250 €."));
    expect(pricePaired(250, "Beljenje zob", "", mentions)).toBe(false);
    expect(pricePaired(250, "Teeth whitening (beljenje zob)", "", mentions)).toBe(true);
  });
});
