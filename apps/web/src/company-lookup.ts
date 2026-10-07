import type { Hono } from "hono";
import type { AppConfig } from "@sb/config";
import type { AppEnv } from "./access.ts";
import { loginThrottle } from "./auth.ts";

/**
 * Legal name and address from a Slovenian tax number (it-zept-lookup), for the editor's "Še to potrebujemo" and
 * Podatki: the owner types the davčna številka, the fields fill, the owner can still change them. The source is the
 * EU VIES REST service (POST check-vat-number: `valid`, `name`, `address`; free, no key), which only knows
 * VAT-registered businesses; the matična številka isn't in it. Nothing of the answer is stored or logged here: it
 * goes back to the editor, which saves what the owner keeps like typed text.
 */

export interface CompanyAddress {
  street: string;
  postalCode: string;
  city: string;
}

export type CompanyLookup =
  | { found: true; name: string; address: CompanyAddress | null }
  | { found: false; reason: "invalid" | "not_found" | "unavailable"; message: string };

/** Short notes for the owner, under the tax number field. */
export const LOOKUP_MESSAGE = {
  invalid: "Davčna številka ni veljavna. Preverite števke.",
  not_found: "Te davčne številke ni med zavezanci za DDV, zato podatkov ne moremo prevzeti. Vpišite jih sami.",
  unavailable: "Registra zavezancev za DDV trenutno ni mogoče doseči. Podatke vpišite sami.",
  rateLimited: "Preveč poizvedb. Podatke vpišite sami ali poskusite čez nekaj minut.",
} as const;

/** The 8 digits of a Slovenian tax number ("SI 1234 5678", "12345678"), or null. */
export function taxDigits(raw: string): string | null {
  const s = raw.replace(/[\s.-]/g, "").toUpperCase().replace(/^SI/, "");
  return /^\d{8}$/.test(s) ? s : null;
}

/** FURS check digit: weights 8…2 over the first seven digits, 11 minus the sum mod 11 (10 → 0; 11 is never issued). */
export function validTaxNumber(digits: string): boolean {
  if (!/^\d{8}$/.test(digits)) return false;
  const sum = [...digits.slice(0, 7)].reduce((a, d, i) => a + Number(d) * (8 - i), 0);
  const check = 11 - (sum % 11);
  if (check === 11) return false;
  return (check === 10 ? 0 : check) === Number(digits[7]);
}

/** VIES writes "---" for a value it doesn't give. */
const given = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const s = v.replace(/\s+/g, " ").trim();
  return s && s !== "---" ? s : null;
};

/** "ŠMARJEŠKA CESTA 6, 8501 NOVO MESTO" → street, postal code, city; null when it doesn't read that way. */
export function parseAddress(text: string): CompanyAddress | null {
  const m = /^(.+),\s*(\d{4})\s+([^,]+)$/.exec(text.replace(/\s*\n\s*/g, ", ").replace(/\s+/g, " ").trim());
  if (!m) return null;
  const [street, postalCode, city] = [m[1]!.trim(), m[2]!, m[3]!.trim()];
  // The spec's limits (business Address): a longer value is the owner's to shorten.
  if (!street || street.length > 80 || !city || city.length > 40) return null;
  return { street, postalCode, city };
}

export interface LookupDeps {
  fetch: typeof fetch;
  url: string;
  timeoutMs: number;
}

/** Asks VIES about one number. Never throws: a timeout, an error or an odd answer is "unavailable". */
export async function lookupCompany(raw: string, d: LookupDeps): Promise<CompanyLookup> {
  const digits = taxDigits(raw);
  if (!digits || !validTaxNumber(digits)) return { found: false, reason: "invalid", message: LOOKUP_MESSAGE.invalid };
  let body: Record<string, unknown>;
  try {
    const res = await d.fetch(d.url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ countryCode: "SI", vatNumber: digits }),
      signal: AbortSignal.timeout(d.timeoutMs),
    });
    if (!res.ok) {
      // Only the status: the body is VIES's, not ours to keep.
      console.warn(`[company-lookup] VIES answered HTTP ${res.status}`);
      return { found: false, reason: "unavailable", message: LOOKUP_MESSAGE.unavailable };
    }
    body = (await res.json()) as Record<string, unknown>;
  } catch (e) {
    console.warn(`[company-lookup] VIES not reached: ${(e as Error).name}`);
    return { found: false, reason: "unavailable", message: LOOKUP_MESSAGE.unavailable };
  }
  if (body.actionSucceed === false || typeof body.valid !== "boolean") return { found: false, reason: "unavailable", message: LOOKUP_MESSAGE.unavailable };
  if (!body.valid) return { found: false, reason: "not_found", message: LOOKUP_MESSAGE.not_found };
  const name = given(body.name);
  if (!name) return { found: false, reason: "not_found", message: LOOKUP_MESSAGE.not_found };
  const address = given(body.address);
  return { found: true, name: name.slice(0, 120), address: address ? parseAddress(address) : null };
}

export interface CompanyLookupRouteDeps {
  config: AppConfig;
  /** Tests pass a fake; the real one otherwise. */
  fetch?: typeof fetch;
}

/**
 * POST /api/sites/:id/company-lookup { taxNumber }: the site's own editor only (siteAccess: the owner or the admin;
 * an anonymous preview can't edit), rate-limited per viewer and in total.
 */
export function registerCompanyLookupRoute(app: Hono<AppEnv>, d: CompanyLookupRouteDeps): void {
  const cfg = d.config.companyLookup;
  const throttle = loginThrottle(cfg.perViewer, cfg.total, cfg.windowMinutes * 60_000);
  app.post("/api/sites/:id/company-lookup", async (c) => {
    const viewer = c.get("viewer");
    if (viewer.kind === "anonymous") return c.json({ error: "sign_in_required" }, 401);
    const body = (await c.req.json().catch(() => ({}))) as { taxNumber?: unknown };
    const raw = typeof body.taxNumber === "string" ? body.taxNumber.slice(0, 40) : "";
    if (!cfg.enabled) return c.json({ found: false, reason: "unavailable", message: LOOKUP_MESSAGE.unavailable } satisfies CompanyLookup);
    // A number that can't be one costs nothing and isn't counted.
    const digits = taxDigits(raw);
    if (!digits || !validTaxNumber(digits)) return c.json({ found: false, reason: "invalid", message: LOOKUP_MESSAGE.invalid } satisfies CompanyLookup);
    if (!throttle(viewer.kind === "admin" ? "admin" : viewer.account.id)) return c.json({ error: "rate_limited", code: "rate_limited", message: LOOKUP_MESSAGE.rateLimited }, 429);
    c.header("cache-control", "no-store");
    return c.json(await lookupCompany(digits, { fetch: d.fetch ?? fetch, url: cfg.url, timeoutMs: cfg.timeoutMs }));
  });
}
