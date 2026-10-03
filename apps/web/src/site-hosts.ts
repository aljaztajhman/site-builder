import { timingSafeEqual } from "node:crypto";
import type { Hono, MiddlewareHandler } from "hono";
import { normaliseHostname, type Repo } from "@sb/platform";
import type { AppEnv } from "./access.ts";

/**
 * Published sites on their own hostnames (docs/plans/custom-domains.md). A request whose Host is a
 * site's domain (an active site_domains row) or a platform subdomain (<slug>.<PLATFORM_DOMAIN>) is
 * served as that site's /s/<slug>/ path: same files, same 404 pages, no cookies. Nothing else of the
 * app (dashboard, API, admin) is reachable on such a host: every path maps inside the site.
 * In production a Cloudflare Worker sits in front (TLS for every hostname) and forwards the visitor's
 * hostname in SITE_HOST_HEADER with the shared secret; directly reached, the Host header is used.
 */

export type HostAnswer =
  /** Serve this site. */
  | { slug: string }
  /** Another name of a site (www, a second domain): moved permanently to its primary hostname. */
  | { redirectTo: string }
  /** One of our site hostnames, but nothing is published there. */
  | { missing: true };

const SAFE_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export interface SiteHostOptions {
  repo: Repo;
  /** PLATFORM_DOMAIN: sites at <slug>.<domain>. Null until the platform domain exists. */
  platformDomain: string | null;
  /** The app's own hostnames (APP_URL, Railway's domain, localhost): never a site. */
  appHosts: readonly string[];
  /** How long an answer is reused (a published site's hostnames rarely change). Default 30 s. */
  cacheMs?: number;
}

/** What a Host header means: a site, a redirect, nothing published, or null for the app itself. */
export function siteHostResolver(o: SiteHostOptions): (rawHost: string) => Promise<HostAnswer | null> {
  const platform = o.platformDomain ? normaliseHostname(o.platformDomain) : null;
  const app = new Set(o.appHosts.map((h) => normaliseHostname(h)).filter((h): h is string => Boolean(h)));
  const ttl = o.cacheMs ?? 30_000;
  const cache = new Map<string, { at: number; answer: HostAnswer | null }>();

  async function resolve(host: string): Promise<HostAnswer | null> {
    if (app.has(host)) return null;
    if (platform && host.endsWith(`.${platform}`)) {
      const label = host.slice(0, -platform.length - 1);
      if (!SAFE_SLUG.test(label)) return { missing: true };
      const site = await o.repo.getSiteBySlug(label);
      return site?.published_version ? { slug: site.slug } : { missing: true };
    }
    const row = await o.repo.domains.get(host);
    if (!row || row.status !== "active") return null;
    const site = await o.repo.getSite(row.site_id);
    if (!site?.published_version) return { missing: true };
    if (!row.is_primary) {
      const primary = (await o.repo.domains.forSite(row.site_id)).find((d) => d.is_primary && d.status === "active");
      if (primary) return { redirectTo: primary.hostname };
    }
    return { slug: site.slug };
  }

  return async (rawHost) => {
    const host = normaliseHostname(rawHost);
    if (!host) return null;
    const hit = cache.get(host);
    if (hit && Date.now() - hit.at < ttl) return hit.answer;
    const answer = await resolve(host);
    if (ttl > 0) cache.set(host, { at: Date.now(), answer });
    return answer;
  };
}

/** The path inside the app that serves `path` of a site: its files under /s/<slug>/, shared files under /s/_shared/. */
export function sitePath(slug: string, path: string): string {
  return path.startsWith("/_shared/") ? `/s${path}` : `/s/${slug}${path}`;
}

/** The visitor's hostname as the edge Worker forwards it (Railway routes by Host, so the Worker can't keep it). */
export const SITE_HOST_HEADER = "x-stranko-site-host";
/** Proves the forwarded hostname came from our Worker: SITE_PROXY_SECRET. */
export const SITE_PROXY_SECRET_HEADER = "x-stranko-proxy-secret";

const sameSecret = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/**
 * First middleware of the app: a site host's request is answered by the app itself at the site's
 * /s/<slug>/ path (the inner request is marked so it isn't routed twice). The hostname is the Host
 * header, or the one the edge Worker forwards when it carries the proxy secret.
 */
export function siteHosts(app: Hono<AppEnv>, resolve: (host: string) => Promise<HostAnswer | null>, opts: { proxySecret?: string | null } = {}): MiddlewareHandler<AppEnv> {
  const inner = new WeakSet<Request>();
  return async (c, next) => {
    if (inner.has(c.req.raw)) return next();
    const forwarded = c.req.header(SITE_HOST_HEADER);
    const secret = c.req.header(SITE_PROXY_SECRET_HEADER);
    const trusted = Boolean(forwarded && secret && opts.proxySecret && sameSecret(secret, opts.proxySecret));
    const answer = await resolve(trusted ? forwarded! : (c.req.header("host") ?? ""));
    if (!answer) return next();
    const url = new URL(c.req.url);
    if ("redirectTo" in answer) return c.redirect(`https://${answer.redirectTo}${url.pathname}${url.search}`, 301);
    if ("missing" in answer) {
      c.header("X-Robots-Tag", "noindex, nofollow");
      return c.text("Stran ne obstaja.", 404);
    }
    const req = new Request(new URL(`${sitePath(answer.slug, url.pathname)}${url.search}`, url), c.req.raw);
    inner.add(req);
    return app.fetch(req, c.env);
  };
}
