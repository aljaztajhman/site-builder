import { resolveCname, resolveMx, resolveNs } from "node:dns/promises";

/**
 * The outside services a site's own domain needs (docs/plans/custom-domains.md): a registrar that sells
 * and registers names in the owner's name, the edge in front of every site (DNS zones, custom hostnames
 * and certificates), and DNS lookups of the owner's own records. Provisioning (packages/engine
 * provision.ts) talks only to these interfaces. Only the in-memory fakes below are wired (config
 * `domains.providers`); openprovider.ts and cloudflare-saas.ts are adapters for when the accounts exist.
 *
 * Every write is idempotent, because a provisioning step can run again after a crash between the
 * provider's answer and our record of it: registering a name already registered in our account answers
 * with that registration, adding a zone or hostname that exists answers with it.
 */

export interface DomainCheck {
  /** Full name, lower case ("pekarnakvas.si"). */
  name: string;
  available: boolean;
  /** Registry premium names are never offered (they cost more than config allows). */
  premium: boolean;
  /** What the registrar charges us per year, in euros; null when it didn't say. */
  costEur: number | null;
}

/** The domain's holder: the owner (the domain is theirs), from the site's facts and their own corrections. */
export interface Registrant {
  kind: "person" | "company";
  /** The contact person (for a company) or the holder (a person). */
  firstName: string;
  lastName: string;
  /** The company's legal name; only for kind "company". */
  companyName?: string;
  street: string;
  postalCode: string;
  city: string;
  /** ISO 3166-1 alpha-2 ("SI"). */
  country: string;
  /** E.164 ("+38641123456"). */
  phone: string;
  email: string;
}

export type RegistrationStatus = "pending" | "active" | "failed";
export type CertificateStatus = "pending" | "active" | "failed";

export interface DomainRegistrar {
  readonly kind: string;
  /** Availability and our cost of each name. Names the registrar didn't answer for are left out. */
  check(names: string[]): Promise<DomainCheck[]>;
  /** The holder's contact handle at the registrar. */
  createContact(r: Registrant): Promise<{ handle: string }>;
  /** Registers `name` for `ownerHandle` with our edge's nameservers. A name already registered in our account answers with it. */
  register(o: { name: string; ownerHandle: string; years: number; nameservers: string[] }): Promise<{ id: string; status: RegistrationStatus }>;
  registration(id: string): Promise<RegistrationStatus>;
  /**
   * The registration of `name` in our account (any status), or null when we don't hold it. A register
   * call whose answer was lost (a timeout, a dead process) is found here instead of bought again.
   */
  lookup(name: string): Promise<{ id: string; status: RegistrationStatus } | null>;
}

export interface EdgeHostnames {
  readonly kind: string;
  /** Where an owner's own domain points (their `www` CNAME). */
  readonly cnameTarget: string;
  /** A domain we registered: its DNS zone in our account, the site's records and route. Existing → that zone. */
  addZone(domain: string): Promise<{ zoneId: string; nameservers: string[] }>;
  /** Whether the zone is delegated to us (the registry published our nameservers) and its certificate is issued. */
  zone(zoneId: string): Promise<{ status: "pending" | "active"; certificate: CertificateStatus }>;
  /** An owner's own hostname (custom hostname on our zone). Existing → that one. */
  addHostname(hostname: string): Promise<{ id: string }>;
  hostname(id: string): Promise<{ status: "pending" | "active" | "failed"; certificate: CertificateStatus; errors: string[] }>;
}

/** DNS answers about the owner's domain. No answer (no such name, no such record) is an empty list. */
export interface DnsLookup {
  cname(host: string): Promise<string[]>;
  ns(domain: string): Promise<string[]>;
  mx(domain: string): Promise<string[]>;
}

/**
 * A provider refused or failed. `permanent`: trying again can't help (the name is taken, the data is
 * refused); otherwise the step is retried with backoff. `code` names the failure for the owner's message.
 */
export class DomainProviderError extends Error {
  constructor(
    message: string,
    readonly opts: { permanent?: boolean; code?: string } = {},
  ) {
    super(message);
    this.name = "DomainProviderError";
  }
  get permanent(): boolean {
    return this.opts.permanent ?? false;
  }
}

const lower = (s: string) => s.trim().toLowerCase().replace(/\.$/, "");

/** Real DNS (free, no account). Missing names and records answer [] instead of throwing. */
export function systemDns(): DnsLookup {
  const none = (e: unknown) => {
    const code = (e as { code?: string }).code;
    if (code === "ENOTFOUND" || code === "ENODATA" || code === "ESERVFAIL" || code === "NXDOMAIN") return [] as string[];
    throw e;
  };
  return {
    cname: (h) => resolveCname(h).then((r) => r.map(lower), none),
    ns: (d) => resolveNs(d).then((r) => r.map(lower), none),
    mx: (d) => resolveMx(d).then((r) => r.map((m) => lower(m.exchange)), none),
  };
}

/** Fixed DNS answers (tests, dev). `anyCnameTo`: every name answers this CNAME (dev: the owner's record "is there"). */
export function fakeDns(records: { cname?: Record<string, string[]>; ns?: Record<string, string[]>; mx?: Record<string, string[]> } = {}, opts: { anyCnameTo?: string } = {}): DnsLookup & {
  records: typeof records;
} {
  const r = { cname: { ...records.cname }, ns: { ...records.ns }, mx: { ...records.mx } };
  return {
    records: r,
    cname: async (h) => r.cname[lower(h)] ?? (opts.anyCnameTo ? [opts.anyCnameTo] : []),
    ns: async (d) => r.ns[lower(d)] ?? [],
    mx: async (d) => r.mx[lower(d)] ?? [],
  };
}

/**
 * DNS hosts we can name from a domain's nameservers, so the owner reads "pri Cloudflare" instead of
 * a generic instruction. Only hosts whose nameserver names are well known; anything else is "your DNS host".
 */
export const DNS_HOSTS: readonly { name: string; suffixes: readonly string[] }[] = [
  { name: "Cloudflare", suffixes: ["ns.cloudflare.com"] },
  { name: "GoDaddy", suffixes: ["domaincontrol.com"] },
  { name: "Namecheap", suffixes: ["registrar-servers.com"] },
  { name: "Amazon Route 53", suffixes: ["awsdns-"] },
  { name: "Google Cloud DNS", suffixes: ["googledomains.com"] },
  { name: "Wix", suffixes: ["wixdns.net"] },
  { name: "Hostinger", suffixes: ["dns-parking.com"] },
  { name: "Neoserv", suffixes: ["neoserv.si"] },
  { name: "Domenca", suffixes: ["domenca.com"] },
];

/** The DNS host behind a domain's nameservers, or null when we don't recognise it. */
export function detectDnsHost(nameservers: readonly string[]): string | null {
  for (const host of DNS_HOSTS) {
    if (nameservers.some((ns) => host.suffixes.some((s) => (s.endsWith("-") ? ns.includes(s) : ns === s || ns.endsWith(`.${s}`))))) return host.name;
  }
  return null;
}

// ---------- In-memory fakes (tests and development) ----------

/**
 * How a fake method behaves, for tests of retries and failures: throw a transient error the first
 * `fail` times, throw a permanent one, or answer "pending" the first `pending` times it is asked.
 * `lose` (register only): do the work, then throw a transient error the first `lose` times, as a call
 * whose answer never arrived (a timeout after the registrar registered the name).
 */
export interface FakeBehaviour {
  fail?: number;
  permanent?: boolean;
  pending?: number;
  lose?: number;
}

type Calls = { method: string; args: unknown[] }[];

function behave(script: Record<string, FakeBehaviour | undefined>, counts: Map<string, number>, method: string): "ok" | "pending" {
  const b = script[method];
  const n = (counts.get(method) ?? 0) + 1;
  counts.set(method, n);
  if (!b) return "ok";
  if (b.permanent) throw new DomainProviderError(`fake ${method}: refused`, { permanent: true, code: method === "register" ? "unavailable" : "refused" });
  if (b.fail && n <= b.fail) throw new DomainProviderError(`fake ${method}: temporary failure ${n}`);
  if (b.pending && n <= (b.fail ?? 0) + b.pending) return "pending";
  return "ok";
}

export interface FakeRegistrar extends DomainRegistrar {
  calls: Calls;
  /** Names registered here (name → id). */
  registered: Map<string, string>;
}

/**
 * A registrar in memory. Every name is free except `taken` (and any name containing "zaseden", so a
 * developer can try the taken case); costs per TLD from `costEur` (default 10). Stateless across
 * processes for everything a web and a worker process both ask (availability, ids derived from names).
 */
export function fakeRegistrar(o: { taken?: Iterable<string>; costEur?: Record<string, number>; premium?: Iterable<string>; script?: Record<string, FakeBehaviour> } = {}): FakeRegistrar {
  const taken = new Set([...(o.taken ?? [])].map(lower));
  const premium = new Set([...(o.premium ?? [])].map(lower));
  const counts = new Map<string, number>();
  const script = o.script ?? {};
  const calls: Calls = [];
  const registered = new Map<string, string>();
  // Asked for and still with the registry (register answered "pending").
  const pendingNames = new Set<string>();
  return {
    kind: "fake",
    calls,
    registered,
    async check(names) {
      calls.push({ method: "check", args: [names] });
      behave(script, counts, "check");
      return names.map((raw) => {
        const name = lower(raw);
        const tld = name.split(".").pop() ?? "";
        return { name, available: !taken.has(name) && !name.includes("zaseden") && !registered.has(name) && !pendingNames.has(name), premium: premium.has(name), costEur: o.costEur?.[tld] ?? 10 };
      });
    },
    async createContact(r) {
      calls.push({ method: "createContact", args: [r] });
      behave(script, counts, "createContact");
      return { handle: `FK${(r.lastName || r.companyName || "x").slice(0, 2).toUpperCase()}${calls.length}-SI` };
    },
    async register(r) {
      calls.push({ method: "register", args: [r] });
      const name = lower(r.name);
      if (registered.has(name)) return { id: registered.get(name)!, status: "active" };
      if (taken.has(name) || name.includes("zaseden")) throw new DomainProviderError(`${name} is taken`, { permanent: true, code: "unavailable" });
      const state = behave(script, counts, "register");
      const id = `fake-${name}`;
      if (state === "ok") registered.set(name, id);
      else pendingNames.add(name);
      const lose = script.register?.lose ?? 0;
      if (lose && (counts.get("register") ?? 0) <= lose) throw new DomainProviderError(`fake register: no answer (the name was registered)`);
      return { id, status: state === "ok" ? "active" : "pending" };
    },
    async registration(id) {
      calls.push({ method: "registration", args: [id] });
      const state = behave(script, counts, "registration");
      if (state === "ok") {
        registered.set(id.replace(/^fake-/, ""), id);
        pendingNames.delete(id.replace(/^fake-/, ""));
      }
      return state === "ok" ? "active" : "pending";
    },
    async lookup(raw) {
      calls.push({ method: "lookup", args: [raw] });
      behave(script, counts, "lookup");
      const name = lower(raw);
      if (registered.has(name)) return { id: registered.get(name)!, status: "active" };
      return pendingNames.has(name) ? { id: `fake-${name}`, status: "pending" } : null;
    },
  };
}

export interface FakeEdge extends EdgeHostnames {
  calls: Calls;
}

/** The edge in memory: zones and hostnames become active (certificate included) unless the script says otherwise. */
export function fakeEdge(o: { cnameTarget?: string; nameservers?: string[]; script?: Record<string, FakeBehaviour> } = {}): FakeEdge {
  const counts = new Map<string, number>();
  const script = o.script ?? {};
  const calls: Calls = [];
  return {
    kind: "fake",
    calls,
    cnameTarget: o.cnameTarget ?? "povezava.stranko.example",
    async addZone(domain) {
      calls.push({ method: "addZone", args: [domain] });
      behave(script, counts, "addZone");
      return { zoneId: `zone-${lower(domain)}`, nameservers: o.nameservers ?? ["ana.ns.stranko.example", "bor.ns.stranko.example"] };
    },
    async zone(zoneId) {
      calls.push({ method: "zone", args: [zoneId] });
      const state = behave(script, counts, "zone");
      return state === "ok" ? { status: "active", certificate: "active" } : { status: "active", certificate: "pending" };
    },
    async addHostname(hostname) {
      calls.push({ method: "addHostname", args: [hostname] });
      behave(script, counts, "addHostname");
      return { id: `ch-${lower(hostname)}` };
    },
    async hostname(id) {
      calls.push({ method: "hostname", args: [id] });
      const state = behave(script, counts, "hostname");
      return state === "ok" ? { status: "active", certificate: "active", errors: [] } : { status: "pending", certificate: "pending", errors: [] };
    },
  };
}

export interface DomainProviders {
  registrar: DomainRegistrar;
  edge: EdgeHostnames;
  dns: DnsLookup;
}

/**
 * The providers config `domains.providers` selects. Only the fakes can be selected: the real adapters
 * (openprovider.ts, cloudflare-saas.ts) are not wired until the accounts exist (HQ it-openprovider).
 */
export function domainProvidersFor(providers: { registrar: "fake"; edge: "fake"; dns: "fake" | "system" }): DomainProviders {
  const edge = fakeEdge();
  return {
    registrar: fakeRegistrar(),
    edge,
    dns: providers.dns === "system" ? systemDns() : fakeDns({}, { anyCnameTo: edge.cnameTarget }),
  };
}
