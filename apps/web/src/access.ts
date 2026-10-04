import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { AppConfig } from "@sb/config";
import type { AccountRow, PaidPlanKey, Repo, SiteRow, Tier } from "@sb/platform";
import { hasSession, type AuthSettings } from "./auth.ts";
import type { UploadTicket } from "./upload-ticket.ts";

/** Same-origin path only: "/x" but not "//host", "/\host" or anything with whitespace. Default: the landing page. */
export function safeNext(v: unknown): string {
  return typeof v === "string" && /^\/(?![/\\])[^\s\\]*$/.test(v) ? v : "/";
}

/**
 * Who is asking, and what they may do. Three kinds of visitor:
 * - admin: the product owner, signed in with ACCESS_PASSWORD (auth.ts); sees and manages everything.
 * - account: a business owner signed in by magic link; sees only their own sites. Allow-listed
 *   accounts (sb-full-access) have paid-tier rights: full sites, publishing, export.
 * - anonymous: no session.
 * Every visitor to the product (not to published sites) gets a signed device cookie: it anchors the
 * CSRF token of every form.
 */

export const DEVICE_COOKIE = "sb_device";
export const ACCOUNT_COOKIE = "sb_account";

export type Viewer = { kind: "admin" } | { kind: "account"; account: AccountRow; paidSince: string | null; plan: PaidPlanKey | null } | { kind: "anonymous" };
export type { Tier };

export const tierOf = (v: Viewer): Tier => (v.kind === "admin" ? "admin" : v.kind === "account" ? (v.paidSince ? "paid" : "free") : "anonymous");
export const signedIn = (v: Viewer): boolean => v.kind !== "anonymous";

export interface AppEnv {
  Variables: {
    viewer: Viewer;
    deviceId: string;
    /** The CSRF token for this browser's forms (hidden field `_csrf`). */
    csrf: string;
    /** The site the path names, loaded and access-checked by `siteAccess`. */
    site: SiteRow;
    /** An anonymous upload's ticket, checked and taken before its body is read (app.ts, upload-ticket.ts). */
    ticket: UploadTicket | undefined;
  };
}

/** SHA-256 hex: magic-link tokens and session tokens are stored only like this. */
export const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");
export const newToken = (): string => randomBytes(32).toString("base64url");
const mac = (secret: string, value: string): string => createHmac("sha256", secret).update(value).digest("base64url");
const same = (a: string, b: string): boolean => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * The visitor's IP. Railway's edge sets X-Real-IP to the visitor and rewrites X-Forwarded-For to
 * "visitor, edge" (both overwrite whatever the client sent; checked live 2026-10-02 with /health?ip=1).
 * The rightmost X-Forwarded-For entry is Railway's edge, so it is only a fallback for local runs without X-Real-IP.
 */
export const clientIp = (c: Context): string =>
  c.req.header("x-real-ip")?.trim() || c.req.header("x-forwarded-for")?.split(",").at(-1)?.trim() || "local";
/** A keyed hash of the client's IP for rate limits; the IP itself is never stored (cleared after a day). */
export const ipKey = (secret: string, ip: string): string => createHmac("sha256", secret).update(`ip:${ip}`).digest("hex").slice(0, 32);

/** Paths that never get a cookie or a viewer: published client sites stay cookie-free. */
const NO_IDENTITY = (path: string) => path.startsWith("/s/") || path.startsWith("/assets/") || path === "/health" || path === "/favicon.ico" || path.startsWith("/preview/_shared/");

export interface AccessDeps {
  repo: Repo;
  auth: AuthSettings;
  config: AppConfig;
}

/** Resolves the viewer and the device, sets the device cookie when missing, derives the CSRF token. */
export function identity({ repo, auth, config }: AccessDeps): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (NO_IDENTITY(c.req.path)) return next();
    let deviceId = readSigned(getCookie(c, DEVICE_COOKIE), auth.secret);
    if (!deviceId) {
      deviceId = randomBytes(16).toString("hex");
      setCookie(c, DEVICE_COOKIE, `${deviceId}.${mac(auth.secret, `device:${deviceId}`)}`, {
        httpOnly: true,
        sameSite: "Lax",
        secure: auth.secureCookies,
        path: "/",
        maxAge: Math.round(config.accounts.deviceCookieDays * 86400),
      });
    }
    c.set("deviceId", deviceId);
    c.set("csrf", mac(auth.secret, `csrf:${deviceId}`).slice(0, 32));
    c.set("viewer", await resolveViewer(c, repo, auth));
    return next();
  };
}

function readSigned(value: string | undefined, secret: string): string | null {
  const [id, sig] = (value ?? "").split(".");
  if (!id || !sig || !/^[0-9a-f]{32}$/.test(id)) return null;
  return same(sig, mac(secret, `device:${id}`)) ? id : null;
}

async function resolveViewer(c: Context, repo: Repo, auth: AuthSettings): Promise<Viewer> {
  if (hasSession(c, auth)) return { kind: "admin" };
  const token = getCookie(c, ACCOUNT_COOKIE);
  if (!token || token.length > 100) return { kind: "anonymous" };
  const account = await repo.accounts.sessionAccount(hashToken(token));
  if (!account) return { kind: "anonymous" };
  const allowed = await repo.accounts.allowed(account.email_key);
  return { kind: "account", account, paidSince: allowed?.added_at ?? null, plan: allowed?.plan ?? null };
}

export function issueAccountSession(c: Context, token: string, auth: AuthSettings, config: AppConfig): void {
  setCookie(c, ACCOUNT_COOKIE, token, { httpOnly: true, sameSite: "Lax", secure: auth.secureCookies, path: "/", maxAge: Math.round(config.accounts.sessionDays * 86400) });
}

export function clearAccountSession(c: Context): void {
  deleteCookie(c, ACCOUNT_COOKIE, { path: "/" });
}

/** True when the form's hidden `_csrf` field matches this browser's token. */
export function csrfOk(c: Context<AppEnv>, body: Record<string, unknown>): boolean {
  const given = body._csrf;
  return typeof given === "string" && same(given, c.get("csrf"));
}

/**
 * Rejects state-changing requests that a browser marks as coming from another site (Sec-Fetch-Site),
 * or whose Origin names another host. Requests without either header aren't from a browser page, so
 * they can't be cross-site forgeries. The public form endpoint of published sites is exempt.
 */
export const sameOriginOnly: MiddlewareHandler = async (c, next) => {
  // A published site's form and stats beacon are public and carry no authority; behind the edge Worker the
  // Host header is the app's while the Origin is the site's own domain, so they can't be judged by Host.
  if (c.req.method === "GET" || c.req.method === "HEAD" || c.req.method === "OPTIONS" || /^\/s\/[^/]+\/(_submit|_hit)$/.test(c.req.path)) return next();
  const fetchSite = c.req.header("sec-fetch-site");
  const origin = c.req.header("origin");
  let cross = false;
  if (fetchSite) cross = fetchSite !== "same-origin" && fetchSite !== "none";
  else if (origin) {
    try {
      cross = new URL(origin).host !== c.req.header("host");
    } catch {
      cross = true;
    }
  }
  if (cross) return c.text("Zahteva z druge strani ni dovoljena.", 403);
  return next();
};

// ---------- Which sites a viewer may open, and what they may do there ----------

const SITE_PATH = /^\/(?:sites|api\/sites|preview)\/(site_[0-9a-f]{16})(?:\/|$)/;

const PUBLIC = (path: string) =>
  path === "/" ||
  path === "/health" ||
  path === "/login" ||
  path.startsWith("/login/") ||
  path === "/logout" ||
  path === "/zasebnost" ||
  // The public website checker and its reports (an unguessable id each).
  path === "/pregled" ||
  /^\/pregled\/[^/]+$/.test(path) ||
  // The intake: the first homepage needs no account (the limits decide who may generate).
  path === "/api/sites" ||
  path === "/api/intake/ticket" ||
  path.startsWith("/s/") ||
  path.startsWith("/assets/") ||
  path.startsWith("/preview/_shared/") ||
  path === "/favicon.ico";

/**
 * The viewer may see this site (its preview, state and editor): the admin, the owning account, or the
 * device that made an unclaimed anonymous preview.
 */
export function canView(v: Viewer, site: SiteRow, deviceId: string): boolean {
  if (v.kind === "admin") return true;
  if (v.kind === "account" && site.account_id === v.account.id) return true;
  return site.account_id === null && !!site.device_id && site.device_id === deviceId;
}

/** Where an anonymous visitor signs in and comes back to. */
export const signInUrl = (next: string): string => `/login?next=${encodeURIComponent(next)}`;

/** Sign-in for pages, 401 for the API. */
function needSignIn(c: Context) {
  if (c.req.path.startsWith("/api/")) return c.json({ error: "unauthorized", code: "sign_in_required", message: "Prijavite se z e-pošto." }, 401);
  return c.redirect(`/login?next=${encodeURIComponent(c.req.path)}`);
}

/**
 * Everything outside the public paths needs a viewer who may see it: the admin pages only the admin,
 * a site's pages, API and preview only its owner (and the admin). Someone else's site is a 404, so
 * site ids can't be probed.
 */
export function siteAccess(repo: Repo): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const path = c.req.path;
    if (PUBLIC(path)) return next();
    const viewer = c.get("viewer");
    if (path === "/admin" || path.startsWith("/admin/")) {
      if (viewer.kind === "admin") return next();
      return viewer.kind === "anonymous" ? needSignIn(c) : c.notFound();
    }
    const m = SITE_PATH.exec(path);
    if (m) {
      const site = await repo.getSite(m[1]!);
      if (site && canView(viewer, site, c.get("deviceId"))) {
        c.set("site", site);
        // An anonymous preview can be looked at; changing it needs an account. Its generation (a retry
        // after a failure) is the limits' call.
        if (viewer.kind === "anonymous" && c.req.method !== "GET" && c.req.method !== "HEAD" && !/^\/api\/sites\/[^/]+\/generate$/.test(path)) {
          return refusalJson(c, { status: 401, code: "sign_in_required", message: "Za urejanje se prijavite z e-pošto. Predogled ostane vaš.", signIn: signInUrl(`/sites/${site.id}`) });
        }
        return next();
      }
      if (viewer.kind === "anonymous") return needSignIn(c);
      return path.startsWith("/api/") ? c.json({ error: "not found" }, 404) : c.notFound();
    }
    if (viewer.kind === "anonymous") return needSignIn(c);
    return next();
  };
}

export interface Refusal {
  status: 400 | 401 | 403 | 409 | 429 | 503;
  code: string;
  /** Slovene, for the owner. */
  message: string;
  /** Where signing in would help (anonymous visitors): the sign-in page, coming back here. */
  signIn?: string;
}

export const refusalJson = (c: Context, r: Refusal) => c.json({ error: r.code, code: r.code, message: r.message, ...(r.signIn ? { signIn: r.signIn } : {}) }, r.status);

/** Publishing and export are paid-tier rights (allow-listed accounts before billing) and the admin's. */
export function publishRefusal(v: Viewer): Refusal | null {
  const tier = tierOf(v);
  if (tier === "admin" || tier === "paid") return null;
  return { status: 403, code: "paid_only", message: "Objava in prenos strani sta del naročnine. Predogled lahko še naprej urejate." };
}

/** A whole site (all pages) is a paid-tier right; free and anonymous previews are the homepage. */
export function fullSiteRefusal(v: Viewer): Refusal | null {
  const tier = tierOf(v);
  if (tier === "admin" || tier === "paid") return null;
  return { status: 403, code: "full_site_paid", message: "Celotna stran z vsemi podstranmi je del naročnine. Brezplačno naredimo domačo stran." };
}
