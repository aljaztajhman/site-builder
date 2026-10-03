import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { strFromU8 } from "fflate";
import { migrateSpec, type SiteSpec } from "@sb/spec";
import { exportFiles, jsonLd, normaliseSiteUrl, renderPage, renderSite, shareImageOf, siteFiles } from "../src/index.ts";

const GOLDEN_DIR = new URL("../../../tools/eval/golden/", import.meta.url);
const golden = (id: string) => migrateSpec(JSON.parse(readFileSync(new URL(`${id}.json`, GOLDEN_DIR), "utf8"))) as SiteSpec;
const ALL = readdirSync(GOLDEN_DIR).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""));
const URL_ = "https://pekarnakvas.si/";

const pageOf = (spec: SiteSpec, kind: string) => spec.pages.find((p) => p.kind === kind)!;
/** Every JSON-LD block of a page, parsed. */
const ld = (html: string) => [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map((m) => JSON.parse(m[1]!) as Record<string, unknown>);
const meta = (html: string, prop: string) => html.match(new RegExp(`<meta (?:property|name)="${prop}" content="([^"]*)"`))?.[1];

describe("site address", () => {
  it("is normalised to an origin or path ending in /, and refuses anything but http(s)", () => {
    expect(normaliseSiteUrl("https://pekarnakvas.si")).toBe("https://pekarnakvas.si/");
    expect(normaliseSiteUrl("https://pekarna.stranko.si/?x=1#a")).toBe("https://pekarna.stranko.si/");
    expect(normaliseSiteUrl("javascript:alert(1)")).toBeNull();
    expect(normaliseSiteUrl("")).toBeNull();
    expect(normaliseSiteUrl("not a url")).toBeNull();
  });
});

describe("pages without an address (preview before a domain, export)", () => {
  const spec = golden("fizioterapija-pregib");
  const html = renderPage(spec, pageOf(spec, "home"));

  it("carry locale, site name and structured data, but no canonical, og:url or og:image", () => {
    expect(meta(html, "og:locale")).toBe("sl_SI");
    expect(meta(html, "og:site_name")).toBe(spec.business.name);
    expect(meta(html, "twitter:card")).toBe("summary");
    expect(html).not.toContain('rel="canonical"');
    expect(html).not.toContain("og:url");
    expect(html).not.toContain("og:image");
    expect(html).not.toContain("hreflang");
    const business = ld(html)[0]!;
    expect(business["@type"]).toBe("Physiotherapy");
    expect(business).not.toHaveProperty("url");
  });

  it("come with a robots.txt that allows everything and no sitemap (it needs absolute URLs)", () => {
    const site = renderSite(spec);
    expect(site.files.get("robots.txt")).toBe("User-agent: *\nAllow: /\n");
    expect(site.files.has("sitemap.xml")).toBe(false);
  });
});

describe("pages with an address", () => {
  const spec = golden("fizioterapija-pregib");
  const opts = { siteUrl: URL_ };
  const home = renderPage(spec, pageOf(spec, "home"), opts);
  const sub = spec.pages.find((p) => p.kind === "standard")!;

  it("have a canonical URL and og:url: the directory for home, the file for other pages", () => {
    expect(home).toContain(`<link rel="canonical" href="${URL_}"/>`);
    expect(meta(home, "og:url")).toBe(URL_);
    const subHtml = renderPage(spec, sub, opts);
    expect(subHtml).toContain(`<link rel="canonical" href="${URL_}${sub.slug}.html"/>`);
  });

  it("share a 1200 × 630 JPEG of the home page's opening photo", () => {
    const share = shareImageOf(spec)!;
    expect(share.file).toMatch(/^share-img_[a-z0-9_-]+\.jpg$/);
    expect(meta(home, "og:image")).toBe(`${URL_}media/${share.file}`);
    expect(meta(home, "og:image:width")).toBe("1200");
    expect(meta(home, "og:image:height")).toBe("630");
    expect(meta(home, "twitter:card")).toBe("summary_large_image");
  });

  it("put the address, the share picture and the offers into the business's structured data", () => {
    const business = ld(home)[0]!;
    expect(business.url).toBe(URL_);
    expect(business.image).toBe(`${URL_}media/${shareImageOf(spec)!.file}`);
    const catalog = business.hasOfferCatalog as { itemListElement: { itemOffered: { name: string }; price?: number; priceCurrency?: string }[] };
    expect(catalog.itemListElement.length).toBeGreaterThan(0);
    for (const o of catalog.itemListElement) if (o.price !== undefined) expect(o.priceCurrency).toBe("EUR");
  });

  it("never mark the 404 page canonical, and tell robots not to index it", () => {
    const nf = renderPage(spec, pageOf(spec, "not-found"), opts);
    expect(nf).not.toContain('rel="canonical"');
    expect(nf).toContain('<meta name="robots" content="noindex"/>');
  });

  it("list every page but the 404 in sitemap.xml, and name it in robots.txt", () => {
    const site = renderSite(spec, opts);
    const xml = site.files.get("sitemap.xml")!;
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toEqual(spec.pages.filter((p) => p.kind !== "not-found").map((p) => `${URL_}${p.slug ? `${p.slug}.html` : ""}`));
    expect(xml).not.toContain("404");
    expect(site.files.get("robots.txt")).toBe(`User-agent: *\nAllow: /\n\nSitemap: ${URL_}sitemap.xml\n`);
  });
});

describe("a site in two languages", () => {
  const spec = golden("fizioterapija-pregib");
  spec.locales.enabled = ["sl", "en"];
  const opts = { siteUrl: URL_ };

  it("links each page to its other language and marks the default as x-default", () => {
    const sub = spec.pages.find((p) => p.kind === "standard")!;
    const en = renderPage(spec, sub, { ...opts, locale: "en" });
    expect(en).toContain(`<link rel="canonical" href="${URL_}en/${sub.slug}.html"/>`);
    expect(en).toContain(`<link rel="alternate" hrefLang="sl" href="${URL_}${sub.slug}.html"/>`);
    expect(en).toContain(`<link rel="alternate" hrefLang="en" href="${URL_}en/${sub.slug}.html"/>`);
    expect(en).toContain(`<link rel="alternate" hrefLang="x-default" href="${URL_}${sub.slug}.html"/>`);
    expect(meta(en, "og:locale")).toBe("en_GB");
    expect(meta(en, "og:locale:alternate")).toBe("sl_SI");
  });

  it("has both languages in the sitemap, each entry with its alternates", () => {
    const xml = renderSite(spec, opts).files.get("sitemap.xml")!;
    expect(xml).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
    expect(xml).toContain(`<loc>${URL_}en/</loc>`);
    expect(xml).toContain(`<xhtml:link rel="alternate" hreflang="en" href="${URL_}en/"/>`);
    expect(xml).toContain(`<xhtml:link rel="alternate" hreflang="x-default" href="${URL_}"/>`);
  });
});

describe("structured data", () => {
  it("answers the FAQ as a FAQPage on the page that holds it", () => {
    const spec = golden("fizioterapija-pregib");
    const page = spec.pages.find((p) => p.sections.some((s) => s.type === "faq"))!;
    const faq = ld(renderPage(spec, page)).find((d) => d["@type"] === "FAQPage")!;
    const items = page.sections.flatMap((s) => (s.type === "faq" ? s.props.items : []));
    expect((faq.mainEntity as unknown[]).length).toBe(items.length);
    expect(faq.mainEntity).toContainEqual({ "@type": "Question", name: items[0]!.question, acceptedAnswer: { "@type": "Answer", text: items[0]!.answer } });
  });

  it("never offers a placeholder price or an item marked unavailable", () => {
    const spec = golden("fizioterapija-pregib");
    // The home page and the price page list the same items: mark them in both.
    const lists = spec.pages.flatMap((p) => p.sections).flatMap((s) => (s.type === "price-list" ? [s] : []));
    expect(lists.length).toBeGreaterThan(0);
    const [a, b] = [lists[0]!.props.groups[0]!.items[0]!, lists[0]!.props.groups[0]!.items[1]!];
    for (const l of lists)
      for (const it of l.props.groups.flatMap((g) => g.items)) {
        if (it.name === a.name) it.price = { $placeholder: "price" };
        if (it.name === b.name) it.unavailable = true;
      }
    // Only the price lists offer these here (the services list names some of the same treatments).
    for (const p of spec.pages) p.sections = p.sections.filter((s) => s.type !== "services-list");
    const data = JSON.parse(jsonLd(spec)) as { hasOfferCatalog?: { itemListElement: { itemOffered: { name: string }; price?: number }[] } };
    const offers = data.hasOfferCatalog?.itemListElement ?? [];
    expect(offers.length).toBeGreaterThan(0);
    expect(offers.find((o) => o.itemOffered.name === a.name)?.price).toBeUndefined();
    expect(offers.some((o) => o.itemOffered.name === b.name)).toBe(false);
  });

  it("lists a bakery's products with their prices", () => {
    const spec = golden("pekarna-kvas");
    const data = JSON.parse(jsonLd(spec)) as { hasOfferCatalog: { itemListElement: { itemOffered: { "@type": string; name: string }; price?: number }[] } };
    const products = spec.pages.flatMap((p) => p.sections).flatMap((s) => (s.type === "products" ? s.props.items : []));
    const priced = products.find((p) => p.price && !("$placeholder" in p.price))!;
    const offer = data.hasOfferCatalog.itemListElement.find((o) => o.itemOffered.name === priced.name)!;
    expect(offer.itemOffered["@type"]).toBe("Product");
    expect(offer.price).toBe((priced.price as { amount: number }).amount);
  });

  it("puts a restaurant's menu under hasMenu", () => {
    const data = JSON.parse(jsonLd(golden("gostilna-zlata-zlica"))) as { hasMenu?: { hasMenuSection: { hasMenuItem: unknown[] }[] } };
    expect(data.hasMenu?.hasMenuSection.length).toBeGreaterThan(0);
  });

  it("parses on every page of all ten test sites, with the address", () => {
    for (const id of ALL) {
      const spec = golden(id);
      const site = renderSite(spec, { siteUrl: URL_ });
      for (const [file, html] of site.pages) {
        for (const d of ld(html)) expect(d["@context"], `${id}/${file}`).toBe("https://schema.org");
        if (file === "index.html") expect(ld(html)[0]!.url, id).toBe(URL_);
      }
      expect(site.files.get("sitemap.xml"), id).toMatch(/^<\?xml[\s\S]*<\/urlset>\n$/);
    }
  });
});

describe("export and publish files", () => {
  it("hold robots.txt, and sitemap.xml when the site has an address", () => {
    const spec = golden("pekarna-kvas");
    const without = siteFiles(spec, new Map());
    expect(strFromU8(without.get(`${spec.slug}/robots.txt`)!)).toContain("Allow: /");
    expect(without.has(`${spec.slug}/sitemap.xml`)).toBe(false);
    const files = exportFiles(spec, new Map(), { siteUrl: URL_ });
    expect(strFromU8(files.get(`${spec.slug}/sitemap.xml`)!)).toContain(`<loc>${URL_}</loc>`);
    expect(strFromU8(files.get(`${spec.slug}/robots.txt`)!)).toContain(`Sitemap: ${URL_}sitemap.xml`);
  });
});
