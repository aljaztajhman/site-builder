import type { Context } from "hono";
import type { AppConfig } from "@sb/config";
import type { AppEnv } from "./access.ts";
import { servedForSiteHost } from "./site-hosts.ts";

/**
 * Cloudflare Web Analytics on the product's own public pages (docs/plans/analytics.md, step 2; HQ sb-analytics):
 * the landing page, the login page and the privacy policy, only when the request's hostname is one of config
 * `analytics.cloudflare.hosts` (so local runs, tests and the railway.app hostname get none). Never on the
 * dashboard, the editor, admin, previews, published sites or the example sites the landing page frames.
 * The beacon is cookieless; its token is public (it is in the page) and lives in config.
 */
export const BEACON_PATHS: ReadonlySet<string> = new Set(["/", "/login", "/zasebnost"]);

/** Where the beacon script comes from, and where it sends its measurements (Cloudflare's CSP FAQ). */
export const CF_BEACON_SCRIPT = "https://static.cloudflareinsights.com/beacon.min.js";
export const CF_BEACON_ENDPOINT = "https://cloudflareinsights.com";

/** The site token when this response carries the beacon; null otherwise. */
export function cloudflareBeacon(c: Context<AppEnv>, config: AppConfig): string | null {
  const cf = config.analytics.cloudflare;
  if (!cf.token || c.req.method !== "GET" || !BEACON_PATHS.has(c.req.path)) return null;
  if (servedForSiteHost(c.req.raw)) return null;
  const host = new URL(c.req.url).hostname.toLowerCase();
  return cf.hosts.includes(host) ? cf.token : null;
}

/** The snippet Cloudflare gives, with the token from config. */
export const Beacon = ({ token }: { token: string | null | undefined }) =>
  token ? <script type="module" src={CF_BEACON_SCRIPT} data-cf-beacon={JSON.stringify({ token })} /> : null;
