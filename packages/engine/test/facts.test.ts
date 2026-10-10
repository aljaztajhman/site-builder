import { describe, expect, it } from "vitest";
import type { SiteSpec } from "@sb/spec";
import { checkFacts } from "../src/index.ts";

const corpus =
  "Frizerstvo Lana, Ljubljanska cesta 8, 3000 Celje. Tel. 041 555 301, lana@frizerstvo-lana.example. " +
  "Pon–pet 8.00–19.00. Moško striženje 18 €, žensko od 32 €. Salon vodi Lana Kos.";

function spec(over: { business?: Partial<SiteSpec["business"]>; sections?: unknown[] } = {}): SiteSpec {
  return {
    business: {
      name: "Frizerstvo Lana",
      type: "hairdresser",
      phone: "+38641555301",
      email: "lana@frizerstvo-lana.example",
      address: { street: "Ljubljanska cesta 8", postalCode: "3000", city: "Celje" },
      hours: { entries: [{ from: "mon", to: "fri", open: "08:00", close: "19:00" }] },
      provider: { legalName: { $placeholder: "legalName" }, registrationNumber: { $placeholder: "registrationNumber" }, taxNumber: { $placeholder: "taxNumber" } },
      ...over.business,
    },
    pages: [{ id: "p_home", kind: "home", slug: "", sections: over.sections ?? [] }],
  } as unknown as SiteSpec;
}

describe("checkFacts", () => {
  it("passes facts that come from the client", () => {
    const s = spec({
      sections: [
        { id: "s_prices", type: "price-list", props: { groups: [{ name: "Striženje", items: [{ name: "Moško", price: { amount: 18 } }, { name: "Žensko", price: { amount: 32, from: true } }] }] } },
        { id: "s_team", type: "team", props: { members: [{ name: "Lana Kos", role: "frizerka" }, { name: { $placeholder: "name" }, role: "pomočnica" }] } },
        { id: "s_text", type: "text", props: { title: "Odprto od 8.00", paragraphs: ["Pokličite 041 555 301."] } },
      ],
    });
    expect(checkFacts(s, corpus)).toEqual([]);
  });

  it("flags invented phone, price, name, statistic and hours", () => {
    const s = spec({
      business: { phone: "+38641555999", hours: { entries: [{ from: "sat", to: "sat", open: "07:00", close: "13:00" }] } },
      sections: [
        { id: "s_prices", type: "price-list", props: { groups: [{ name: "Barvanje", items: [{ name: "Barvanje", price: { amount: 45 } }] }] } },
        { id: "s_team", type: "team", props: { members: [{ name: "Maja Horvat", role: "frizerka" }] } },
        { id: "s_text", type: "text", props: { title: "Več kot 500 zadovoljnih strank", paragraphs: ["Pokličite 041 555 777."] } },
      ],
    });
    const kinds = checkFacts(s, corpus).map((v) => `${v.kind}:${v.value}`);
    expect(kinds).toEqual(
      expect.arrayContaining(["phone:+38641555999", "hours:07:00", "hours:13:00", "price:45", "name:Maja Horvat", "number:500", "phone:041 555 777"]),
    );
  });

  it("ignores placeholders and structural strings", () => {
    const s = spec({
      business: { phone: { $placeholder: "phone" }, email: { $placeholder: "email" }, address: { $placeholder: "address" } },
      sections: [{ id: "s_hero_2", type: "hero-split", variant: "image-right", props: { headline: "Striženje v Celju", image: "img_01" } }],
    });
    expect(checkFacts(s, corpus)).toEqual([]);
  });

  it("reads the accessibility statement's date as a date, not a phone number in copy", () => {
    const s = spec({ sections: [{ id: "s_legal_accessibility", type: "legal", variant: "default", props: { kind: "accessibility", date: "2026-10-03" } }] });
    expect(checkFacts(s, corpus)).toEqual([]);
  });

  it("reads an image reference under any key as an id, not a number in copy", () => {
    const s = spec({
      sections: [
        { id: "s_hero", type: "hero-signature", variant: "label", props: { headline: "Striženje v Celju", image: "img_01", inset: "img_02" } },
        { id: "s_hours", type: "opening-hours", variant: "photo", props: { title: "Odprto", image: "img_04", inset: "img_05" } },
      ],
    });
    expect(checkFacts(s, corpus)).toEqual([]);
    // A number written in copy is still checked.
    const copy = spec({ sections: [{ id: "s_hero", type: "hero-signature", variant: "label", props: { headline: "img_02 in 05 let", inset: "img_05" } }] });
    expect(checkFacts(copy, corpus).map((v) => v.value)).toContain("05");
  });
});

describe("checkFacts, numbers written as words", () => {
  const words = (text: string) => `${corpus} ${text}`;
  const figures = (title: string) => spec({ sections: [{ id: "s_f", type: "highlights", variant: "figures", props: { heading: "V številkah", items: [{ title, text: "imam svojo ambulanto" }, { title: "18 €", text: "moško striženje" }] } }] });

  it("passes a figure the client wrote as a word, in any case form", () => {
    expect(checkFacts(figures("4 leta"), words("Zadnja štiri leta imam svojo ambulanto."))).toEqual([]);
    expect(checkFacts(figures("12 let"), words("Dvanajst let sem delala v bolnišnici."))).toEqual([]);
    expect(checkFacts(figures("5 terapij"), words("Paket petih terapij."))).toEqual([]);
  });

  it("still flags a number the client never wrote, as digits or as a word", () => {
    expect(checkFacts(figures("4 leta"), words("Tri leta imam svojo ambulanto.")).map((v) => v.value)).toEqual(["4"]);
    // Words inside longer words are not numbers: "petek" is not 5, "trideset" is 30 not 3.
    expect(checkFacts(figures("5 dni"), words("Odprto v petek.")).map((v) => v.value)).toEqual(["5"]);
    expect(checkFacts(figures("3 leta"), words("Trideset let izkušenj.")).map((v) => v.value)).toEqual(["3"]);
  });
});

describe("checkFacts, stricter matching", () => {
  it("flags an invented business name, allowing legal forms and missing diacritics", () => {
    expect(checkFacts(spec({ business: { name: "Frizerstvo Lana d.o.o." } }), corpus)).toEqual([]);
    expect(checkFacts(spec({ business: { name: "FRIZERSTVO LANA" } }), corpus.normalize("NFKD").replace(/[\u0300-\u036f]/g, ""))).toEqual([]);
    expect(checkFacts(spec({ business: { name: "Salon Lepote Lana" } }), corpus).map((v) => v.kind)).toContain("name");
  });

  it("needs both the postal code and the city", () => {
    const guessed = spec({ business: { address: { street: "Ljubljanska cesta 8", postalCode: "3001", city: "Celje" } } });
    expect(checkFacts(guessed, corpus).map((v) => v.path)).toContain("/business/address");
  });

  it("does not match a phone across two separate numbers in the text", () => {
    const text = "Pokličite 041 555 ali pa 301 za več.";
    const s = spec({ business: { name: "Frizerstvo Lana", phone: "+38641555301", email: { $placeholder: "email" }, address: { $placeholder: "address" }, hours: { $placeholder: "hours" } } });
    expect(checkFacts(s, `Frizerstvo Lana. ${text}`).map((v) => v.kind)).toContain("phone");
  });

  it("flags invented social links, legal name, hours note and street name", () => {
    const s = spec({
      business: {
        address: { street: "Cesta svobode 8", postalCode: "3000", city: "Celje" },
        hours: { entries: [{ from: "mon", to: "fri", open: "08:00", close: "19:00" }], note: "Ob sobotah 9–12." },
        social: [{ network: "facebook", url: "https://facebook.com/frizerstvolana" }],
        provider: { legalName: "Frizerstvo Ana Novak s.p.", registrationNumber: { $placeholder: "registrationNumber" }, taxNumber: { $placeholder: "taxNumber" } },
      } as Partial<SiteSpec["business"]>,
    });
    const paths = checkFacts(s, corpus).map((v) => `${v.path}:${v.value}`);
    expect(paths).toEqual(
      expect.arrayContaining([
        "/business/address/street:Cesta svobode 8",
        "/business/hours/note:9",
        "/business/social/0:https://facebook.com/frizerstvolana",
        "/business/provider/legalName:Frizerstvo Ana Novak s.p.",
      ]),
    );
  });

  it("passes the same facts when the client gave them, street type abbreviated", () => {
    const own = `${corpus} Lana Kos s.p. Facebook: facebook.com/frizerstvolana. Ob sobotah 9–12.`.replace("Ljubljanska cesta 8", "Ljubljanska c. 8");
    const s = spec({
      business: {
        hours: { entries: [{ from: "mon", to: "fri", open: "08:00", close: "19:00" }], note: "Ob sobotah 9–12." },
        social: [{ network: "facebook", url: "https://www.facebook.com/frizerstvolana/" }],
        provider: { legalName: "Lana Kos s.p.", registrationNumber: { $placeholder: "registrationNumber" }, taxNumber: { $placeholder: "taxNumber" } },
      } as Partial<SiteSpec["business"]>,
    });
    expect(checkFacts(s, own)).toEqual([]);
  });

  it("checks translations as they are shown", () => {
    const s = {
      ...spec({ sections: [{ id: "s_text", type: "text", props: { title: "Striženje", paragraphs: ["Pokličite 041 555 301."] } }] }),
      locales: { default: "sl", enabled: ["sl", "en"] },
      translations: { en: { "/business/phone": "+38640999999", "/pages/0/sections/0/props/title": "20 years of experience" } },
    } as unknown as SiteSpec;
    const found = checkFacts(s, corpus).map((v) => `${v.kind}:${v.path}`);
    expect(found).toEqual(expect.arrayContaining(["phone:/translations/en/business/phone", "number:/translations/en/pages/0/sections/0/props/title"]));
    expect(found.filter((f) => !f.includes("/translations/"))).toEqual([]);
  });

  it("reads a composed section's layout as layout and its copy as copy", () => {
    const desk = { col: 1, span: 6, row: 1 };
    const phone = { order: 0, span: "full" };
    const composed = (elements: unknown[]) => ({ id: "s_comp", type: "composed", props: { intent: "hero", width: "wide", rows: 2, elements } });
    const layout = [
      { id: "e_h", kind: "heading", desk, phone, text: "Striženje v Celju", level: 1, size: 7, rotate: "-90" },
      { id: "e_img", kind: "image", desk, phone, image: "img_01", ratio: "4:5", mask: "arch" },
      { id: "e_seal", kind: "fact", desk, phone, value: "8.00", label: "Odprto od", treatment: "seal", size: 4 },
      { id: "e_call", kind: "action", desk, phone, action: "call", label: "Pokličite 041 555 301", style: "primary" },
      { id: "e_dec", kind: "decor", desk, phone, svg: { width: 400, height: 20, paths: [{ d: "M10 10 a 7 7 0 1 0 14 0 a 7 7 0 1 0 -14 0 L 396 10", fill: "none", stroke: "accent", width: 2 }] } },
      { id: "e_p", kind: "prices", desk, phone, style: "rows", items: [{ name: "Moško", price: { amount: 18 } }] },
    ];
    expect(checkFacts(spec({ sections: [composed(layout)] }), corpus)).toEqual([]);

    const invented = [
      { id: "e_h", kind: "heading", desk, phone, text: "25 let v Celju", level: 1, size: 7 },
      { id: "e_seal", kind: "fact", desk, phone, value: "1987", label: "od leta", treatment: "seal", size: 4 },
      { id: "e_t", kind: "text", desk, phone, paragraphs: ["Pokličite 041 555 777."] },
      { id: "e_l", kind: "list", desk, phone, items: ["Več kot 500 strank"] },
      { id: "e_p", kind: "prices", desk, phone, style: "rows", items: [{ name: "Barvanje", price: { amount: 45 } }] },
    ];
    const found = checkFacts(spec({ sections: [composed(invented)] }), corpus).map((v) => `${v.kind}:${v.value}:${v.path}`);
    expect(found).toEqual(
      expect.arrayContaining([
        "number:25:/pages/0/sections/0/props/elements/0/text",
        "number:1987:/pages/0/sections/0/props/elements/1/value",
        "phone:041 555 777:/pages/0/sections/0/props/elements/2/paragraphs/0",
        "number:500:/pages/0/sections/0/props/elements/3/items/0",
        "price:45:/pages/0/sections/0/props/elements/4/items/0/price",
      ]),
    );
  });

  it("checks layout-named keys as copy outside composed sections", () => {
    // Only composed sections have a fixed meaning for keys like "style" or "width"; elsewhere a string is copy until proven otherwise.
    const s = spec({ sections: [{ id: "s_text", type: "text", props: { title: "Striženje", style: "25 let izkušenj" } }] });
    expect(checkFacts(s, corpus).map((v) => `${v.kind}:${v.value}`)).toEqual(["number:25"]);
  });
});
