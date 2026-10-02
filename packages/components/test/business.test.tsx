import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ReactElement } from "react";
import {
  businessDefs,
  contactSection,
  contactFormSection,
  formatPhone,
  faqSection,
  gallerySection,
  menuSection,
  openingHoursSection,
  priceList,
  productsSection,
  roomsSection,
  serviceAreaSection,
  servicesCards,
  servicesList,
  teamSection,
  type Business,
  type SectionOf,
  type SectionType,
} from "@sb/spec";
import { businessIslands, businessLcp, businessRenderers } from "../src/groups/business/index.ts";
import { largestWebp } from "../src/groups/business/shared.tsx";
import { initials } from "../src/groups/business/Media.tsx";
import type { RenderCtx } from "../src/types.ts";
import { FULL_BUSINESS, SPARSE_BUSINESS, html, testCtx, testSpec } from "./helpers.ts";

const NBSP = " ";
const here = path.dirname(fileURLToPath(import.meta.url));

type BizType = keyof typeof businessRenderers;

function render(section: SectionOf<BizType>, ctx: RenderCtx = testCtx()): string {
  const C = businessRenderers[section.type] as unknown as (p: { section: SectionOf<BizType>; ctx: RenderCtx; index: number }) => ReactElement | null;
  return html(<C section={section} ctx={ctx} index={1} />);
}

const sparseCtx = () => testCtx(testSpec({ business: SPARSE_BUSINESS }));
const ctxWith = (b: Partial<Business>) => testCtx(testSpec({ business: { ...FULL_BUSINESS, ...b } }));

/** One realistic fixture per section type, parsed through its schema. */
const fixtures = {
  "services-list": servicesList.schema.parse({
    id: "s_services",
    type: "services-list",
    variant: "rows",
    props: {
      eyebrow: "Storitve",
      title: "Striženje, barvanje in nega",
      intro: "Vse storitve opravimo z izdelki brez amonijaka.",
      items: [
        { name: "Žensko striženje", description: "Posvet, pranje, striženje in oblikovanje.", price: { amount: 32 } },
        { name: "Barvanje", description: "Enobarvno barvanje z nego.", price: { amount: 12.5, from: true } },
        { name: "Keratinska nega", description: "Za suhe in poškodovane lase.", price: { $placeholder: "price" } },
        { name: "Posvet", description: "Brezplačen posvet pred barvanjem.", link: { label: "Pokličite", target: { action: "call" } } },
      ],
    },
  }),
  "services-cards": servicesCards.schema.parse({
    id: "s_cards",
    type: "services-cards",
    variant: "grid",
    props: {
      title: "Kaj delamo",
      items: [
        { image: "img_salon", title: "Striženje", text: "Za ženske, moške in otroke." },
        { image: "img_detail", title: "Barvanje", text: "Pramenovi, balayage in enobarvno.", link: { label: "Cenik", target: { page: "p_storitve" } } },
        { title: "Frizure za posebne priložnosti", text: "Poroke, mature in obletnice." },
      ],
    },
  }),
  "price-list": priceList.schema.parse({
    id: "s_prices",
    type: "price-list",
    variant: "table",
    props: {
      title: "Cenik",
      groups: [
        {
          name: "Striženje",
          items: [
            { name: "Žensko striženje", note: "Kratki lasje", price: { amount: 28 } },
            { name: "Otroško striženje", price: { amount: 12.5 } },
          ],
        },
        { name: "Barvanje", items: [{ name: "Pramenovi", price: { $placeholder: "price", note: "Cena ni podana" } }] },
      ],
      footnote: "Cene vključujejo DDV.",
    },
  }),
  menu: menuSection.schema.parse({
    id: "s_menu",
    type: "menu",
    variant: "classic",
    props: {
      title: "Jedilni list",
      categories: [
        {
          name: "Juhe",
          dishes: [
            { name: "Goveja juha z rezanci", price: { amount: 4.5 } },
            { name: "Gobova kremna juha", description: "Z jurčki iz domačih gozdov.", price: { amount: 5.2 }, tags: ["vegetarian", "gluten-free"] },
          ],
        },
        { name: "Glavne jedi", dishes: [{ name: "Ričet s prekajenimi rebrci", price: { $placeholder: "price" } }] },
      ],
    },
  }),
  "opening-hours": openingHoursSection.schema.parse({
    id: "s_hours",
    type: "opening-hours",
    variant: "table",
    props: { title: "Kdaj smo odprti", note: "Ob praznikih po dogovoru." },
  }),
  contact: contactSection.schema.parse({
    id: "s_contact",
    type: "contact",
    variant: "split-map",
    props: { title: "Kje nas najdete", intro: "Parkirišče je za stavbo." },
  }),
  faq: faqSection.schema.parse({
    id: "s_faq",
    type: "faq",
    variant: "accordion",
    props: {
      title: "Pogosta vprašanja",
      items: [
        { question: "Ali moram termin rezervirati vnaprej?", answer: "Priporočamo rezervacijo, sprejmemo pa tudi stranke brez termina." },
        { question: "Ali lahko plačam s kartico?", answer: "Da, sprejemamo vse debetne in kreditne kartice." },
      ],
    },
  }),
  team: teamSection.schema.parse({
    id: "s_team",
    type: "team",
    variant: "grid",
    props: {
      title: "Ekipa",
      members: [
        { name: "Ana Novak", role: "Lastnica in frizerka", bio: "V salonu dela od odprtja.", image: "img_team" },
        { name: { $placeholder: "name" }, role: "Frizerka" },
      ],
    },
  }),
  gallery: gallerySection.schema.parse({
    id: "s_gallery",
    type: "gallery",
    variant: "grid",
    props: {
      title: "Salon od blizu",
      images: [{ image: "img_salon", caption: "Pult ob vhodu" }, { image: "img_detail" }, { image: "img_team" }],
    },
  }),
  products: productsSection.schema.parse({
    id: "s_products",
    type: "products",
    variant: "grid",
    props: {
      title: "Iz naše pekarne",
      items: [
        { name: "Pirin kruh", description: "S kislim testom.", price: { amount: 3.2 }, unit: "500 g", image: "img_detail" },
        { name: "Orehova potica", price: { $placeholder: "price" }, unit: "kos" },
      ],
    },
  }),
  rooms: roomsSection.schema.parse({
    id: "s_rooms",
    type: "rooms",
    variant: "cards",
    props: {
      title: "Sobe in apartmaji",
      items: [
        { name: "Soba Lipa", description: "Z balkonom proti sadovnjaku.", capacity: 1, image: "img_salon" },
        {
          name: "Apartma Hrast",
          description: "Z lastno kuhinjo.",
          capacity: 2,
          features: ["Kuhinja", "Balkon", "Wi-Fi"],
          price: { amount: 85, unit: "na noč" },
          link: { label: "Rezervirajte", target: { action: "booking" } },
        },
        { name: "Družinska soba", description: "Za družine z otroki.", capacity: 3 },
        { name: "Skupinski apartma", description: "Za večje skupine.", capacity: 5 },
      ],
    },
  }),
  "contact-form": contactFormSection.schema.parse({
    id: "s_enquiry",
    type: "contact-form",
    variant: "stacked",
    props: { title: "Pošljite povpraševanje", intro: "Odgovorimo v enem delovnem dnevu.", askPhone: true, messageHint: "Opišite, kaj potrebujete." },
  }),
  "service-area": serviceAreaSection.schema.parse({
    id: "s_area",
    type: "service-area",
    variant: "list",
    props: { title: "Kje delamo", intro: "Na terenu smo vsak dan.", action: { label: "Pokličite", target: { action: "call" } } },
  }),
} satisfies { [T in BizType]: SectionOf<T> };

describe("business group registration", () => {
  it("has a renderer for every business section type and nothing else", () => {
    expect(Object.keys(businessRenderers).sort()).toEqual(businessDefs.map((d) => d.type).sort());
  });

  it("declares islands for the map and the gallery, and no LCP resolvers", () => {
    expect(businessIslands.contact).toEqual(["consent.js"]);
    expect(businessIslands.gallery).toEqual(["gallery.js"]);
    expect(businessIslands["contact-form"]).toEqual(["form.js"]);
    expect(businessLcp).toEqual({});
  });

  it("puts every section in the business group with a catalogue description", () => {
    for (const d of businessDefs) {
      expect(d.group).toBe("business");
      expect(d.description.length).toBeGreaterThan(40);
      expect(d.centredVariants).toBeUndefined();
    }
  });
});

describe("every business section and variant", () => {
  for (const def of businessDefs) {
    const type = def.type as BizType;
    for (const variant of def.variants) {
      it(`${type} / ${variant}: validates and renders an h2 section without h1`, () => {
        const section = { ...fixtures[type], variant } as SectionOf<SectionType>;
        expect(def.schema.safeParse(section).success).toBe(true);
        for (const ctx of [testCtx(), sparseCtx()]) {
          const out = render(section as SectionOf<BizType>, ctx);
          expect(out).toContain(`class="s s-${type} s-${type}--${variant} tone-default"`);
          expect(out).toContain(`aria-labelledby="${section.id}-title"`);
          expect(out.match(/<h2 /g)).toHaveLength(1);
          expect(out).toMatch(new RegExp(`<h2 id="${section.id}-title" class="section-title">`));
          expect(out).not.toContain("<h1");
          expect(out).not.toContain("<iframe");
          expect(out).not.toMatch(/\p{Extended_Pictographic}/u);
          // Icons only label the contact facts; services, prices, menus and the rest stay words only.
          if (type !== "contact") expect(out).not.toContain("<svg");
        }
      });
    }
  }

  it("applies the tone class", () => {
    const out = render({ ...fixtures.faq, tone: "inverse" });
    expect(out).toContain("tone-inverse");
  });
});

describe("services-list", () => {
  it("formats prices the Slovene way and marks a missing price", () => {
    const out = render(fixtures["services-list"]);
    expect(out).toContain(`32${NBSP}€`);
    expect(out).toContain(`od 12,50${NBSP}€`);
    expect(out).toContain('<mark class="ph" data-ph="price"');
    expect(out.match(/<h3 class="svc-list__name">/g)).toHaveLength(4);
    expect(out).toContain('href="tel:+38641123456"');
  });

  it("drops the call link when the phone is a placeholder", () => {
    expect(render(fixtures["services-list"], sparseCtx())).not.toContain("tel:");
  });

  it("rejects fewer than two services", () => {
    const one = { ...fixtures["services-list"], props: { ...fixtures["services-list"].props, items: fixtures["services-list"].props.items.slice(0, 1) } };
    expect(servicesList.schema.safeParse(one).success).toBe(false);
  });
});

describe("services-cards", () => {
  it("marks three cards so they never form a plain row of three", () => {
    const out = render(fixtures["services-cards"]);
    expect(out).toContain("svc-cards--three");
    expect(out).toContain('data-count="3"');
    expect(out).toContain('href="storitve.html"');
    expect(out).toContain("media--contained");
  });

  it("uses the wide grid only with four or more cards", () => {
    const s = fixtures["services-cards"];
    const four = { ...s, props: { ...s.props, items: [...s.props.items, { title: "Nega", text: "Maske in obloge." }] } };
    const out = render(four);
    expect(out).toContain("svc-cards--many");
    expect(out).not.toContain("svc-cards--three");
  });

  it("has no icon prop", () => {
    const s = fixtures["services-cards"];
    const withIcon = { ...s, props: { ...s.props, items: [{ ...s.props.items[0], icon: "scissors" }, ...s.props.items.slice(1)] } };
    expect(servicesCards.schema.safeParse(withIcon).success).toBe(false);
  });
});

describe("price-list", () => {
  it("table: one real table per group with an h3 caption, row headers and Slovene prices", () => {
    const out = render(fixtures["price-list"]);
    expect(out.match(/<table class="prices__table"/g)).toHaveLength(2);
    expect(out).toContain('<caption><h3 class="prices__group-title">Striženje</h3></caption>');
    expect(out).toContain('<th scope="row">');
    expect(out).toContain(`12,50${NBSP}€`);
    expect(out).toContain(`28${NBSP}€`);
    expect(out).toContain('data-ph="price"');
    expect(out).toContain("Cene vključujejo DDV.");
  });

  it("table without a group name is labelled by the section heading", () => {
    const s = fixtures["price-list"];
    const out = render({ ...s, props: { ...s.props, groups: [{ items: s.props.groups[0]!.items }] } });
    expect(out).toContain('<table class="prices__table" aria-labelledby="s_prices-title">');
    expect(out).not.toContain("<caption>");
  });

  it("grouped: h3 per group and a definition list", () => {
    const out = render({ ...fixtures["price-list"], variant: "grouped" });
    expect(out).not.toContain("<table");
    expect(out.match(/<dl class="prices__dl">/g)).toHaveLength(2);
    expect(out).toContain('<h3 class="prices__group-title">Barvanje</h3>');
    expect(out).toContain(`<dd><span class="price">12,50${NBSP}€</span></dd>`);
  });

  it("requires a price on every item (placeholder allowed, never omitted)", () => {
    const s = fixtures["price-list"];
    const bad = { ...s, props: { ...s.props, groups: [{ name: "X", items: [{ name: "Brez cene" }] }] } };
    expect(priceList.schema.safeParse(bad).success).toBe(false);
  });
});

describe("menu", () => {
  it("renders categories as h3 with dishes, prices and text tags", () => {
    const out = render(fixtures.menu);
    expect(out.match(/<h3 class="menu__cat-title"/g)).toHaveLength(2);
    expect(out).toContain(`4,50${NBSP}€`);
    expect(out).toContain("vegetarijansko, brez glutena");
    expect(out).toContain('<span class="visually-hidden">Oznake: </span>');
    expect(out).toContain('data-ph="price"');
  });

  it("rejects tags outside the fixed list", () => {
    const s = fixtures.menu;
    const bad = { ...s, props: { ...s.props, categories: [{ name: "X", dishes: [{ name: "Y", price: { amount: 1 }, tags: ["organic"] }] }] } };
    expect(menuSection.schema.safeParse(bad).success).toBe(false);
  });
});

describe("opening-hours", () => {
  it("table: full day names and Slovene times from the business facts", () => {
    const out = render(fixtures["opening-hours"]);
    expect(out).toContain('<table class="oh__table" aria-labelledby="s_hours-title">');
    expect(out).toContain('<th scope="row">Ponedeljek–petek</th><td>8.00–19.00</td>');
    expect(out).toContain('<tr class="oh__row--closed"><th scope="row">Nedelja</th><td>zaprto</td></tr>');
    expect(out).toContain("Ob praznikih po dogovoru.");
  });

  it("compact: short day names", () => {
    const out = render({ ...fixtures["opening-hours"], variant: "compact" });
    expect(out).toContain("<dt>Pon–pet</dt><dd>8.00–19.00</dd>");
  });

  it("renders a placeholder when hours are missing or were never given", () => {
    expect(render(fixtures["opening-hours"], sparseCtx())).toContain('data-ph="hours"');
    expect(render(fixtures["opening-hours"], ctxWith({ hours: undefined }))).toContain('data-ph="hours"');
  });

  it("has no props that duplicate the hours", () => {
    const bad = { ...fixtures["opening-hours"], props: { title: "Ure", hours: "8-16" } };
    expect(openingHoursSection.schema.safeParse(bad).success).toBe(false);
  });
});

describe("contact", () => {
  it("renders click-to-call, email, address, directions and hours from the facts", () => {
    const out = render(fixtures.contact);
    expect(out).toContain('href="tel:+38641123456"');
    expect(out).toContain(`>${formatPhone("+38641123456")}</a>`);
    expect(out).toContain('href="mailto:info@salon-lipa.si"');
    expect(out).toContain("Trubarjeva cesta 12<br/>1000 Ljubljana");
    expect(out).toContain('href="https://www.google.com/maps/search/?api=1&amp;query=Trubarjeva%20cesta%2012%2C%201000%20Ljubljana%2C%20Slovenija"');
    expect(out).toContain("8.00–19.00");
  });

  it("puts a hidden line icon before each fact label, in every variant and with missing facts", () => {
    for (const variant of contactSection.variants) {
      for (const ctx of [testCtx(), sparseCtx()]) {
        const out = render({ ...fixtures.contact, variant }, ctx);
        const labels = [...out.matchAll(/<dt class="fact-label">(<svg [^>]*>)[\s\S]*?<\/svg>([^<]+)<\/dt>/g)];
        expect(labels.map((m) => m[2])).toEqual(["Telefon", "E-pošta", "Naslov", "Delovni čas"]);
        for (const m of labels) expect(m[1]).toContain('aria-hidden="true"');
        expect(out.match(/<svg /g)).toHaveLength(4);
      }
    }
  });

  it("gates the map behind a click: no iframe, only data attributes, a button and a plain link", () => {
    for (const variant of contactSection.variants) {
      const out = render({ ...fixtures.contact, variant });
      expect(out).not.toContain("<iframe");
      expect(out).toContain(
        'data-embed-src="https://www.google.com/maps?q=Trubarjeva%20cesta%2012%2C%201000%20Ljubljana%2C%20Slovenija&amp;output=embed"',
      );
      expect(out).toContain('data-embed-title="Zemljevid: Frizerski salon Lipa"');
      expect(out).toContain('<button type="button" class="btn btn--secondary" data-embed-load="true">Prikažite zemljevid</button>');
      expect(out).toContain("Zemljevid naloži Google Maps");
      expect(out).toContain(">Odprite v Google Zemljevidih</a>");
    }
  });

  it("shows placeholders and no map or tel link when facts are missing", () => {
    const out = render(fixtures.contact, sparseCtx());
    for (const kind of ["phone", "email", "address", "hours"]) expect(out).toContain(`data-ph="${kind}"`);
    expect(out).not.toContain("tel:");
    expect(out).not.toContain("data-embed-src");
    expect(out).not.toContain("google.com");
  });

  it("has no form and no fact props", () => {
    expect(render(fixtures.contact)).not.toContain("<form");
    const bad = { ...fixtures.contact, props: { title: "Kontakt", phone: "+38641123456" } };
    expect(contactSection.schema.safeParse(bad).success).toBe(false);
  });
});

describe("faq", () => {
  it("accordion uses native details/summary with an h3 question", () => {
    const out = render(fixtures.faq);
    expect(out.match(/<details class="faq__item">/g)).toHaveLength(2);
    expect(out).toContain('<summary class="faq__q"><h3 class="faq__title">Ali moram termin rezervirati vnaprej?</h3>');
    expect(out).not.toContain("<script");
  });

  it("list shows every answer without disclosure", () => {
    const out = render({ ...fixtures.faq, variant: "list" });
    expect(out).not.toContain("<details");
    expect(out.match(/<h3 class="faq__title">/g)).toHaveLength(2);
    expect(out).toContain("Da, sprejemamo vse debetne in kreditne kartice.");
  });
});

describe("team", () => {
  it("renders names as h3 and a placeholder for a missing name", () => {
    const out = render(fixtures.team);
    expect(out).toContain('<h3 class="team__name">Ana Novak</h3>');
    expect(out).toContain('<h3 class="team__name"><mark class="ph" data-ph="name"');
    expect(out).toContain('alt="Ekipa salona"');
    expect(out).toContain("team--bios");
  });

  it("gives members without a portrait a same-size initials tile when others have one", () => {
    const s = fixtures.team;
    const mixed = { ...s, props: { ...s.props, members: [s.props.members[0]!, { name: "Maja Horvat, dr. dent. med.", role: "Zobozdravnica" }, s.props.members[1]!] } };
    const out = render(teamSection.schema.parse(mixed));
    expect(out).toContain('<span class="media media--contained team__photo team__initials" aria-hidden="true">MH</span>');
    // A placeholder name gets the tile but no invented letters.
    expect(out).toContain('<span class="media media--contained team__photo team__initials" aria-hidden="true"></span>');
    expect(out).not.toContain("team__member--text");
    // Nobody with a portrait: plain text members, no tiles.
    const none = { ...s, props: { ...s.props, members: [{ name: "Ana Novak", role: "Frizerka" }, { name: "Eva Kos", role: "Frizerka" }] } };
    const plain = render(teamSection.schema.parse(none));
    expect(plain).not.toContain("team__initials");
    expect(plain.match(/team__member--text/g)).toHaveLength(2);
  });

  it("makes initials from the first two words, skipping titles", () => {
    expect(initials("Urška Lebar")).toBe("UL");
    expect(initials("dr. Žiga Čeh")).toBe("ŽČ");
    expect(initials("Maja")).toBe("M");
    expect(initials({ $placeholder: "name" })).toBe("");
  });

  it("rejects an empty name (the model must use a placeholder)", () => {
    const s = fixtures.team;
    const bad = { ...s, props: { ...s.props, members: [{ name: "", role: "Frizerka" }] } };
    expect(teamSection.schema.safeParse(bad).success).toBe(false);
  });
});

describe("gallery", () => {
  it("links every photo to its largest variant so it works without JS", () => {
    const out = render(fixtures.gallery);
    expect(out).toContain('<a class="gallery__link" href="media/img_salon-720.webp" data-gallery-item="">');
    expect(out).toContain('href="media/img_detail-720.webp"');
    expect(out.match(/data-gallery-item=""/g)).toHaveLength(3);
    expect(out).toContain('<figcaption class="gallery__caption">Pult ob vhodu</figcaption>');
    expect(out).toContain('data-label-close="Zaprite"');
    expect(out).toContain('data-label-prev="Prejšnja slika"');
    expect(out).toContain('data-label-next="Naslednja slika"');
  });

  it("gives a link without alt text an accessible name", () => {
    const spec = testSpec();
    spec.assets.images[1]!.alt = "";
    const out = render(fixtures.gallery, testCtx(spec));
    expect(out).toContain('href="media/img_detail-720.webp" data-gallery-item="" aria-label="Povečajte sliko"');
  });

  it("needs at least two photos", () => {
    const s = fixtures.gallery;
    expect(gallerySection.schema.safeParse({ ...s, props: { ...s.props, images: s.props.images.slice(0, 1) } }).success).toBe(false);
    expect(gallerySection.images).toBe("required");
  });

  it("largestWebp picks the widest WebP entry", () => {
    const img = testCtx().image("img_salon");
    expect(largestWebp(img)).toBe("media/img_salon-720.webp");
    expect(
      largestWebp({ ...img, sources: [{ type: "image/webp", srcSet: "a-1600.webp 1600w, a-360.webp 360w, a-1080.webp 1080w" }] }),
    ).toBe("a-1600.webp");
  });
});

describe("products", () => {
  it("renders name, price and unit, with a placeholder for a missing price", () => {
    const out = render(fixtures.products);
    expect(out).toContain('<h3 class="product__name">Pirin kruh</h3>');
    expect(out).toContain(`3,20${NBSP}€`);
    expect(out).toContain('<span class="product__unit muted">500 g</span>');
    expect(out).toContain('data-ph="price"');
    expect(out).toContain("product--text");
  });
});

describe("rooms", () => {
  it("uses Slovene plurals for capacity", () => {
    const out = render(fixtures.rooms);
    expect(out).toContain(`1${NBSP}oseba`);
    expect(out).toContain(`2${NBSP}osebi`);
    expect(out).toContain(`3${NBSP}osebe`);
    expect(out).toContain(`5${NBSP}oseb<`);
  });

  it("renders features as a list, the price with its unit and the booking link", () => {
    const out = render(fixtures.rooms);
    expect(out).toContain('<ul class="room__features" aria-label="Oprema"><li>Kuhinja</li><li>Balkon</li><li>Wi-Fi</li></ul>');
    expect(out).toContain(`85${NBSP}€ na noč`);
    expect(out).toContain('href="https://booking.example.com/lipa"');
  });

  it("drops the booking link when there is no booking URL", () => {
    expect(render(fixtures.rooms, sparseCtx())).not.toContain("booking.example.com");
  });

  it("rejects capacity outside 1–20", () => {
    const s = fixtures.rooms;
    const bad = { ...s, props: { ...s.props, items: [{ name: "X", description: "Y", capacity: 0 }] } };
    expect(roomsSection.schema.safeParse(bad).success).toBe(false);
  });
});

describe("service-area", () => {
  it("lists the places from the business facts", () => {
    const out = render(fixtures["service-area"], ctxWith({ serviceArea: ["Ljubljana", "Domžale", "Kamnik"] }));
    expect(out).toContain('<ul class="area__list" aria-label="Območje dela"><li>Ljubljana</li><li>Domžale</li><li>Kamnik</li></ul>');
    expect(out).toContain('href="tel:+38641123456"');
  });

  it("renders a placeholder when no places are known", () => {
    expect(render(fixtures["service-area"])).toContain('data-ph="text"');
    expect(render({ ...fixtures["service-area"], variant: "inline" }, ctxWith({ serviceArea: [] }))).toContain('data-ph="text"');
  });

  it("has no prop for the places themselves", () => {
    const bad = { ...fixtures["service-area"], props: { title: "Kje", areas: ["Ljubljana"] } };
    expect(serviceAreaSection.schema.safeParse(bad).success).toBe(false);
  });
});

describe("business.css", () => {
  const css = readFileSync(path.join(here, "../styles/business.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

  it("contains none of the banned visual patterns", () => {
    expect(css).not.toMatch(/(linear|radial|conic)-gradient/);
    expect(css).not.toMatch(/backdrop-filter/);
    expect(css).not.toMatch(/font-style:\s*italic/);
    expect(css).not.toMatch(/monospace/);
    expect(css).not.toMatch(/text-align:\s*center/);
    expect(css).not.toMatch(/border-radius:\s*(50%|\d{3,}px)/);
    for (const m of css.matchAll(/box-shadow:\s*([^;]+);/g)) expect(m[1]!.trim()).toBe("var(--shadow)");
  });

  it("uses only colour tokens (no hard-coded colours)", () => {
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(css).not.toMatch(/\brgba?\(/);
  });
});

describe("gallery island", () => {
  const js = readFileSync(path.join(here, "../islands/gallery.js"), "utf8");
  it("is plain ES2020 without imports and uses a native dialog", () => {
    expect(js).not.toMatch(/^\s*import /m);
    expect(js).toContain("showModal");
    expect(js).toContain("data-label-close");
  });
});

describe("contact-form", () => {
  const tag = (out: string, re: RegExp) => out.match(re)?.[0] ?? "";

  it("renders a working plain-HTML form: visible labels bound to fields, correct types and autocomplete", () => {
    const out = render(fixtures["contact-form"]);
    const form = tag(out, /<form [^>]*>/);
    expect(form).toContain('method="post"');
    expect(form).toContain('action="_submit"');
    expect(form).toContain("data-contact-form");
    for (const [name, type, auto] of [["name", "text", "name"], ["email", "email", "email"], ["phone", "tel", "tel"]] as const) {
      expect(out).toContain(`<label for="s_enquiry-${name}">`);
      const input = tag(out, new RegExp(`<input id="s_enquiry-${name}"[^>]*>`));
      expect(input).toContain(`type="${type}"`);
      expect(input).toMatch(new RegExp(`autocomplete="${auto}"`, "i"));
      expect(input).toContain(`name="${name}"`);
    }
    const textarea = tag(out, /<textarea [^>]*>/);
    expect(textarea).toContain('name="message"');
    expect(textarea).toContain("required");
    expect(textarea).toContain('aria-describedby="s_enquiry-hint"');
    expect(out).toContain('<input type="hidden" name="section" value="s_enquiry"/>');
    expect(out).toContain('role="status" aria-live="polite" data-form-status=""');
    expect(out).toContain("(obvezno)");
    expect(out).toContain("(neobvezno)");
  });

  it("hides the honeypot from people and assistive tech, and leaves out the phone when not asked", () => {
    const out = render({ ...fixtures["contact-form"], props: { ...fixtures["contact-form"].props, askPhone: false } });
    const hp = tag(out, /<div class="cform__hp" aria-hidden="true">.*?<\/div>/s);
    const input = tag(hp, /<input [^>]*>/);
    expect(input).toContain('name="website"');
    expect(input).toContain('tabindex="-1"');
    expect(out).not.toContain('name="phone"');
  });

  it("links the privacy page when the site has one", () => {
    const privacyPage = { ...testSpec().pages[0]!, id: "p_privacy", kind: "privacy" as const, slug: "zasebnost" };
    const ctx = testCtx(testSpec({ pages: [...testSpec().pages, privacyPage] }));
    const out = render(fixtures["contact-form"], ctx);
    expect(tag(out, /<p class="cform__privacy">.*?<\/p>/s)).toContain(`${"Varstvo osebnih podatkov"}</a>`);
    expect(render(fixtures["contact-form"])).not.toMatch(/cform__privacy[^<]*<a /);
  });
});
