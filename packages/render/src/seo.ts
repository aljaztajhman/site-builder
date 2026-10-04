import { lcpImageFor } from "@sb/components";
import type { Locale, Page, SiteSpec } from "@sb/spec";

/**
 * Search and sharing metadata of a published site (it-seo-basics). Canonical URLs, hreflang, og:url, og:image,
 * the sitemap and the robots.txt Sitemap line need the site's absolute address, which only exists once it has a
 * domain (its own, or <slug>.<PLATFORM_DOMAIN>). Without one those are left out; everything else is rendered.
 * Whether search engines may index is decided by the server (X-Robots-Tag), not by these files.
 */

/** A site address as the renderer uses it: https://host/ (or a path ending in "/"), or null when it isn't one. */
export function normaliseSiteUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  url.search = "";
  url.hash = "";
  const s = url.toString();
  return s.endsWith("/") ? s : `${s}/`;
}

/** Output directory prefix of a locale: "" for the default, "en/" for others. */
export function localeDirOf(spec: SiteSpec, locale: Locale): string {
  return locale === spec.locales.default ? "" : `${locale}/`;
}

/** Path of a page inside the site, as people link to it: the home page is its directory ("", "en/"). */
export function pagePath(spec: SiteSpec, page: Pick<Page, "slug">, locale: Locale): string {
  return `${localeDirOf(spec, locale)}${page.slug ? `${page.slug}.html` : ""}`;
}

/** og:locale values: sl_SI, en_GB. */
export const OG_LOCALE: Record<Locale, string> = { sl: "sl_SI", en: "en_GB", de: "de_AT", hr: "hr_HR", it: "it_IT" };

/** Pages a search engine should list: everything but the 404 page. */
export const indexable = (page: Pick<Page, "kind">) => page.kind !== "not-found";

/**
 * The picture shown when the site is shared (og:image): the home page's opening photo, else the first of the
 * owner's own photos, else the first picture. Published as a 1200 × 630 JPEG (every app that unfurls links
 * reads JPEG; not all read WebP or AVIF), made at publish from the image's largest variant.
 */
export function shareImageOf(spec: SiteSpec): { image: string; file: string } | null {
  const home = spec.pages.find((p) => p.kind === "home");
  const first = home?.sections[0];
  const lcp = first ? lcpImageFor(first) : null;
  const known = new Set(spec.assets.images.map((i) => i.id));
  const id =
    (lcp && known.has(lcp.image) ? lcp.image : undefined) ??
    spec.assets.images.find((i) => i.origin !== "generated")?.id ??
    spec.assets.images[0]?.id;
  return id ? { image: id, file: shareImageFile(id) } : null;
}

export const shareImageFile = (imageId: string) => `share-${imageId}.jpg`;
export const SHARE_IMAGE = { width: 1200, height: 630 } as const;

export interface SeoEntry {
  /** Path inside the site per locale, e.g. { sl: "storitve.html", en: "en/storitve.html" }. */
  paths: Partial<Record<Locale, string>>;
  /** YYYY-MM-DD, when the page has a date of its own (a blog post). */
  lastmod?: string;
}

/** Every indexable page of the site in every enabled locale, plus `extra` (collection entries). */
export function sitemapEntries(spec: SiteSpec, extra: SeoEntry[] = []): SeoEntry[] {
  const pages = spec.pages.filter(indexable).map((page) => ({
    paths: Object.fromEntries(spec.locales.enabled.map((l) => [l, pagePath(spec, page, l)])) as Partial<Record<Locale, string>>,
  }));
  return [...pages, ...extra];
}

const xml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);

/** sitemap.xml with hreflang alternates when the site has more than one language. */
export function sitemapXml(spec: SiteSpec, siteUrl: string, entries: SeoEntry[]): string {
  const multi = spec.locales.enabled.length > 1;
  const urls: string[] = [];
  for (const e of entries) {
    const located = spec.locales.enabled.filter((l) => e.paths[l] !== undefined);
    for (const l of located) {
      const alternates = multi
        ? located.map((a) => `<xhtml:link rel="alternate" hreflang="${a}" href="${xml(siteUrl + e.paths[a]!)}"/>`).join("") +
          (e.paths[spec.locales.default] !== undefined ? `<xhtml:link rel="alternate" hreflang="x-default" href="${xml(siteUrl + e.paths[spec.locales.default]!)}"/>` : "")
        : "";
      urls.push(`<url><loc>${xml(siteUrl + e.paths[l]!)}</loc>${e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ""}${alternates}</url>`);
    }
  }
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${multi ? ` xmlns:xhtml="http://www.w3.org/1999/xhtml"` : ""}>\n` +
    urls.join("\n") +
    `\n</urlset>\n`
  );
}

/**
 * robots.txt: everything may be crawled, AI assistants' crawlers included (owners want to be found and quoted).
 * The Sitemap line only with the site's address.
 */
export function robotsTxt(siteUrl: string | null): string {
  return `User-agent: *\nAllow: /\n${siteUrl ? `\nSitemap: ${siteUrl}sitemap.xml\n` : ""}`;
}
