import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { clientWithholdsHours, toE164, verifyBriefFacts, type Brief } from "../src/index.ts";

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
    imageIdeas: [],
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

  it("drops a price given for another offering and hours given for other days", () => {
    const { dropped, brief: b } = verifyBriefFacts(
      brief({ hours: [{ from: "sat", to: "sat", open: "06:30", close: "18:00", closed: false }] }, [
        { group: "Kruh", name: "Pirin kruh", description: null, price: { amount: 3.9, from: false, unit: null } },
        { group: "Kruh", name: "Rženi kruh", description: null, price: { amount: 3.9, from: false, unit: null } },
        { group: null, name: "Žemlja", description: null, price: { amount: 30, from: false, unit: null } },
      ]),
      description,
    );
    expect(b.facts.hours).toBeNull();
    expect(b.offerings.map((o) => o.price?.amount ?? null)).toEqual([null, 3.9, null]);
    expect(dropped.map((d) => d.field)).toEqual(["hours", "price:Pirin kruh", "price:Žemlja"]);
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

describe("clientWithholdsHours", () => {
  it("reads the wish in the client's own words", () => {
    for (const text of [
      "Delovnega časa tudi ne bi pisali, ker se stranke vedno prej najavijo po telefonu.",
      "Delovnega casa ne objavljamo.",
      "Prosim, ne navajajte delovnega časa na strani.",
      "Urnika ne bi objavljal, ker sem večinoma na terenu.",
      "Smo brez stalnega delovnega časa, pokličite.",
      "Nimamo fiksnega delovnega časa.",
      "Delovni čas: po dogovoru.",
      "Uradne ure so samo po predhodnem dogovoru.",
    ])
      expect(clientWithholdsHours(text), text).toBe(true);
  });

  it("doesn't read it into stated hours or wishes about other facts", () => {
    for (const text of [
      "Delovni čas: pon–pet 8.00–16.00, sobota ne.",
      "Odprto pon-pet od 7.00 do 16.00, sobota po dogovoru.",
      "Cen ne bi objavljali. Delovni čas je od 8. do 16. ure.",
      "Cene so po dogovoru in so odvisne od števila računov, zato jih ne bi objavljali.",
      "Za skupine kuhamo tudi med tednom po dogovoru.",
      "Ordinacijski čas: ponedeljek in sreda od 12.00 do 19.00.",
    ])
      expect(clientWithholdsHours(text), text).toBe(false);
  });

  it("finds it in exactly one of the ten fixtures: the accountant who asked for no hours", () => {
    const dir = new URL("../../../tools/eval/fixtures/", import.meta.url);
    const hits = readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .filter((d) => clientWithholdsHours((JSON.parse(readFileSync(new URL(`${d.name}/brief.json`, dir), "utf8")) as { description: string }).description))
      .map((d) => d.name);
    expect(hits).toEqual(["racunovodstvo-seliskar"]);
  });
});