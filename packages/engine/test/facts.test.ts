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
});
