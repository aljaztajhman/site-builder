/**
 * Cookies and form tokens for scripts that drive a deployed environment like a browser would: the app
 * gives every visitor a device cookie, and every HTML form carries a CSRF token bound to it.
 */

export interface RemoteBrowser {
  base: string;
  /** Cookie header: every cookie this "browser" holds. */
  cookie: string;
  /** The form token for this browser's device cookie. */
  csrf: string;
}

export function setCookies(res: Response): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of res.headers.getSetCookie()) {
    const [pair] = c.split(";");
    const i = pair!.indexOf("=");
    out[pair!.slice(0, i)] = pair!.slice(i + 1);
  }
  return out;
}

export const csrfIn = (html: string): string => /name="_csrf" value="([^"]+)"/.exec(html)?.[1] ?? "";

/** A first visit (no cookies): the device cookie and the token its forms carry. */
export async function remoteBrowser(base: string): Promise<RemoteBrowser> {
  const res = await fetch(`${base}/login`);
  const device = setCookies(res).sb_device;
  if (!device) throw new Error(`no device cookie from ${base}/login (HTTP ${res.status})`);
  return { base, cookie: `sb_device=${device}`, csrf: csrfIn(await res.text()) };
}

/** The admin, signed in with the access password. */
export async function remoteAdmin(base: string, password: string): Promise<RemoteBrowser & { ok: boolean; status: number }> {
  const b = await remoteBrowser(base);
  const res = await fetch(`${base}/login`, { method: "POST", body: new URLSearchParams({ password, next: "/" }), headers: { cookie: b.cookie }, redirect: "manual" });
  const session = setCookies(res).sb_session;
  return { ...b, cookie: session ? `${b.cookie}; sb_session=${session}` : b.cookie, ok: res.status === 302 && !!session, status: res.status };
}

/** Uses a sign-in link in this browser (open it, press "Prijava"); returns the browser with its account session. */
export async function useSignInLink(b: RemoteBrowser, url: string): Promise<RemoteBrowser & { ok: boolean; location: string | null }> {
  const u = new URL(url);
  const page = await fetch(`${b.base}${u.pathname}${u.search}`, { headers: { cookie: b.cookie } });
  const csrf = csrfIn(await page.text());
  const res = await fetch(`${b.base}/login/link`, { method: "POST", body: new URLSearchParams({ t: u.searchParams.get("t") ?? "", _csrf: csrf }), headers: { cookie: b.cookie }, redirect: "manual" });
  const session = setCookies(res).sb_account;
  return { ...b, cookie: session ? `${b.cookie.replace(/; sb_account=[^;]*/, "")}; sb_account=${session}` : b.cookie, ok: !!session, location: res.headers.get("location") };
}
