/**
 * The 404 page is rendered once per locale directory (`404.html`, `en/404.html`) with paths relative to
 * that directory. A host answers a miss deeper down (/s/x/storitve/missing) with that same file, where
 * those paths would point one level too low: no styles, fonts, logo or working links. These helpers let a
 * server serve the stored file at any depth. `rebaseRelativeUrls(html, "../")` gives the same document as
 * `renderPage(spec, page, { depth: 1 })` (test/not-found.test.ts holds them to that).
 *
 * Only documents from renderPage go through here: attributes are always double-quoted and escaped.
 */

/** Absolute (scheme, //host, /path), fragment-only, query-only or empty: left as it is. */
const KEEP = /^(?:[a-z][a-z0-9+.-]*:|\/|#|\?|$)/i;

const prefixUrl = (url: string, prefix: string) => (KEEP.test(url) ? url : prefix + url);

/** Prefixes every relative URL in href, src, srcset/imagesrcset and CSS url(...) with `prefix` (e.g. "../../"). */
export function rebaseRelativeUrls(html: string, prefix: string): string {
  if (!prefix) return html;
  return html
    .replace(/\s(href|src)="([^"]*)"/g, (_, attr: string, url: string) => ` ${attr}="${prefixUrl(url, prefix)}"`)
    .replace(/\s(srcset|imagesrcset)="([^"]*)"/g, (_, attr: string, list: string) => {
      const entries = list.split(",").map((entry) => entry.replace(/^(\s*)(\S+)/, (_m, space: string, url: string) => space + prefixUrl(url, prefix)));
      return ` ${attr}="${entries.join(",")}"`;
    })
    .replace(/url\(("?)([^")]*)\1\)/g, (_, quote: string, url: string) => `url(${quote}${prefixUrl(url, prefix)}${quote})`);
}

/**
 * Where to answer a miss from. `rest` is the requested path below the site root ("storitve/missing",
 * "en/a/b"); `localeDirs` are the site's locale directories ("en/") that have their own 404 page.
 * Returns the 404 page's directory and how many levels below it the request sits.
 */
export function notFoundPlacement(rest: string, localeDirs: readonly string[] = []): { dir: string; depth: number } {
  const dir = localeDirs.find((d) => rest.startsWith(d)) ?? "";
  const depth = rest.slice(dir.length).split("/").length - 1;
  return { dir, depth };
}
