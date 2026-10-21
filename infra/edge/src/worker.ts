/**
 * The edge Worker in front of every published site (docs/plans/custom-domains.md, infra/edge/README.md).
 * Cloudflare gives each hostname TLS; this forwards the request to the Railway web service (env.ORIGIN, Railway's
 * own hostname, since Railway routes by Host) and names the visitor's hostname in SITE_HOST_HEADER with the shared
 * secret, so the app serves that site (apps/web/src/site-hosts.ts). The apex and the platform's own names
 * (app., mail., www. … of PLATFORM_DOMAIN) are never forwarded: a DNS slip can't put the app behind a site's name.
 * No imports, so `wrangler deploy` needs no build of ours.
 */

export interface Env {
  /** Railway's own address of the web service, e.g. https://web-production-1234.up.railway.app */
  ORIGIN: string;
  /** The same value as the web service's SITE_PROXY_SECRET (a wrangler secret, never in wrangler.toml). */
  SITE_PROXY_SECRET: string;
  /** Sites at <slug>.<PLATFORM_DOMAIN>; default postavi.si. */
  PLATFORM_DOMAIN?: string;
}

/** Same names as apps/web/src/site-hosts.ts. */
export const SITE_HOST_HEADER = "x-postavi-site-host";
export const SITE_PROXY_SECRET_HEADER = "x-postavi-proxy-secret";
export const SITE_VISITOR_IP_HEADER = "x-postavi-visitor-ip";

/** A copy of RESERVED_SITE_LABELS (packages/platform/src/reserved-labels.ts); the test keeps them equal. */
export const RESERVED_LABELS: readonly string[] = [
  "www", "app", "mail", "api", "admin", "dashboard", "static", "cdn", "assets", "status", "help", "pomoc", "podpora",
  "blog", "novice", "docs", "send", "bounce", "email", "smtp", "imap", "pop", "ftp", "ns", "ns1", "ns2", "dev", "test",
  "staging", "preview", "demo", "postavi", "stranko", "povezava", "_dmarc",
];
const RESERVED = new Set(RESERVED_LABELS);

/** True for a hostname this Worker must never forward: the platform apex or any of its own names. */
export function isPlatformOwnHost(hostname: string, platformDomain: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  const platform = platformDomain.toLowerCase();
  if (host === platform) return true;
  if (!host.endsWith(`.${platform}`)) return false;
  return host.slice(0, -platform.length - 1).split(".").some((label) => RESERVED.has(label));
}

const notFound = () => new Response("Stran ne obstaja.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8", "x-robots-tag": "noindex, nofollow" } });

/** The request as the app gets it, or a 404/503 answered here. `fetcher` is the global fetch (a fake in tests). */
export async function handle(request: Request, env: Env, fetcher: typeof fetch = fetch): Promise<Response> {
  const url = new URL(request.url);
  if (isPlatformOwnHost(url.hostname, env.PLATFORM_DOMAIN || "postavi.si")) return notFound();
  if (!env.ORIGIN || !env.SITE_PROXY_SECRET) return new Response("Edge not configured.", { status: 503 });

  // Path and query set on the origin's URL, never resolved against it: a path like //evil.example/x stays a path.
  const target = new URL(env.ORIGIN);
  target.pathname = url.pathname;
  target.search = url.search;
  const headers = new Headers(request.headers);
  // Only this Worker names the site: incoming copies are dropped before ours are set.
  headers.delete(SITE_HOST_HEADER);
  headers.delete(SITE_PROXY_SECRET_HEADER);
  headers.delete(SITE_VISITOR_IP_HEADER);
  headers.delete("host");
  headers.set(SITE_HOST_HEADER, url.hostname);
  headers.set(SITE_PROXY_SECRET_HEADER, env.SITE_PROXY_SECRET);
  headers.set("x-forwarded-proto", "https");
  headers.set("x-forwarded-host", url.hostname);
  const visitor = request.headers.get("cf-connecting-ip");
  // Railway's edge overwrites X-Real-IP with the connecting (Cloudflare) address, so the visitor goes in our own header.
  if (visitor) headers.set(SITE_VISITOR_IP_HEADER, visitor);

  // Bodies on site hosts are small (contact forms, the stats beacon): read whole, no streaming duplex needed.
  const body = request.method === "GET" || request.method === "HEAD" ? null : await request.arrayBuffer();
  // The app's own redirects (www → primary hostname) go to the visitor as they are.
  return fetcher(new Request(target, { method: request.method, headers, body, redirect: "manual" }));
}

export default {
  fetch: (request: Request, env: Env): Promise<Response> => handle(request, env),
};
