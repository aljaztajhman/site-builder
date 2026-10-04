import { COLLECTION_DIRS, collectionEntries, localeTag, type SiteSpec } from "@sb/spec";

/**
 * The blog's RSS feed (novice/rss.xml): the site's posts with pages, newest first, in the default language.
 * Only with the site's address (RSS needs absolute links), like the sitemap.
 */
export function feedOf(spec: SiteSpec): { path: string; title: string } | null {
  const posts = collectionEntries(spec.collections, "blog").filter((e) => e.path);
  if (!posts.length) return null;
  const page = spec.pages.find((p) => p.id === spec.collections?.blog?.page);
  return { path: `${COLLECTION_DIRS.blog}/rss.xml`, title: `${page?.nav.label ?? "Novice"} – ${spec.business.name}` };
}

const xml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);

/** A YYYY-MM-DD day as RFC 822 (RSS pubDate), at noon UTC so no time zone moves it to another day. */
function rfc822(day: string): string {
  return new Date(`${day}T12:00:00Z`).toUTCString().replace("GMT", "+0000");
}

export function rssXml(spec: SiteSpec, siteUrl: string): string {
  const feed = feedOf(spec);
  const posts = collectionEntries(spec.collections, "blog").filter((e) => e.path);
  const page = spec.pages.find((p) => p.id === spec.collections?.blog?.page);
  const link = page ? `${siteUrl}${page.slug ? `${page.slug}.html` : ""}` : siteUrl;
  const items = posts.map((e) => {
    const url = siteUrl + e.path!;
    return `<item><title>${xml(e.entry.title)}</title><link>${xml(url)}</link><guid isPermaLink="true">${xml(url)}</guid><pubDate>${rfc822(e.entry.date)}</pubDate><description>${xml(e.entry.summary)}</description></item>`;
  });
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>` +
    `<title>${xml(feed?.title ?? spec.business.name)}</title><link>${xml(link)}</link>` +
    `<description>${xml(page?.seo.description ?? spec.business.name)}</description>` +
    `<language>${localeTag(spec.locales.default).toLowerCase()}</language>` +
    `<atom:link href="${xml(siteUrl + (feed?.path ?? ""))}" rel="self" type="application/rss+xml"/>` +
    (posts[0] ? `<lastBuildDate>${rfc822(posts[0].entry.date)}</lastBuildDate>` : "") +
    `\n${items.join("\n")}\n</channel></rss>\n`
  );
}
