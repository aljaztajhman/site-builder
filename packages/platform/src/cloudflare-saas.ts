import { DomainProviderError, type CertificateStatus, type EdgeHostnames } from "./domain-providers.ts";

/**
 * Cloudflare as our edge (EdgeHostnames). SKELETON, NOT WIRED: no config selects it
 * (`domains.providers.edge` allows only "fake"), it has never talked to the real API, and Cloudflare for
 * SaaS isn't enabled on the account yet (it needs a payment method; first 100 hostnames free, then $0.10
 * each, max 50,000). Field names from Cloudflare's API reference, read 2026-10-04:
 *   POST /zones {account.id, name, type "full"} → result.id, name_servers, status (initializing|pending|active|moved)
 *   GET  /zones/{zone_id}/ssl/verification → result[].certificate_status (… active …)
 *   POST /zones/{zone_id}/dns_records {type, name, content, proxied, ttl}
 *   POST /zones/{zone_id}/workers/routes {pattern, script}
 *   POST /zones/{zone_id}/custom_hostnames {hostname, ssl {method, type "dv"}} → result.id, status, ssl.status,
 *        ssl.validation_errors[].message, verification_errors[]
 *   GET  /zones/{zone_id}/custom_hostnames?hostname=… and /custom_hostnames/{id}
 * Envelope { success, errors[{code, message}], messages[], result }.
 *
 * Domains we register become zones of their own in our account (free DNS and Universal SSL for apex and
 * www), with originless proxied records and the edge Worker's routes; domains owners already have become
 * custom hostnames on our SaaS zone, validated over HTTP once their www CNAME points at `cnameTarget`.
 *
 * Before wiring it: the zone limit on the Free plan, whether a .si zone can be added before its
 * delegation passes, the API token's permissions (Zone Edit, DNS Edit, Workers Routes Write, SSL read),
 * and the fallback origin (PUT /zones/{saas}/custom_hostnames/fallback_origin {origin}).
 */

export const CLOUDFLARE_API = "https://api.cloudflare.com/client/v4";

interface Envelope<T> {
  success: boolean;
  errors?: { code: number; message: string }[];
  result: T;
}

/** An originless proxied record: the edge Worker answers every request, so the address is never reached (IPv6 discard prefix). */
const ORIGINLESS = { type: "AAAA", content: "100::", proxied: true, ttl: 1 };

export function cloudflareEdge(o: {
  apiToken: string;
  accountId: string;
  /** The SaaS zone (our platform domain) that carries owners' custom hostnames. */
  saasZoneId: string;
  /** The proxied hostname in the SaaS zone owners point their CNAME at. */
  cnameTarget: string;
  /** The edge Worker's script name (infra/edge). */
  workerScript: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}): EdgeHostnames {
  const doFetch = o.fetch ?? fetch;

  async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<{ ok: true; result: T } | { ok: false; errors: { code: number; message: string }[]; status: number }> {
    const res = await doFetch(`${CLOUDFLARE_API}${path}`, {
      method,
      headers: { authorization: `Bearer ${o.apiToken}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(o.timeoutMs ?? 15_000),
    });
    const env = (await res.json().catch(() => ({ success: false, errors: [{ code: res.status, message: `HTTP ${res.status}` }] }))) as Envelope<T>;
    return env.success ? { ok: true, result: env.result } : { ok: false, errors: env.errors ?? [], status: res.status };
  }
  const must = async <T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> => {
    const r = await call<T>(method, path, body);
    if (!r.ok) throw new DomainProviderError(`Cloudflare ${method} ${path}: ${r.errors.map((e) => `${e.code} ${e.message}`).join("; ")}`.slice(0, 300), { permanent: r.status === 400 || r.status === 403 });
    return r.result;
  };

  /** Creates something that may exist already (a retried step): a refusal is fine when the lookup then finds it. */
  async function createOrFind<T>(create: () => Promise<{ ok: true; result: T } | { ok: false; errors: { code: number; message: string }[]; status: number }>, find: () => Promise<T | undefined>, what: string): Promise<T> {
    const r = await create();
    if (r.ok) return r.result;
    const found = await find();
    if (found) return found;
    throw new DomainProviderError(`Cloudflare ${what}: ${r.errors.map((e) => `${e.code} ${e.message}`).join("; ")}`.slice(0, 300), { permanent: r.status === 400 || r.status === 403 });
  }

  return {
    kind: "cloudflare",
    cnameTarget: o.cnameTarget,
    async addZone(domain) {
      const zone = await createOrFind(
        () => call<{ id: string; name_servers: string[] }>("POST", "/zones", { account: { id: o.accountId }, name: domain, type: "full" }),
        async () => (await must<{ id: string; name_servers: string[] }[]>("GET", `/zones?name=${encodeURIComponent(domain)}`))[0],
        `zone ${domain}`,
      );
      // The site's records and the Worker's routes; existing ones are refused and left as they are.
      for (const name of [domain, `www.${domain}`]) {
        await call("POST", `/zones/${zone.id}/dns_records`, { ...ORIGINLESS, name, comment: "Stranko: spletna stran" });
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
        () => call<{ id: string }>("POST", `/zones/${o.saasZoneId}/custom_hostnames`, { hostname, ssl: { method: "http", type: "dv" } }),
        async () => (await must<{ id: string; hostname: string }[]>("GET", `/zones/${o.saasZoneId}/custom_hostnames?hostname=${encodeURIComponent(hostname)}`)).find((x) => x.hostname === hostname),
        `custom hostname ${hostname}`,
      );
      return { id: h.id };
    },
    async hostname(id) {
      const h = await must<{ status: string; ssl?: { status?: string; validation_errors?: { message: string }[] }; verification_errors?: string[] }>("GET", `/zones/${o.saasZoneId}/custom_hostnames/${id}`);
      const status = h.status === "active" ? "active" : /blocked|moved|deleted|test_failed/.test(h.status) ? "failed" : "pending";
      const ssl = h.ssl?.status ?? "";
      const certificate: CertificateStatus = ssl === "active" ? "active" : /timed_out|expired|deleted|inactive/.test(ssl) ? "failed" : "pending";
      return { status, certificate, errors: [...(h.verification_errors ?? []), ...(h.ssl?.validation_errors ?? []).map((e) => e.message)] };
    },
  };
}
