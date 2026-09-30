import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Page, SiteSpec } from "@sb/spec";
import { CookieConsent, Footer, Header, MobileActionBar } from "../src/chrome/index.tsx";
import { FULL_BUSINESS, SPARSE_BUSINESS, html, testCtx, testSpec } from "./helpers.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

const legalPage = (id: string, kind: Page["kind"], slug: string, label: string): Page => ({
  id,
  kind,
  slug,
  nav: { label, show: false },
  seo: { title: label, description: label },
  sections: [] as never,
});

function spec(overrides: Partial<SiteSpec> = {}): SiteSpec {
  const base = testSpec();
  return {
    ...base,
    pages: [
      ...base.pages,
      legalPage("p_zasebnost", "privacy", "zasebnost", "Zasebnost"),
      legalPage("p_dostopnost", "accessibility", "dostopnost", "Dostopnost"),
      legalPage("p_404", "not-found", "404", "Ni strani"),
    ],
    ...overrides,
  };
}
const chrome = (c: Partial<SiteSpec["chrome"]["header"]>, rest: Partial<SiteSpec["chrome"]> = {}): SiteSpec["chrome"] => ({
  header: { variant: "bar", cta: "call", ...c },
  footer: { variant: "columns" },
  mobileActionBar: true,
  ...rest,
});

describe("Header", () => {
  for (const variant of ["bar", "split-cta", "stacked"] as const) {
    it(`renders ${variant} with brand, labelled nav, a real menu button and the CTA`, () => {
      const out = html(<Header ctx={testCtx(spec({ chrome: chrome({ variant }) }))} />);
      expect(out).toContain(`site-header--${variant}`);
      expect(out).toMatch(/^<header/);
      expect(out).toContain(">Frizerski salon Lipa</span>");
      expect(out).toMatch(/<button type="button" class="nav-toggle" aria-expanded="false" aria-controls="site-nav" data-nav-toggle="">/);
      expect(out).toContain('<nav id="site-nav" class="site-nav" aria-label="Glavna navigacija">');
      expect(out).toContain('<a href="index.html" aria-current="page">Domov</a>');
      expect(out).toContain('<a href="storitve.html">Storitve</a>');
      // Legal pages are not in the main nav.
      expect(out).not.toContain("zasebnost.html");
      expect(out).toMatch(/class="btn btn--primary site-header__cta[^"]*" href="tel:\+38641123456">Pokliči</);
      expect(out).toContain('classList.add("js")');
    });
  }

  it("marks the current page", () => {
    const s = spec();
    const out = html(<Header ctx={testCtx(s, s.pages[1])} />);
    expect(out).toContain('<a href="storitve.html" aria-current="page">Storitve</a>');
    expect(count(out, /aria-current/g)).toBe(1);
  });

  it("keeps a call CTA for wide screens only when the mobile action bar carries it", () => {
    expect(html(<Header ctx={testCtx(spec())} />)).toContain("site-header__cta--wide-only");
    const noBar = html(<Header ctx={testCtx(spec({ chrome: chrome({}, { mobileActionBar: false }) }))} />);
    expect(noBar).toContain("site-header__cta");
    expect(noBar).not.toContain("site-header__cta--wide-only");
  });

  it("keeps a booking CTA for wide screens only when the page opens with the same action (no duplicate on phones)", () => {
    const s = spec({ chrome: chrome({ cta: "booking" }) });
    const hero = { id: "s_hero", type: "hero-type", variant: "large", props: { headline: "Fizioterapija", intro: "Uvod.", primary: { label: "Rezervirajte termin", target: { action: "booking" } } } };
    const withHero = { ...s, pages: [{ ...s.pages[0]!, sections: [hero, ...s.pages[0]!.sections] } as unknown as typeof s.pages[number], ...s.pages.slice(1)] };
    expect(html(<Header ctx={testCtx(withHero, withHero.pages[0])} />)).toContain("site-header__cta--wide-only");
  });

  it("renders a booking CTA and hides a CTA whose fact is missing", () => {
    const booking = html(<Header ctx={testCtx(spec({ chrome: chrome({ cta: "booking" }) }))} />);
    expect(booking).toMatch(/href="https:\/\/booking.example.com\/lipa" rel="noopener" target="_blank">Rezerviraj termin</);
    expect(booking).not.toContain("wide-only");
    const none = html(<Header ctx={testCtx(spec({ chrome: chrome({ cta: "none" }) }))} />);
    expect(none).not.toContain("site-header__cta");
    const sparse = html(<Header ctx={testCtx(spec({ business: SPARSE_BUSINESS }))} />);
    expect(sparse).not.toContain("tel:");
    expect(sparse).not.toContain("site-header__cta");
  });

  it("uses the logo when there is one", () => {
    const s = spec({ assets: { ...testSpec().assets, logo: { src: "uploads/logo.svg", width: 160, height: 40, file: "logo.svg" } } });
    const out = html(<Header ctx={testCtx(s)} />);
    expect(out).toContain('<img class="site-header__logo" src="media/logo.svg" width="160" height="40" alt="Frizerski salon Lipa"/>');
    expect(out).not.toContain("site-header__name");
  });

  it("drops the menu button when no page is in the nav", () => {
    const s = spec();
    const out = html(<Header ctx={testCtx({ ...s, pages: s.pages.map((p) => ({ ...p, nav: { ...p.nav, show: false } })) })} />);
    expect(out).not.toContain("nav-toggle");
    expect(out).not.toContain("<nav");
  });
});

describe("Footer", () => {
  for (const variant of ["columns", "compact"] as const) {
    it(`renders ${variant} with ZEPT provider info, legal links and a labelled nav`, () => {
      const out = html(<Footer ctx={testCtx(spec({ chrome: chrome({}, { footer: { variant } }) }))} />);
      expect(out).toMatch(/^<footer class="site-footer site-footer--/);
      expect(out).toContain(`site-footer--${variant}`);
      expect(out).toContain("Frizerski salon Lipa, Ana Novak s.p.");
      expect(out).toContain("Trubarjeva cesta 12");
      expect(out).toContain("<dt>Matična številka</dt><dd>1234567000</dd>");
      expect(out).toContain("<dt>ID za DDV</dt><dd>SI12345678</dd>");
      expect(out).toContain("<dd>AJPES</dd>");
      expect(out).toContain('href="tel:+38641123456"');
      expect(out).toContain('href="mailto:info@salon-lipa.si"');
      expect(out).toContain('<nav class="site-footer__block site-footer__nav" aria-label="Povezave v nogi">');
      expect(out).toContain('href="zasebnost.html">Zasebnost</a>');
      expect(out).toContain('href="dostopnost.html">Dostopnost</a>');
      expect(out).not.toContain("404.html");
      expect(out).toContain(`© ${new Date().getFullYear()} Frizerski salon Lipa, Ana Novak s.p.`);
      expect(out).toMatch(/<button type="button" class="site-footer__consent" data-consent-open="" hidden="">Nastavitve piškotkov<\/button>/);
      expect(count(out, /<h2/g)).toBe(3);
    });
  }

  it("renders required placeholders for missing provider facts", () => {
    const out = html(<Footer ctx={testCtx(spec({ business: SPARSE_BUSINESS }))} />);
    for (const k of ["legalName", "registrationNumber", "taxNumber", "phone", "email", "address"]) expect(out).toContain(`data-ph="${k}"`);
    expect(out).toContain("<dt>Davčna številka</dt>");
    expect(out).not.toContain("Vpis v register");
    expect(out).toContain("Mizarstvo Bor</p>");
  });

  it("lists social profiles as plain links", () => {
    const b = { ...FULL_BUSINESS, social: [{ network: "instagram" as const, url: "https://www.instagram.com/salonlipa" }] };
    const out = html(<Footer ctx={testCtx(spec({ business: b }))} />);
    expect(out).toContain('href="https://www.instagram.com/salonlipa" rel="noopener">Instagram</a>');
    expect(out).toContain(">Družbena omrežja</h2>");
    expect(out).not.toContain("<script");
  });
});

describe("MobileActionBar", () => {
  it("renders call and directions as two buttons", () => {
    const out = html(<MobileActionBar ctx={testCtx(spec())} />);
    expect(out).toMatch(/^<nav class="action-bar" aria-label="Hitri kontakt">/);
    expect(out).toContain('href="tel:+38641123456">Pokliči</a>');
    expect(out).toMatch(/href="https:\/\/www.google.com\/maps[^"]*" rel="noopener" target="_blank">Navodila za pot<\/a>/);
    expect(count(out, /action-bar__btn/g)).toBe(2);
  });

  it("hides a button whose fact is missing, and renders nothing when both are", () => {
    const noPhone = html(<MobileActionBar ctx={testCtx(spec({ business: { ...FULL_BUSINESS, phone: { $placeholder: "phone" } } }))} />);
    expect(noPhone).not.toContain("tel:");
    expect(noPhone).toContain("Navodila za pot");
    expect(html(<MobileActionBar ctx={testCtx(spec({ business: SPARSE_BUSINESS }))} />)).toBe("");
  });
});

describe("CookieConsent", () => {
  it("renders a hidden, labelled, non-blocking notice with two equal choices", () => {
    const out = html(<CookieConsent ctx={testCtx(spec())} />);
    expect(out).toMatch(/^<section id="consent" class="consent" aria-labelledby="consent-title" data-consent-notice="" hidden="">/);
    expect(out).toContain('<h2 id="consent-title" class="consent__title">Piškotki</h2>');
    expect(out).toContain('<button type="button" class="btn btn--secondary" data-consent="denied">Samo nujni</button>');
    expect(out).toContain('<button type="button" class="btn btn--secondary" data-consent="granted">Dovoli zunanje vsebine</button>');
    expect(out).toContain('href="zasebnost.html"');
    expect(out).not.toContain('role="dialog"');
  });
});

describe("islands", () => {
  const read = (f: string) => readFileSync(path.join(here, "../islands", f), "utf8");

  it("nav.js is small, dependency-free and implements the menu contract", () => {
    const js = read("nav.js");
    expect(Buffer.byteLength(js)).toBeLessThan(2048);
    expect(js).not.toMatch(/\bimport\b|\brequire\(/);
    for (const s of ['classList.add("js")', "aria-expanded", "Escape", "Tab", "min-width: 48rem"]) expect(js).toContain(s);
  });

  it("consent.js makes no requests before consent and follows the embed contract", () => {
    const js = read("consent.js");
    expect(js).not.toMatch(/fetch\(|XMLHttpRequest|document\.cookie|sendBeacon/);
    for (const s of ['"sb-consent"', "data-embed-src", "data-embed-title", "data-embed-load", "data-consent-open", '"lazy"', "no-referrer-when-downgrade"]) {
      expect(js).toContain(s);
    }
  });
});

describe("chrome.css", () => {
  const css = readFileSync(path.join(here, "../styles/chrome.css"), "utf8");
  it("contains no banned patterns and uses tokens only", () => {
    expect(css).not.toMatch(/gradient\(|backdrop-filter|font-style:\s*italic|monospace|border-radius:\s*(9{3,}|50%)|text-align:\s*center/);
    for (const m of css.matchAll(/box-shadow:\s*([^;]+);/g)) expect(m[1]).toBe("var(--shadow)");
    for (const m of css.matchAll(/#[0-9a-f]{3,6}\b|rgb\(/gi)) expect.fail(`raw colour ${m[0]}`);
  });
  it("respects the safe area and pads the page for the action bar", () => {
    expect(css).toContain("env(safe-area-inset-bottom");
    expect(css).toMatch(/body\.has-action-bar\s*\{\s*padding-bottom/);
  });
});
