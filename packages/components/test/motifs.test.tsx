import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SIGNATURE_PHOTO_VARIANTS, direction, heroSignature, type Business, type Design, type SectionOf } from "@sb/spec";
import { HERO_SIGNATURE_SIZES, HeroSignature, signatureOffersDirections } from "../src/groups/heroes/HeroSignature.tsx";
import { Products, Team } from "../src/groups/business/Media.tsx";
import { ImageText } from "../src/groups/content/ImageText.tsx";
import { heroLcp } from "../src/groups/heroes/index.ts";
import { PriceList } from "../src/groups/business/Prices.tsx";
import { Contact } from "../src/groups/business/Info.tsx";
import { FULL_BUSINESS, SPARSE_BUSINESS, html, testCtx, testSpec } from "./helpers.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

function templateDesign(id: string): Design {
  const d = direction(id);
  return {
    direction: d.id,
    fontPair: d.fontPairs[0]!,
    colors: { ...d.palette.fallback },
    radius: d.ranges.radius[0],
    baseFontSize: d.ranges.baseFontSize[0],
    scale: d.ranges.scale[0],
    headingWeight: d.ranges.headingWeight[1],
    headingCase: d.ranges.headingCase[0]!,
    headingTracking: d.ranges.headingTracking[0],
    density: d.ranges.density[0]!,
    shadow: d.ranges.shadow[0]!,
    imagery: d.imagery,
  };
}

const KRANJ: Business = { ...FULL_BUSINESS, phone: "+38641555730", address: { street: "Savska cesta 52", postalCode: "4000", city: "Kranj" } };
const ctxFor = (dir: string, business: Business = KRANJ) => testCtx(testSpec({ design: templateDesign(dir), business }));

const hero = (variant: SectionOf<"hero-signature">["variant"], props: Partial<SectionOf<"hero-signature">["props"]> = {}): SectionOf<"hero-signature"> =>
  heroSignature.schema.parse({
    id: "s_hero",
    type: "hero-signature",
    variant,
    props: { headline: "Servis vseh znamk v Kranju", intro: "Družinski servis od leta 2008.", fact: "phone", factLabel: "Najhitreje nas dobite po telefonu", image: "img_salon", ...props },
  }) as SectionOf<"hero-signature">;

describe("hero-signature", () => {
  it("photo (Tablica): the phone as a plate with the town's code, one tel: link, the photo as LCP, a fact strip without the phone", () => {
    const out = html(<HeroSignature section={hero("photo")} ctx={ctxFor("tablica")} index={0} />);
    expect(out).toMatch(/<h1 id="s_hero-title" class="hsig__title">Servis vseh znamk v Kranju<\/h1>/);
    expect(out).toContain('<a class="plate plate--hero" href="tel:+38641555730" aria-label="Pokličite 041 555 730">');
    expect(out).toMatch(/KR<span class="plate__dot"><\/span>041 555 730/);
    expect(out.match(/href="tel:/g)).toHaveLength(1);
    expect(out).toContain('fetchPriority="high"');
    expect(out).toContain("hsig__strip tone-band");
    expect(out).toContain("Savska cesta 52, 4000 Kranj");
    expect(heroLcp["hero-signature"]?.(hero("photo"))).toEqual({ image: "img_salon", sizes: "100vw" });
  });

  it("offers directions beside the phone object, so the phone's call bar can wait below the hero", () => {
    const out = html(<HeroSignature section={hero("drawing")} ctx={ctxFor("cevi")} index={0} />);
    expect(out).toMatch(/<a href="https:\/\/www\.google\.com\/maps[^"]*"[^>]*class="text-link"[^>]*>Navodila za pot<\/a>/);
    expect(signatureOffersDirections(hero("drawing"))).toBe(true);
    // A link of the model's own replaces it; then the bar is needed from the start.
    const own = hero("drawing", { primary: { label: "Kje delamo", target: { page: "p_storitve" } } });
    expect(signatureOffersDirections(own)).toBe(false);
    expect(html(<HeroSignature section={own} ctx={ctxFor("cevi")} index={0} />)).not.toContain("Navodila za pot");
    expect(signatureOffersDirections(hero("arch", { fact: "opening" }))).toBe(false);
  });

  it("never adds a second call: a call link next to the phone object is dropped", () => {
    const out = html(<HeroSignature section={hero("photo", { primary: { label: "Pokličite", target: { action: "call" } } })} ctx={ctxFor("tablica")} index={0} />);
    expect(out.match(/href="tel:/g)).toHaveLength(1);
    expect(out).not.toContain("btn--primary");
  });

  it("drawing (Cevi): the number in a block with its label, a decorative radiator, no photo even when one is set", () => {
    const out = html(<HeroSignature section={hero("drawing", { factNote: "Če ne dvignem, vas pokličem nazaj isti dan." })} ctx={ctxFor("cevi")} index={0} />);
    expect(out).toContain('<a class="callblock" href="tel:+38641555730"><span class="callblock__label">Najhitreje nas dobite po telefonu</span><span class="callblock__num">041 555 730</span></a>');
    expect(out).toMatch(/<svg class="radiator hsig__drawing"[^>]*aria-hidden="true"/);
    expect(out).toContain("Če ne dvignem");
    expect(out).not.toContain("<img");
    expect(heroLcp["hero-signature"]?.(hero("drawing"))).toBeNull();
  });

  it("arch (Skorja): the earliest opening time on a seal from the hours, the photo in the arch, ordinary actions", () => {
    const section = hero("arch", { fact: "opening", factLabel: "Svež kruh", primary: { label: "Poglejte ponudbo", target: { page: "p_storitve" } }, secondary: { label: "Naročite po telefonu", target: { action: "call" } } });
    const out = html(<HeroSignature section={section} ctx={ctxFor("skorja")} index={0} />);
    // FULL_BUSINESS: mon–fri 8.00, sat 8.00, sun closed.
    expect(out).toContain('<p class="seal hsig__seal"><span class="seal__days">pon–sob odprto od</span><span class="seal__time">8.00</span></p>');
    expect(out).toContain("hsig__arch-media");
    expect(out).toContain("btn btn--primary");
    expect(out).toContain('href="tel:+38641555730"');
  });

  it("shows placeholders, never a broken link, when the phone or the hours are missing", () => {
    const sparse = ctxFor("skorja", SPARSE_BUSINESS);
    expect(html(<HeroSignature section={hero("drawing")} ctx={sparse} index={0} />)).toContain('data-ph="phone"');
    expect(html(<HeroSignature section={hero("arch", { fact: "opening" })} ctx={sparse} index={0} />)).toContain('data-ph="hours"');
    expect(html(<HeroSignature section={hero("photo")} ctx={sparse} index={0} />)).not.toContain("tel:");
  });

  it("works outside a template direction: the phone at poster type, no drawing", () => {
    const out = html(<HeroSignature section={hero("drawing")} ctx={testCtx()} index={0} />);
    expect(out).toContain('<a class="bignum bignum--hero" href="tel:+38641123456">041 123 456</a>');
    expect(out).not.toContain("radiator");
  });

  it("limits the headline to 60 characters and the fact to phone or opening", () => {
    expect(() => hero("photo", { headline: "x".repeat(61) })).toThrow();
    expect(() => hero("photo", { fact: "email" as never })).toThrow();
  });
});

describe("hero-signature receipt (Račun)", () => {
  const SOBOTA: Business = { ...FULL_BUSINESS, name: "Računovodstvo Seliškar d.o.o.", phone: "+38625554710", email: "pisarna@racunovodstvo-seliskar.example", address: { street: "Slovenska ulica 41", postalCode: "9000", city: "Murska Sobota" } };
  const receipt = (props: Partial<SectionOf<"hero-signature">["props"]> = {}) =>
    hero("receipt", {
      headline: "Računovodstvo za s.p., d.o.o. in društva",
      factLabel: "Pokličite nas",
      factNote: "Odvisna je od števila prejetih in izdanih računov.",
      secondary: { label: "Pišite nam", target: { action: "email" } },
      receipt: { title: "Kaj uredimo za vas", lines: ["Plače in potni stroški", "DDV in poročanje FURS"], total: { label: "Cena", value: "po dogovoru" } },
      ...props,
    });

  it("lists what the office does on a receipt with the business name from the facts, the call as the one button", () => {
    const out = html(<HeroSignature section={receipt()} ctx={ctxFor("racun", SOBOTA)} index={0} />);
    expect(out).toMatch(/<h1 id="s_hero-title" class="hsig__title[^"]*">Računovodstvo za s.p., d.o.o. in društva<\/h1>/);
    // The address line comes from the facts, not from props.
    expect(out).toContain('<p class="eyebrow hsig__eyebrow">Slovenska ulica 41, Murska Sobota</p>');
    expect(out.match(/btn btn--primary/g)).toHaveLength(1);
    expect(out).toMatch(/<a href="tel:\+38625554710" data-action="call" class="btn btn--primary">Pokličite nas<\/a>/);
    expect(out).toMatch(/<a href="mailto:pisarna@racunovodstvo-seliskar\.example" data-action="email" class="text-link">Pišite nam<\/a>/);
    expect(out).toContain('<p class="receipt__title" id="s_hero-receipt">Kaj uredimo za vas</p><p class="receipt__sub">Računovodstvo Seliškar d.o.o.</p>');
    expect(out).toContain('<ul class="receipt__lines" aria-labelledby="s_hero-receipt"><li>Plače in potni stroški</li><li>DDV in poročanje FURS</li></ul>');
    expect(out).toContain('<p class="receipt__total"><span>Cena</span><span>po dogovoru</span></p>');
    expect(out).toContain('<p class="receipt__fine">Odvisna je od števila prejetih in izdanih računov.</p>');
    expect(out).toContain('<span class="receipt__tear" aria-hidden="true"></span>');
    expect(out).not.toContain("<img");
    expect(out).not.toContain("<h2");
    expect(heroLcp["hero-signature"]?.(receipt())).toBeNull();
  });

  it("agrees with the spec on which variants show a photo (the pipeline plans pictures by it)", () => {
    const withPhoto = Object.entries(HERO_SIGNATURE_SIZES).filter(([, sizes]) => sizes !== null).map(([v]) => v);
    expect(withPhoto.sort()).toEqual([...SIGNATURE_PHOTO_VARIANTS].sort());
    expect(Object.keys(HERO_SIGNATURE_SIZES).sort()).toEqual([...heroSignature.variants].sort());
  });

  it("never adds a second call, and shows the phone placeholder instead of a broken button", () => {
    const twice = html(<HeroSignature section={receipt({ primary: { label: "Pokličite", target: { action: "call" } } })} ctx={ctxFor("racun", SOBOTA)} index={0} />);
    expect(twice.match(/href="tel:/g)).toHaveLength(1);
    const sparse = html(<HeroSignature section={receipt()} ctx={ctxFor("racun", SPARSE_BUSINESS)} index={0} />);
    expect(sparse).not.toContain("tel:");
    expect(sparse).toContain('data-ph="phone"');
    expect(sparse).not.toContain("hsig__eyebrow");
  });

  it("leaves the receipt out when there is none, and takes the model's own eyebrow over the address", () => {
    const out = html(<HeroSignature section={receipt({ receipt: undefined, eyebrow: "Računovodstvo v Pomurju" })} ctx={ctxFor("racun", SOBOTA)} index={0} />);
    expect(out).not.toContain("receipt__");
    expect(out).toContain("Računovodstvo v Pomurju");
    expect(out).not.toContain("Slovenska ulica 41");
  });
});

describe("hero-signature label (Etiketa)", () => {
  const KOPER: Business = { ...FULL_BUSINESS, name: "Oljka in sol", phone: "+38655551860", address: { street: "Kidričeva ulica 22", postalCode: "6000", city: "Koper" } };
  const label = (props: Partial<SectionOf<"hero-signature">["props"]> = {}) =>
    hero("label", {
      headline: "Istrske dobrote manjših pridelovalcev",
      intro: "Majhna trgovina v starem mestnem jedru Kopra.",
      fact: "address",
      factLabel: undefined,
      primary: { label: "Darilni paketi", target: { page: "p_storitve" } },
      secondary: { label: "Kaj prodajamo", target: { page: "p_storitve" } },
      image: "img_salon",
      inset: "img_team",
      ...props,
    });

  it("sets the headline on a label card with the address from the facts, the photo in an arch and the inset in a disc", () => {
    const out = html(<HeroSignature section={label()} ctx={ctxFor("etiketa", KOPER)} index={0} />);
    expect(out).toContain("s-hero-signature--label tone-inverse");
    expect(out).toMatch(/<div class="label-card hsig__card"><svg class="branch"[^>]*aria-hidden="true"/);
    expect(out).toContain('<p class="hsig__where">Kidričeva ulica 22, Koper</p>');
    expect(out).toMatch(/<h1 id="s_hero-title" class="hsig__title[^"]*">Istrske dobrote manjših pridelovalcev<\/h1>/);
    expect(out.match(/btn btn--primary/g)).toHaveLength(1);
    expect(out).toContain('class="text-link">Kaj prodajamo</a>');
    expect(out).toMatch(/<figure class="hsig__door"><picture class="media hsig__door-media arch-top media--contained">/);
    expect(out).toMatch(/<span class="hsig__dot disc"><picture class="media hsig__dot-media media--contained">/);
    // The arch photo is the LCP image; the inset loads lazily.
    expect(out.match(/fetchPriority="high"/g)).toHaveLength(1);
    expect(heroLcp["hero-signature"]?.(label())).toEqual({ image: "img_salon", sizes: "(min-width: 64rem) 32rem, 74vw" });
    expect(out).not.toContain("tel:");
  });

  it("shows an address placeholder instead of an invented one, and works without photos", () => {
    const out = html(<HeroSignature section={label({ image: undefined, inset: undefined })} ctx={ctxFor("etiketa", SPARSE_BUSINESS)} index={0} />);
    expect(out).toContain('data-ph="address"');
    expect(out).not.toContain("<img");
    expect(out).toContain("hsig hsig--label");
    expect(out).not.toContain("hsig--has-image");
  });
});

describe("hero-signature card (Jedilnik)", () => {
  const LOKA: Business = { ...FULL_BUSINESS, name: "Gostilna Pri Zlati Žlici", address: { street: "Kapucinski trg 7", postalCode: "4220", city: "Škofja Loka" } };
  const card = (props: Partial<SectionOf<"hero-signature">["props"]> = {}) =>
    hero("card", {
      headline: "Domače jedi iz sestavin lokalnih kmetov",
      intro: "Družinska gostilna v starem delu Škofje Loke.",
      fact: "address",
      factLabel: undefined,
      primary: { label: "Rezervirajte mizo", target: { action: "call" } },
      secondary: { label: "Jedilni list", target: { page: "p_storitve" } },
      ...props,
    });

  it("lays the menu card over the house photo: the address from the facts, one call button and a link", () => {
    const out = html(<HeroSignature section={card()} ctx={ctxFor("jedilnik", LOKA)} index={0} />);
    expect(out).toContain("s-hero-signature--card tone-default");
    expect(out).toMatch(/<picture class="media hsig__bg media--contained">/);
    expect(out).toContain('<div class="label-card label-card--rule hsig__card"><p class="hsig__where">Kapucinski trg 7, Škofja Loka</p>');
    expect(out.match(/btn btn--primary/g)).toHaveLength(1);
    expect(out).toMatch(/data-action="call" class="btn btn--primary">Rezervirajte mizo<\/a>/);
    expect(out).toContain('class="text-link">Jedilni list</a>');
    expect(heroLcp["hero-signature"]?.(card())).toEqual({ image: "img_salon", sizes: "100vw" });
  });

  it("stands on the dark ground without a photo", () => {
    const out = html(<HeroSignature section={card({ image: undefined })} ctx={ctxFor("jedilnik", LOKA)} index={0} />);
    expect(out).toContain('class="hsig hsig--card"');
    expect(out).not.toContain("<img");
  });
});

describe("hero-signature mirrors (Ogledalo)", () => {
  const CELJE: Business = { ...FULL_BUSINESS, name: "Frizerstvo Lana", phone: "+38641555213", address: { street: "Stanetova ulica 14", postalCode: "3000", city: "Celje" } };
  const mirrors = (props: Partial<SectionOf<"hero-signature">["props"]> = {}) =>
    hero("mirrors", {
      headline: "Barvamo brez amoniaka",
      fact: "phone",
      factLabel: "Naročite se",
      wordmark: "Lana",
      images: ["img_salon", "img_team", "img_detail"],
      image: undefined,
      secondary: { label: "Cenik", target: { page: "p_storitve" } },
      ...props,
    });

  it("sets the name wall-sized behind (hidden from screen readers), three photos in arches, the call as the button", () => {
    const out = html(<HeroSignature section={mirrors()} ctx={ctxFor("ogledalo", CELJE)} index={0} />);
    expect(out).toContain('<p class="hsig__wall" aria-hidden="true">Lana</p>');
    expect(out).toContain('<p class="eyebrow hsig__eyebrow">Stanetova ulica 14, Celje</p>');
    expect(out).toContain('<div class="hsig__mirrors" data-count="3">');
    expect(out.match(/class="media hsig__mirror arch-top media--contained"/g)).toHaveLength(3);
    // Only the first mirror is the LCP image.
    expect(out.match(/fetchPriority="high"/g)).toHaveLength(1);
    expect(heroLcp["hero-signature"]?.(mirrors())).toEqual({ image: "img_salon", sizes: "(min-width: 64rem) 15rem, 32vw" });
    expect(out).toMatch(/<a href="tel:\+38641555213" data-action="call" class="btn btn--primary">Naročite se<\/a>/);
    expect(out.match(/href="tel:/g)).toHaveLength(1);
  });

  it("rejects a wordmark that isn't the business's own name, and images or a wordmark on another variant", async () => {
    const { validateSite } = await import("@sb/spec");
    const golden = JSON.parse(readFileSync(path.join(here, "../../../tools/eval/golden/frizerstvo-lana.json"), "utf8"));
    const { migrateSpec } = await import("@sb/spec");
    const spec = migrateSpec(golden);
    expect(validateSite(spec).issues).toEqual([]);
    const h = spec.pages[0]!.sections[0]! as SectionOf<"hero-signature">;
    h.props.wordmark = "Lepota";
    expect(validateSite(spec).issues.map((i) => i.message)).toContain("wordmark must be one word of the business name");
    h.props.wordmark = "lana";
    expect(validateSite(spec).issues).toEqual([]);
    h.variant = "arch";
    expect(validateSite(spec).issues.map((i) => i.message)).toEqual(expect.arrayContaining(["images are only shown by the mirrors variant", "wordmark is only shown by the mirrors variant"]));
  });
});

describe("hero-signature disc (Nasmeh)", () => {
  const MARIBOR: Business = { ...FULL_BUSINESS, name: "Zobozdravstvo Lebar", phone: "+38625553120", address: { street: "Gosposvetska cesta 36", postalCode: "2000", city: "Maribor" } };
  const disc = (props: Partial<SectionOf<"hero-signature">["props"]> = {}) =>
    hero("disc", {
      headline: "Prvi obisk je le pogovor in pregled, brez posegov",
      fact: "phone",
      factLabel: "Naročite se",
      factNote: "Otroke sprejemamo od 3. leta starosti.",
      secondary: { label: "Pišite nam", target: { action: "email" } },
      ...props,
    });

  it("sets the promise as the headline, the photo round with the arc, the note on the chip, the call as the button", () => {
    const out = html(<HeroSignature section={disc()} ctx={ctxFor("nasmeh", MARIBOR)} index={0} />);
    expect(out).toContain('<p class="eyebrow hsig__eyebrow">Gosposvetska cesta 36, Maribor</p>');
    expect(out).toMatch(/<figure class="hsig__face"><picture class="media hsig__face-media disc media--contained">[\s\S]*<\/picture><span class="hsig__arc" aria-hidden="true"><\/span><figcaption class="hsig__chip">Otroke sprejemamo od 3\. leta starosti\.<\/figcaption><\/figure>/);
    expect(out).toMatch(/<a href="tel:\+38625553120" data-action="call" class="btn btn--primary">Naročite se<\/a>/);
    expect(out.match(/btn btn--primary/g)).toHaveLength(1);
    expect(heroLcp["hero-signature"]?.(disc())).toEqual({ image: "img_salon", sizes: "(min-width: 64rem) 35rem, 82vw" });
  });

  it("keeps the note without a photo", () => {
    const out = html(<HeroSignature section={disc({ image: undefined })} ctx={ctxFor("nasmeh", MARIBOR)} index={0} />);
    expect(out).toContain('<p class="hsig__chip hsig__chip--alone">Otroke sprejemamo od 3. leta starosti.</p>');
    expect(out).not.toContain("<img");
  });
});

describe("price-list offers (Jedilnik)", () => {
  const offers: SectionOf<"price-list"> = {
    id: "s_today",
    type: "price-list",
    variant: "offers",
    tone: "inverse",
    props: { title: "Malica in nedeljsko kosilo", groups: [{ name: "Vsak dan", items: [{ name: "Dnevna malica", note: "Juha, glavna jed, solata", price: { amount: 11.5 } }] }, { name: "Ob nedeljah", items: [{ name: "Nedeljsko kosilo", price: { $placeholder: "price" } }] }] },
  };

  it("sets each offer with when, what and the price at headline size, a spoon between them, the heading for screen readers", () => {
    const out = html(<PriceList section={offers} ctx={ctxFor("jedilnik")} index={1} />);
    expect(out).toContain('<h2 id="s_today-title" class="section-title">Malica in nedeljsko kosilo</h2>');
    expect(out).toMatch(/<p class="offers__when">Vsak dan<\/p><h3 class="offers__name">Dnevna malica<\/h3><p class="offers__note">Juha, glavna jed, solata<\/p><p class="offers__price"><span class="price">11,50\s€<\/span><\/p>/);
    expect(out.match(/<svg class="spoon offers__spoon"/g)).toHaveLength(1);
    expect(out).toContain('data-ph="price"');
  });

  it("draws no spoon outside Jedilnik", () => {
    expect(html(<PriceList section={offers} ctx={testCtx()} index={1} />)).not.toContain("spoon");
  });
});

describe("products plates, image-text pair, team photo (Jedilnik, Ogledalo)", () => {
  it("plates: dishes with a photo on round plates, the rest on a ruled list with leaders and price placeholders", () => {
    const section: SectionOf<"products"> = {
      id: "s_dishes",
      type: "products",
      variant: "plates",
      props: { title: "Z jedilnega lista", items: [{ name: "Telečja obara", price: { amount: 8.5 }, image: "img_salon" }, { name: "Ričet", price: { $placeholder: "price" } }] },
    };
    const out = html(<Products section={section} ctx={ctxFor("jedilnik")} index={2} />);
    expect(out).toMatch(/<li class="plates__item"><picture class="media plates__media disc media--contained">[\s\S]*<h3 class="plates__name">Telečja obara<\/h3><p class="plates__price"><span class="price">8,50\s€<\/span>/);
    expect(out).toMatch(/<li class="plates-list__item"><h3 class="plates-list__name">Ričet<\/h3><span class="plates-list__leader" aria-hidden="true"><\/span><p class="plates-list__price"><mark class="ph" data-ph="price"/);
  });

  it("pair: the client's number inside the h2 on its own line, the second photo over the corner, the link as the one button", () => {
    const section: SectionOf<"image-text"> = {
      id: "s_terrace",
      type: "image-text",
      variant: "pair",
      tone: "inverse",
      props: { heading: "sedežev na terasi pod lipo", figure: "40", paragraphs: ["Terasa je odprta poleti."], link: { label: "Rezervirajte za skupino", target: { action: "call" } }, image: "img_salon", inset: "img_team" },
    };
    const out = html(<ImageText section={section} ctx={ctxFor("jedilnik")} index={3} />);
    expect(out).toContain('<h2 id="s_terrace-title" class="section-title"><span class="image-text__figure">40</span> sedežev na terasi pod lipo</h2>');
    expect(out).toContain('<picture class="media image-text__inset media--contained">');
    expect(out).toMatch(/data-action="call" class="btn btn--primary image-text__link">Rezervirajte za skupino<\/a>/);
    expect(out.match(/<h2/g)).toHaveLength(1);
  });

  it("team photo: the people as ruled rows beside the photo and its inset; names from the facts or placeholders", () => {
    const section: SectionOf<"team"> = {
      id: "s_team",
      type: "team",
      variant: "photo",
      tone: "alt",
      props: { title: "V salonu delava dve", members: [{ name: "Lana Vidmar", role: "lastnica, frizerka" }, { name: { $placeholder: "name" }, role: "frizerka" }], image: "img_salon", inset: "img_team" },
    };
    const out = html(<Team section={section} ctx={ctxFor("ogledalo")} index={3} />);
    expect(out).toContain('<div class="team-photo team-photo--has-image">');
    expect(out).toMatch(/<li class="team-rows__member"><h3 class="team-rows__name">Lana Vidmar<\/h3><p class="team-rows__role muted">lastnica, frizerka<\/p><\/li>/);
    expect(out).toContain('data-ph="name"');
    expect(out).toContain('<picture class="media team-photo__inset media--contained">');
    const noPhoto = html(<Team section={{ ...section, props: { ...section.props, image: undefined, inset: undefined } }} ctx={ctxFor("ogledalo")} index={3} />);
    expect(noPhoto).toContain('<div class="team-photo">');
    expect(noPhoto).not.toContain("<img");
  });
});

describe("price-list tags", () => {
  const section: SectionOf<"price-list"> = {
    id: "s_cene",
    type: "price-list",
    variant: "tags",
    tone: "inverse",
    props: { title: "Nekaj cen", groups: [{ items: [{ name: "Diagnostika", price: { amount: 30 } }, { name: "Menjava gum", note: "za komplet", price: { $placeholder: "price" } }] }] },
  };

  it("draws every price as a plate in Tablica, the name as h3 under it", () => {
    const out = html(<PriceList section={section} ctx={ctxFor("tablica")} index={1} />);
    expect(out).toContain('<p class="price-tag plate"><span class="plate__eu" aria-hidden="true"><span>SLO</span></span>');
    expect(out).toMatch(/30\s€<\/span><\/span><\/p><h3 class="price-tags__name">Diagnostika<\/h3>/);
    expect(out).toContain('data-ph="price"');
  });

  it("keeps the plate for an item the owner marked unavailable, says so under its name", () => {
    const off: SectionOf<"price-list"> = { ...section, props: { ...section.props, groups: [{ items: [{ name: "Diagnostika", price: { amount: 30 }, unavailable: true }, { name: "Menjava olja", price: { amount: 45, from: true } }] }] } };
    const out = html(<PriceList section={off} ctx={ctxFor("tablica")} index={1} />);
    expect(out.match(/<p class="price-tag plate">/g)).toHaveLength(2);
    expect(out).toMatch(/<li class="price-tags__item is-unavailable">[\s\S]*Diagnostika<\/h3><p><span class="unavailable price-tags__flag">Trenutno ni na voljo<\/span><\/p><\/li>/);
    expect(out).toMatch(/od 45\s€/);
  });

  it("sets every price on a bottle label in Etiketa: branch, name, the quantity, then the price", () => {
    const out = html(<PriceList section={{ ...section, tone: undefined }} ctx={ctxFor("etiketa")} index={1} />);
    expect(out).toContain('<ul class="price-labels" role="list">');
    expect(out).toMatch(/<li class="price-label label-card"><svg class="branch"[^>]*>[\s\S]*?<\/svg><h3 class="price-label__name">Diagnostika<\/h3><p class="price-label__price"><span class="price">30\s€<\/span><\/p><\/li>/);
    expect(out).toMatch(/<h3 class="price-label__name">Menjava gum<\/h3><p class="price-label__note">za komplet<\/p><p class="price-label__price"><mark class="ph" data-ph="price"/);
    expect(out).not.toContain("plate");
  });

  it("is a plain large price elsewhere", () => {
    const out = html(<PriceList section={section} ctx={testCtx()} index={1} />);
    expect(out).toContain('<p class="price-tag">');
    expect(out).not.toContain("plate");
  });
});

describe("contact call-out", () => {
  const section: SectionOf<"contact"> = { id: "s_klic", type: "contact", variant: "call-out", tone: "band", props: { title: "Pokličite" } };

  it("puts the phone at poster size as the direction's call object, then address, hours and e-mail, and no map", () => {
    const out = html(<Contact section={section} ctx={ctxFor("tablica")} index={5} />);
    expect(out).toContain('class="plate plate--poster"');
    expect(out).toContain("Savska cesta 52");
    expect(out).toContain("Delovni čas");
    expect(out).toContain("info@salon-lipa.si");
    expect(out).not.toContain("data-embed-src");
    const cevi = html(<Contact section={section} ctx={ctxFor("cevi")} index={5} />);
    expect(cevi).toContain('<a class="bignum bignum--poster" href="tel:+38641555730">041 555 730</a>');
  });

  it("leaves the hours to an opening-hours section on the same page (say each thing once)", () => {
    const ctx = ctxFor("etiketa");
    const withHours = { ...ctx, page: { ...ctx.page, sections: [section, { id: "s_oh", type: "opening-hours", variant: "photo", props: { title: "Odprto" } }] } } as typeof ctx;
    expect(html(<Contact section={section} ctx={withHours} index={5} />)).not.toContain("Delovni čas");
    expect(html(<Contact section={section} ctx={ctx} index={5} />)).toContain("Delovni čas");
  });

  it("leaves out an e-mail the owner doesn't have", () => {
    const out = html(<Contact section={section} ctx={ctxFor("cevi", { ...KRANJ, email: { $placeholder: "email" } })} index={5} />);
    expect(out).not.toContain("E-pošta");
  });
});

describe("motifs.css", () => {
  const css = readFileSync(path.join(here, "../styles/motifs.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

  it("contains none of the banned visual patterns and no raw colours", () => {
    expect(css).not.toMatch(/gradient\(|backdrop-filter|font-style:\s*italic|monospace/);
    expect(css).not.toMatch(/box-shadow/);
    for (const m of css.matchAll(/#[0-9a-f]{3,6}\b|rgb\(/gi)) expect.fail(`raw colour ${m[0]}`);
  });

  it("rounds only drawn objects (seal, valves, stops, the plate's dot) and photos in a disc, never buttons", () => {
    for (const m of css.matchAll(/([^{}]+)\{[^}]*border-radius:\s*50%/g)) {
      expect(m[1]!.trim()).toMatch(/^(?:[^,]*plate__dot|[^,]*steps__item::before|[^,]*area__list li::before|\.disc,\s*\.media\.disc)$/);
      expect(m[1]).not.toMatch(/btn/);
    }
  });

  it("never puts a disc or an arch on a button or a link", () => {
    for (const m of css.matchAll(/([^{}]+)\{/g)) {
      if (/\.(disc|arch-top)\b/.test(m[1]!)) expect(m[1]).not.toMatch(/btn|\ba\b|button|text-link/);
    }
    const src = ["HeroSignature.tsx", "../business/Info.tsx", "../content/ImageText.tsx"].map((f) => readFileSync(path.join(here, "../src/groups/heroes", f), "utf8")).join("\n");
    for (const m of src.matchAll(/className=\{?"([^"]*\b(?:disc|arch-top)\b[^"]*)"/g)) expect(m[1]).not.toMatch(/btn|text-link/);
  });
});
