import { MOBILE_PREFIXES } from "@sb/spec";
import { DomainProviderError, type DomainCheck, type DomainRegistrar, type Registrant, type RegistrationStatus } from "./domain-providers.ts";

/**
 * Openprovider REST API /v1 as our DomainRegistrar. SKELETON, NOT WIRED: no config selects it
 * (`domains.providers.registrar` allows only "fake") and it has never talked to the real API; there is
 * no account yet (HQ it-openprovider). Field names are from Openprovider's own API reference, read
 * 2026-10-04: the Swagger file behind https://developer.openprovider.com (data/swagger.spec.js,
 * host api.openprovider.eu) and https://developer.openprovider.com/get-started.html. Tests use responses
 * shaped like the documented examples, not recordings.
 *
 * Before wiring it (needs the account):
 * - the sandbox is documented only as https://api.sandbox.openprovider.nl/v1beta/ (a /v1 path answers there
 *   but isn't documented); /v1beta is switched off 2027-06-30;
 * - .si requirements: ask GET /v1/domains/additional-data?domain.extension=si and
 *   GET /v1/domains/additional-data/customers?domain.extension=si (not documented for .si on the pages read);
 * - whose handles go in admin/tech/billing for .si (today: the owner's, a guess to confirm);
 * - a register whose answer was lost is found with `lookup` (GET /v1/domains?full_name=…, ListDomains in
 *   the same Swagger file, read 2026-10-04) before buying again; confirm against the sandbox that a domain
 *   just requested (REQ) is listed there at once;
 * - rate limits (openprovider.help): check 20 calls / 300 s, create domain 15 / 300 s, token 30 / 60 s;
 *   the token is cached (TTL 48 h per the older v1beta article; v1 says only "limited time").
 */

export const OPENPROVIDER_BASE_URL = "https://api.openprovider.eu/v1";

/** The documented envelope: a non-zero `code` is an error, `desc` says what. */
interface Envelope<T> {
  code: number;
  desc?: string;
  data?: T;
  maintenance?: boolean;
  warnings?: { code: number; desc: string }[];
}

/** Openprovider's "Authentication/Authorization Failed" (seen on the sandbox with wrong credentials). */
const AUTH_FAILED = 196;
/** Domains per check request (older API docs: 15). */
const CHECK_BATCH = 15;

/** "Trubarjeva cesta 12a" → street "Trubarjeva cesta", number "12", suffix "a" (Openprovider's address fields). */
export function splitStreet(street: string): { street: string; number: string; suffix: string } {
  const m = /^(.*?)[\s,]+(\d+)\s*([a-zA-Z]?)$/.exec(street.trim());
  return m ? { street: m[1]!, number: m[2]!, suffix: m[3]!.toLowerCase() } : { street: street.trim(), number: "", suffix: "" };
}

/** "+38641123456" → { country_code: "+386", area_code: "41", subscriber_number: "123456" }. Slovene numbers only for now. */
export function splitPhone(e164: string): { country_code: string; area_code: string; subscriber_number: string } {
  const m = /^\+386(\d{8})$/.exec(e164);
  if (!m) throw new DomainProviderError(`Only Slovene phone numbers are mapped so far: ${e164.slice(0, 5)}…`, { permanent: true, code: "refused" });
  const digits = m[1]!;
  // Mobile and non-geographic prefixes are two digits (the same list the sites format numbers with); landlines one.
  const area = MOBILE_PREFIXES.has(digits.slice(0, 2)) ? digits.slice(0, 2) : digits.slice(0, 1);
  return { country_code: "+386", area_code: area, subscriber_number: digits.slice(area.length) };
}

const splitName = (full: string): { name: string; extension: string } => {
  const i = full.indexOf(".");
  return { name: full.slice(0, i), extension: full.slice(i + 1) };
};

export function openproviderRegistrar(o: { username: string; password: string; baseUrl?: string; fetch?: typeof fetch; timeoutMs?: number }): DomainRegistrar {
  const base = (o.baseUrl ?? OPENPROVIDER_BASE_URL).replace(/\/$/, "");
  const doFetch = o.fetch ?? fetch;
  let token: { value: string; until: number } | null = null;

  async function login(): Promise<string> {
    if (token && token.until > Date.now()) return token.value;
    const res = await doFetch(`${base}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: o.username, password: o.password, ip: "0.0.0.0" }),
      signal: AbortSignal.timeout(o.timeoutMs ?? 15_000),
    });
    const body = (await res.json().catch(() => ({ code: -1 }))) as Envelope<{ token?: string }>;
    if (body.code !== 0 || !body.data?.token) throw new DomainProviderError(`Openprovider login failed: ${body.code} ${body.desc ?? res.status}`, { permanent: body.code === AUTH_FAILED });
    // Renewed well before the 48 h the older docs give.
    token = { value: body.data.token, until: Date.now() + 12 * 3600_000 };
    return token.value;
  }

  async function call<T>(method: "GET" | "POST", path: string, body?: unknown, retried = false): Promise<T> {
    const res = await doFetch(`${base}${path}`, {
      method,
      headers: { authorization: `Bearer ${await login()}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(o.timeoutMs ?? 15_000),
    });
    const env = (await res.json().catch(() => ({ code: -1, desc: `HTTP ${res.status}` }))) as Envelope<T>;
    if (env.code === AUTH_FAILED && !retried) {
      token = null;
      return call<T>(method, path, body, true);
    }
    if (env.code !== 0 || env.data === undefined) throw new DomainProviderError(`Openprovider ${method} ${path}: ${env.code} ${env.desc ?? ""}`.trim(), { permanent: res.status === 400 });
    return env.data;
  }

  return {
    kind: "openprovider",
    async check(names) {
      const out: DomainCheck[] = [];
      for (let i = 0; i < names.length; i += CHECK_BATCH) {
        const batch = names.slice(i, i + CHECK_BATCH);
        const data = await call<{ results?: { domain: string; status: string; is_premium?: boolean; price?: { reseller?: { currency: string; price: number } } }[] }>("POST", "/domains/check", {
          domains: batch.map(splitName),
          with_price: true,
        });
        for (const r of data.results ?? []) {
          const reseller = r.price?.reseller;
          out.push({
            name: r.domain.toLowerCase(),
            // The spec says "free or active"; the quickstart also lists "reserved" and "in use": only "free" is free.
            available: r.status === "free",
            premium: r.is_premium === true,
            costEur: reseller && reseller.currency === "EUR" ? reseller.price : null,
          });
        }
      }
      return out;
    },
    async createContact(r: Registrant) {
      const street = splitStreet(r.street);
      const data = await call<{ handle: string }>("POST", "/customers", {
        name: { first_name: r.firstName, last_name: r.lastName },
        ...(r.kind === "company" && r.companyName ? { company_name: r.companyName } : {}),
        address: { street: street.street, number: street.number, ...(street.suffix ? { suffix: street.suffix } : {}), zipcode: r.postalCode, city: r.city, country: r.country },
        phone: splitPhone(r.phone),
        email: r.email,
      });
      return { handle: data.handle };
    },
    async register(r) {
      const data = await call<{ id: number; status: string }>("POST", "/domains", {
        domain: splitName(r.name),
        owner_handle: r.ownerHandle,
        admin_handle: r.ownerHandle,
        tech_handle: r.ownerHandle,
        billing_handle: r.ownerHandle,
        period: r.years,
        autorenew: "default",
        name_servers: r.nameservers.map((name, i) => ({ name, seq_nr: i + 1 })),
      });
      return { id: String(data.id), status: statusOf(data.status) };
    },
    async registration(id) {
      const data = await call<{ status: string }>("GET", `/domains/${encodeURIComponent(id)}`);
      return statusOf(data.status);
    },
    async lookup(raw) {
      const name = raw.trim().toLowerCase();
      // ListDomains: `full_name` filters by the whole name; results are domainGetDomainResponseData (id, status, domain.name/extension, is_deleted).
      const data = await call<{ results?: { id: number; status: string; is_deleted?: boolean; domain?: { name?: string; extension?: string } }[] }>(
        "GET",
        `/domains?full_name=${encodeURIComponent(name)}&is_deleted=false&limit=10`,
      );
      const hit = (data.results ?? []).find((r) => !r.is_deleted && `${r.domain?.name ?? ""}.${r.domain?.extension ?? ""}`.toLowerCase() === name);
      return hit ? { id: String(hit.id), status: statusOf(hit.status) } : null;
    },
  };
}

/** Openprovider's domain status: ACT active, REQ requested, FAI failed (support article); anything else is still pending. */
function statusOf(s: string): RegistrationStatus {
  return s === "ACT" ? "active" : s === "FAI" ? "failed" : "pending";
}
