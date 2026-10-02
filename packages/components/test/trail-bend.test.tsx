import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { direction, heroSignature, type Business, type Design, type SectionOf } from "@sb/spec";
import { HeroSignature, signatureActions } from "../src/groups/heroes/HeroSignature.tsx";
import { heroLcp } from "../src/groups/heroes/index.ts";
import { PriceList } from "../src/groups/business/Prices.tsx";
import { Gallery } from "../src/groups/business/Media.tsx";
import { OpeningHours } from "../src/groups/business/Info.tsx";
import { MobileActionBar, barActions } from "../src/chrome/MobileActionBar.tsx";
import { FULL_BUSINESS, html, testCtx, testSpec } from "./helpers.ts";

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

const LUCE: Business = { ...FULL_BUSINESS, phone: "+38631555408", address: { street: "Podveža 41", postalCode: "3334", city: "Luče" }, bookingUrl: undefined };
const NOVO_MESTO: Business = { ...FULL_BUSINESS, phone: "+38651555642", address: { street: "Glavni trg 9", postalCode: "8000", city: "Novo mesto" }, bookingUrl: "https://pregib.example/narocanje" };
const ctxFor = (dir: string, business: Business) => testCtx(testSpec({ design: templateDesign(dir), business }));

const hero = (variant: "view" | "bend", props: Record<string, unknown>): SectionOf<"hero-signature"> =>
  heroSignature.schema.parse({ id: "s_hero", type: "hero-signature", variant, props: { headline: "Razgled na gore iz vsake sobe", intro: "4 sobe in apartma.", image: "img_salon", ...props } }) as SectionOf<"hero-signature">;

describe("hero-signature view (Markacija)", () => {
  const view = (props: Record<string, unknown> = {}) =>
    hero("view", {
      eyebrow: "V Zgornji Savinjski dolini",
      fact: "phone",
      factLabel: "Rezervirajte",
      secondary: { label: "Sobe in cene", target: { page: "p_storitve" } },
      signs: [{ label: "Raduha" }, { label: "Logarska dolina" }, { label: "Smučišče", note: "10 min" }],
      ...props,
    });

  it("puts the headline over the landscape, the call as the one button, the places on signs on a post", () => {
    const out = html(<HeroSignature section={view()} ctx={ctxFor("markacija", LUCE)} index={0} />);
    expect(out).toContain('<div class="hsig__shade" aria-hidden="true"></div>');
    expect(out).toMatch(/<a href="tel:\+38631555408" data-action="call" class="btn btn--primary">Rezervirajte<\/a><a href="storitve\.html" class="text-link">Sobe in cene<\/a>/);
    expect(out.match(/btn btn--primary/g)).toHaveLength(1);
    expect(out).toContain('<ul class="hsig__post" role="list">');
    expect(out.match(/<li class="hsig__sign">/g)).toHaveLength(3);
    expect(out).toContain('<span class="blaze blaze--sign" aria-hidden="true"></span><span>Smučišče<small class="hsig__sign-note">10 min</small></span>');
    expect(heroLcp["hero-signature"]?.(view())).toEqual({ image: "img_salon", sizes: "100vw" });
    expect(signatureActions(view())).toEqual(["call"]);
  });

  it("shows no post without signs and no shade without a photo", () => {
    const out = html(<HeroSignature section={view({ signs: undefined, image: undefined })} ctx={ctxFor("markacija", LUCE)} index={0} />);
    expect(out).not.toContain("hsig__post");
    expect(out).not.toContain("hsig__shade");
    expect(out).toContain("hsig hsig--view");
  });

  it("allows signs only on view, at most three, each place at most 24 characters", () => {
    expect(heroSignature.schema.safeParse({ id: "s", type: "hero-signature", variant: "view", props: { headline: "x", intro: "y", fact: "phone", factLabel: "z", signs: [{ label: "a" }, { label: "b" }, { label: "c" }, { label: "d" }] } }).success).toBe(false);
    expect(heroSignature.schema.safeParse({ id: "s", type: "hero-signature", variant: "view", props: { headline: "x", intro: "y", fact: "phone", factLabel: "z", signs: [{ label: "Planinska pot čez Raduho do koče" }] } }).success).toBe(false);
  });
});

describe("hero-signature bend (Pregib)", () => {
  const bend = (props: Record<string, unknown> = {}) =>
    hero("bend", {
      headline: "Ena ura je samo za enega pacienta",
      fact: "address",
      primary: { label: "Rezervirajte termin", target: { action: "booking" } },
      secondary: { label: "Pokličite", target: { action: "call" } },
      ...props,
    });

  it("draws the limb behind the headline, the address from the facts, booking first, the photo with a cut corner", () => {
    const out = html(<HeroSignature section={bend()} ctx={ctxFor("pregib", NOVO_MESTO)} index={0} />);
    expect(out).toMatch(/<svg class="limb hsig__limb" viewBox="0 0 900 900" preserveAspectRatio="xMinYMin slice"[^>]*aria-hidden="true"/);
    expect(out).toContain('<p class="hsig__where">Glavni trg 9, Novo mesto</p>');
    expect(out).toMatch(/<a href="https:\/\/pregib\.example\/narocanje" data-action="booking" class="btn btn--primary">Rezervirajte termin<\/a><a href="tel:\+38651555642" data-action="call" class="text-link">Pokličite<\/a>/);
    expect(out).toMatch(/<figure class="hsig__fold"><picture class="media hsig__fold-media media--contained">/);
    expect(heroLcp["hero-signature"]?.(bend())).toEqual({ image: "img_salon", sizes: "(min-width: 64rem) 31rem, 72vw" });
    expect(signatureActions(bend())).toEqual(["booking", "call"]);
  });

  it("shows an address placeholder, never an invented one, and works without the photo", () => {
    const out = html(<HeroSignature section={bend({ image: undefined })} ctx={ctxFor("pregib", { ...NOVO_MESTO, address: { $placeholder: "address" } })} index={0} />);
    expect(out).toMatch(/<p class="hsig__where"><mark class="ph" data-ph="address"/);
    expect(out).not.toContain("hsig__fold");
    expect(out).toContain("limb");
  });
});

describe("price-list rates", () => {
  const rates: SectionOf<"price-list"> = {
    id: "s_rates",
    type: "price-list",
    variant: "rates",
    props: {
      title: "4 sobe in apartma za 4 osebe",
      intro: "Vse z lastno kopalnico in pogledom na gore.",
      groups: [{ items: [{ name: "Nočitev z zajtrkom", price: { amount: 38, unit: "na osebo" } }, { name: "Polpenzion", price: { $placeholder: "price" } }] }],
      footnote: "Otroci do 6 let so brezplačni.",
      image: "img_detail",
    },
  };

  it("sets each price at headline size with its unit under it, beside the photo, the footnote under them", () => {
    const out = html(<PriceList section={rates} ctx={ctxFor("markacija", LUCE)} index={1} />);
    expect(out).toContain('<div class="rates rates--image"><picture class="media rates__media media--contained">');
    expect(out).toMatch(/<dt class="rates__name">Nočitev z zajtrkom<\/dt><dd class="rates__price"><span class="rates__amount">38\s€<\/span><span class="rates__unit">na osebo<\/span><\/dd>/);
    expect(out).toMatch(/<dt class="rates__name">Polpenzion<\/dt><dd class="rates__price"><mark class="ph" data-ph="price"/);
    expect(out).toContain('<p class="rates__footnote">Otroci do 6 let so brezplačni.</p>');
  });

  it("works without a photo", () => {
    const out = html(<PriceList section={{ ...rates, props: { ...rates.props, image: undefined } }} ctx={ctxFor("markacija", LUCE)} index={1} />);
    expect(out).toContain('<div class="rates">');
    expect(out).not.toContain("<img");
  });

  it("puts prices on cut-corner cards in Pregib: name, the note, the price at the foot, no branch", () => {
    const tags: SectionOf<"price-list"> = { id: "s_p", type: "price-list", variant: "tags", props: { title: "Cenik", groups: [{ items: [{ name: "Terapija", note: "45 min", price: { amount: 45 } }] }] } };
    const out = html(<PriceList section={tags} ctx={ctxFor("pregib", NOVO_MESTO)} index={1} />);
    expect(out).toMatch(/<li class="price-label price-label--fold"><h3 class="price-label__name">Terapija<\/h3><p class="price-label__note">45 min<\/p><p class="price-label__price"><span class="price">45\s€<\/span><\/p><\/li>/);
    expect(out).not.toContain("branch");
    expect(out).not.toContain("label-card");
  });
});

describe("opening-hours poster", () => {
  const poster: SectionOf<"opening-hours"> = { id: "s_weekend", type: "opening-hours", variant: "poster", tone: "band", props: { eyebrow: "Izletniška kmetija", title: "Ob sobotah in nedeljah kuhamo kosila", note: "Juha, pečenka, štruklji." } };

  it("sets the times from the facts at poster size, the days above them, the note under them", () => {
    const business: Business = { ...LUCE, hours: { entries: [{ from: "sat", to: "sun", open: "11:00", close: "19:00" }] } };
    const out = html(<OpeningHours section={poster} ctx={ctxFor("markacija", business)} index={4} />);
    expect(out).toContain('<div class="oh oh--poster">');
    expect(out).toMatch(/<dl class="oh-poster"><div class="oh-poster__row"><dt class="oh-poster__days">Sobota–nedelja<\/dt><dd class="oh-poster__time">11\.00–19\.00<\/dd><\/div><\/dl><p class="oh__note">Juha, pečenka, štruklji\.<\/p>/);
  });

  it("shows the hours placeholder when the hours are missing", () => {
    const out = html(<OpeningHours section={poster} ctx={ctxFor("markacija", { ...LUCE, hours: { $placeholder: "hours" } })} index={4} />);
    expect(out).toContain('data-ph="hours"');
    expect(out).not.toContain("oh-poster__time");
  });
});

describe("gallery wall", () => {
  const wall: SectionOf<"gallery"> = { id: "s_wall", type: "gallery", variant: "wall", props: { title: "Kmetija in živali", images: [{ image: "img_salon" }, { image: "img_detail" }, { image: "img_team" }, { image: "img_salon" }, { image: "img_detail" }] } };

  it("runs edge to edge (no container), the heading for screen readers, each photo sized for its place", () => {
    const out = html(<Gallery section={wall} ctx={testCtx()} index={2} />);
    expect(out).not.toContain('class="container"');
    expect(out).toContain('<h2 id="s_wall-title" class="section-title">Kmetija in živali</h2>');
    expect(out).toContain('<ul class="gallery gallery--wall" data-gallery=""');
    const sizes = [...out.matchAll(/<source type="image\/avif" srcSet="[^"]*" sizes="([^"]+)"/g)].map((m) => m[1]);
    expect(sizes).toEqual(["(min-width: 40rem) 58vw, 100vw", "(min-width: 40rem) 42vw, 100vw", "(min-width: 40rem) 33vw, 50vw", "(min-width: 40rem) 33vw, 50vw", "(min-width: 40rem) 33vw, 50vw"]);
  });
});

describe("phone bar", () => {
  it("books first and calls second in Pregib", () => {
    const ctx = ctxFor("pregib", NOVO_MESTO);
    expect(barActions(ctx)).toEqual(["booking", "call"]);
    const out = html(<MobileActionBar ctx={ctx} />);
    expect(out).toMatch(/<a class="btn btn--primary action-bar__btn" href="https:\/\/pregib\.example\/narocanje"><svg[^>]*>[\s\S]*?<\/svg>Rezerviraj<\/a><a class="btn btn--secondary action-bar__btn" href="tel:\+38651555642"><svg[^>]*>[\s\S]*?<\/svg>Klic<\/a>/);
  });

  it("falls back to the facts it has: no booking link means call only, then directions", () => {
    expect(barActions(ctxFor("pregib", { ...NOVO_MESTO, bookingUrl: undefined }))).toEqual(["call"]);
    expect(barActions(ctxFor("markacija", LUCE))).toEqual(["call", "directions"]);
    expect(barActions(testCtx())).toEqual(["call", "directions"]);
  });
});

describe("cut shapes", () => {
  const styles = readdirSync(path.join(here, "../styles")).filter((f) => f.endsWith(".css"));

  it("cuts shapes only through the shape tokens (or the visually-hidden idiom), never a free polygon", () => {
    for (const f of styles) {
      const css = readFileSync(path.join(here, "../styles", f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      for (const m of css.matchAll(/clip-path:\s*([^;]+);/g)) expect(m[1], f).toMatch(/^(?:var\(--shape-[a-z]+\)|inset\(50%\))$/);
    }
  });
});
