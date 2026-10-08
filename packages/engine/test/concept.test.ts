import { describe, expect, it } from "vitest";
import { loadConfig } from "@sb/config";
import { SECTION_DEFS, direction as directionById, validateOutline } from "@sb/spec";
import {
  BRIEF_CONCEPT_SYSTEM,
  BRIEF_SYSTEM,
  ModelClient,
  blueprintFor,
  blueprintSlots,
  briefJsonSchema,
  businessFromBrief,
  chooseDesign,
  conceptOutline,
  conceptPlan,
  inClientText,
  makeBrief,
  materialFamilies,
  signatureDevice,
  verifyConcept,
  type Brief,
  type Concept,
  type ModelRequest,
  type ModelTransport,
} from "../src/index.ts";

/** The concept (docs/plans/variety-engine.md, Step 3), behind config variety.concept; no model call. */

// The carpenter twin's own text (tools/eval/twins/mizarstvo-lesnik).
const CARPENTER =
  "Mizarstvo Lesnik iz Škofje Loke. Izdelujemo pohištvo po meri iz masivnega lesa: kuhinje, vgradne omare, mize, postelje, stopnice in notranja vrata. Les kupujemo pri žagah v Poljanski dolini, največ hrast, oreh in macesen.\n\n" +
  "Delavnico je leta 1979 odprl dedek, danes jo vodi Jaka Lesnik. Vsak kos narišemo skupaj z vami, izdelamo v delavnici in sami montiramo.\n\n" +
  "Naslov: Kidričeva cesta 80, 4220 Škofja Loka. Delavnica je odprta od ponedeljka do petka od 7.00 do 15.00, ob sobotah po dogovoru.\n\n" +
  "Pokličite 041 555 382 ali pišite na jaka@mizarstvolesnik.example. Cene po izmeri in ponudbi.";

function brief(over: Partial<Brief> = {}): Brief {
  return {
    businessType: "builder",
    name: "Mizarstvo Lesnik",
    town: "Škofja Loka",
    summary: "Pohištvo po meri iz masivnega lesa.",
    audience: "družine",
    tone: "warm",
    offerings: [{ group: null, name: "Kuhinje", description: null, price: null }],
    highlights: [],
    facts: {
      phone: "+38641555382",
      email: "jaka@mizarstvolesnik.example",
      address: { street: "Kidričeva cesta 80", postalCode: "4220", city: "Škofja Loka" },
      hours: [{ from: "mon", to: "fri", open: "07:00", close: "15:00", closed: false }],
      hoursNote: null,
      bookingUrl: null,
      social: [],
      legalName: null,
      registrationNumber: null,
      taxNumber: null,
      vatPayer: null,
      serviceArea: [],
      people: [{ name: "Jaka Lesnik", role: null }],
    },
    pages: [{ kind: "home", slug: "", navLabel: "Domov", purpose: "x" }],
    missing: [],
    imageIdeas: [],
    ...over,
  };
}

const concept = (over: Partial<Concept> = {}): Concept => ({
  subtype: "carpentry",
  goal: "enquire",
  angle: "family-history",
  signatureFact: "founding-year",
  materials: ["hrast", "oreh", "macesen", "masivni les"],
  localAnchor: "Poljanska dolina",
  ...over,
});

describe("the concept's fact guard", () => {
  it("keeps materials and the anchor the client wrote, in any Slovene form", () => {
    expect(inClientText("masivni les", CARPENTER)).toBe(true);
    expect(inClientText("Poljanska dolina", CARPENTER)).toBe(true);
    expect(inClientText("bukev", CARPENTER)).toBe(false);
    const r = verifyConcept(concept(), brief(), CARPENTER);
    expect(r.dropped).toEqual([]);
    expect(r.concept).toEqual(concept());
  });

  it("drops invented materials, an invented anchor, a subtype of another type and a signature fact the client didn't give", () => {
    const r = verifyConcept(
      concept({ subtype: "florist", materials: ["hrast", "bukev", "Hrast", "češnja"], localAnchor: "Bohinj", signatureFact: "distance" }),
      brief(),
      CARPENTER,
    );
    expect(r.concept).toEqual(concept({ subtype: null, materials: ["hrast"], localAnchor: null, signatureFact: "none" }));
    expect(r.dropped).toEqual([
      { field: "concept.subtype", value: "florist" },
      { field: "concept.materials", value: "bukev" },
      { field: "concept.materials", value: "Hrast" },
      { field: "concept.materials", value: "češnja" },
      { field: "concept.localAnchor", value: "Bohinj" },
      { field: "concept.signatureFact", value: "distance" },
    ]);
  });

  it("holds each signature fact to the client's own facts", () => {
    const keep = (signatureFact: Concept["signatureFact"], b = brief(), text = CARPENTER) => verifyConcept(concept({ signatureFact }), b, text).concept.signatureFact;
    expect(keep("founding-year")).toBe("founding-year");
    expect(keep("founding-year", brief(), "Mizarstvo Lesnik, pohištvo iz hrasta.")).toBe("none");
    expect(keep("phone")).toBe("phone");
    expect(keep("phone", brief({ facts: { ...brief().facts, phone: null } }))).toBe("none");
    expect(keep("hours")).toBe("hours");
    // No price the client gave: no price object.
    expect(keep("price")).toBe("none");
    expect(keep("price", brief({ offerings: [{ group: null, name: "Kuhinje", description: null, price: { amount: 4000, from: true, unit: null } }] }))).toBe("price");
    expect(keep("distance", brief(), `${CARPENTER} Do Ljubljane je 25 km.`)).toBe("distance");
    expect(keep("rooms")).toBe("none");
    expect(keep("rooms", brief(), "Imamo štiri sobe z razgledom.")).toBe("rooms");
    expect(keep("place")).toBe("place");
  });
});

describe("homepage blueprints by goal", () => {
  it("follows the goal; a family or the owner's story leads when nobody has to call or book first", () => {
    expect(blueprintFor({ goal: "call", angle: "speed" })).toBe("call-first");
    expect(blueprintFor({ goal: "call", angle: "family-history" })).toBe("call-first");
    expect(blueprintFor({ goal: "book", angle: "person" })).toBe("book-first");
    expect(blueprintFor({ goal: "browse", angle: "value" })).toBe("browse-first");
    expect(blueprintFor({ goal: "order", angle: "craft" })).toBe("browse-first");
    expect(blueprintFor({ goal: "visit", angle: "place" })).toBe("visit-first");
    expect(blueprintFor({ goal: "visit", angle: "family-history" })).toBe("story-first");
    expect(blueprintFor({ goal: "enquire", angle: "speciality" })).toBe("story-first");
  });

  it("replaces the template's fixed outline with outline slots in the template's own variants", () => {
    const cevi = directionById("cevi");
    const call = blueprintSlots(cevi, "call-first");
    expect(call.map((s) => [s.kind, s.options.join("|")])).toEqual([
      ["one-of", "hero-signature:drawing|hero-type:with-facts|hero-type:large"],
      ["optional", "services-list:rows"],
      ["optional", "service-area:list"],
      ["optional", "steps:horizontal"],
      ["optional", "price-list:table"],
      ["required", "contact:call-out"],
    ]);
    // The template's own lines (tone and what goes in) carry over where the template has the type.
    expect(call[3]!.note).toMatch(/^steps:horizontal tone alt:/);
    const story = blueprintSlots(cevi, "story-first", { hero: "hero-type:large" });
    expect(story.map((s) => s.options.join("|"))).toEqual(["hero-type:large", "about:image-side", "image-text:image-left", "services-list:rows", "highlights:list", "contact:call-out"]);
    // validateOutline (families.ts) checks a homepage against it: optional places may be left out, order holds.
    const ok = [{ type: "hero-signature", variant: "drawing" }, { type: "services-list", variant: "rows" }, { type: "steps", variant: "horizontal" }, { type: "contact", variant: "call-out" }];
    expect(validateOutline(ok, call)).toEqual([]);
    expect(validateOutline([ok[0]!, ok[2]!, ok[1]!, ok[3]!], call)).not.toEqual([]);
    expect(validateOutline(ok.slice(0, 3), call)).toEqual(["missing contact:call-out (position 4)"]);
    // Every blueprint on every template names only existing section types and variants, and five differ.
    for (const d of ["tablica", "cevi", "skorja", "racun", "etiketa", "jedilnik", "ogledalo", "nasmeh", "markacija", "pregib"].map(directionById)) {
      const outlines = new Set<string>();
      for (const b of ["call-first", "book-first", "browse-first", "visit-first", "story-first"] as const) {
        const slots = blueprintSlots(d, b);
        for (const s of slots.slice(1)) {
          const [type, variant] = s.options[0]!.split(":");
          expect(SECTION_DEFS.find((x) => x.type === type)?.variants, `${d.id} ${b} ${s.options[0]}`).toContain(variant);
        }
        outlines.add(slots.map((s) => s.options[0]).join(" "));
      }
      expect(outlines.size, d.id).toBe(5);
    }
    expect(blueprintSlots(directionById("industrial"), "call-first")).toEqual([]);
  });
});

describe("the signature device", () => {
  it("comes from the signature fact and the materials, not the trade", () => {
    expect(signatureDevice({ signatureFact: "phone", materials: [] })).toMatchObject({ id: "call-object", heroFact: "phone" });
    expect(signatureDevice({ signatureFact: "hours", materials: ["kruh", "kvas"] })).toMatchObject({ id: "seal", heroFact: "opening" });
    expect(signatureDevice({ signatureFact: "hours", materials: ["obrazci"] })).toMatchObject({ id: "poster", section: "opening-hours:poster" });
    expect(signatureDevice({ signatureFact: "hours", materials: ["hrast"] })).toMatchObject({ id: "week-chart", section: "opening-hours:week" });
    expect(signatureDevice({ signatureFact: "price", materials: ["oljčno olje", "med"] })).toMatchObject({ id: "label", section: "price-list:tags" });
    expect(signatureDevice({ signatureFact: "price", materials: ["šopki", "lončnice"] })).toMatchObject({ id: "label" });
    expect(signatureDevice({ signatureFact: "price", materials: ["malica", "kosilo"] })).toMatchObject({ id: "offers", section: "price-list:offers" });
    expect(signatureDevice({ signatureFact: "price", materials: ["gume"] })).toMatchObject({ id: "tags", section: "price-list:tags" });
    expect(signatureDevice({ signatureFact: "founding-year", materials: [] })).toMatchObject({ id: "figure", section: "about:figure" });
    expect(signatureDevice({ signatureFact: "distance", materials: [] })).toMatchObject({ id: "route-line", section: "service-area:list" });
    expect(signatureDevice({ signatureFact: "rooms", materials: [] })).toMatchObject({ id: "rates", section: "price-list:rates" });
    expect(signatureDevice({ signatureFact: "place", materials: [] })).toMatchObject({ id: "address-card", heroFact: "address" });
    expect(signatureDevice({ signatureFact: "none", materials: ["hrast"] })).toBeUndefined();
    expect([...materialFamilies(["Šopek iz sezonskega cvetja", "steklenice"])].sort()).toEqual(["bottle", "plant"]);
    // Every device is a hero fact or an existing section.
    for (const fact of ["phone", "hours", "price", "founding-year", "distance", "rooms", "place"] as const) {
      for (const materials of [[], ["kruh"], ["papir"], ["vino"]]) {
        const d = signatureDevice({ signatureFact: fact, materials })!;
        expect(!!d.heroFact !== !!d.section, `${fact} ${materials.join()}`).toBe(true);
        if (!d.section) continue;
        const [type, variant] = d.section.split(":");
        expect(SECTION_DEFS.find((x) => x.type === type)?.variants).toContain(variant);
      }
    }
  });

  it("goes into the blueprint right after the hero and into the content step's outline", () => {
    const plan = conceptPlan(concept());
    expect(plan).toMatchObject({ blueprint: "story-first", device: { id: "figure", section: "about:figure" } });
    const slots = blueprintSlots(directionById("cevi"), plan.blueprint, { device: plan.device! });
    expect(slots.map((s) => s.options[0])).toEqual(["hero-signature:drawing", "about:figure", "image-text:image-left", "services-list:rows", "highlights:list", "contact:call-out"]);
    const text = conceptOutline(directionById("cevi"), plan);
    expect(text).toContain("Homepage blueprint story-first on the Cevi");
    expect(text).toContain("2. about:figure: the year the business started");
    expect(text).toContain("Use about:figure for it, right after the hero.");
    // The hero's fact where the hero can show it; the address only on label, card and bend heroes.
    expect(conceptOutline(directionById("tablica"), { blueprint: "call-first", device: signatureDevice({ signatureFact: "phone", materials: [] })! })).toContain('Set the hero\'s fact to "phone".');
    expect(conceptOutline(directionById("etiketa"), { blueprint: "visit-first", device: signatureDevice({ signatureFact: "place", materials: [] })! })).toContain('Set the hero\'s fact to "address".');
    expect(conceptOutline(directionById("cevi"), { blueprint: "call-first", device: signatureDevice({ signatureFact: "place", materials: [] })! })).toContain("This hero can't show the address");
    // Outside a template only the device.
    expect(conceptOutline(directionById("industrial"), plan)).toBe("Signature object (chosen in code from the client's own fact): the year the business started as the wall-sized figure (only the year the client wrote), the heading what it stands for. Use about:figure for it, right after the hero.");
  });
});

describe("the brief and design requests", () => {
  const config = loadConfig();
  const answer = (b: unknown) => ({ text: JSON.stringify(b), stopReason: "end_turn", model: "m", usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } });
  async function briefRequest(on: boolean | undefined, reply: unknown): Promise<{ req: ModelRequest; out: Awaited<ReturnType<typeof makeBrief>> }> {
    const seen: ModelRequest[] = [];
    const transport: ModelTransport = { async send(r) { seen.push(r); return answer(reply); } };
    const client = new ModelClient({ config, transport, spentToday: async () => 0, onCall: async () => undefined });
    const input = { description: CARPENTER, businessType: "builder", photoCount: 0, generatedSlots: 0, hasLogo: false, scope: "home" as const };
    const out = await makeBrief(client, on === undefined ? input : { ...input, concept: on });
    return { req: seen[0]!, out };
  }

  it("with the switch off, the brief request is today's: one system block, no concept in the schema or the message", async () => {
    const { req, out } = await briefRequest(undefined, brief());
    const off = await briefRequest(false, brief());
    expect(off.req).toEqual(req);
    expect(req.system).toEqual([BRIEF_SYSTEM]);
    expect(JSON.stringify(req.schema)).not.toContain("concept");
    expect(req.schema).toEqual(briefJsonSchema());
    expect(req.messages[0]!.content).toMatch(/^Business type \(classified\): builder\nPhotos provided: 0\n/);
    expect(out.brief.concept).toBeUndefined();
  });

  it("with it on, asks for the concept and keeps only what the client's text supports", async () => {
    const { req, out } = await briefRequest(true, { ...brief(), concept: concept({ materials: ["hrast", "bukev"], localAnchor: "Bohinj" }) });
    expect(req.system).toEqual([BRIEF_SYSTEM, BRIEF_CONCEPT_SYSTEM]);
    expect(req.messages[0]!.content).toMatch(/^Business type \(classified\): builder\nSubtypes for builder: plumbing, electrical, carpentry, roofing, painting\.\nPhotos provided: 0\n/);
    const schema = req.schema as { properties: Record<string, unknown>; required: string[] };
    expect(schema.required).toContain("concept");
    expect(out.brief.concept).toEqual(concept({ materials: ["hrast"], localAnchor: null }));
    expect(out.dropped).toEqual([
      { field: "concept.materials", value: "bukev" },
      { field: "concept.localAnchor", value: "Bohinj" },
    ]);
    // The subtype reaches the spec's business facts (it picks the motif); a brief without a concept leaves it out.
    expect(businessFromBrief(out.brief).subtype).toBe("carpentry");
    expect("subtype" in businessFromBrief(brief())).toBe(false);
    expect("subtype" in businessFromBrief(brief({ concept: concept({ subtype: "florist" }) }))).toBe(false);
  });

  it("tells the design step the subtype only with the switch on", async () => {
    const design = async (on: boolean | undefined, b: Brief) => {
      const seen: ModelRequest[] = [];
      const transport: ModelTransport = {
        async send(r) {
          seen.push(r);
          return answer({ direction: "cevi", fontPair: "x", primary: "#1d4ed8", accent: null, radius: 4, baseFontSize: 18, scale: 1.25, headingWeight: 700, headingCase: "normal", headingTracking: -0.02, density: "regular", shadow: "none", reason: "r" });
        },
      };
      const client = new ModelClient({ config, transport, spentToday: async () => 0, onCall: async () => undefined });
      await chooseDesign(client, { brief: b, swatches: [], photoCount: 0, generatedCount: 0, ...(on === undefined ? {} : { concept: on }) });
      return seen[0]!;
    };
    const withConcept = brief({ concept: concept() });
    const today = await design(undefined, brief());
    expect(await design(false, withConcept)).toEqual(today);
    expect(await design(true, brief())).toEqual(today);
    const on = (await design(true, withConcept)).messages[0]!.content as string;
    expect(on).toContain("Subtype: carpentry. On its trade's template the drawn motif is this subtype's own (joint), in the site's colours. Goal: enquire; angle: family-history.");
  });
});
