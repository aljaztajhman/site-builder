import { describe, expect, it } from "vitest";
import { heroImage, heroSplit, heroType, pageHeader } from "@sb/spec";
import { HeroSplit } from "../src/groups/heroes/HeroSplit.tsx";
import { HERO_IMAGE_SIZES, HeroImage } from "../src/groups/heroes/HeroImage.tsx";
import { HeroType } from "../src/groups/heroes/HeroType.tsx";
import { PAGE_HEADER_SIZES, PageHeader } from "../src/groups/heroes/PageHeader.tsx";
import { heroLcp, heroRenderers } from "../src/groups/heroes/index.ts";
import { SPARSE_BUSINESS, html, testCtx, testSpec } from "./helpers.ts";

const sparseCtx = () => testCtx(testSpec({ business: SPARSE_BUSINESS }));
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

describe("hero-split", () => {
  const section = heroSplit.schema.parse({
    id: "s_hero",
    type: "hero-split",
    variant: "image-right",
    props: {
      eyebrow: "Ljubljana, center",
      headline: "Striženje in barvanje brez čakanja",
      intro: "Termin rezervirate v minuti.",
      primary: { label: "Pokliči", target: { action: "call" } },
      secondary: { label: "Storitve", target: { page: "p_storitve" } },
      image: "img_salon",
    },
  });

  for (const variant of heroSplit.variants) {
    it(`renders ${variant} with h1, actions and a preloaded-priority photo`, () => {
      const out = html(<HeroSplit section={{ ...section, variant }} ctx={testCtx()} index={0} />);
      expect(out).toContain(`s-hero-split--${variant}`);
      expect(out).toMatch(/<h1 id="s_hero-title"[^>]*>Striženje in barvanje brez čakanja<\/h1>/);
      expect(out).toContain('href="tel:+38641123456"');
      expect(out).toContain('href="storitve.html"');
      expect(out).toContain('fetchPriority="high"');
      expect(out).toContain('alt="Notranjost salona s tremi stoli"');
    });
  }

  it("lazy-loads the photo below the fold", () => {
    const out = html(<HeroSplit section={section} ctx={testCtx()} index={2} />);
    expect(out).toContain('loading="lazy"');
  });

  it("drops the call button when the phone is a placeholder", () => {
    const out = html(<HeroSplit section={section} ctx={sparseCtx()} index={0} />);
    expect(out).not.toContain("tel:");
    expect(out).toContain('href="storitve.html"');
  });

  it("rejects a headline over the length limit", () => {
    expect(() => heroSplit.schema.parse({ ...section, props: { ...section.props, headline: "x".repeat(71) } })).toThrow();
  });
});

describe("hero-image", () => {
  const section = heroImage.schema.parse({
    id: "s_hero",
    type: "hero-image",
    variant: "overlay-bottom",
    props: {
      eyebrow: "Trubarjeva cesta, Ljubljana",
      headline: "Salon z veliko svetlobe in brez čakalne vrste",
      intro: "Striženje, barvanje in nega las za vso družino.",
      primary: { label: "Rezerviraj termin", target: { action: "booking" } },
      secondary: { label: "Storitve in cene", target: { page: "p_storitve" } },
      image: "img_salon",
    },
  });

  for (const variant of heroImage.variants) {
    it(`renders ${variant} with the h1 on a solid inverse panel and a priority photo`, () => {
      const out = html(<HeroImage section={{ ...section, variant }} ctx={testCtx()} index={0} />);
      expect(out).toContain(`s-hero-image--${variant}`);
      expect(out).toMatch(/class="hero-image__panel tone-inverse"><p class="eyebrow">[^<]+<\/p><h1 id="s_hero-title"/);
      expect(count(out, /<h1/g)).toBe(1);
      expect(out).toContain('href="https://booking.example.com/lipa"');
      expect(out).toContain('href="storitve.html"');
      expect(out).toContain('fetchPriority="high"');
      expect(out).toContain(`sizes="${HERO_IMAGE_SIZES}"`);
    });
  }

  it("lazy-loads the photo when it is not first", () => {
    expect(html(<HeroImage section={section} ctx={testCtx()} index={1} />)).toContain('loading="lazy"');
  });

  it("registers an LCP resolver with the rendered sizes", () => {
    expect(heroLcp["hero-image"]?.(section)).toEqual({ image: "img_salon", sizes: HERO_IMAGE_SIZES });
  });

  it("requires an image and limits the headline", () => {
    const { image: _image, ...noImage } = section.props;
    expect(() => heroImage.schema.parse({ ...section, props: noImage })).toThrow();
    expect(() => heroImage.schema.parse({ ...section, props: { ...section.props, headline: "x".repeat(71) } })).toThrow();
    expect(() => heroImage.schema.parse({ ...section, props: { ...section.props, intro: "x".repeat(201) } })).toThrow();
  });
});

describe("hero-type", () => {
  const section = heroType.schema.parse({
    id: "s_hero",
    type: "hero-type",
    variant: "large",
    props: {
      headline: "Računovodske storitve za samostojne podjetnike v Celju",
      intro: "Vodimo knjige, obračunamo plače in oddamo davčne obrazce.",
      primary: { label: "Pokličite nas", target: { action: "call" } },
    },
  });

  it("renders large without facts or images", () => {
    const out = html(<HeroType section={section} ctx={testCtx()} index={0} />);
    expect(out).toContain("s-hero-type--large");
    expect(out).toMatch(/<h1 id="s_hero-title"[^>]*>Računovodske storitve/);
    expect(out).not.toContain("hero-facts");
    expect(out).not.toContain("<img");
    expect(out).toContain('href="tel:+38641123456"');
  });

  it("renders with-facts: phone, address with directions, hours", () => {
    const out = html(<HeroType section={{ ...section, variant: "with-facts" }} ctx={testCtx()} index={0} />);
    expect(out).toContain("s-hero-type--with-facts");
    expect(out).toContain('<dl class="hero-facts">');
    expect(count(out, /href="tel:\+38641123456"/g)).toBe(2);
    expect(out).toContain("Trubarjeva cesta 12");
    expect(out).toContain('href="https://www.google.com/maps');
    expect(out).toContain("hours__list");
    expect(out).not.toContain('class="ph"');
  });

  it("labels each fact with a hidden line icon, and only the facts", () => {
    for (const ctx of [testCtx(), sparseCtx()]) {
      const out = html(<HeroType section={{ ...section, variant: "with-facts" }} ctx={ctx} index={0} />);
      const labels = [...out.matchAll(/<dt class="fact-label">(<svg [^>]*>)[\s\S]*?<\/svg>([^<]+)<\/dt>/g)];
      expect(labels.map((m) => m[2])).toEqual(["Telefon", "Naslov", "Delovni čas"]);
      for (const m of labels) expect(m[1]).toContain('aria-hidden="true"');
      expect(count(out, /<svg /g)).toBe(3);
    }
    // No icons on the headline, the buttons or the large variant.
    expect(html(<HeroType section={section} ctx={testCtx()} index={0} />)).not.toContain("<svg");
  });

  it("shows placeholders for missing facts and no broken links", () => {
    const out = html(<HeroType section={{ ...section, variant: "with-facts" }} ctx={sparseCtx()} index={0} />);
    expect(out).not.toContain("tel:");
    expect(out).not.toContain("google.com/maps");
    expect(out).toContain('data-ph="phone"');
    expect(out).toContain('data-ph="address"');
    expect(out).toContain('data-ph="hours"');
  });

  it("has no LCP resolver and accepts no image prop", () => {
    expect(heroLcp["hero-type"]).toBeUndefined();
    expect(() => heroType.schema.parse({ ...section, props: { ...section.props, image: "img_salon" } })).toThrow();
    expect(() => heroType.schema.parse({ ...section, props: { ...section.props, headline: "x".repeat(91) } })).toThrow();
  });
});

describe("page-header", () => {
  const section = pageHeader.schema.parse({
    id: "s_head",
    type: "page-header",
    variant: "with-image",
    props: { title: "Najpogostejša vprašanja", intro: "Kratki odgovori o terminih, cenah in plačilu.", image: "img_detail" },
  });

  it("renders with-image with h1 and a priority photo", () => {
    const out = html(<PageHeader section={section} ctx={testCtx()} index={0} />);
    expect(out).toContain("s-page-header--with-image");
    expect(out).toMatch(/<h1 id="s_head-title"[^>]*>Najpogostejša vprašanja<\/h1>/);
    expect(out).toContain('fetchPriority="high"');
    expect(out).toContain(`sizes="${PAGE_HEADER_SIZES}"`);
    expect(heroLcp["page-header"]?.(section)).toEqual({ image: "img_detail", sizes: PAGE_HEADER_SIZES });
  });

  it("renders plain without the image, and no LCP image", () => {
    const plain = { ...section, variant: "plain" as const };
    const out = html(<PageHeader section={plain} ctx={testCtx()} index={0} />);
    expect(out).toContain("s-page-header--plain");
    expect(out).toContain("<h1");
    expect(out).not.toContain("<img");
    expect(heroLcp["page-header"]?.(plain)).toBeNull();
  });

  it("with-image without an image renders like plain", () => {
    const { image: _image, ...rest } = section.props;
    const noImage = { ...section, props: rest };
    expect(html(<PageHeader section={noImage} ctx={testCtx()} index={0} />)).not.toContain("<img");
    expect(heroLcp["page-header"]?.(noImage)).toBeNull();
  });

  it("limits the title and intro", () => {
    expect(() => pageHeader.schema.parse({ ...section, props: { ...section.props, title: "x".repeat(71) } })).toThrow();
    expect(() => pageHeader.schema.parse({ ...section, props: { ...section.props, intro: "x".repeat(241) } })).toThrow();
  });
});

describe("heroes group", () => {
  it("has a renderer for every hero type", () => {
    expect(Object.keys(heroRenderers).sort()).toEqual(["hero-image", "hero-signature", "hero-split", "hero-type", "page-header"]);
  });
});
