import { describe, expect, it } from "vitest";
import type { SiteSpec } from "@sb/spec";
import { checkFacts } from "../src/index.ts";

/** The v20 kinds' fact rules (studio-phase1-design.md §1.8). */
const corpus =
  "Frizerstvo Lana, Ljubljanska cesta 8, 3000 Celje. Tel. 041 555 301, lana@frizerstvo-lana.example. " +
  "Pon–pet 8.00–19.00. Moško striženje 18 €. Salon vodi Lana Kos. " +
  'Stranka je zapisala: „Lana mi je rešila poročni dan,   hvala!“ (Maja Novak). ' +
  "Nahajamo se na vogalu s Kidričevo ulico, ob parkirišču za Mercatorjem. Najboljša kava v mestu, so nam rekli. Salon je odprt od leta 2004.";

const desk = { col: 1, span: 6, row: 1 };
const phone = { order: 0, span: "full" };
const img = (id: string, extra: object = {}) => ({ id, src: `${id}.jpg`, width: 800, height: 600, alt: "Fotografija", ...extra });

function spec(elements: unknown[], over: { city?: string; amenities?: string[]; images?: unknown[] } = {}): SiteSpec {
  return {
    business: {
      name: "Frizerstvo Lana",
      type: "hairdresser",
      phone: "+38641555301",
      email: "lana@frizerstvo-lana.example",
      address: { street: "Ljubljanska cesta 8", postalCode: over.city ? "1230" : "3000", city: over.city ?? "Celje" },
      hours: { entries: [{ from: "mon", to: "fri", open: "08:00", close: "19:00" }] },
      provider: { legalName: { $placeholder: "legalName" }, registrationNumber: { $placeholder: "registrationNumber" }, taxNumber: { $placeholder: "taxNumber" } },
      ...(over.amenities ? { amenities: over.amenities } : {}),
    },
    assets: { images: over.images ?? [] },
    pages: [{ id: "p_home", kind: "home", slug: "", sections: [{ id: "s_comp", type: "composed", props: { intent: "story", width: "wide", rows: 2, elements } }] }],
  } as unknown as SiteSpec;
}
const el = (e: object) => ({ id: "e_x", desk, phone, ...e });
const found = (s: SiteSpec) => checkFacts(s, corpus).map((v) => `${v.kind}:${v.value}:${v.path}`);
const at = (i: number, rest: string) => `/pages/0/sections/0/props/elements/${i}${rest}`;

describe("quote", () => {
  it("passes the client's words, whatever the whitespace and quote marks", () => {
    const q = el({ kind: "quote", text: '"Lana mi je rešila poročni dan, hvala!"', by: "Maja Novak" });
    expect(checkFacts(spec([q]), corpus)).toEqual([]);
  });
  it("rejects a quote or attribution that is not verbatim in the input", () => {
    const f = found(spec([el({ kind: "quote", text: "Lana mi je rešila poročni dan, najlepša hvala!", by: "Janez Horvat" })]));
    expect(f).toEqual(
      expect.arrayContaining([`quote:Lana mi je rešila poročni dan, najlepša hvala!:${at(0, "/text")}`, `quote:Janez Horvat:${at(0, "/by")}`]),
    );
  });
  it("is checked as shown in a translation too", () => {
    const s = {
      ...spec([el({ kind: "quote", text: "Lana mi je rešila poročni dan, hvala!" })]),
      locales: { default: "sl", enabled: ["sl", "en"] },
      translations: { en: { "/pages/0/sections/0/props/elements/0/text": "Lana saved my wedding day, thanks!" } },
    } as unknown as SiteSpec;
    expect(found(s)).toEqual(expect.arrayContaining([`quote:Lana saved my wedding day, thanks!:/translations/en${at(0, "/text")}`]));
  });
});

describe("sticker and ribbon", () => {
  it("passes plain short copy and a claim the client wrote verbatim", () => {
    const ok = [el({ kind: "sticker", text: "Brez čakanja", shape: "round" }), el({ kind: "ribbon", items: ["Striženje", "Barvanje"] }), el({ kind: "sticker", text: "Najboljša kava v mestu", shape: "tag" })];
    expect(checkFacts(spec(ok), corpus)).toEqual([]);
  });
  it.each(["★ 4,9", "Ocena 4.9/5", "5/5", "Nagrajen salon", "Nagrada 2023", "Priznanje stroke", "Certificiran frizer", "Certifikat kakovosti", "Najboljši frizer", "Najboljše cene", "Št. 1 v Celju", "#1 v mestu", "Ocenjeno z 5", "Award winner"])(
    "rejects a sticker saying %s",
    (t) => {
      expect(found(spec([el({ kind: "sticker", text: t, shape: "round" })])).some((f) => f.startsWith(`claim:${t}:`))).toBe(true);
    },
  );
  it("rejects a claim in a ribbon item, by position", () => {
    const f = found(spec([el({ kind: "ribbon", items: ["Striženje", "Najboljši salon"] })]));
    expect(f).toContain(`claim:Najboljši salon:${at(0, "/items/1")}`);
  });
  it("does not mistake a free estimate for a rating", () => {
    expect(found(spec([el({ kind: "sticker", text: "Brezplačna ocenitev", shape: "rect" })]))).toEqual([]);
  });
  it("still runs the number check on their copy", () => {
    expect(found(spec([el({ kind: "sticker", text: "Že 25 let", shape: "round" })]))).toContain(`number:25:/pages/0/sections/0/props/elements/0/text`);
  });
});

describe("map", () => {
  it("passes cross and note that are in the input, and no text at all", () => {
    expect(checkFacts(spec([el({ kind: "map", style: "corner", cross: "Kidričevo ulico", note: "ob parkirišču za Mercatorjem" }), el({ kind: "map", style: "pin" })]), corpus)).toEqual([]);
  });
  it("rejects a cross street or note the client did not write", () => {
    const f = found(spec([el({ kind: "map", style: "street", cross: "Prešernova ulica", note: "Nasproti pošte" })]));
    expect(f).toEqual(expect.arrayContaining([`verbatim:Prešernova ulica:${at(0, "/cross")}`, `verbatim:Nasproti pošte:${at(0, "/note")}`]));
  });
});

describe("iconFacts", () => {
  it("passes keys that are in business.amenities, with a note", () => {
    const s = spec([el({ kind: "iconFacts", items: [{ fact: "wifi" }, { fact: "parking", note: "Odprto od 8.00" }] })], { amenities: ["wifi", "parking", "card"] });
    expect(checkFacts(s, corpus)).toEqual([]);
  });
  it("rejects a key missing from amenities, or any key when there are none", () => {
    const items = [{ fact: "wifi" }, { fact: "ev-charging" }];
    expect(found(spec([el({ kind: "iconFacts", items })], { amenities: ["wifi"] }))).toEqual([`amenity:ev-charging:${at(0, "/items/1/fact")}`]);
    expect(found(spec([el({ kind: "iconFacts", items })])).filter((f) => f.startsWith("amenity:"))).toHaveLength(2);
  });
  it("checks a note like copy", () => {
    const s = spec([el({ kind: "iconFacts", items: [{ fact: "wifi", note: "Pokličite 041 555 999" }] })], { amenities: ["wifi"] });
    expect(found(s).some((f) => f.startsWith("phone:"))).toBe(true);
  });
});

describe("photos", () => {
  const photos = (extra: object) => el({ kind: "photos", arrangement: "strip", images: ["img_a", "img_b"], ...extra });
  it("passes the client's own photos (origin client or unset)", () => {
    expect(checkFacts(spec([photos({})], { images: [img("img_a"), img("img_b", { origin: "client" })] }), corpus)).toEqual([]);
  });
  it("rejects a generated image in any arrangement", () => {
    for (const arrangement of ["strip", "fan", "stack"]) {
      const s = spec([photos({ arrangement })], { images: [img("img_a"), img("img_b", { origin: "generated" })] });
      expect(found(s)).toEqual([`photo:img_b:${at(0, "/images/1")}`]);
    }
  });
  const ba = (extra: object) => photos({ arrangement: "before-after", ...extra });
  it("passes a before-after pair of client photos captioned prej and potem", () => {
    const s = spec([ba({ captions: ["Prej", "Potem"] })], { images: [img("img_a"), img("img_b")] });
    expect(checkFacts(s, corpus)).toEqual([]);
    // The photos' own descriptions can carry the labels instead.
    const t = spec([ba({})], { images: [img("img_a", { alt: "Kuhinja pred prenovo" }), img("img_b", { alt: "Kuhinja po prenovi" })] });
    expect(checkFacts(t, corpus)).toEqual([]);
  });
  it("rejects a before-after pair without labels, in the wrong order, of generated photos, or not two", () => {
    const images = [img("img_a"), img("img_b")];
    expect(found(spec([ba({})], { images })).map((f) => f.split(":")[0])).toEqual(["photo"]);
    expect(found(spec([ba({ captions: ["Potem", "Prej"] })], { images })).map((f) => f.split(":")[0])).toEqual(["photo"]);
    expect(found(spec([ba({ captions: ["Prej", "Potem"] })], { images: [img("img_a"), img("img_b", { origin: "generated" })] })).map((f) => f.split(":")[0])).toEqual(["photo"]);
    expect(found(spec([ba({ images: ["img_a", "img_b", "img_c"], captions: ["Prej", "Potem", "Še"] })], { images: [...images, img("img_c")] }))).toEqual([expect.stringContaining(`photo:3:${at(0, "/images")}`)]);
  });
});

describe("list leads", () => {
  const list = (items: unknown[]) => el({ kind: "list", marker: "line", items });
  it("passes leads that are the client's dates and numbers", () => {
    expect(checkFacts(spec([list([{ lead: "2004", text: "Odprtje salona" }, { lead: "8.00", text: "Odpremo vrata" }])]), corpus)).toEqual([]);
  });
  it("rejects an invented date or number in a lead", () => {
    expect(found(spec([list([{ lead: "1987", text: "Začetek" }])]))).toEqual([`number:1987:${at(0, "/items/0/lead")}`]);
  });
  it("rejects a numbered label as a lead", () => {
    const f = found(spec([list([{ lead: "01", text: "Posvet" }, { lead: "02 /", text: "Striženje" }])]));
    expect(f).toEqual(expect.arrayContaining([`label:01:${at(0, "/items/0/lead")}`, `label:02 /:${at(0, "/items/1/lead")}`]));
  });
});

describe("plate codes", () => {
  it("passes plateCode when the town has a registration code", () => {
    const e = [el({ kind: "fact", value: "8.00", label: "Odprto od", treatment: "plate", size: 4, plateCode: true }), el({ kind: "prices", style: "plates", plateCode: true, items: [{ name: "Moško striženje", price: { amount: 18 } }] })];
    expect(checkFacts(spec(e), corpus)).toEqual([]);
  });
  it("rejects plateCode in a town the table does not know, on a fact and on prices", () => {
    const corpusTown = corpus.replace("3000 Celje", "1230 Domžale");
    const e = [el({ kind: "fact", value: "8.00", label: "Odprto od", treatment: "plate", size: 4, plateCode: true }), el({ kind: "prices", style: "plates", plateCode: true, items: [{ name: "Moško striženje", price: { amount: 18 } }] })];
    const f = checkFacts(spec(e, { city: "Domžale" }), corpusTown).map((v) => `${v.kind}:${v.path}`);
    expect(f).toEqual(expect.arrayContaining([`plate:${at(0, "/plateCode")}`, `plate:${at(1, "/plateCode")}`]));
  });
  it("is fine without the flag in an unknown town", () => {
    const e = [el({ kind: "fact", value: "8.00", label: "Odprto od", treatment: "plate", size: 4 })];
    expect(checkFacts(spec(e, { city: "Domžale" }), corpus.replace("3000 Celje", "1230 Domžale"))).toEqual([]);
  });
});

describe("layout keys", () => {
  it("skips every v20 layout value, but not the copy next to it", () => {
    const e = [
      el({ kind: "heading", text: "Striženje", level: 1, size: 7, treatment: "outline", color: "accent", fill: "surface", weight: 700 }),
      el({ kind: "list", items: [{ lead: "2004", text: "Odprtje" }], marker: "drawing", drawing: "ornament/rope-line", weight: "bold" }),
      el({ kind: "photos", arrangement: "before-after", images: ["img_a", "img_b"], captions: ["Prej", "Potem"], mask: "arch" }),
      el({ kind: "ribbon", items: ["Striženje"], separator: "ornament/rope-line", move: "drift" }),
      el({ kind: "iconFacts", items: [{ fact: "wifi" }], icons: "cut" }),
      el({ kind: "decor", drawing: "ornament/rope-line", fit: "fixed", size: 4, repeat: "x", color: "accent" }),
    ];
    const s = spec(e, { amenities: ["wifi"], images: [img("img_a"), img("img_b")] });
    (s.pages[0]!.sections[0]!.props as unknown as Record<string, unknown>).background = [{ kind: "drawing", drawing: "ornament/rope-line", scale: 4, anchor: "end", color: "accent" }];
    (s.pages[0]!.sections[0]!.props as unknown as Record<string, unknown>).top = { edge: "drawing", drawing: "ornament/rope-line", rise: 1 };
    expect(checkFacts(s, corpus)).toEqual([]);
  });
});
