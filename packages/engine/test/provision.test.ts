import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, type AppConfig } from "@sb/config";
import { Repo, createDb, createFsStorage, fakeDns, fakeEdge, fakeRegistrar, migrate, type DomainProviders, type Storage } from "@sb/platform";
import { migrateSpec, type SiteSpec } from "@sb/spec";
import { fillPlaceholderOps } from "../../../tools/eval/src/placeholder-fill.ts";
import {
  backoffSeconds,
  domainState,
  domainSuggestions,
  livePointerKey,
  planOwnDomain,
  provisionDomain,
  publishSite,
  publishedBase,
  registrantFromSpec,
  registrantMissing,
  republishForAddress,
  republishStaleAddresses,
  startDomain,
  DomainStartError,
  OwnDomainError,
  type RegistrantDraft,
} from "../src/index.ts";

/**
 * Provisioning a site's own domain against the fake registrar, edge and DNS (no network): every step,
 * retries with backoff, waiting and its time limit, failures worded for the owner, resuming after a run
 * was cut off, and the republish with the new address when the domain goes live.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
let repo: Repo;
let storage: Storage;
let dir: string;
let golden: SiteSpec;
let description: string;
const base = loadConfig();
const config: AppConfig = {
  ...base,
  domains: { ...base.domains, enabled: true, retry: { baseSeconds: 30, maxSeconds: 600, maxAttempts: 3 }, waitHours: { registration: 48, dns: 72, certificate: 24 } },
};

const REGISTRANT: RegistrantDraft = { kind: "company", companyName: "Računovodstvo Seliškar d.o.o.", firstName: "Maja", lastName: "Seliškar", street: "Testna ulica 1", postalCode: "1000", city: "Ljubljana", country: "SI", phone: "+38640123456", email: "info@primer.si" };

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sb-provision-"));
  const db = await createDb("pglite://memory");
  await migrate(db);
  repo = new Repo(db);
  storage = createFsStorage(dir);
  golden = migrateSpec(JSON.parse(await readFile(path.join(here, "../../../tools/eval/golden/racunovodstvo-seliskar.json"), "utf8"))) as SiteSpec;
  description = (JSON.parse(await readFile(path.join(here, "../../../tools/eval/fixtures/racunovodstvo-seliskar/brief.json"), "utf8")) as { description: string }).description;
}, 60_000);
afterAll(async () => {
  await repo.db.close();
  await rm(dir, { recursive: true, force: true });
});

let n = 0;
/** A site with the accountant's golden spec, its placeholders filled in by the owner; published unless told otherwise. */
async function site(o: { publish?: boolean; platformDomain?: string | null } = {}): Promise<{ id: string; slug: string }> {
  const slug = `racunovodstvo-${++n}`;
  const s = await repo.createSite({ name: "Računovodstvo Seliškar", slug, intake: { description, photoAssetIds: [], scope: "full" } });
  const spec = structuredClone(golden);
  spec.slug = slug;
  await repo.saveSpec(s.id, spec, "generate");
  const ops = fillPlaceholderOps(spec);
  const filled = structuredClone(spec) as unknown as Record<string, unknown>;
  for (const op of ops) setPointer(filled, op.path, op.value);
  await repo.saveSpec(s.id, filled as unknown as SiteSpec, "manual", "facts", ops);
  if (o.publish !== false) await publishSite({ repo, storage, config, platformDomain: o.platformDomain ?? null }, s.id);
  return { id: s.id, slug };
}

function setPointer(obj: Record<string, unknown>, pointer: string, value: unknown): void {
  const parts = pointer.split("/").slice(1).map((p) => p.replace(/~1/g, "/").replace(/~0/g, "~"));
  let at: Record<string, unknown> = obj;
  for (const p of parts.slice(0, -1)) at = at[p] as Record<string, unknown>;
  at[parts.at(-1)!] = value;
}

const providers = (o: { registrar?: Parameters<typeof fakeRegistrar>[0]; edge?: Parameters<typeof fakeEdge>[0]; dns?: ReturnType<typeof fakeDns> } = {}) => {
  const edge = fakeEdge(o.edge);
  return { registrar: fakeRegistrar(o.registrar), edge, dns: o.dns ?? fakeDns() } satisfies DomainProviders;
};
const deps = (p: DomainProviders, extra: { now?: () => number; platformDomain?: string | null } = {}) => ({ repo, storage, config, providers: p, ...extra });

const sitemap = async (slug: string) => new TextDecoder().decode((await storage.get(`${await publishedBase(storage, slug)}sitemap.xml`)) ?? new Uint8Array());
const homepage = async (slug: string) => new TextDecoder().decode((await storage.get(`${await publishedBase(storage, slug)}index.html`)) ?? new Uint8Array());

describe("a domain we register for the owner", () => {
  it("runs contact → zone → register → certificate → live, republishes with the new address, and leaves the email due", async () => {
    const s = await site();
    expect(await sitemap(s.slug)).toBe("");
    const p = providers();
    const row = await startDomain(deps(p), s.id, { kind: "registered", hostname: "seliskar-racunovodstvo.si", registrant: REGISTRANT });
    expect(row.status).toBe("pending");
    const r = await provisionDomain(deps(p), row.hostname);
    expect(r).toMatchObject({ status: "active", step: "live" });
    expect(p.registrar.calls.map((c) => c.method)).toEqual(["check", "createContact", "check", "register"]);
    expect(p.edge.calls.map((c) => c.method)).toEqual(["addZone", "zone"]);
    // Registered with our edge's nameservers and the holder's handle.
    expect(p.registrar.calls.find((c) => c.method === "register")!.args[0]).toMatchObject({ name: "seliskar-racunovodstvo.si", ownerHandle: expect.stringMatching(/^FK/), years: 1, nameservers: ["ana.ns.stranko.example", "bor.ns.stranko.example"] });
    const done = (await repo.domains.get(row.hostname))!;
    expect(done).toMatchObject({ status: "active", step: "live", is_primary: true, notify: "pending", failure: null, next_at: null });
    // The holder's personal details went to the registrar; we keep only its handle.
    expect(done.detail.registrant).toBeUndefined();
    expect(done.detail.ownerHandle).toMatch(/^FK/);
    // www redirects to it.
    expect(await repo.domains.get("www.seliskar-racunovodstvo.si")).toMatchObject({ status: "active", is_primary: false });
    // Republished: canonical URL and sitemap carry the domain.
    const after = (await repo.getSite(s.id))!;
    expect(after.published_address).toBe("https://seliskar-racunovodstvo.si/");
    expect(await sitemap(s.slug)).toContain("<loc>https://seliskar-racunovodstvo.si/</loc>");
    expect(await homepage(s.slug)).toContain('<link rel="canonical" href="https://seliskar-racunovodstvo.si/"');
    expect(domainState(done, config)).toMatchObject({ label: "Objavljeno", url: "https://seliskar-racunovodstvo.si/", message: null, stages: [{ state: "done" }, { state: "done" }, { state: "done" }] });
  });

  it("retries a failed step with backoff, then goes on from that step (no second contact or zone)", async () => {
    const s = await site();
    const p = providers({ registrar: { script: { register: { fail: 2 } } } });
    const row = await startDomain(deps(p), s.id, { kind: "registered", hostname: "seliskar-ponovno.si", registrant: REGISTRANT });
    const first = await provisionDomain(deps(p), row.hostname);
    expect(first).toEqual({ status: "pending", step: "register" });
    let r = (await repo.domains.get(row.hostname))!;
    expect(r).toMatchObject({ attempts: 1, step: "register", status: "pending" });
    expect(String(r.detail.lastError)).toMatch(/temporary failure/);
    // Not due yet: a run without force skips it.
    expect((await provisionDomain(deps(p), row.hostname)).status).toBe("skipped");
    const nextIn = (Date.parse(r.next_at!) - Date.now()) / 1000;
    expect(nextIn).toBeGreaterThan(backoffSeconds(config, 0) - 5);
    expect(nextIn).toBeLessThanOrEqual(backoffSeconds(config, 0) + 1);
    expect(await provisionDomain(deps(p), row.hostname, { force: true })).toEqual({ status: "pending", step: "register" });
    r = (await repo.domains.get(row.hostname))!;
    expect(r.attempts).toBe(2);
    expect((Date.parse(r.next_at!) - Date.now()) / 1000).toBeGreaterThan(backoffSeconds(config, 1) - 5);
    expect((await provisionDomain(deps(p), row.hostname, { force: true })).status).toBe("active");
    expect(p.registrar.calls.filter((c) => c.method === "createContact")).toHaveLength(1);
    expect(p.edge.calls.filter((c) => c.method === "addZone")).toHaveLength(1);
  });

  it("gives up after maxAttempts and words the failure for the owner", async () => {
    const s = await site();
    const p = providers({ edge: { script: { addZone: { fail: 99 } } } });
    const row = await startDomain(deps(p), s.id, { kind: "registered", hostname: "seliskar-zone.si", registrant: REGISTRANT });
    for (let i = 0; i < 2; i++) expect((await provisionDomain(deps(p), row.hostname, { force: true })).status).toBe("pending");
    expect(await provisionDomain(deps(p), row.hostname, { force: true })).toMatchObject({ status: "failed", step: "zone", failure: "zone" });
    const r = (await repo.domains.get(row.hostname))!;
    expect(r).toMatchObject({ status: "failed", attempts: 3, next_at: null });
    const st = domainState(r, config);
    expect(st.label).toBe("Ni uspelo");
    expect(st.message).toMatch(/^Povezave domene seliskar-zone\.si nismo mogli dokončati/);
    expect(st.chooseAnother).toBe(false);
    // Failed: the sweep never picks it up, a run skips it, "Poskusi znova" starts that step again.
    expect(await repo.domains.due()).not.toContain(row.hostname);
    expect((await provisionDomain(deps(p), row.hostname, { force: true })).status).toBe("skipped");
    expect(await repo.domains.retry(row.hostname)).toBe(true);
    expect((await repo.domains.get(row.hostname))!).toMatchObject({ status: "pending", attempts: 0, failure: null, step: "zone" });
  });

  it("fails at once when the name was taken meanwhile, without paying", async () => {
    const s = await site();
    const p = providers();
    const row = await startDomain(deps(p), s.id, { kind: "registered", hostname: "seliskar-prosta.si", registrant: REGISTRANT });
    // Someone else registers it between the owner's choice and our run.
    const taken = providers({ registrar: { taken: [row.hostname] } });
    const r = await provisionDomain(deps(taken), row.hostname);
    expect(r).toMatchObject({ status: "failed", step: "register", failure: "unavailable" });
    expect(taken.registrar.calls.map((c) => c.method)).not.toContain("register");
    const st = domainState((await repo.domains.get(row.hostname))!, config);
    expect(st.message).toBe("Domena seliskar-prosta.si je medtem postala zasedena, zato je nismo registrirali. Izberite drugo ime.");
    expect(st).toMatchObject({ failure: "unavailable", chooseAnother: true });
  });

  it("never pays more than the TLD's maxCostEur (the price is checked again right before registering)", async () => {
    const s = await site();
    const row = await startDomain(deps(providers()), s.id, { kind: "registered", hostname: "seliskar-draga.si", registrant: REGISTRANT });
    const dear = providers({ registrar: { costEur: { si: config.domains.tlds[0]!.maxCostEur + 5 } } });
    expect(await provisionDomain(deps(dear), row.hostname)).toMatchObject({ status: "failed", failure: "price" });
    expect(dear.registrar.calls.map((c) => c.method)).not.toContain("register");
  });

  it("waits while the registry processes the registration, then fails once waitHours.registration has passed", async () => {
    const s = await site();
    let now = Date.now();
    const p = providers({ registrar: { script: { register: { pending: 1 }, registration: { pending: 100 } } } });
    const row = await startDomain(deps(p), s.id, { kind: "registered", hostname: "seliskar-registry.si", registrant: REGISTRANT });
    const d = deps(p, { now: () => now });
    expect(await provisionDomain(d, row.hostname)).toEqual({ status: "pending", step: "register" });
    const r = (await repo.domains.get(row.hostname))!;
    expect(r).toMatchObject({ attempts: 0, step: "register" });
    expect(r.detail).toMatchObject({ registrationId: "fake-seliskar-registry.si", waiting: "registry", waits: 1 });
    expect(domainState(r, config).label).toBe("Registriramo…");
    now += 3600_000;
    expect((await provisionDomain(d, row.hostname, { force: true })).status).toBe("pending");
    // Asked again with the stored id, never registered twice.
    expect(p.registrar.calls.filter((c) => c.method === "register")).toHaveLength(1);
    now += 48 * 3600_000;
    expect(await provisionDomain(d, row.hostname, { force: true })).toMatchObject({ status: "failed", failure: "register_timeout" });
    const st = domainState((await repo.domains.get(row.hostname))!, config);
    expect(st.message).toMatch(/ni bila končana v pričakovanem času/);
    // The name may be bought already: no "choose another", only "try again".
    expect(st.chooseAnother).toBe(false);
  });

  it("resumes a run that was cut off: a lease left by a dead process expires, the step runs again", async () => {
    const s = await site();
    const p = providers();
    const row = await startDomain(deps(p), s.id, { kind: "registered", hostname: "seliskar-prekinjena.si", registrant: REGISTRANT });
    // A process took it and died (lease still running): nobody else runs it meanwhile.
    expect(await repo.domains.claim(row.hostname, 300)).not.toBeNull();
    expect((await provisionDomain(deps(p), row.hostname, { force: true })).status).toBe("skipped");
    expect(await repo.domains.due()).not.toContain(row.hostname);
    // Its lease runs out.
    await repo.db.query("update site_domains set lease_until = now() - interval '1 second' where hostname = $1", [row.hostname]);
    expect(await repo.domains.due()).toContain(row.hostname);
    expect((await provisionDomain(deps(p), row.hostname)).status).toBe("active");
  });

  it("a run cut off after the registrar registered the name, before the progress write: the retry adopts it", async () => {
    const s = await site();
    const p = providers();
    const row = await startDomain(deps(p), s.id, { kind: "registered", hostname: "seliskar-odrezana.si", registrant: REGISTRANT });
    // The process dies right after register() answered: the step's progress write never happens.
    const progress = repo.domains.progress.bind(repo.domains);
    const spy = vi.spyOn(repo.domains, "progress").mockImplementation(async (h, change) => {
      if (h === row.hostname && change.step === "certificate") throw new Error("worker died");
      return progress(h, change);
    });
    try {
      await expect(provisionDomain(deps(p), row.hostname)).rejects.toThrow("worker died");
    } finally {
      spy.mockRestore();
    }
    expect(p.registrar.registered.get(row.hostname)).toBe("fake-seliskar-odrezana.si");
    let r = (await repo.domains.get(row.hostname))!;
    expect(r).toMatchObject({ status: "pending", step: "register" });
    expect(r.detail.registrationId).toBeUndefined();
    expect(typeof r.detail.registering).toBe("string");
    // Even failed now, it would never offer another name: it may be bought.
    expect(domainState({ ...r, status: "failed", failure: "unavailable" }, config).chooseAnother).toBe(false);
    // The next run asks the registrar, finds the name in our account and goes on: one registration, live.
    expect(await provisionDomain(deps(p), row.hostname, { force: true })).toMatchObject({ status: "active", step: "live" });
    expect(p.registrar.calls.filter((c) => c.method === "register")).toHaveLength(1);
    expect(p.registrar.calls.filter((c) => c.method === "lookup")).toHaveLength(1);
    expect(p.registrar.registered.size).toBe(1);
    r = (await repo.domains.get(row.hostname))!;
    expect(r).toMatchObject({ status: "active", failure: null });
    expect(r.detail.registrationId).toBe("fake-seliskar-odrezana.si");
    // The id replaced the attempt marker.
    expect(r.detail.registering).toBeNull();
  });

  it("a registrar timeout after the name was registered: retried, found in our account, never bought twice", async () => {
    const s = await site();
    const p = providers({ registrar: { script: { register: { lose: 1 } } } });
    const row = await startDomain(deps(p), s.id, { kind: "registered", hostname: "seliskar-casovna.si", registrant: REGISTRANT });
    expect(await provisionDomain(deps(p), row.hostname)).toEqual({ status: "pending", step: "register" });
    expect(p.registrar.registered.has(row.hostname)).toBe(true);
    const r = (await repo.domains.get(row.hostname))!;
    expect(r).toMatchObject({ attempts: 1, step: "register" });
    expect(String(r.detail.lastError)).toMatch(/no answer/);
    expect(domainState(r, config).chooseAnother).toBe(false);
    expect(await provisionDomain(deps(p), row.hostname, { force: true })).toMatchObject({ status: "active" });
    expect(p.registrar.calls.filter((c) => c.method === "register")).toHaveLength(1);
    // The name is unavailable at the registry now (it is ours), yet it was never treated as taken.
    expect((await repo.domains.get(row.hostname))!.failure).toBeNull();
  });

  it("after an unanswered attempt a name the registrar doesn't list as ours is not called taken: retried, then 'try again'", async () => {
    const s = await site();
    // The attempt's answer was lost before the registrar did anything.
    const p = providers({ registrar: { script: { register: { fail: 1 } } } });
    const row = await startDomain(deps(p), s.id, { kind: "registered", hostname: "seliskar-nejasna.si", registrant: REGISTRANT });
    expect((await provisionDomain(deps(p), row.hostname)).status).toBe("pending");
    // Meanwhile the registry shows the name as taken and our account doesn't (yet) list it.
    const taken = providers({ registrar: { taken: [row.hostname] } });
    expect((await provisionDomain(deps(taken), row.hostname, { force: true })).status).toBe("pending");
    expect(await provisionDomain(deps(taken), row.hostname, { force: true })).toMatchObject({ status: "failed", failure: "register_unconfirmed" });
    expect(taken.registrar.calls.map((c) => c.method)).not.toContain("register");
    const st = domainState((await repo.domains.get(row.hostname))!, config);
    expect(st).toMatchObject({ failure: "register_unconfirmed", chooseAnother: false });
    expect(st.message).toBe("Registracije domene seliskar-nejasna.si pri registrarju še nismo mogli potrditi. Poskusite znova čez nekaj minut.");
    // And the owner can't replace it with another name.
    await expect(startDomain(deps(taken), s.id, { kind: "registered", hostname: "seliskar-druga-izbira.si", registrant: REGISTRANT })).rejects.toThrow(/morda že uspela/);
  });

  it("a run whose lease ran out never clears the lease of the run that took over", async () => {
    const s = await site();
    const p = providers();
    let takeover: (() => Promise<void>) | null = null;
    const slow: DomainProviders = {
      ...p,
      edge: {
        ...p.edge,
        addZone: async (d: string) => {
          await takeover?.();
          return p.edge.addZone(d);
        },
      },
    };
    const row = await startDomain(deps(p), s.id, { kind: "registered", hostname: "seliskar-zakup.si", registrant: REGISTRANT });
    let second: string | null = null;
    // While the first run waits on the edge, its lease runs out and a second run claims the domain.
    takeover = async () => {
      takeover = null;
      await repo.db.query("update site_domains set lease_until = now() - interval '1 second' where hostname = $1", [row.hostname]);
      second = (await repo.domains.claim(row.hostname, 300, true))!.lease;
    };
    expect(await provisionDomain(deps(slow), row.hostname)).toEqual({ status: "pending", step: "register" });
    expect(second).not.toBeNull();
    // The first run's progress write and its finally left the second run's lease in place.
    const r = (await repo.domains.get(row.hostname))!;
    expect(r.lease_until).not.toBeNull();
    expect((await repo.domains.claim(row.hostname, 300, true))).toBeNull();
    expect((await provisionDomain(deps(p), row.hostname, { force: true })).status).toBe("skipped");
    // The second run lets go of its own lease.
    await repo.domains.release(row.hostname, second!);
    expect((await repo.domains.get(row.hostname))!.lease_until).toBeNull();
  });

  it("goes live even when the republish has to wait for another publish; the address check republishes later", async () => {
    const s = await site();
    const p = providers();
    const row = await startDomain(deps(p), s.id, { kind: "registered", hostname: "seliskar-objavljanje.si", registrant: REGISTRANT });
    expect(await repo.claimPublish(s.id)).toBe(true);
    expect((await provisionDomain(deps(p), row.hostname)).status).toBe("active");
    expect((await repo.getSite(s.id))!.published_address).toBeNull();
    await repo.releasePublish(s.id);
    const r = await republishStaleAddresses({ repo, storage, config });
    expect(r.republished).toContain(s.id);
    expect((await repo.getSite(s.id))!.published_address).toBe(`https://${row.hostname}/`);
  });
});

describe("a domain the owner already has", () => {
  it("adds the custom hostname, waits for the owner's CNAME, then the certificate, then goes live", async () => {
    const s = await site();
    const now = Date.now();
    const dns = fakeDns({ ns: { "seliskar.si": ["ns1.neoserv.si", "ns2.neoserv.si"] }, mx: { "seliskar.si": ["mx.seliskar.si"] } });
    const p = providers({ dns, edge: { cnameTarget: "povezava.stranko.example", script: { hostname: { pending: 1 } } } });
    const plan = await planOwnDomain({ providers: p }, "https://Seliskar.si/");
    expect(plan).toEqual({ hostname: "www.seliskar.si", apex: "seliskar.si", record: { type: "CNAME", name: "www", value: "povezava.stranko.example" }, dnsHost: "Neoserv", hasMail: true, pointing: false });
    const row = await startDomain(deps(p), s.id, { kind: "connected", hostname: "seliskar.si" });
    expect(row.hostname).toBe("www.seliskar.si");
    const d = deps(p, { now: () => now });
    expect(await provisionDomain(d, row.hostname)).toEqual({ status: "pending", step: "dns" });
    let st = domainState((await repo.domains.get(row.hostname))!, config);
    expect(st.label).toBe("Čakamo na zapis DNS…");
    expect(st.connect).toEqual({ record: plan.record, dnsHost: "Neoserv", hasMail: true, seen: [] });
    // The owner adds the record; their MX stays as it was (we only ever read DNS).
    dns.records.cname!["www.seliskar.si"] = ["povezava.stranko.example"];
    expect(await provisionDomain(d, row.hostname, { force: true })).toEqual({ status: "pending", step: "certificate" });
    st = domainState((await repo.domains.get(row.hostname))!, config);
    expect(st.label).toBe("Varujemo povezavo…");
    expect(st.stages.map((x) => x.state)).toEqual(["done", "current", "todo"]);
    expect(await provisionDomain(d, row.hostname, { force: true })).toMatchObject({ status: "active" });
    expect(dns.records.mx).toEqual({ "seliskar.si": ["mx.seliskar.si"] });
    expect(p.edge.calls.filter((c) => c.method === "addHostname")).toHaveLength(1);
    expect((await repo.getSite(s.id))!.published_address).toBe("https://www.seliskar.si/");
    expect(await sitemap(s.slug)).toContain("<loc>https://www.seliskar.si/</loc>");
  });

  it("stops waiting for the record after waitHours.dns and says what to do", async () => {
    const s = await site();
    let now = Date.now();
    const p = providers({ dns: fakeDns({ cname: { "www.seliskar-cakanje.si": ["seliskar-cakanje.si"] } }) });
    const row = await startDomain(deps(p), s.id, { kind: "connected", hostname: "www.seliskar-cakanje.si" });
    const d = deps(p, { now: () => now });
    await provisionDomain(d, row.hostname);
    now += 73 * 3600_000;
    expect(await provisionDomain(d, row.hostname, { force: true })).toMatchObject({ status: "failed", failure: "dns_timeout" });
    const st = domainState((await repo.domains.get(row.hostname))!, config);
    expect(st.message).toBe("Zapisa DNS za www.seliskar-cakanje.si v 3 dneh nismo videli, zato smo povezovanje ustavili. Preverite zapis pri ponudniku DNS in tapnite »Poskusi znova«.");
  });

  it("a certificate the edge can't issue is retried, then reported", async () => {
    const s = await site();
    const p = providers({ dns: fakeDns({}, { anyCnameTo: "povezava.stranko.example" }), edge: { script: { hostname: { permanent: true } } } });
    const row = await startDomain(deps(p), s.id, { kind: "connected", hostname: "seliskar-cert.si" });
    expect(await provisionDomain(deps(p), row.hostname)).toMatchObject({ status: "failed", failure: "refused" });
  });

  it("refuses a domain that is another site's, ours, or not a domain", async () => {
    const a = await site();
    const b = await site();
    const p = providers();
    await startDomain(deps(p), a.id, { kind: "connected", hostname: "seliskar-druga.si" });
    await expect(startDomain(deps(p), b.id, { kind: "connected", hostname: "www.seliskar-druga.si" })).rejects.toThrow(DomainStartError);
    await expect(startDomain(deps(p), a.id, { kind: "connected", hostname: "seliskar-tretja.si" })).rejects.toThrow("Stran že ima domeno.");
    await expect(planOwnDomain({ providers: p }, "pekarna.stranko.example", { refuse: ["stranko.example"] })).rejects.toThrow(OwnDomainError);
    await expect(planOwnDomain({ providers: p }, "ni domena")).rejects.toThrow("To ni veljavno ime domene");
  });
});

describe("the address check", () => {
  it("republishes every published site once PLATFORM_DOMAIN is set, and nothing the second time", async () => {
    const s = await site();
    const unpublished = await site({ publish: false });
    const before = (await repo.getSite(s.id))!;
    expect(before.published_address).toBeNull();
    const r = await republishStaleAddresses({ repo, storage, config, platformDomain: "stranko.example" });
    expect(r.republished).toContain(s.id);
    expect(r.republished).not.toContain(unpublished.id);
    const after = (await repo.getSite(s.id))!;
    expect(after.published_address).toBe(`https://${s.slug}.stranko.example/`);
    // The published version, not a newer draft.
    expect(after.published_version).toBe(before.published_version);
    expect(await sitemap(s.slug)).toContain(`<loc>https://${s.slug}.stranko.example/</loc>`);
    expect((await republishStaleAddresses({ repo, storage, config, platformDomain: "stranko.example" })).republished).not.toContain(s.id);
    expect(await republishForAddress({ repo, storage, config, platformDomain: "stranko.example" }, s.id)).toBe("unchanged");
    expect(await storage.get(livePointerKey(s.slug))).not.toBeNull();
  });
});

describe("starting a registration", () => {
  it("suggests available names from the business name, priced from config, skipping taken, premium and too dear ones", async () => {
    const s = await site({ publish: false });
    const p = providers({ registrar: { taken: ["racunovodstvoseliskar.si"], premium: ["racunovodstvo-seliskar.si"] } });
    const out = await domainSuggestions({ repo, config, providers: p }, s.id);
    expect(out.length).toBe(config.domains.suggestions.show);
    expect(out[0]).toEqual({ name: "racunovodstvoseliskar-murskasobota.si", priceEurPerYear: config.domains.tlds[0]!.priceEurPerYear });
    expect(out.map((x) => x.name)).not.toContain("racunovodstvoseliskar.si");
    expect(out.map((x) => x.name)).not.toContain("racunovodstvo-seliskar.si");
    const dear = providers({ registrar: { costEur: { si: 99, com: 99 } } });
    expect(await domainSuggestions({ repo, config, providers: dear }, s.id)).toEqual([]);
  });

  it("takes the holder's details from the site's facts, never inventing a name", () => {
    const company = registrantFromSpec(golden, "lastnik@primer.si");
    expect(company).toMatchObject({ kind: "company", companyName: "Računovodstvo Seliškar d.o.o." });
    expect(company.firstName).toBeUndefined();
    expect(registrantMissing(company)).toEqual(expect.arrayContaining(["firstName", "lastName"]));
    const soleTrader = structuredClone(golden);
    soleTrader.business.provider.legalName = "Frizerstvo Lana, Ana Kos s.p.";
    soleTrader.business.phone = "+38641123456";
    soleTrader.business.email = "ana@primer.si";
    soleTrader.business.address = { street: "Glavni trg 3", postalCode: "2000", city: "Maribor" };
    const r = registrantFromSpec(soleTrader, "lastnik@primer.si");
    expect(r).toEqual({ kind: "person", firstName: "Ana", lastName: "Kos", street: "Glavni trg 3", postalCode: "2000", city: "Maribor", country: "SI", phone: "+38641123456", email: "ana@primer.si" });
    expect(registrantMissing(r)).toEqual([]);
  });

  it("refuses an incomplete holder, a TLD we don't sell, and a taken name", async () => {
    const s = await site({ publish: false });
    const p = providers({ registrar: { taken: ["zasedeno.si"] } });
    await expect(startDomain(deps(p), s.id, { kind: "registered", hostname: "seliskar-x.si", registrant: { ...REGISTRANT, phone: "041 123" } })).rejects.toThrow("Za registracijo manjka še: telefon.");
    await expect(startDomain(deps(p), s.id, { kind: "registered", hostname: "seliskar.de", registrant: REGISTRANT })).rejects.toThrow("Te domene ne moremo registrirati.");
    await expect(startDomain(deps(p), s.id, { kind: "registered", hostname: "zasedeno.si", registrant: REGISTRANT })).rejects.toThrow("Domena zasedeno.si je zasedena. Izberite drugo ime.");
  });

  it("replaces a failed domain with a new choice", async () => {
    const s = await site();
    const row = await startDomain(deps(providers()), s.id, { kind: "registered", hostname: "seliskar-prva.si", registrant: REGISTRANT });
    await provisionDomain(deps(providers({ registrar: { taken: [row.hostname] } })), row.hostname);
    const again = await startDomain(deps(providers()), s.id, { kind: "registered", hostname: "seliskar-druga-izbira.si", registrant: REGISTRANT });
    expect(again.is_primary).toBe(true);
    expect((await repo.domains.forSite(s.id)).map((d) => d.hostname)).toEqual(["seliskar-druga-izbira.si"]);
  });
});
