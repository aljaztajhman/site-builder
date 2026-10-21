import { DomainProviderError, domainProvidersFor, type CertificateStatus, type DomainProviders, type EdgeHostnames } from "./domain-providers.ts";

/**
 * Cloudflare as our edge (EdgeHostnames). Wired for connecting owners' own domains (config
 * `domains.providers.edge: "cloudflare-saas"`, env `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ZONE_ID`,
 * docs/dev/domains.md): each owner's `www.<their domain>` becomes a custom hostname on our zone
 * (postavi.si), validated over HTTP once their CNAME points at `cnameTarget` (the zone's fallback origin,
 * `povezava.postavi.si`). Cloudflare for SaaS must be enabled on the zone (it needs a payment method; first
 * 100 hostnames free, then $0.10 each). Not yet checked against the live API: field names are from
 * Cloudflare's API reference (read 2026-10-04 and 2026-10-21) and the tests use the documented shapes.
 *   POST   /zones/{zone_id}/custom_hostnames {hostname, ssl {method "http", type "dv"}} → result.id, status, ssl.status,
 *          ssl.validation_errors[].message, verification_errors[]
 *   GET    /zones/{zone_id}/custom_hostnames?hostname=… and /custom_hostnames/{id}
 *   DELETE /zones/{zone_id}/custom_hostnames/{id} → result.id
 * Registered domains (addZone, zone) are for buying names (Openprovider, off until paid plans, M7b):
 *   POST /zones {account.id, name, type "full"} → result.id, name_servers, status (initializing|pending|active|moved)
 *   GET  /zones/{zone_id}/ssl/verification → result[].certificate_status (… active …)
 *   POST /zones/{zone_id}/dns_records {type, name, content, proxied, ttl}
 *   POST /zones/{zone_id}/workers/routes {pattern, script}
 * Envelope { success, errors[{code, message}], messages[], result }.
 *
 * The API token needs "SSL and Certificates: Edit" on the zone (custom hostnames); Zone, DNS and Workers
 * Routes edit rights only once registering is on.
 */

export const CLOUDFLARE_API = "https://api.cloudflare.com/client/v4";

interface Envelope<T> {
  success: boolean;
  errors?: { code: number; message: string }[];
  result: T;
}

type Method = "GET" | "POST" | "DELETE";
type CallResult<T> = { ok: true; result: T } | { ok: false; errors: { code: number; message: string }[]; status: number };

/** An originless proxied record: the edge Worker answers every request, so the address is never reached (IPv6 discard prefix). */
const ORIGINLESS = { type: "AAAA", content: "100::", proxied: true, ttl: 1 };

/** Custom hostname states that won't become active by waiting (Cloudflare's documented list). */
const HOSTNAME_FAILED = /blocked|moved|deleted|test_failed/;
/** Certificate states that won't become active by waiting. */
const SSL_FAILED = /timed_out|expired|deleted|inactive|deactivating/;

export function cloudflareEdge(o: {
  apiToken: string;
  /** The SaaS zone (our platform domain) that carries owners' custom hostnames. */
  saasZoneId: string;
  /** The proxied hostname in the SaaS zone owners point their CNAME at (the fallback origin). */
  cnameTarget: string;
  /** Only for domains we register (addZone): our account, and the edge Worker's script name (infra/edge). */
  accountId?: string;
  workerScript?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}): EdgeHostnames {
  const doFetch = o.fetch ?? fetch;

  async function call<T>(method: Method, path: string, body?: unknown): Promise<CallResult<T>> {
    const res = await doFetch(`${CLOUDFLARE_API}${path}`, {
      method,
      headers: { authorization: `Bearer ${o.apiToken}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(o.timeoutMs ?? 15_000),
    });
    const env = (await res.json().catch(() => ({ success: false, errors: [{ code: res.status, message: `HTTP ${res.status}` }] }))) as Envelope<T>;
    return env.success ? { ok: true, result: env.result } : { ok: false, errors: env.errors ?? [], status: res.status };
  }
  const describe = (errors: { code: number; message: string }[]) => errors.map((e) => `${e.code} ${e.message}`).join("; ");
  // 400 (refused data) and 401/403 (the token) won't pass by retrying; 429, 5xx and timeouts may.
  const permanentStatus = (status: number) => status === 400 || status === 401 || status === 403;
  const must = async <T>(method: Method, path: string, body?: unknown): Promise<T> => {
    const r = await call<T>(method, path, body);
    if (!r.ok) throw new DomainProviderError(`Cloudflare ${method} ${path}: ${describe(r.errors)}`.slice(0, 300), { permanent: permanentStatus(r.status) });
    return r.result;
  };

  /** Creates something that may exist already (a retried step): a refusal is fine when the lookup then finds it. */
  async function createOrFind<T>(create: () => Promise<CallResult<T>>, find: () => Promise<T | undefined>, what: string): Promise<T> {
    const r = await create();
    if (r.ok) return r.result;
    const found = await find();
    if (found) return found;
    throw new DomainProviderError(`Cloudflare ${what}: ${describe(r.errors)}`.slice(0, 300), { permanent: permanentStatus(r.status) });
  }

  const hostnames = `/zones/${encodeURIComponent(o.saasZoneId)}/custom_hostnames`;

  return {
    kind: "cloudflare",
    cnameTarget: o.cnameTarget,
    async addZone(domain) {
      if (!o.accountId || !o.workerScript) throw new DomainProviderError("Cloudflare: registered domains need the account id and the Worker's script name", { permanent: true });
      const zone = await createOrFind(
        () => call<{ id: string; name_servers: string[] }>("POST", "/zones", { account: { id: o.accountId }, name: domain, type: "full" }),
        async () => (await must<{ id: string; name_servers: string[] }[]>("GET", `/zones?name=${encodeURIComponent(domain)}`))[0],
        `zone ${domain}`,
      );
      // The site's records and the Worker's routes; existing ones are refused and left as they are.
      for (const name of [domain, `www.${domain}`]) {
        await call("POST", `/zones/${zone.id}/dns_records`, { ...ORIGINLESS, name, comment: "Postavi: spletna stran" });
        await call("POST", `/zones/${zone.id}/workers/routes`, { pattern: `${name}/*`, script: o.workerScript });
      }
      return { zoneId: zone.id, nameservers: zone.name_servers };
    },
    async zone(zoneId) {
      const zone = await must<{ status: string }>("GET", `/zones/${zoneId}`);
      if (zone.status !== "active") return { status: "pending", certificate: "pending" };
      const certs = await must<{ certificate_status: string }[]>("GET", `/zones/${zoneId}/ssl/verification`);
      const states = certs.map((c) => c.certificate_status);
      const certificate: CertificateStatus = states.length && states.every((s) => s === "active") ? "active" : states.includes("expired") ? "failed" : "pending";
      return { status: "active", certificate };
    },
    async addHostname(hostname) {
      const h = await createOrFind(
        () => call<{ id: string }>("POST", hostnames, { hostname, ssl: { method: "http", type: "dv" } }),
        async () => (await must<{ id: string; hostname: string }[]>("GET", `${hostnames}?hostname=${encodeURIComponent(hostname)}`)).find((x) => x.hostname === hostname),
        `custom hostname ${hostname}`,
      );
      return { id: h.id };
    },
    async hostname(id) {
      const h = await must<{ status: string; ssl?: { status?: string; validation_errors?: { message: string }[] }; verification_errors?: string[] }>("GET", `${hostnames}/${encodeURIComponent(id)}`);
      // "active_redeploying" still serves; "pending_blocked" and the like won't clear by waiting.
      const status = h.status.startsWith("active") ? "active" : HOSTNAME_FAILED.test(h.status) ? "failed" : "pending";
      const ssl = h.ssl?.status ?? "";
      const certificate: CertificateStatus = ssl === "active" ? "active" : SSL_FAILED.test(ssl) ? "failed" : "pending";
      return { status, certificate, errors: [...(h.verification_errors ?? []), ...(h.ssl?.validation_errors ?? []).map((e) => e.message)] };
    },
    async removeHostname(id) {
      const r = await call<{ id: string }>("DELETE", `${hostnames}/${encodeURIComponent(id)}`);
      if (r.ok || r.status === 404) return;
      throw new DomainProviderError(`Cloudflare DELETE custom hostname ${id}: ${describe(r.errors)}`.slice(0, 300), { permanent: permanentStatus(r.status) });
    },
  };
}

/** The env variables the Cloudflare for SaaS edge needs (secrets: never printed). */
export const CLOUDFLARE_ENV = ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ZONE_ID"] as const;

/**
 * The Cloudflare for SaaS edge from env, or null with the names of the missing variables. Optional, for
 * registered domains only (off until M7b): CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_WORKER_SCRIPT (default postavi-edge).
 */
export function cloudflareEdgeFromEnv(
  env: Record<string, string | undefined>,
  cnameTarget: string,
  opts: { fetch?: typeof fetch } = {},
): { edge: EdgeHostnames; missing: [] } | { edge: null; missing: string[] } {
  const missing = CLOUDFLARE_ENV.filter((k) => !env[k]?.trim());
  if (missing.length) return { edge: null, missing };
  const accountId = env.CLOUDFLARE_ACCOUNT_ID?.trim();
  return {
    edge: cloudflareEdge({
      apiToken: env.CLOUDFLARE_API_TOKEN!.trim(),
      saasZoneId: env.CLOUDFLARE_ZONE_ID!.trim(),
      cnameTarget,
      ...(accountId ? { accountId } : {}),
      workerScript: env.CLOUDFLARE_WORKER_SCRIPT?.trim() || "postavi-edge",
      ...(opts.fetch ? { fetch: opts.fetch } : {}),
    }),
    missing: [],
  };
}

/** The providers config `domains` selects, with Cloudflare for SaaS read from env (web and worker). */
export function domainProvidersFromEnv(domains: Parameters<typeof domainProvidersFor>[0], env: Record<string, string | undefined> = process.env): DomainProviders {
  return domainProvidersFor(domains, (cnameTarget) => cloudflareEdgeFromEnv(env, cnameTarget));
}
