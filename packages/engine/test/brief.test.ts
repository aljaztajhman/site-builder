import { describe, expect, it } from "vitest";
import { toE164, verifyBriefFacts, type Brief } from "../src/index.ts";

const description =
  "Pekarna Kvas, Šutna 30, 1241 Kamnik. Pokličite 041 555 210 ali pišite na info@pekarna-kvas.example. " +
  "Odprto pon–pet 6.30–18.00. Pirin kruh 4,20 €, rženi kruh 3,90 €. Pečem jaz, Jure Petek.";

function brief(over: Partial<Brief["facts"]> = {}, offerings: Brief["offerings"] = []): Brief {
  return {
    businessType: "bakery",
    name: "Pekarna Kvas",
    town: "Kamnik",
    summary: "Družinska pekarna.",
    audience: "domačini",
    tone: "warm",
    offerings,
    highlights: [],
    facts: {
      phone: "+38641555210",
      email: "info@pekarna-kvas.example",
      address: { street: "Šutna 30", postalCode: "1241", city: "Kamnik" },
      hours: [{ from: "mon", to: "fri", open: "06:30", close: "18:00", closed: false }],
      hoursNote: null,
      bookingUrl: null,
      social: [],
      legalName: null,
      registrationNumber: null,
      taxNumber: null,
      vatPayer: null,
      serviceArea: [],
      people: [{ name: "Jure Petek", role: "peki" }],
      ...over,
    },
    pages: [{ kind: "home", slug: "", navLabel: "Domov", purpose: "x" }],
    missing: [],
  };
}

describe("verifyBriefFacts", () => {
  it("keeps facts that are in the client's text", () => {
    const { dropped, brief: b } = verifyBriefFacts(
      brief({}, [{ group: null, name: "Pirin kruh", description: null, price: { amount: 4.2, from: false, unit: null } }]),
      description,
    );
    expect(dropped).toEqual([]);
    expect(b.facts.phone).toBe("+38641555210");
    expect(b.offerings[0]!.price?.amount).toBe(4.2);
  });

  it("drops invented phone, email, legal numbers, people, hours and prices", () => {
    const { dropped, brief: b } = verifyBriefFacts(
      brief(
        {
          phone: "+38641999888",
          email: "narocila@pekarna-kvas.example",
          registrationNumber: "1234567000",
          taxNumber: "SI12345678",
          people: [{ name: "Katja Novak", role: null }],
          hours: [{ from: "sat", to: "sat", open: "07:00", close: "13:00", closed: false }],
        },
        [{ group: null, name: "Potica", description: null, price: { amount: 18.5, from: false, unit: null } }],
      ),
      description,
    );
    expect(b.facts.phone).toBeNull();
    expect(b.facts.email).toBeNull();
    expect(b.facts.registrationNumber).toBeNull();
    expect(b.facts.taxNumber).toBeNull();
    expect(b.facts.people).toEqual([]);
    expect(b.facts.hours).toBeNull();
    expect(b.offerings[0]!.price).toBeNull();
    expect(dropped.map((d) => d.field).sort()).toEqual(["email", "hours", "people", "phone", "price:Potica", "registrationNumber", "taxNumber"]);
  });

  it("drops an address whose street is not in the text", () => {
    const { brief: b } = verifyBriefFacts(brief({ address: { street: "Glavni trg 1", postalCode: "1241", city: "Kamnik" } }), description);
    expect(b.facts.address).toBeNull();
  });
});

describe("toE164", () => {
  it("normalises Slovene numbers", () => {
    expect(toE164("041 555 210")).toBe("+38641555210");
    expect(toE164("01/555 01 23")).toBe("+38615550123");
    expect(toE164("+386 41 555 210")).toBe("+38641555210");
    expect(toE164("00386 41 555 210")).toBe("+38641555210");
    expect(toE164("123")).toBeNull();
  });
});
