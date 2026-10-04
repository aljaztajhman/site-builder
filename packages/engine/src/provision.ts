import type { AppConfig } from "@sb/config";
import {
  DomainProviderError,
  detectDnsHost,
  normaliseHostname,
  suggestDomains,
  type DomainProviders,
  type Registrant,
  type Repo,
  type SiteDomainRow,
  type Storage,
} from "@sb/platform";
import { isPlaceholder, type SiteSpec } from "@sb/spec";
import { PublishBlockedError, PublishBusyError, publishSite, siteAddress } from "./pipeline.ts";

/**
 * A site's own domain, from the owner's choice to live (docs/plans/custom-domains.md, it-domain-flow).
 * The worker runs `provisionDomain` for a pending site_domains row; each run takes the row's lease, runs
 * its steps from where the last run stopped, and writes back the step it reached:
 *
 *   registered (we buy it for the owner):  contact → zone → register → certificate → live
 *   connected (the owner already has it):  edge → dns → certificate → live
 *
 * Every step is idempotent (the providers' writes are, and each id is stored as soon as it exists), so a
 * run cut off anywhere starts that step again. A step that fails is retried with backoff (config
 * `domains.retry`); one that waits on the outside (the registry, the owner's DNS record, the certificate)
 * is asked again later, until `domains.waitHours` runs out. Failures keep a code, worded for the owner in
 * Slovene by `domainState`. "live" makes the hostname active, republishes the site with its new address
 * (canonical URLs, sitemap, feed) and leaves the owner's email to the web process (notify 'pending').
 */

export interface ProvisionDeps {
  repo: Repo;
  storage: Storage;
  config: AppConfig;
  providers: DomainProviders;
  /** PLATFORM_DOMAIN, for the site's address when it has no active domain. */
  platformDomain?: string | null;
  /** Milliseconds now (tests move it). */
  now?: () => number;
}

const REGISTERED_STEPS = ["contact", "zone", "register", "certificate", "live"] as const;
const CONNECTED_STEPS = ["edge", "dns", "certificate", "live"] as const;
type Step = (typeof REGISTERED_STEPS)[number] | (typeof CONNECTED_STEPS)[number];

const firstStep = (row: SiteDomainRow): Step => (row.kind === "registered" ? "contact" : "edge");
const stepsOf = (row: SiteDomainRow): readonly Step[] => (row.kind === "registered" ? REGISTERED_STEPS : CONNECTED_STEPS);
const currentStep = (row: SiteDomainRow): Step => (stepsOf(row).includes(row.step as Step) ? (row.step as Step) : firstStep(row));

/** A step's outcome: go on (with what to remember), or wait for the outside. */
type StepResult = { next: true; detail?: Record<string, unknown>; forget?: string[] } | { wait: string; detail?: Record<string, unknown> };

/** A failure no retry can mend; `code` picks the owner's message. */
class StepFailed extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

/** The apex of a hostname we register or connect ("www.pekarna.si" → "pekarna.si"). Second-level names only (.si, .com). */
export const apexOf = (hostname: string): string => hostname.split(".").slice(-2).join(".");

export interface ProvisionResult {
  status: "active" | "pending" | "failed" | "skipped";
  step: string;
  failure?: string | null;
}

/** Seconds before the n-th retry or re-check (n from 0): base · 2^n, at most max. */
export function backoffSeconds(config: AppConfig, n: number): number {
  const r = config.domains.retry;
  return Math.min(r.maxSeconds, r.baseSeconds * 2 ** Math.min(n, 20));
}

/**
 * One provisioning run for `hostname`: claims it (a run elsewhere, or a domain not due yet, is skipped
 * unless `force`), runs its steps as far as they go, and records where it stopped.
 */
export async function provisionDomain(deps: ProvisionDeps, hostname: string, opts: { force?: boolean } = {}): Promise<ProvisionResult> {
  const { repo, config } = deps;
  const domains = repo.domains;
  const now = deps.now ?? Date.now;
  let row = await domains.claim(hostname, config.domains.leaseSeconds, opts.force ?? false);
  if (!row) {
    const r = await domains.get(hostname);
    return { status: "skipped", step: r?.step ?? "", failure: r?.failure ?? null };
  }
  let step = currentStep(row);
  const detail = { ...row.detail };
  try {
    for (;;) {
      if (step === "live") {
        await goLive(deps, row);
        return { status: "active", step };
      }
      const since = typeof detail.stepSince === "string" ? Date.parse(detail.stepSince) : now();
      let result: StepResult;
      try {
        result = await runStep(deps, row, step, detail);
      } catch (e) {
        const permanent = e instanceof StepFailed || (e instanceof DomainProviderError && e.permanent);
        const code = e instanceof StepFailed ? e.code : e instanceof DomainProviderError && e.opts.code ? e.opts.code : step;
        const message = (e as Error).message.slice(0, 300);
        const attempts = row.attempts + 1;
        if (permanent || attempts >= config.domains.retry.maxAttempts) {
          await fail(deps, row, step, code, message, attempts);
          return { status: "failed", step, failure: code };
        }
        await domains.progress(hostname, { step, attempts, nextInSeconds: backoffSeconds(config, attempts - 1), detail: { lastError: message, stepSince: new Date(since).toISOString() } });
        await repo.addEvent({ siteId: row.site_id, stage: "domain", level: "warn", message: `${hostname}: ${step} failed (attempt ${attempts}), retrying: ${message}` });
        return { status: "pending", step };
      }
      if ("wait" in result) {
        const waits = typeof detail.waits === "number" ? detail.waits : 0;
        if (now() - since > waitLimitHours(config, step) * 3600_000) {
          await fail(deps, row, step, `${step}_timeout`, `${step} still waiting: ${result.wait}`, row.attempts);
          return { status: "failed", step, failure: `${step}_timeout` };
        }
        await domains.progress(hostname, { step, nextInSeconds: backoffSeconds(config, waits), detail: { ...result.detail, waits: waits + 1, waiting: result.wait, stepSince: new Date(since).toISOString() } });
        return { status: "pending", step };
      }
      const steps = stepsOf(row);
      const next = steps[steps.indexOf(step) + 1]!;
      Object.assign(detail, result.detail ?? {}, { stepSince: new Date(now()).toISOString(), waits: 0 });
      for (const k of result.forget ?? []) delete detail[k];
      await domains.progress(hostname, { step: next, attempts: 0, detail: { ...result.detail, stepSince: detail.stepSince, waits: 0 }, forget: [...(result.forget ?? []), "lastError", "waiting"] });
      // Keep holding it for the next step: the progress write let go of the lease.
      const again = await domains.claim(hostname, config.domains.leaseSeconds, true);
      if (!again) return { status: "pending", step: next };
      row = again;
      step = next;
    }
  } finally {
    await domains.release(hostname).catch(() => undefined);
  }
}

function waitLimitHours(config: AppConfig, step: Step): number {
  const w = config.domains.waitHours;
  return step === "dns" ? w.dns : step === "certificate" ? w.certificate : w.registration;
}

async function fail(deps: ProvisionDeps, row: SiteDomainRow, step: Step, code: string, message: string, attempts: number): Promise<void> {
  await deps.repo.domains.progress(row.hostname, { status: "failed", step, attempts, failure: code, nextInSeconds: null, detail: { lastError: message } });
  await deps.repo.addEvent({ siteId: row.site_id, stage: "domain", level: "error", message: `${row.hostname}: ${step} failed (${code}): ${message}` });
}

async function runStep(deps: ProvisionDeps, row: SiteDomainRow, step: Step, detail: Record<string, unknown>): Promise<StepResult> {
  const { registrar, edge, dns } = deps.providers;
  const host = row.hostname;
  switch (step) {
    case "contact": {
      if (typeof detail.ownerHandle === "string") return { next: true, forget: ["registrant"] };
      const registrant = detail.registrant as Registrant | undefined;
      if (!registrant) throw new StepFailed("refused", "no registrant details stored");
      const { handle } = await registrar.createContact(registrant);
      // The registrar holds the holder's details from now on; we keep only its handle.
      return { next: true, detail: { ownerHandle: handle }, forget: ["registrant"] };
    }
    case "zone": {
      if (typeof detail.zoneId === "string") return { next: true };
      const z = await edge.addZone(apexOf(host));
      return { next: true, detail: { zoneId: z.zoneId, nameservers: z.nameservers } };
    }
    case "register": {
      if (typeof detail.registrationId === "string") {
        const status = await registrar.registration(detail.registrationId);
        if (status === "failed") throw new StepFailed("registrar", "the registrar reports the registration failed");
        return status === "active" ? { next: true } : { wait: "registry" };
      }
      // Never pay more than config allows: the price is checked again right before buying.
      const tld = host.split(".").pop()!;
      const offer = deps.config.domains.tlds.find((t) => t.tld === tld);
      if (!offer) throw new StepFailed("price", `.${tld} is not offered`);
      const [check] = await registrar.check([host]);
      if (!check || !check.available) throw new StepFailed("unavailable", `${host} is no longer available`);
      if (check.premium || check.costEur === null || check.costEur > offer.maxCostEur) throw new StepFailed("price", `${host} costs ${check.costEur ?? "?"} € (at most ${offer.maxCostEur} €)`);
      const r = await registrar.register({ name: host, ownerHandle: String(detail.ownerHandle), years: deps.config.domains.registrationYears, nameservers: (detail.nameservers as string[] | undefined) ?? [] });
      if (r.status === "failed") throw new StepFailed("registrar", "the registrar refused the registration");
      return r.status === "active" ? { next: true, detail: { registrationId: r.id } } : { wait: "registry", detail: { registrationId: r.id } };
    }
    case "edge": {
      if (typeof detail.hostnameId === "string") return { next: true };
      const h = await edge.addHostname(host);
      return { next: true, detail: { hostnameId: h.id, target: edge.cnameTarget } };
    }
    case "dns": {
      const seen = await dns.cname(host);
      if (seen.includes(edge.cnameTarget.toLowerCase())) return { next: true, detail: { seen } };
      return { wait: "dns", detail: { seen } };
    }
    case "certificate": {
      if (row.kind === "registered") {
        const z = await edge.zone(String(detail.zoneId));
        if (z.certificate === "failed") throw new DomainProviderError("certificate failed", { code: "certificate" });
        return z.status === "active" && z.certificate === "active" ? { next: true } : { wait: z.status === "active" ? "certificate" : "delegation" };
      }
      const h = await edge.hostname(String(detail.hostnameId));
      if (h.status === "failed" || h.certificate === "failed") throw new DomainProviderError(`certificate failed: ${h.errors.join("; ").slice(0, 200)}`, { code: "certificate" });
      return h.status === "active" && h.certificate === "active" ? { next: true } : { wait: "certificate" };
    }
    case "live":
      return { next: true };
  }
}

/**
 * The last step: the hostname serves the site from now on (a registered domain's www too, redirecting
 * to it), the site is republished with this address, and the owner's email is due. A republish that
 * can't happen now (another publish running) is left to the address check, which retries it.
 */
async function goLive(deps: ProvisionDeps, row: SiteDomainRow): Promise<void> {
  const { repo } = deps;
  await repo.domains.progress(row.hostname, { status: "active", step: "live", attempts: 0, nextInSeconds: null, failure: null, notify: "pending", forget: ["lastError", "waiting", "waits"] });
  if (row.kind === "registered") {
    const www = `www.${row.hostname}`;
    const existing = await repo.domains.get(www);
    if (!existing) {
      await repo.domains.add(row.site_id, www, "registered");
      await repo.domains.progress(www, { status: "active", step: "live", detail: { redirectsTo: row.hostname } });
    }
  }
  await repo.addEvent({ siteId: row.site_id, stage: "domain", message: `${row.hostname} is live` });
  await republishForAddress(deps, row.site_id).catch((e: unknown) =>
    repo.addEvent({ siteId: row.site_id, stage: "domain", level: "warn", message: `Republish for ${row.hostname} postponed: ${(e as Error).message.slice(0, 200)}` }),
  );
}

/**
 * Republishes a published site whose address (siteAddress: its active primary domain, else
 * <slug>.<PLATFORM_DOMAIN>) differs from the one its live release carries, so canonical URLs, the sitemap
 * and the feed name the address it is now served at. The published version is republished, not the draft.
 */
export async function republishForAddress(deps: Pick<ProvisionDeps, "repo" | "storage" | "config" | "platformDomain">, siteId: string): Promise<"republished" | "unchanged" | "unpublished" | "busy" | "blocked"> {
  const site = await deps.repo.getSite(siteId);
  if (!site?.published_version) return "unpublished";
  const address = await siteAddress(deps.repo, siteId, site.slug, deps.platformDomain);
  if (address === (site.published_address ?? null)) return "unchanged";
  try {
    await publishSite({ repo: deps.repo, storage: deps.storage, config: deps.config, platformDomain: deps.platformDomain ?? null }, siteId, site.published_version);
  } catch (e) {
    if (e instanceof PublishBusyError) return "busy";
    if (e instanceof PublishBlockedError) {
      await deps.repo.addEvent({ siteId, stage: "publish", level: "warn", message: `Not republished for the address ${address ?? "(none)"}: the published version no longer passes the checklist (${e.blockers.slice(0, 3).join("; ")})` });
      return "blocked";
    }
    throw e;
  }
  return "republished";
}

/** Every published site whose address changed since its release (PLATFORM_DOMAIN set, a domain active or gone). */
export async function republishStaleAddresses(deps: Pick<ProvisionDeps, "repo" | "storage" | "config" | "platformDomain">): Promise<{ republished: string[]; busy: string[]; blocked: string[] }> {
  const out = { republished: [] as string[], busy: [] as string[], blocked: [] as string[] };
  for (const s of await deps.repo.publishedSites()) {
    const address = await siteAddress(deps.repo, s.id, s.slug, deps.platformDomain);
    if (address === s.published_address) continue;
    const r = await republishForAddress(deps, s.id).catch((e: unknown) => {
      console.error(`[domains] republish ${s.id}:`, (e as Error).message);
      return "busy" as const;
    });
    if (r === "republished" || r === "busy" || r === "blocked") out[r].push(s.id);
  }
  return out;
}

// ---------- Starting: suggestions, the holder's details, an own domain's records ----------

export interface DomainSuggestion {
  name: string;
  priceEurPerYear: number;
}

/** The business name and town domain names are made from (the site's facts, else the brief). */
function nameAndTown(spec: SiteSpec | null, site: { name: string; brief: unknown }): { name: string; town: string | null } {
  const brief = (site.brief ?? {}) as { name?: string; town?: string | null };
  const address = spec && !isPlaceholder(spec.business.address) ? spec.business.address : null;
  return { name: spec?.business.name || brief.name || site.name, town: address?.city ?? brief.town ?? null };
}

/**
 * Names to offer for a site, best first: from the business name (domain-names.ts), asked at the
 * registrar, only available ones that aren't premium and cost us at most the TLD's `maxCostEur`, with
 * the price the owner is shown from config.
 */
export async function domainSuggestions(deps: Pick<ProvisionDeps, "repo" | "config" | "providers">, siteId: string): Promise<DomainSuggestion[]> {
  const site = await deps.repo.getSite(siteId);
  if (!site) return [];
  const spec = (await deps.repo.getSpec(siteId))?.spec ?? null;
  const { name, town } = nameAndTown(spec, site);
  const tlds = deps.config.domains.tlds;
  const names = suggestDomains(name, { tlds: tlds.map((t) => t.tld), town, limit: deps.config.domains.suggestions.check });
  if (!names.length) return [];
  const checks = await deps.providers.registrar.check(names);
  const byName = new Map(checks.map((c) => [c.name, c]));
  const out: DomainSuggestion[] = [];
  for (const n of names) {
    const c = byName.get(n);
    const offer = tlds.find((t) => n.endsWith(`.${t.tld}`));
    if (!c || !offer || !c.available || c.premium || c.costEur === null || c.costEur > offer.maxCostEur) continue;
    out.push({ name: n, priceEurPerYear: offer.priceEurPerYear });
    if (out.length >= deps.config.domains.suggestions.show) break;
  }
  return out;
}

/** The holder's details the owner can correct before registering, and which of them are still missing. */
export type RegistrantDraft = Partial<Registrant>;
export const REGISTRANT_FIELDS = ["firstName", "lastName", "companyName", "street", "postalCode", "city", "country", "phone", "email"] as const;

/** Slovene names of the holder's fields, for the confirm sheet and refusals. */
export const REGISTRANT_LABEL: Record<(typeof REGISTRANT_FIELDS)[number], string> = {
  firstName: "Ime",
  lastName: "Priimek",
  companyName: "Podjetje",
  street: "Ulica in hišna številka",
  postalCode: "Poštna številka",
  city: "Kraj",
  country: "Država",
  phone: "Telefon",
  email: "E-pošta",
};

const COMPANY = /\b(d\.?\s?o\.?\s?o|d\.?\s?d|k\.?\s?d|d\.?\s?n\.?\s?o|zavod|društvo|zadruga|so\.?\s?p)\b\.?/i;
/** An s.p.'s legal name carries its holder's name and surname, right before "s.p." (ZGD-1). */
const SOLE_TRADER = /(\p{Lu}[\p{Ll}'’]+)\s+(\p{Lu}[\p{Ll}'’]+(?:-\p{Lu}[\p{Ll}'’]+)?)\s*,?\s*s\.\s?p\.?\s*$/u;

/**
 * The holder's details from the site's own facts (never invented): the legal name decides person (s.p.,
 * whose name it carries) or company, then address, phone and e-mail (the business's, else the account's).
 * The owner sees them prefilled, corrects them, and fills in what is missing.
 */
export function registrantFromSpec(spec: SiteSpec, accountEmail: string | null): RegistrantDraft {
  const b = spec.business;
  const out: RegistrantDraft = {};
  const legal = isPlaceholder(b.provider.legalName) ? null : String(b.provider.legalName).trim();
  if (legal && COMPANY.test(legal)) {
    out.kind = "company";
    out.companyName = legal;
  } else if (legal) {
    const m = SOLE_TRADER.exec(legal);
    out.kind = "person";
    if (m) {
      out.firstName = m[1]!;
      out.lastName = m[2]!;
    }
  }
  if (!isPlaceholder(b.address)) {
    out.street = b.address.street;
    out.postalCode = b.address.postalCode;
    out.city = b.address.city;
    if (!b.address.country || /^slovenij|^slovenia$|^si$/i.test(b.address.country.trim())) out.country = "SI";
  }
  if (!isPlaceholder(b.phone)) out.phone = b.phone;
  const email = !isPlaceholder(b.email) ? b.email : accountEmail;
  if (email) out.email = email;
  return out;
}

/** The fields a registration still needs, in form order (empty when it can go). */
export function registrantMissing(r: RegistrantDraft): (typeof REGISTRANT_FIELDS)[number][] {
  const bad: (typeof REGISTRANT_FIELDS)[number][] = [];
  const text = (v: unknown, max: number) => typeof v === "string" && v.trim().length > 0 && v.trim().length <= max;
  if (!text(r.firstName, 60)) bad.push("firstName");
  if (!text(r.lastName, 60)) bad.push("lastName");
  if (r.kind === "company" && !text(r.companyName, 120)) bad.push("companyName");
  if (!text(r.street, 80)) bad.push("street");
  if (!(typeof r.postalCode === "string" && (r.country === "SI" ? /^\d{4}$/.test(r.postalCode) : text(r.postalCode, 12)))) bad.push("postalCode");
  if (!text(r.city, 40)) bad.push("city");
  if (!(typeof r.country === "string" && /^[A-Z]{2}$/.test(r.country))) bad.push("country");
  if (!(typeof r.phone === "string" && /^\+\d{8,15}$/.test(r.phone))) bad.push("phone");
  if (!(typeof r.email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email) && r.email.length <= 120)) bad.push("email");
  return bad;
}

/** Cleans what the browser sent: known fields only, trimmed strings, a phone in E.164 (spaces dropped, 0… → +386…). */
export function cleanRegistrant(input: unknown): RegistrantDraft {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const out: RegistrantDraft = {};
  out.kind = o.kind === "company" ? "company" : "person";
  for (const k of REGISTRANT_FIELDS) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) (out as Record<string, string>)[k] = v.trim().slice(0, 200);
  }
  if (out.phone) {
    const digits = out.phone.replace(/[\s/().-]/g, "");
    out.phone = digits.startsWith("00") ? `+${digits.slice(2)}` : digits.startsWith("0") ? `+386${digits.slice(1)}` : digits;
  }
  if (out.country) out.country = out.country.toUpperCase();
  if (out.kind !== "company") delete out.companyName;
  return out;
}

/** What the owner adds at their DNS host to connect a domain they already have. */
export interface OwnDomainPlan {
  /** The hostname that will serve the site ("www.pekarna.si"). */
  hostname: string;
  apex: string;
  /** The one record to add: a CNAME on `name` (relative to the apex). */
  record: { type: "CNAME"; name: string; value: string };
  /** Who hosts the domain's DNS, when we recognise them from its nameservers. */
  dnsHost: string | null;
  /** The domain receives email (MX records): we say they stay as they are. */
  hasMail: boolean;
  /** The record is in place already. */
  pointing: boolean;
}

export class OwnDomainError extends Error {}

/**
 * The plan for an owner's own domain: "pekarna.si" or "www.pekarna.si" becomes www.pekarna.si (an apex
 * can't carry a CNAME next to its MX records, so the site lives on www and the owner's email is never
 * touched); another subdomain ("trgovina.pekarna.si") is connected as it is. DNS is only read.
 */
export async function planOwnDomain(deps: Pick<ProvisionDeps, "providers">, input: string, opts: { refuse?: readonly string[] } = {}): Promise<OwnDomainPlan> {
  const raw = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const host = normaliseHostname(raw);
  if (!host) throw new OwnDomainError("To ni veljavno ime domene. Vpišite ga takole: vasepodjetje.si");
  const labels = host.split(".");
  const hostname = labels.length === 2 ? `www.${host}` : host;
  const apex = apexOf(hostname);
  if (opts.refuse?.some((r) => hostname === r || hostname.endsWith(`.${r}`))) throw new OwnDomainError("Te domene ni mogoče povezati.");
  const { dns, edge } = deps.providers;
  const [ns, mx, cname] = await Promise.all([dns.ns(apex), dns.mx(apex), dns.cname(hostname)]);
  const target = edge.cnameTarget.toLowerCase();
  return {
    hostname,
    apex,
    record: { type: "CNAME", name: hostname.slice(0, -apex.length - 1), value: target },
    dnsHost: detectDnsHost(ns),
    hasMail: mx.length > 0,
    pointing: cname.includes(target),
  };
}

export class DomainStartError extends Error {}

/**
 * Starts provisioning: a registered name (checked again at the registrar, the holder's details complete)
 * or the owner's own domain (planOwnDomain). One domain per site; a failed one is replaced. The caller
 * queues the job (it is also due for the worker's sweep).
 */
export async function startDomain(
  deps: Pick<ProvisionDeps, "repo" | "config" | "providers">,
  siteId: string,
  input: { kind: "registered"; hostname: string; registrant: RegistrantDraft } | { kind: "connected"; hostname: string; refuse?: readonly string[] },
): Promise<SiteDomainRow> {
  const existing = await deps.repo.domains.forSite(siteId);
  if (existing.some((d) => d.status !== "failed")) throw new DomainStartError("Stran že ima domeno.");
  let hostname: string;
  let detail: Record<string, unknown>;
  if (input.kind === "registered") {
    const host = normaliseHostname(input.hostname);
    const tld = host?.split(".").pop();
    const offer = deps.config.domains.tlds.find((t) => t.tld === tld);
    if (!host || host.split(".").length !== 2 || !offer) throw new DomainStartError("Te domene ne moremo registrirati.");
    const missing = registrantMissing(input.registrant);
    if (missing.length) throw new DomainStartError(`Za registracijo manjka še: ${missing.map((k) => REGISTRANT_LABEL[k].toLowerCase()).join(", ")}.`);
    const [check] = await deps.providers.registrar.check([host]);
    if (!check?.available) throw new DomainStartError(`Domena ${host} je zasedena. Izberite drugo ime.`);
    if (check.premium || check.costEur === null || check.costEur > offer.maxCostEur) throw new DomainStartError(`Domene ${host} ne ponujamo. Izberite drugo ime.`);
    hostname = host;
    detail = { registrant: input.registrant, priceEurPerYear: offer.priceEurPerYear };
  } else {
    const plan = await planOwnDomain(deps, input.hostname, input.refuse ? { refuse: input.refuse } : {});
    const taken = await deps.repo.domains.get(plan.hostname);
    if (taken && taken.site_id !== siteId) throw new DomainStartError("Ta domena je že povezana z drugo stranjo.");
    hostname = plan.hostname;
    detail = { record: plan.record, dnsHost: plan.dnsHost, hasMail: plan.hasMail };
  }
  for (const d of existing) await deps.repo.domains.remove(d.hostname);
  const row = await deps.repo.domains.start(siteId, hostname, input.kind, detail);
  await deps.repo.addEvent({ siteId, stage: "domain", message: `${hostname}: ${input.kind === "registered" ? "registration" : "connection"} started` });
  return row;
}

// ---------- What the owner reads ----------

export interface DomainState {
  hostname: string;
  kind: "registered" | "connected";
  status: "pending" | "active" | "failed";
  primary: boolean;
  /** The three stages, in Slovene, and where provisioning is. */
  stages: { label: string; state: "done" | "current" | "todo" }[];
  /** One line: "Registriramo…", "Varujemo povezavo…", "Objavljeno". */
  label: string;
  /** What went wrong and what to do, in Slovene (failed only). */
  message: string | null;
  /** For a connected domain still waiting: the record to add, the DNS host, whether it receives email. */
  connect: { record: { type: string; name: string; value: string }; dnsHost: string | null; hasMail: boolean; seen: string[] } | null;
  /** https://… once active. */
  url: string | null;
}

const FAILURE: Record<string, (h: string, c: AppConfig) => string> = {
  unavailable: (h) => `Domena ${h} je medtem postala zasedena, zato je nismo registrirali. Izberite drugo ime.`,
  price: (h) => `Cena domene ${h} se je pri registrarju spremenila, zato je nismo registrirali. Izberite drugo ime.`,
  refused: () => "Registrar podatkov imetnika domene ni sprejel. Preverite ime, naslov, telefon in e-pošto ter poskusite znova.",
  registrar: (h) => `Registracija domene ${h} ni uspela. Poskusite znova; če se ponovi, izberite drugo ime.`,
  register_timeout: (h) => `Registracija domene ${h} ni bila končana v pričakovanem času. Poskusite znova.`,
  dns_timeout: (h, c) => `Zapisa DNS za ${h} v ${Math.round(c.domains.waitHours.dns / 24)} dneh nismo videli, zato smo povezovanje ustavili. Preverite zapis pri ponudniku DNS in tapnite »Poskusi znova«.`,
  certificate: (h) => `Varne povezave (HTTPS) za ${h} nismo mogli vzpostaviti. Poskusite znova čez nekaj minut.`,
  certificate_timeout: (h) => `Varne povezave (HTTPS) za ${h} nismo mogli vzpostaviti v pričakovanem času. Poskusite znova.`,
};
const FAILURE_DEFAULT = (h: string) => `Povezave domene ${h} nismo mogli dokončati, čeprav smo poskusili večkrat. Poskusite znova pozneje.`;

/** A domain's status for the owner, in Slovene. */
export function domainState(row: SiteDomainRow, config: AppConfig): DomainState {
  const registered = row.kind === "registered";
  const names = registered ? ["Registriramo domeno", "Varujemo povezavo", "Objavljeno"] : ["Čakamo na vaš zapis DNS", "Varujemo povezavo", "Objavljeno"];
  const step = row.status === "active" ? "live" : currentStep(row);
  const at = step === "live" ? (row.status === "active" ? 3 : 1) : step === "certificate" ? 1 : 0;
  const stages = names.map((label, i) => ({ label, state: (i < at ? "done" : i === at ? "current" : "todo") as "done" | "current" | "todo" }));
  if (row.status === "active") stages[2]!.state = "done";
  const label = row.status === "active" ? "Objavljeno" : row.status === "failed" ? "Ni uspelo" : at === 0 ? (registered ? "Registriramo…" : "Čakamo na zapis DNS…") : "Varujemo povezavo…";
  const d = row.detail;
  const record = d.record as { type: string; name: string; value: string } | undefined;
  return {
    hostname: row.hostname,
    kind: row.kind,
    status: row.status,
    primary: row.is_primary,
    stages,
    label,
    message: row.status === "failed" ? (FAILURE[row.failure ?? ""] ?? FAILURE_DEFAULT)(row.hostname, config) : null,
    connect: !registered && row.status !== "active" && record ? { record, dnsHost: (d.dnsHost as string | null) ?? null, hasMail: d.hasMail === true, seen: (d.seen as string[] | undefined) ?? [] } : null,
    url: row.status === "active" ? `https://${row.hostname}/` : null,
  };
}
