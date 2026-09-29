import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { Context, MiddlewareHandler } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";

export const SESSION_COOKIE = "sb_session";
const MAX_AGE_S = 60 * 60 * 24 * 14;

export interface AuthSettings {
  password: string;
  /** Signing key; derived from the password when SESSION_SECRET is not set. */
  secret: string;
  secureCookies: boolean;
}

export function authSettingsFromEnv(): AuthSettings {
  const password = process.env.ACCESS_PASSWORD;
  if (!password || password.length < 12) throw new Error("ACCESS_PASSWORD must be set (at least 12 characters)");
  return {
    password,
    secret: process.env.SESSION_SECRET || createHash("sha256").update(`sb-session:${password}`).digest("hex"),
    secureCookies: process.env.NODE_ENV === "production",
  };
}

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function passwordMatches(given: string, expected: string): boolean {
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export function issueSession(c: Context, s: AuthSettings): void {
  const issued = String(Math.floor(Date.now() / 1000));
  setCookie(c, SESSION_COOKIE, `${issued}.${sign(issued, s.secret)}`, {
    httpOnly: true,
    sameSite: "Lax",
    secure: s.secureCookies,
    path: "/",
    maxAge: MAX_AGE_S,
  });
}

export function clearSession(c: Context): void {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

export function hasSession(c: Context, s: AuthSettings): boolean {
  const v = getCookie(c, SESSION_COOKIE);
  if (!v) return false;
  const [issued, mac] = v.split(".");
  if (!issued || !mac) return false;
  const expected = sign(issued, s.secret);
  if (mac.length !== expected.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return false;
  return Date.now() / 1000 - Number(issued) < MAX_AGE_S;
}

/** Everything except public paths requires the access password session. */
export function requireAuth(s: AuthSettings, isPublic: (path: string) => boolean): MiddlewareHandler {
  return async (c, next) => {
    if (isPublic(c.req.path) || hasSession(c, s)) return next();
    if (c.req.path.startsWith("/api/")) return c.json({ error: "unauthorized" }, 401);
    return c.redirect(`/login?next=${encodeURIComponent(c.req.path)}`);
  };
}

/**
 * In-memory login throttle: 10 attempts per client per 10 minutes, and at most 200 attempts in total
 * per 10 minutes (so rotating client addresses doesn't lift the limit). Old entries are pruned.
 */
export function loginThrottle(perClient = 10, total = 200, windowMs = 10 * 60_000) {
  const attempts = new Map<string, number[]>();
  let all: number[] = [];
  return (key: string): boolean => {
    const now = Date.now();
    all = all.filter((t) => now - t < windowMs);
    if (attempts.size > 1000) for (const [k, v] of attempts) if (v.every((t) => now - t >= windowMs)) attempts.delete(k);
    const list = (attempts.get(key) ?? []).filter((t) => now - t < windowMs);
    list.push(now);
    all.push(now);
    attempts.set(key, list);
    return list.length <= perClient && all.length <= total;
  };
}
