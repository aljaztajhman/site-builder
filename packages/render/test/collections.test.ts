import { describe, expect, it } from "vitest";
import { validateSite, type SiteSpec } from "@sb/spec";
import { renderPage, renderPath, renderSite } from "../src/index.ts";
import { withCollections } from "./collections-fixture.ts";

const URL_ = "https://pekarnakvas.si/";
const NBSP = " ";

const html = (spec: SiteSpec, path: string, siteUrl?: string) => renderPath(spec, path, siteUrl ? { siteUrl } : {})!;
const ld = (page: string) => [...page.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map((m) => JSON.parse(m[1]!) as Record<string, unknown>);

describe("collections on the site", () => {
  const spec = withCollections();

  it("is a valid v12 spec", () => {
    expect(validateSite(spec).issues).toEqual([]);
  });

  it("lists posts newest first with Slovene dates, each linking to its page", () => {
    const page = html(spec, "novice.html");
    const titles = [...page.matchAll(/<h2 class="coll__title"><a href="([^"]+)">([^<]+)<\/a>/g)].map((m) => [m[1], m[2]]);
    expect(titles.slice(0, 2)).toEqual([
      ["novice/nov-rzeni-kruh.html", "Nov rženi kruh"],
      ["novice/kvasni-tecaj-za-zacetnike.html", "Kvasni tečaj za začetnike"],
    ]);
    expect(page).toContain(`<time dateTime="2026-10-01">1.${NBSP}oktobra 2026</time>`);
    // The list opens the page: its title is the page's h1 (the home page's short list keeps an h2).
    expect(page).toMatch(/<h1 id="s_novice-title" class="section-title">Novice<\/h1>/);
    expect(html(spec, "index.html")).toMatch(/<h2 id="s_home_news-title" class="section-title">Iz pekarne<\/h2>/);
  });

  it("lists events soonest first; only an event with a body links to a page; the events island is loaded", () => {
    const page = html(spec, "novice.html");
    const events = page.slice(page.indexOf('id="s_dogodki"'));
    expect(events.indexOf("Pekovski sejem")).toBeLessThan(events.indexOf("Dan odprtih vrat"));
    expect(events).toContain(`20.–22.${NBSP}oktobra 2026`);
    expect(events).toContain('data-ends="2026-10-22"');
    expect(events).toContain('<h3 class="coll__title">Pekovski sejem</h3>');
    expect(html(spec, "index.html")).toContain('<h3 class="coll__title"><a href="novice/nov-rzeni-kruh.html">Nov rženi kruh</a></h3>');
    expect(events).toContain('href="dogodki/dan-odprtih-vrat.html"');
    expect(events).toContain(`7.${NBSP}novembra 2026, 10.00–14.00`);
    expect(page).toMatch(/<script src="[^"]*js\/events\.js" defer="">/);
    // A page without an events list doesn't load it.
    expect(html(spec, "index.html")).not.toContain("events.js");
  });

  it("shows only the newest post on the home page with a link to all news", () => {
    const home = html(spec, "index.html");
    const box = home.slice(home.indexOf('id="s_home_news"'));
    expect(box).toContain("Nov rženi kruh");
    expect(box).not.toContain("Kvasni tečaj");
    expect(box).toContain('<a class="text-link" href="novice.html">Vse novice</a>');
  });

  it("renders each entry's page one directory down, with working links, an h1 and the reading time", () => {
    const site = renderSite(spec);
    expect([...site.pages.keys()]).toEqual(expect.arrayContaining(["novice/nov-rzeni-kruh.html", "novice/kvasni-tecaj-za-zacetnike.html", "dogodki/dan-odprtih-vrat.html"]));
    expect(site.pages.has("dogodki/pekovski-sejem.html")).toBe(false);
    const post = site.pages.get("novice/kvasni-tecaj-za-zacetnike.html")!;
    expect(post).toMatch(/<h1 id="[^"]+" class="section-title">Kvasni tečaj za začetnike<\/h1>/);
    expect(post).toContain('<p class="entry__back"><a href="../novice.html">Novice</a></p>');
    expect(post).toContain("1 minuta branja");
    expect(post).toContain('href="../index.html"');
    expect(post).toMatch(/href="\.\.\/\.\.\/_shared\/[0-9a-f]+\/site/);
    expect(post).toContain('src="../media/img_02-');
    expect(post).toContain("<title>Kvasni tečaj za začetnike | Pekarna Kvas</title>");
  });

  it("gives an event's page its facts and a note the island shows once it has passed", () => {
    const page = html(spec, "dogodki/dan-odprtih-vrat.html", URL_);
    expect(page).toContain('data-ends="2026-11-07"');
    expect(page).toContain('<p class="entry__past" hidden="">Ta dogodek je že minil.</p>');
    expect(page).toContain("<dt>Kje</dt><dd>Pekarna</dd>");
    const event = ld(page)[0]!;
    expect(event["@type"]).toBe("Event");
    expect(event.startDate).toBe("2026-11-07T10:00:00+01:00");
    expect(event.endDate).toBe("2026-11-07T14:00:00+01:00");
    expect(event.url).toBe(`${URL_}dogodki/dan-odprtih-vrat.html`);
  });

  it("describes a post as a BlogPosting by the business", () => {
    const post = ld(html(spec, "novice/kvasni-tecaj-za-zacetnike.html", URL_))[0]!;
    expect(post).toMatchObject({ "@type": "BlogPosting", headline: "Kvasni tečaj za začetnike", datePublished: "2026-09-12", author: { name: "Pekarna Kvas" } });
    expect(String(post.image)).toMatch(/^https:\/\/pekarnakvas\.si\/media\/img_02-\d+\.webp$/);
  });

  it("puts entry pages in the sitemap (posts with their date) and the posts in an RSS feed", () => {
    const site = renderSite(spec, { siteUrl: URL_ });
    const sitemap = site.files.get("sitemap.xml")!;
    expect(sitemap).toContain(`<url><loc>${URL_}novice/nov-rzeni-kruh.html</loc><lastmod>2026-10-01</lastmod></url>`);
    expect(sitemap).toContain(`<loc>${URL_}dogodki/dan-odprtih-vrat.html</loc>`);
    const rss = site.files.get("novice/rss.xml")!;
    expect(rss).toContain(`<link>${URL_}novice/nov-rzeni-kruh.html</link>`);
    expect(rss.indexOf("Nov rženi kruh")).toBeLessThan(rss.indexOf("Kvasni tečaj"));
    expect(rss).toContain("<pubDate>Thu, 01 Oct 2026 12:00:00 +0000</pubDate>");
    expect(rss).toContain("<language>sl-si</language>");
    expect(site.pages.get("index.html")).toContain(`<link rel="alternate" type="application/rss+xml" title="Novice – Pekarna Kvas" href="${URL_}novice/rss.xml"/>`);
  });

  it("renders entries in the second language under en/, with English labels", () => {
    const two = withCollections();
    two.locales.enabled = ["sl", "en"];
    two.translations = { en: { "/collections/blog/items/1/title": "New rye bread" } };
    const site = renderSite(two, { siteUrl: URL_ });
    const en = site.pages.get("en/novice/nov-rzeni-kruh.html")!;
    expect(en).toContain(">New rye bread</h1>");
    expect(en).toContain(`1${NBSP}October 2026`);
    expect(en).toContain(`<link rel="alternate" hrefLang="sl" href="${URL_}novice/nov-rzeni-kruh.html"/>`);
    expect(en).toContain('href="../../../_shared/');
    // The menu marks the news page as the section the entry belongs to, not as the current page.
    expect(en).toContain('<a href="../novice.html" aria-current="true">Novice</a>');
    // The editor's preview of the English pages renders the same files from their paths.
    expect(renderPath(two, "en/novice/nov-rzeni-kruh.html", { siteUrl: URL_ })).toBe(en);
    expect(renderPath(two, "en/novice.html", { siteUrl: URL_ })).toBe(site.pages.get("en/novice.html"));
    expect(renderPath(two, "en/index.html", { siteUrl: URL_ })).toBe(site.pages.get("en/index.html"));
    // Only an enabled language: German isn't, so there is no de/ page.
    expect(renderPath(two, "de/novice.html")).toBeNull();
    expect(renderPath(spec, "en/novice.html")).toBeNull();
  });

  it("shows nothing for an empty blog, and says so for no events", () => {
    const empty = withCollections();
    empty.collections!.blog!.items = [];
    empty.collections!.events!.items = [];
    const page = html(empty, "novice.html");
    expect(page).not.toContain('id="s_novice"');
    expect(page).toContain('<p class="coll__empty">Trenutno ni napovedanih dogodkov.</p>');
  });

  it("is the same page in the preview and the published site (one renderer)", () => {
    const page = spec.pages.find((p) => p.id === "p_novice")!;
    expect(renderPage(spec, page)).toBe(renderSite(spec).pages.get("novice.html"));
  });
});
