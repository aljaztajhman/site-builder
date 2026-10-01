import type { MailMessage } from "@sb/platform";

/** `app.request` (Hono) or a fetch against a running server, both relative to the app. */
export type Req = (path: string, init?: RequestInit) => Response | Promise<Response>;

/** name → value of every cookie a response sets. */
export function setCookies(res: Response): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of res.headers.getSetCookie()) {
    const [pair] = c.split(";");
    const i = pair!.indexOf("=");
    out[pair!.slice(0, i)] = pair!.slice(i + 1);
  }
  return out;
}

/** The form token in a page. */
export const csrfIn = (html: string): string => /name="_csrf" value="([^"]+)"/.exec(html)?.[1] ?? "";

export interface Browser {
  /** Cookie header with every cookie this "browser" holds. */
  cookie: string;
  csrf: string;
}

/** A first visit: the device cookie the app sets and the CSRF token its forms carry. */
export async function newBrowser(req: Req): Promise<Browser> {
  const res = await req("/login");
  const device = setCookies(res).sb_device;
  if (!device) throw new Error("no device cookie");
  return { cookie: `sb_device=${device}`, csrf: csrfIn(await res.text()) };
}

/** A client address per call, so the per-client login throttles don't trip across a test file. */
const someIp = () => `198.18.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

/** The admin, signed in with ACCESS_PASSWORD. */
export async function adminBrowser(req: Req, password: string): Promise<Browser> {
  const b = await newBrowser(req);
  const res = await req("/login", { method: "POST", body: new URLSearchParams({ password, next: "/" }), headers: { cookie: b.cookie, "x-forwarded-for": someIp() }, redirect: "manual" });
  const session = setCookies(res).sb_session;
  if (!session) throw new Error(`admin login failed: HTTP ${res.status}`);
  return { cookie: `${b.cookie}; sb_session=${session}`, csrf: b.csrf };
}

/** The admin's session cookie alone (name=value), for browser contexts. */
export async function adminCookie(req: Req, password: string): Promise<string> {
  const res = await req("/login", { method: "POST", body: new URLSearchParams({ password, next: "/" }), redirect: "manual" });
  const session = setCookies(res).sb_session;
  if (!session) throw new Error(`admin login failed: HTTP ${res.status}`);
  return `sb_session=${session}`;
}

/** The sign-in link in the last message sent to `to`. */
export function linkFor(sent: MailMessage[], to: string): string {
  const m = [...sent].reverse().find((x) => x.to === to);
  const url = m && /https?:\/\/\S+\/login\/link\?t=[A-Za-z0-9_-]+/.exec(m.text)?.[0];
  if (!url) throw new Error(`no sign-in link for ${to}`);
  return url;
}

/**
 * A business owner signing in by magic link in this browser: request the link, open it, press "Prijava".
 * Returns the browser with its account session added.
 */
export async function ownerSignIn(req: Req, sent: MailMessage[], email: string, b?: Browser): Promise<Browser & { location: string }> {
  const browser = b ?? (await newBrowser(req));
  const asked = await req("/login/email", { method: "POST", body: new URLSearchParams({ email, _csrf: browser.csrf, next: "/sites" }), headers: { cookie: browser.cookie, "x-forwarded-for": someIp() } });
  if (asked.status !== 200) throw new Error(`link request failed: HTTP ${asked.status}`);
  const url = new URL(linkFor(sent, email.trim().toLowerCase()));
  const page = await req(`${url.pathname}${url.search}`, { headers: { cookie: browser.cookie } });
  const csrf = csrfIn(await page.text());
  const t = url.searchParams.get("t")!;
  const done = await req("/login/link", { method: "POST", body: new URLSearchParams({ t, _csrf: csrf }), headers: { cookie: browser.cookie }, redirect: "manual" });
  const session = setCookies(done).sb_account;
  if (!session) throw new Error(`sign-in failed: HTTP ${done.status}`);
  const cookie = browser.cookie.replace(/; sb_account=[^;]*/, "");
  return { cookie: `${cookie}; sb_account=${session}`, csrf: browser.csrf, location: done.headers.get("location") ?? "" };
}
