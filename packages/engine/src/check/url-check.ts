import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { AppConfig } from "@sb/config";
import type { CheckBrowser } from "./browser.ts";
import { runLighthouse } from "./lighthouse.ts";
import { measurePage } from "./page-checks.ts";

/**
 * The public website checker (/pregled) and the small-business study: someone else's live site, checked
 * the way we check our own on a phone (no model calls). Only public http(s) addresses are opened: the
 * typed address and every redirect hop are resolved and refused when private before the browser goes
 * there, and the browser refuses every request to a private address. The report holds numbers and
 * yes/no answers, never the page's content.
 */

/** Why an address can't be checked; `message` is for the visitor, in Slovene. */
export class UrlRefusedError extends Error {
  constructor(
    readonly reason: "invalid" | "private" | "unreachable" | "redirects" | "status",
    message: string,
  ) {
    super(message);
  }
}

const MSG = {
  invalid: "Vpišite naslov spletne strani, na primer www.vasepodjetje.si.",
  private: "Ta naslov ni javna spletna stran.",
  unreachable: "Strani na tem naslovu nismo mogli odpreti. Preverite naslov.",
  redirects: "Stran nas je preusmerila preveč krat.",
} as const;

/** What the visitor typed, as a URL we may open: http(s), a public-looking host name, default ports, no credentials. */
export function normaliseUrl(input: string, opts: { anyPort?: boolean } = {}): URL | null {
  const t = input.trim();
  if (!t || t.length > 2000 || /\s/.test(t)) return null;
  let u: URL;
  try {
    u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `https://${t}`);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (u.username || u.password) return null;
  if (u.port && u.port !== "80" && u.port !== "443" && !opts.anyPort) return null;
  const host = u.hostname.replace(/^\[|\]$/g, "");
  // An IP literal is judged by its address later; a name needs a dot and no internal suffix.
  if (!isIP(host) && (!host.includes(".") || /(^|\.)(localhost|local|internal|lan|home|arpa)$/i.test(host))) return null;
  u.hash = "";
  return u;
}

function v4Private(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number) as [number, number, number, number];
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

/** Loopback, private, link-local, carrier-grade NAT, multicast and reserved ranges (IPv4 and IPv6). */
export function isPrivateAddress(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return v4Private(ip);
  if (kind !== 6) return true;
  const v6 = ip.toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v6);
  if (mapped) return v4Private(mapped[1]!);
  if (v6 === "::" || v6 === "::1") return true;
  const first = parseInt(v6.split(":")[0] || "0", 16);
  // fc00::/7 unique local (Railway's private network), fe80::/10 link-local, ff00::/8 multicast, 64:ff9b::/96 NAT64.
  return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80 || (first & 0xff00) === 0xff00 || v6.startsWith("64:ff9b:");
}

export type Resolve = (host: string) => Promise<string[]>;
const dnsResolve: Resolve = async (host) => (await lookup(host, { all: true, verbatim: true })).map((a) => a.address);

/** True when the host is (or resolves to) a private address, or doesn't resolve at all. */
export async function hostIsPrivate(hostname: string, resolve: Resolve = dnsResolve): Promise<boolean> {
  const host = hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) return isPrivateAddress(host);
  try {
    const addrs = await resolve(host);
    return addrs.length === 0 || addrs.some(isPrivateAddress);
  } catch {
    throw new UrlRefusedError("unreachable", MSG.unreachable);
  }
}

export interface OpenOptions {
  maxRedirects: number;
  timeoutMs: number;
  /** Tests on 127.0.0.1 only. */
  allowPrivate?: boolean;
  /** Tests: servers on random ports. */
  anyPort?: boolean;
  resolve?: Resolve;
  fetch?: typeof fetch;
}

/** Follows redirects ourselves, refusing any hop to a private address; returns where the site ends up. */
export async function openPublicUrl(start: URL, o: OpenOptions): Promise<{ url: URL; status: number }> {
  const doFetch = o.fetch ?? fetch;
  let url = start;
  for (let hop = 0; hop <= o.maxRedirects; hop++) {
    if (!o.allowPrivate && (await hostIsPrivate(url.hostname, o.resolve))) throw new UrlRefusedError("private", MSG.private);
    let res: Response;
    try {
      res = await doFetch(url, { redirect: "manual", headers: { "user-agent": USER_AGENT, accept: "text/html,*/*" }, signal: AbortSignal.timeout(o.timeoutMs) });
    } catch {
      throw new UrlRefusedError("unreachable", MSG.unreachable);
    }
    await res.body?.cancel().catch(() => undefined);
    const to = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && to) {
      const next = normaliseUrl(new URL(to, url).href, { anyPort: !!(o.allowPrivate || o.anyPort) });
      if (!next) throw new UrlRefusedError("private", MSG.private);
      url = next;
      continue;
    }
    if (res.status >= 400) throw new UrlRefusedError("status", `Stran je odgovorila z napako ${res.status}.`);
    return { url, status: res.status };
  }
  throw new UrlRefusedError("redirects", MSG.redirects);
}

const USER_AGENT =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36 StrankoPregled/1.0";

// ---------- What the page says about the company (ZEPT) ----------

/** The provider details ZEPT asks a business site to show, found (or not) in the page's text. */
export interface CompanyFacts {
  /** A company form with the name: d.o.o., s.p., d.d., k.d., d.n.o., z.o.o. */
  companyForm: boolean;
  address: boolean;
  email: boolean;
  /** Matična številka (7 or 10 digits). */
  registration: boolean;
  /** Davčna številka / ID za DDV (8 digits, SI optional). */
  taxNumber: boolean;
}

const NBSP = new RegExp(String.fromCharCode(160), "g");

export function companyFacts(text: string, mailto = false): CompanyFacts {
  const t = text.replace(NBSP, " ");
  return {
    companyForm: /(^|[\s,])(d\.\s?o\.\s?o\.|s\.\s?p\.|d\.\s?d\.|k\.\s?d\.|d\.\s?n\.\s?o\.|z\.\s?o\.\s?o\.)(?=$|[\s,.;)])/i.test(t),
    address: /\b[1-9]\d{3}\s+[A-ZČŠŽĆĐ][\p{L}-]+/u.test(t),
    email: mailto || /[\w.+-]+@[\w-]+(\.[\w-]+)+/.test(t),
    registration: /(mati[čc]n\w*\s*(št(\.|evilka)?)?|\bMŠ)\s*[:.]?\s*\d{7}(\d{3})?\b/i.test(t),
    taxNumber: /((ID\s*(za|št\.?)?\s*DDV|dav[čc]n\w*\s*(št(\.|evilka)?)?)\s*[:.]?\s*(SI\s?)?\d{8}\b)|\bSI\s?\d{8}\b/i.test(t),
  };
}

// ---------- Cookies set before the visitor chose anything ----------

export type CookieKind = "analytics" | "ads" | "other";

export interface CookieSeen {
  name: string;
  domain: string;
  kind: CookieKind;
  /** Set for another site's domain (a third party). */
  thirdParty: boolean;
}

const ANALYTICS = /^(_ga|_gid|_gat|_hj|_clck|_clsk|_pk_|_pk|mp_|ajs_|__utm|_vwo|_hp2_)/i;
const ADS = /^(_fbp|fr$|_gcl|IDE$|test_cookie$|NID$|__gads|__gpi|_ttp|_uet|_pin_unauth|_tt_|MUID$|ANID$)/i;

const siteOf = (host: string) => host.replace(/^\./, "").split(".").slice(-2).join(".");

export function classifyCookies(cookies: { name: string; domain: string }[], pageHost: string): CookieSeen[] {
  return cookies.map((c) => ({
    name: c.name,
    domain: c.domain.replace(/^\./, ""),
    kind: ANALYTICS.test(c.name) ? "analytics" : ADS.test(c.name) ? "ads" : "other",
    thirdParty: siteOf(c.domain) !== siteOf(pageHost),
  }));
}

// ---------- The report ----------

export interface UrlCheckResult {
  url: string;
  finalUrl: string;
  https: boolean;
  checkedAt: string;
  phone: {
    width: number;
    viewportMeta: boolean;
    horizontalScroll: boolean;
    tinyTargets: number;
    smallPrimaryTargets: number;
    smallText: number;
    hasCallLink: boolean;
    callInViewport: boolean;
  };
  /** Lighthouse mobile; null when it was off or failed. */
  speed: { performance: number; lcpMs: number } | null;
  cookiesBeforeConsent: CookieSeen[];
  company: CompanyFacts;
  lang: string | null;
}

export interface UrlCheckDeps {
  browser: CheckBrowser;
  config: AppConfig;
  /** Tests on 127.0.0.1 only. */
  allowPrivate?: boolean;
  /** Tests: servers on random ports. */
  anyPort?: boolean;
  resolve?: Resolve;
  fetch?: typeof fetch;
}

/** Chromium flags for the checker: internal names never resolve (IP literals are refused per request). */
export const CHECKER_BROWSER_ARGS = ["--host-resolver-rules=MAP *.internal ~NOTFOUND, MAP *.railway.internal ~NOTFOUND, MAP localhost ~NOTFOUND"];

export async function checkUrl(input: string, d: UrlCheckDeps): Promise<UrlCheckResult> {
  const c = d.config.checker;
  const anyPort = !!(d.allowPrivate || d.anyPort);
  const start = normaliseUrl(input, { anyPort });
  if (!start) throw new UrlRefusedError("invalid", MSG.invalid);
  const { url } = await openPublicUrl(start, { maxRedirects: c.maxRedirects, timeoutMs: c.pageTimeoutMs, anyPort, ...(d.allowPrivate ? { allowPrivate: true } : {}), ...(d.resolve ? { resolve: d.resolve } : {}), ...(d.fetch ? { fetch: d.fetch } : {}) });
  const vp = d.config.checks.viewports.mobile;
  const context = await d.browser.browser.newContext({ viewport: vp, isMobile: true, hasTouch: true, userAgent: USER_AGENT, locale: "sl-SI", serviceWorkers: "block" });
  // Every request (frames, scripts, images, fetches) is judged by where its host resolves.
  const verdicts = new Map<string, Promise<boolean>>();
  const privateHost = (host: string) => {
    if (!verdicts.has(host)) verdicts.set(host, hostIsPrivate(host, d.resolve).catch(() => true));
    return verdicts.get(host)!;
  };
  await context.route("**/*", async (route) => {
    const u = new URL(route.request().url());
    if (u.protocol === "data:" || u.protocol === "blob:") return route.continue();
    if ((u.protocol !== "http:" && u.protocol !== "https:") || (!d.allowPrivate && (await privateHost(u.hostname)))) return route.abort("blockedbyclient");
    return route.continue();
  });
  try {
    const page = await context.newPage();
    try {
      await page.goto(url.href, { waitUntil: "load", timeout: c.pageTimeoutMs });
    } catch {
      throw new UrlRefusedError("unreachable", MSG.unreachable);
    }
    await page.waitForTimeout(c.settleMs);
    const landed = new URL(page.url());
    // A script that sent the page somewhere private: report nothing from there.
    if (!d.allowPrivate && (await privateHost(landed.hostname))) throw new UrlRefusedError("private", MSG.private);
    const m = await measurePage(page, d.config.checks.tapTarget);
    const facts = await page.evaluate(() => ({
      text: document.body?.innerText ?? "",
      mailto: !!document.querySelector('a[href^="mailto:"]'),
      tel: !!document.querySelector('a[href^="tel:"]'),
      viewportMeta: /width\s*=\s*device-width/i.test(document.querySelector('meta[name="viewport"]')?.getAttribute("content") ?? ""),
    }));
    const cookies = classifyCookies(await context.cookies(), landed.hostname);
    let speed: UrlCheckResult["speed"] = null;
    if (c.lighthouse) {
      try {
        const lh = await runLighthouse(landed.href, d.browser.port);
        speed = { performance: lh.performance, lcpMs: lh.lcpMs };
      } catch (e) {
        console.warn(`[checker] Lighthouse failed for ${landed.host}: ${(e as Error).message.slice(0, 200)}`);
      }
    }
    return {
      url: start.href,
      finalUrl: landed.href,
      https: landed.protocol === "https:",
      checkedAt: new Date().toISOString(),
      phone: {
        width: m.width,
        viewportMeta: facts.viewportMeta,
        horizontalScroll: m.horizontalScroll,
        tinyTargets: m.tinyTargets.length,
        smallPrimaryTargets: m.smallPrimaryTargets.length,
        smallText: m.smallText.length,
        hasCallLink: facts.tel,
        callInViewport: m.callInViewport,
      },
      speed,
      cookiesBeforeConsent: cookies,
      company: companyFacts(facts.text, facts.mailto),
      lang: m.lang,
    };
  } finally {
    await context.close();
  }
}

// ---------- In plain Slovene ----------

export interface Finding {
  id: "https" | "fit" | "targets" | "text" | "call" | "speed" | "cookies" | "company";
  ok: boolean;
  title: string;
  detail: string;
}

const plural = (n: number, forms: [string, string, string, string]) => {
  const f = new Intl.PluralRules("sl-SI").select(n);
  return `${n} ${f === "one" ? forms[0] : f === "two" ? forms[1] : f === "few" ? forms[2] : forms[3]}`;
};

const COMPANY_LABEL: Record<keyof CompanyFacts, string> = {
  companyForm: "ime podjetja z obliko (d.o.o., s.p. …)",
  address: "naslov s poštno številko",
  email: "e-poštni naslov",
  registration: "matična številka",
  taxNumber: "davčna številka",
};

/** The report as the visitor reads it: what's fine and what to fix, without jargon. */
export function urlCheckFindings(r: UrlCheckResult): Finding[] {
  const out: Finding[] = [];
  out.push(
    r.https
      ? { id: "https", ok: true, title: "Varna povezava (https)", detail: "Brskalnik obiskovalcem ne prikazuje opozorila »ni varno«." }
      : { id: "https", ok: false, title: "Stran nima varne povezave", detail: "Brskalnik ob naslovu prikazuje »ni varno«, Google pa takšne strani uvršča nižje." },
  );
  const fit = !r.phone.horizontalScroll && r.phone.viewportMeta;
  out.push(
    fit
      ? { id: "fit", ok: true, title: "Prilega se zaslonu telefona", detail: "Na telefonu ni treba povečevati ali premikati strani vstran." }
      : { id: "fit", ok: false, title: "Na telefonu je stran preširoka", detail: r.phone.viewportMeta ? "Del strani sega čez rob zaslona, zato jo morajo obiskovalci premikati vstran." : "Stran ni prilagojena telefonom: prikaže se pomanjšana, besedilo je treba povečevati." },
  );
  const small = r.phone.tinyTargets + r.phone.smallPrimaryTargets;
  out.push(
    small === 0
      ? { id: "targets", ok: true, title: "Gumbi so dovolj veliki za prst", detail: "Povezave in gumbi so dovolj veliki in dovolj narazen." }
      : { id: "targets", ok: false, title: "Premajhni gumbi za prst", detail: `${plural(small, ["gumb ali povezava je premajhna", "gumba ali povezavi sta premajhna", "gumbi ali povezave so premajhni", "gumbov ali povezav je premajhnih"])} za zanesljiv dotik s prstom.` },
  );
  out.push(
    r.phone.smallText === 0
      ? { id: "text", ok: true, title: "Berljivo besedilo", detail: "Besedilo je na telefonu dovolj veliko za branje brez povečevanja." }
      : { id: "text", ok: false, title: "Premajhno besedilo", detail: `${plural(r.phone.smallText, ["odstavek ima", "odstavka imata", "odstavki imajo", "odstavkov ima"])} pisavo, manjšo od 16 px, ki jo na telefonu težko preberete.` },
  );
  out.push(
    r.phone.callInViewport
      ? { id: "call", ok: true, title: "Klic s tapom takoj na vrhu", detail: "Na prvem zaslonu telefona je povezava, ki takoj pokliče." }
      : r.phone.hasCallLink
        ? { id: "call", ok: false, title: "Gumb za klic je predaleč", detail: "Telefonsko številko lahko pokličete s tapom, a šele, ko se pomaknete navzdol. Večina obiskovalcev na telefonu želi poklicati takoj." }
        : { id: "call", ok: false, title: "Ni klica s tapom", detail: "Telefonske številke ni mogoče poklicati s tapom; obiskovalec jo mora prepisati." },
  );
  if (r.speed) {
    const s = (r.speed.lcpMs / 1000).toFixed(1).replace(".", ",");
    out.push(
      r.speed.performance >= 90
        ? { id: "speed", ok: true, title: "Hitra na telefonu", detail: `Glavna vsebina se na mobilnem omrežju prikaže v ${s} s (ocena hitrosti ${r.speed.performance}/100).` }
        : { id: "speed", ok: false, title: r.speed.performance >= 50 ? "Na telefonu je počasna" : "Na telefonu je zelo počasna", detail: `Glavna vsebina se na mobilnem omrežju prikaže šele v ${s} s (ocena hitrosti ${r.speed.performance}/100). Pri več kot 2,5 s jih veliko odide.` },
    );
  }
  const tracking = r.cookiesBeforeConsent.filter((c) => c.kind !== "other");
  out.push(
    tracking.length === 0
      ? { id: "cookies", ok: true, title: "Brez sledilnih piškotkov pred privolitvijo", detail: "Pred obiskovalčevo privolitvijo stran ne nastavi analitičnih ali oglaševalskih piškotkov." }
      : {
          id: "cookies",
          ok: false,
          title: "Piškotki pred privolitvijo",
          detail: `Stran nastavi ${plural(tracking.length, ["analitični ali oglaševalski piškotek", "analitična ali oglaševalska piškotka", "analitične ali oglaševalske piškotke", "analitičnih ali oglaševalskih piškotkov"])} (${[...new Set(tracking.map((c) => c.name))].slice(0, 4).join(", ")}), še preden obiskovalec karkoli izbere. Zakon zahteva privolitev vnaprej.`,
        },
  );
  const missing = (Object.keys(COMPANY_LABEL) as (keyof CompanyFacts)[]).filter((k) => !r.company[k]);
  out.push(
    missing.length === 0
      ? { id: "company", ok: true, title: "Podatki o podjetju so na strani", detail: "Na prvi strani so ime z obliko podjetja, naslov, e-pošta, matična in davčna številka, kot zahteva ZEPT." }
      : { id: "company", ok: false, title: "Manjkajo podatki o podjetju (ZEPT)", detail: `Na prvi strani nismo našli: ${missing.map((k) => COMPANY_LABEL[k]).join(", ")}. Zakon o elektronskem poslovanju na trgu jih zahteva na spletni strani podjetja; če so na drugi podstrani (npr. Impresum), je lahko v redu.` },
  );
  return out;
}
