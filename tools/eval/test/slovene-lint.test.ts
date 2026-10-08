import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { SiteSpec } from "@sb/spec";
import { ALLOWED_LOANWORDS, ENGLISH_TERMS, RULES, addressCounts, inClientText, lintSpec, lintText, maskString, visibleStrings, type RuleId } from "../src/slovene-lint.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const golden = (id: string) => JSON.parse(readFileSync(path.join(here, "../golden", `${id}.json`), "utf8")) as SiteSpec;
const brief = (id: string) => (JSON.parse(readFileSync(path.join(here, "../fixtures", id, "brief.json"), "utf8")) as { description: string }).description;

/** The quotes one rule finds in `s` (key "text" unless given). */
const found = (rule: RuleId, s: string, key = "text", properNames: string[] = []) => lintText(s, key, { properNames: new Set(properNames) }).filter((f) => f.rule === rule).map((f) => f.quote);

/** Each rule: strings it must flag (with the quote) and correct Slovene it must leave alone. */
const CASES: Record<RuleId, { flag: [string, string][]; pass: string[]; key?: string }> = {
  english: {
    flag: [
      ["Paket prevzamete v trgovini (click & collect).", "click & collect"],
      ["Naročanje online, tudi zvečer.", "online"],
      ["Pišite nam na mail.", "mail"],
      ["Online shopa zaenkrat nimamo.", "shopa"],
      ["Gift box po vaši želji", "Gift box"],
      ["Kava to go in rogljiček", "to go"],
      ["Prijava (check-in) od 14.00", "check-in"],
      ["Brezplačen parking za stavbo", "parking"],
      ["Dry needling kot dodatek", "Dry needling"],
    ],
    pass: [
      "Prevzem v trgovini, plačilo ob prevzemu.",
      "Pišite nam na e-pošto ali na info@shop-online.si.",
      "Rezervirate lahko tudi na Booking.com ali prek Bookinga.",
      "Wellness, fitness in catering za skupine do 60 oseb.",
      "Brunch ob nedeljah, espresso in pizza iz krušne peči.",
      "Eventualno pridemo tudi ob sobotah.",
      "Ekipa servisa, kontakt in dostava.",
    ],
  },
  "ti-form": {
    flag: [
      ["Pokliči 041 555 730", "Pokliči"],
      ["Pokliči za rezervacijo", "Pokliči"],
      ["Naroči zdaj", "Naroči"],
      ["Pri nas boš vedno dobrodošel.", "boš"],
      ["Za tvoj avto poskrbimo.", "tvoj"],
      ["Termin lahko rezerviraš na spletu.", "lahko rezerviraš"],
      ["Oglej si cenik", "Oglej"],
    ],
    pass: [
      "Pokličite nas ali pišite.",
      "Stranka naroči po telefonu, mi pa pripravimo paket do petka.",
      "Pokliče nas večina strank.",
      "Kupite v trgovini.",
      "Ti izdelki so iz domače kmetije.",
      "Oglejte si cenik.",
      "Rezervni deli in pnevmatike",
    ],
  },
  "dual-we": {
    flag: [["Pokličite in skupaj poiščeva termin.", "skupaj poiščeva"], ["Skupaj izbereve barvo.", "Skupaj izbereve"]],
    pass: ["Pokličite in skupaj poiščemo termin.", "Na kmetiji sva od leta 1996.", "Prenove delamo skupaj s keramikom.", "Skupaj dve uri."],
  },
  quotes: {
    flag: [
      ['Gostilna "Pri lipi"', '"Pri lipi"'],
      ["Imenujemo ga “domači kruh”", "“domači kruh”"],
      ['Zaprto do 5"', '"'],
    ],
    pass: ["Gostilna „Pri lipi“", "Imenujemo ga »domači kruh«.", "Pekarna „Kvas“ na Šutni."],
  },
  "decimal-point": {
    flag: [["Rogljiček 1.30 €", "1.30 €"], ["Olje 0.5 l", "0.5 l"], ["Od €4.20 naprej", "€4.20"]],
    pass: ["Rogljiček 1,30 €", "Odprto od 6.30 do 18.00", "Paket za 1.200 €", "Olje 0,5 l"],
  },
  "euro-before": {
    flag: [["Diagnostika €30", "€30"], ["Cena: € 45", "€ 45"]],
    pass: ["Diagnostika 30 €", "Cene v € z DDV."],
  },
  "unit-space": {
    flag: [["Diagnostika za 30€", "30€"], ["Smučišče je 10min stran", "10min"], ["Popust 10%", "10%"], ["Zadnjih 800m je makadam", "800m"]],
    pass: ["Diagnostika za 30 €", "Smučišče je 10 min stran", "Popust 10 %", "Kombiji do 3,5 t", "A4 papir in B2B ponudba", "2. nadstropje"],
  },
  "range-hyphen": {
    flag: [["Odprto 8-16", "8-16"], ["Odprto 7.00-20.00", "7.00-20.00"], ["Otroci 3-6 let", "3-6"]],
    pass: ["Odprto 8–16", "Pokličite 041-555-906", "Datum 2026-10-08", "Toplotne črpalke zrak-voda", "Covid-19 ukrepi"],
  },
  "spaced-hyphen": {
    flag: [["Pekarna Kvas - kruh z drožmi", "Kvas - kruh"]],
    pass: ["Pekarna Kvas – kruh z drožmi", "Toplotne črpalke zrak-voda", "Pon–pet"],
  },
  ellipsis: {
    flag: [["In še veliko več...", "več..."]],
    pass: ["In še veliko več …", "Ob 8.00. Pridite."],
  },
  "em-dash": {
    flag: [["Kruh — vsak dan", "Kruh — vsak"]],
    pass: ["Kruh – vsak dan"],
  },
  "space-before-punct": {
    flag: [["Pečemo vsak dan , tudi ob nedeljah.", "dan ,"], ["Pridite !", "Pridite !"]],
    pass: ["Pečemo vsak dan, tudi ob nedeljah.", "Pon – pet", "In še več …"],
  },
  "missing-space": {
    flag: [["Kruh,pecivo in potice", "Kruh,"], ["Pečemo vsak dan.Pridite!", "dan."]],
    pass: ["Računovodstvo za s.p., d.o.o. in društva", "Tina Zupan, dipl. fiziot.", "Cena 4,20 €", "Pišite na www.pekarna.si ali info@pekarna.si."],
  },
  "doubled-word": {
    flag: [["Pečemo vsak vsak dan", "vsak vsak"], ["Pridite pridite k nam", "Pridite pridite"]],
    pass: ["Pečemo vsak dan", "Še in še", "Malo po malo"],
  },
  "tripled-letter": {
    flag: [["Kruhhh in pecivo", "hhh"], ["Zelooo dober kruh", "ooo"]],
    pass: ["Priimek in ime", "Karel III. in Ludvik XIII.", "Obiščite www.pekarna.si"],
  },
  "roman-artefact": {
    flag: [["Ponujamo: (i) striženje, (ii) barvanje", "(i)"], ["Storitve ii in iii", "ii"]],
    pass: ["Karel II. je bil kralj.", "Kot vi tudi mi (in vi).", "Priimek in ime"],
  },
  "english-format": {
    flag: [["Odprto od 8am", "8am"], ["Naš 1st servis", "1st"]],
    pass: ["Odprto od 8.00", "Naš 1. servis", "Zadnjih 800 m je makadam."],
  },
  "title-case": {
    key: "title",
    flag: [["Domači Kruh Vsak Dan", "Domači Kruh Vsak Dan"], ["Storitve | Naše Najboljše Storitve", "Naše Najboljše Storitve"]],
    pass: ["Domači kruh vsak dan", "Storitve | Inštalacije Rebernik", "Gostilna Pri Zlati Žlici", "Obračun DDV in poročanje FURS"],
  },
};

describe("Slovene lint: every rule flags its errors and leaves correct Slovene alone", () => {
  it("every rule has cases", () => {
    expect(Object.keys(CASES).sort()).toEqual(RULES.map((r) => r.id).sort());
  });
  for (const [rule, c] of Object.entries(CASES) as [RuleId, (typeof CASES)[RuleId]][]) {
    it(rule, () => {
      for (const [s, quote] of c.flag) expect(found(rule, s, c.key, ["Gostilna", "Pri", "Zlati", "Žlici", "Inštalacije", "Rebernik"]), s).toContain(quote);
      for (const s of c.pass) expect(found(rule, s, c.key, ["Gostilna", "Pri", "Zlati", "Žlici", "Inštalacije", "Rebernik"]), s).toEqual([]);
    });
  }
  it("Title Case is only checked in headings", () => {
    expect(found("title-case", "Domači Kruh Vsak Dan", "paragraphs")).toEqual([]);
  });
  it("accepted loanwords are never on the English list", () => {
    for (const w of ALLOWED_LOANWORDS) expect(found("english", `Ponujamo ${w} za vse.`), w).toEqual([]);
    expect(ENGLISH_TERMS.length).toBeGreaterThan(30);
  });
});

describe("Slovene lint over a site", () => {
  it("counts vi and ti address, so a site that mixes them shows both", () => {
    expect(addressCounts("Pokličite nas ali pišite, vaš paket je pripravljen.")).toEqual({ ti: 0, vi: 3 });
    expect(addressCounts("Pokliči za rezervacijo")).toEqual({ ti: 1, vi: 0 });
  });

  it("masks links, e-mail addresses, domains, brands and the business's own names", () => {
    const m = maskString("Pekarna Kvas: info@kvas.si, www.kvas.si, Booking.com", ["Pekarna Kvas"]);
    expect(m.length).toBe("Pekarna Kvas: info@kvas.si, www.kvas.si, Booking.com".length);
    expect(m.replace(/\uE000/g, "")).toBe(": , , ");
  });

  it("a quote that is in the client's text counts as echoed (whole words only)", () => {
    expect(inClientText("click & collect", "paket prevzamete v trgovini (click & collect).")).toBe(true);
    expect(inClientText("Pokliči", "Brez naročila težko pridete na vrsto, zato raje pokličite.")).toBe(false);
    expect(inClientText("-", "zrak-voda")).toBe(false);
  });

  it("walks pages, collections and alt texts but not enums, ids, links or the business facts", () => {
    const spec = golden("pekarna-kvas");
    const strings = visibleStrings(spec);
    const paths = strings.map((s) => s.path);
    expect(paths).toContain("/pages/0/sections/0/props/headline");
    expect(paths).toContain("/assets/images/0/alt");
    expect(paths.some((p) => p.startsWith("/business"))).toBe(false);
    expect(paths.some((p) => /\/(id|type|variant|tone|image|action)$/.test(p))).toBe(false);
    expect(strings.some((s) => s.text === "p_home" || s.text === "img_01")).toBe(false);
  });

  it("the client's own wording is listed as echoed and left out of the counts", () => {
    const r = lintSpec(golden("trgovina-oljka-in-sol"), brief("trgovina-oljka-in-sol"));
    expect(r.counts.english ?? 0).toBe(0);
    expect(r.echoed.english).toBeGreaterThan(0);
    expect(r.findings.filter((f) => f.rule === "english").every((f) => f.echoed)).toBe(true);
    // Without the client's text the same words count.
    expect(lintSpec(golden("trgovina-oljka-in-sol"), "").counts.english).toBe(r.echoed.english);
  });

  it("the goldens address the reader formally throughout: no finding that isn't the client's own text", () => {
    const r = lintSpec(golden("pekarna-kvas"), brief("pekarna-kvas"));
    expect(r.findings.filter((f) => !f.echoed)).toEqual([]);
    expect(r.total).toBe(0);
    expect(r.address.vi).toBeGreaterThan(0);
  });

  it("finds informal call buttons on a site that otherwise says vi", () => {
    // The goldens said "Pokliči" on 12 buttons until 2026-10-08; put two back.
    const spec = JSON.parse(JSON.stringify(golden("pekarna-kvas")).replaceAll('"Pokličite za naročilo"', '"Pokliči za naročilo"').replace('"label":"Pokličite"', '"label":"Pokliči"')) as SiteSpec;
    const r = lintSpec(spec, brief("pekarna-kvas"));
    expect(r.findings.filter((f) => !f.echoed).map((f) => `${f.rule}: ${f.quote}`)).toEqual(["ti-form: Pokliči", "ti-form: Pokliči"]);
    expect(r.total).toBe(2);
    expect(r.address.vi).toBeGreaterThan(0);
  });

  it("the em dash is counted but is not an error here", () => {
    const spec = structuredClone(golden("pekarna-kvas"));
    (spec.pages[0]!.sections[0]!.props as { intro: string }).intro = "Kruh — vsak dan.";
    const r = lintSpec(spec, "");
    expect(r.counts["em-dash"]).toBe(1);
    expect(r.total).toBe(lintSpec(golden("pekarna-kvas"), "").total);
  });

  it("a site in another default language is not linted", () => {
    const spec = { ...golden("pekarna-kvas"), locales: { default: "en", enabled: ["en"] } } as SiteSpec;
    expect(lintSpec(spec, "").strings).toBe(0);
  });
});
