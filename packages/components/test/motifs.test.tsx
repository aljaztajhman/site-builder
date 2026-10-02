import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { direction, heroSignature, type Business, type Design, type SectionOf } from "@sb/spec";
import { HeroSignature } from "../src/groups/heroes/HeroSignature.tsx";
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

const hero = (variant: "photo" | "drawing" | "arch", props: Partial<SectionOf<"hero-signature">["props"]> = {}): SectionOf<"hero-signature"> =>
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

  it("rounds only drawn objects (seal, valves, stops, the plate's dot), never buttons", () => {
    for (const m of css.matchAll(/([^{}]+)\{[^}]*border-radius:\s*50%/g)) {
      expect(m[1]!.trim()).toMatch(/plate__dot|steps__item::before|area__list li::before/);
      expect(m[1]).not.toMatch(/btn/);
    }
  });
});
