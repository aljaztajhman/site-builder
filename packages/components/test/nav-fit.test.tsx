import { describe, expect, it } from "vitest";
import { HEADER_FAMILIES, type Page, type SiteSpec } from "@sb/spec";
import { Header } from "../src/chrome/index.tsx";
import { navFit, textEm, type NavRow } from "../src/chrome/nav-fit.ts";
import { html, testCtx, testSpec } from "./helpers.ts";

/** Plus's 20 menu entries (it-plan-limits), several at the spec's 24-character limit; the browser check is tools/eval/test/nav-pages-render.test.ts. */
const LABELS = [
  "Domov",
  "O nas",
  "Ponudba",
  "Cenik",
  "Sezonski izdelki",
  "Torte za vse priložnosti",
  "Kruh in pecivo",
  "Darilni paketi",
  "Naročila za podjetja",
  "Dostava na dom",
  "Galerija",
  "Novice",
  "Dogodki",
  "Pogosta vprašanja",
  "Zaposlitev",
  "Naša zgodba in ekipa",
  "Partnerji in dobavitelji",
  "Sobe in apartmaji",
  "Izleti v okolici Pohorja",
  "Kontakt",
];
const DESIGN: NavRow["design"] = { fontPair: "inter-tight-inter", baseFontSize: 17, scale: 1.25, headingCase: "normal", headingTracking: 0 };
const row = (r: Partial<NavRow> = {}): NavRow => ({ family: "bar", design: DESIGN, brand: { name: "Pekarna Kvas" }, more: "Več", ...r });
const ORDER = [undefined, "64", "80", "never"];

describe("navFit (the wide header's row and Več)", () => {
  it("keeps a short menu in the row at every wide width: no Več", () => {
    for (const family of HEADER_FAMILIES) expect(navFit(["Domov", "Storitve in cenik", "Kontakt"], row({ family }))).toEqual([undefined, undefined, undefined]);
  });

  it("puts what doesn't fit under Več, in order: an entry in the row at one width stays in it at every wider one", () => {
    for (const family of HEADER_FAMILIES) {
      const fits = navFit(LABELS, row({ family, button: { label: "Pokličite", icon: true, large: family === "split-cta" }, directions: "Navodila za pot" }));
      // At 1280 px the first entries stand in the row (at 768 px a crowded row may hold none: all are under Več).
      expect(fits[0], family).not.toBe("never");
      expect(fits.at(-1), family).toBe("never");
      for (let i = 1; i < fits.length; i++) expect(ORDER.indexOf(fits[i]), `${family} ${i}`).toBeGreaterThanOrEqual(ORDER.indexOf(fits[i - 1]));
    }
  });

  it("gives the row less room when the brand, the button or the type take more", () => {
    const inRow = (fits: (string | undefined)[]) => fits.filter((f) => f !== "never").length;
    const plain = inRow(navFit(LABELS, row()));
    expect(inRow(navFit(LABELS, row({ brand: { name: "Turistična kmetija in gostilna Pri starem mlinu" } })))).toBeLessThan(plain);
    expect(inRow(navFit(LABELS, row({ button: { label: "Rezervirajte termin", icon: false, large: true } })))).toBeLessThan(plain);
    expect(inRow(navFit(LABELS, row({ family: "word" })))).toBeLessThan(plain);
    // Own-row families have the whole width.
    expect(inRow(navFit(LABELS, row({ family: "stacked" })))).toBeGreaterThan(plain);
  });

  it("estimates wider letters wider, upper case and tracking included", () => {
    expect(textEm("mm")).toBeGreaterThan(textEm("ii"));
    expect(textEm("Domov", true)).toBeGreaterThan(textEm("Domov"));
    expect(textEm("Domov", false, 0.08)).toBeCloseTo(textEm("Domov") + 0.4);
  });
});

const page = (i: number, label: string): Page => ({
  id: `p_n${i}`,
  kind: i === 0 ? "home" : "standard",
  slug: i === 0 ? "" : `stran-${i}`,
  nav: { label, show: true },
  seo: { title: label, description: label },
  sections: [] as never,
});
const withPages = (labels: string[], current = 0): ReturnType<typeof testCtx> => {
  const base = testSpec();
  const spec: SiteSpec = { ...base, pages: labels.map((l, i) => page(i, l)) };
  return testCtx(spec, spec.pages[current]);
};

describe("Header with Plus's 20 pages", () => {
  it("lists every entry once in the menu, and the ones that don't fit in the row again under Več", () => {
    const out = html(<Header ctx={withPages(LABELS)} />);
    const main = out.slice(out.indexOf('class="site-nav__list"'), out.indexOf('class="site-nav__more"'));
    for (const l of LABELS) expect(main.match(new RegExp(`>${l}</a>`, "g"))?.length, l).toBe(1);
    const fits = [...main.matchAll(/<li( data-nav-fit="([^"]+)")?><a/g)].map((m) => m[2]);
    expect(fits).toHaveLength(20);
    const sub = out.slice(out.indexOf('class="site-nav__sub"'));
    const copies = [...sub.matchAll(/<li data-nav-fit="([^"]+)"><a href="[^"]+">([^<]+)<\/a>/g)].map((m) => [m[2], m[1]]);
    expect(copies).toEqual(LABELS.flatMap((l, i) => (fits[i] ? [[l, fits[i]]] : [])));
    expect(out).toMatch(/<li class="site-nav__more" data-until="never"><details><summary data-nav-more="">Več<\/summary>/);
  });

  it("marks Več when the current page is under it", () => {
    const out = html(<Header ctx={withPages(LABELS, 19)} />);
    expect(out).toContain('<summary data-nav-more="" data-current="never">Več</summary>');
    expect(out.match(/aria-current="page">Kontakt</g)).toHaveLength(2);
  });

  it("renders a short menu exactly as before: no Več, no breakpoints", () => {
    const out = html(<Header ctx={withPages(["Domov", "Storitve", "Kontakt"])} />);
    expect(out).not.toContain("site-nav__more");
    expect(out).not.toContain("data-nav-fit");
    expect(out).toContain('<ul class="site-nav__list" role="list"><li><a href="index.html" aria-current="page">Domov</a></li>');
  });
});
