import { describe, expect, it } from "vitest";
import {
  DomainProviderError,
  UNCONFIGURED_EDGE,
  cloudflareEdge,
  cloudflareEdgeFromEnv,
  createDb,
  domainProvidersFor,
  domainProvidersFromEnv,
  detectDnsHost,
  fakeDns,
  fakeEdge,
  fakeRegistrar,
  migrate,
  openproviderRegistrar,
  Repo,
  splitPhone,
  splitStreet,
} from "../src/index.ts";

/**
 * The domain providers: the fakes provisioning runs against, DNS host detection, and the Openprovider and
 * Cloudflare adapter skeletons against responses shaped like their documented examples (no network, no
 * account: these are not recordings of the real APIs).
 */

type Seen = { url: string; method: string; headers: Record<string, string>; body: unknown };
/** A fetch that answers from `routes` (method + path → JSON) and remembers every request. */
function fakeFetch(routes: Record<string, unknown | ((body: unknown) => unknown)>): typeof fetch & { seen: Seen[] } {
  const seen: Seen[] = [];
  const f = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    seen.push({ url, method, headers: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>)), body });
    const key = `${method} ${new URL(url).pathname}${new URL(url).search}`;
    const route = Object.entries(routes).find(([k]) => key === k || key.startsWith(`${k}?`) || key.endsWith(k));
    if (!route) return new Response(JSON.stringify({ success: false, code: 404, errors: [{ code: 404, message: `no route ${key}` }] }), { status: 404 });
    const answer = typeof route[1] === "function" ? (route[1] as (b: unknown) => unknown)(body) : route[1];
    return new Response(JSON.stringify(answer), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch & { seen: Seen[] };
  f.seen = seen;
  return f;
}

describe("fakes", () => {
  it("the registrar answers availability and cost, registers idempotently and refuses taken names permanently", async () => {
    const r = fakeRegistrar({ taken: ["zaseden.si"], costEur: { si: 11 } });
    expect(await r.check(["prosta.si", "Zaseden.si", "x.com"])).toEqual([
      { name: "prosta.si", available: true, premium: false, costEur: 11 },
      { name: "zaseden.si", available: false, premium: false, costEur: 11 },
      { name: "x.com", available: true, premium: false, costEur: 10 },
    ]);
    const a = await r.register({ name: "prosta.si", ownerHandle: "H", years: 1, nameservers: [] });
    expect(await r.register({ name: "prosta.si", ownerHandle: "H", years: 1, nameservers: [] })).toEqual(a);
    const e = await r.register({ name: "zaseden.si", ownerHandle: "H", years: 1, nameservers: [] }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(DomainProviderError);
    expect((e as DomainProviderError).permanent).toBe(true);
    expect((e as DomainProviderError).opts.code).toBe("unavailable");
    // What we hold is found by name; what we don't is null.
    expect(await r.lookup("Prosta.si")).toEqual({ id: a.id, status: "active" });
    expect(await r.lookup("zaseden.si")).toBeNull();
  });

  it("'lose' registers the name and then loses the answer, as a timeout would", async () => {
    const r = fakeRegistrar({ script: { register: { lose: 1 }, registration: { pending: 1 } } });
    await expect(r.register({ name: "izgubljen.si", ownerHandle: "H", years: 1, nameservers: [] })).rejects.toThrow(/no answer/);
    expect(await r.lookup("izgubljen.si")).toEqual({ id: "fake-izgubljen.si", status: "active" });
    expect((await r.check(["izgubljen.si"]))[0]!.available).toBe(false);
  });

  it("scripts fail a method a number of times, then answer pending, then active", async () => {
    const edge = fakeEdge({ script: { hostname: { fail: 1, pending: 1 } } });
    await expect(edge.hostname("x")).rejects.toThrow(/temporary failure/);
    expect((await edge.hostname("x")).status).toBe("pending");
    expect(await edge.hostname("x")).toEqual({ status: "active", certificate: "active", errors: [] });
  });

  it("DNS answers [] for what doesn't exist; anyCnameTo stands in for the owner's record in development", async () => {
    const dns = fakeDns({ mx: { "a.si": ["mx.a.si"] } }, { anyCnameTo: "povezava.postavi.example" });
    expect(await dns.mx("A.si.")).toEqual(["mx.a.si"]);
    expect(await dns.ns("a.si")).toEqual([]);
    expect(await dns.cname("www.a.si")).toEqual(["povezava.postavi.example"]);
  });

  it("names the DNS host from its nameservers, or nothing", () => {
    expect(detectDnsHost(["anna.ns.cloudflare.com", "bob.ns.cloudflare.com"])).toBe("Cloudflare");
    expect(detectDnsHost(["dns1.registrar-servers.com"])).toBe("Namecheap");
    expect(detectDnsHost(["ns-12.awsdns-01.com"])).toBe("Amazon Route 53");
    expect(detectDnsHost(["ns1.neoserv.si"])).toBe("Neoserv");
    expect(detectDnsHost(["ns1.example-hosting.si"])).toBeNull();
    // A suffix only matches whole labels.
    expect(detectDnsHost(["ns1.notneoserv.si"])).toBeNull();
  });
});

describe("Openprovider adapter (skeleton, documented shapes)", () => {
  const base = "https://api.openprovider.test/v1";
  const ok = (data: unknown) => ({ code: 0, desc: "", data });

  it("logs in once, checks names in the documented shape and reads the reseller price in euros", async () => {
    const f = fakeFetch({
      "POST /v1/auth/login": ok({ token: "tok", reseller_id: 1 }),
      "POST /v1/domains/check": ok({
        results: [
          { domain: "pekarnakvas.si", status: "free", price: { product: { currency: "EUR", price: 10 }, reseller: { currency: "EUR", price: 11.5 } } },
          { domain: "pekarna.si", status: "active", reason: "Domain exists" },
          { domain: "kvas.com", status: "free", is_premium: true, price: { reseller: { currency: "USD", price: 900 } } },
        ],
      }),
    });
    const op = openproviderRegistrar({ username: "u", password: "p", baseUrl: base, fetch: f });
    const out = await op.check(["pekarnakvas.si", "pekarna.si", "kvas.com"]);
    expect(out).toEqual([
      { name: "pekarnakvas.si", available: true, premium: false, costEur: 11.5 },
      { name: "pekarna.si", available: false, premium: false, costEur: null },
      { name: "kvas.com", available: true, premium: true, costEur: null },
    ]);
    await op.check(["a.si"]);
    expect(f.seen.filter((s) => s.url.endsWith("/auth/login"))).toHaveLength(1);
    expect(f.seen[0]!.body).toEqual({ username: "u", password: "p", ip: "0.0.0.0" });
    expect(f.seen[1]!.body).toEqual({ domains: [{ name: "pekarnakvas", extension: "si" }, { name: "pekarna", extension: "si" }, { name: "kvas", extension: "com" }], with_price: true });
    expect(f.seen[1]!.headers.authorization).toBe("Bearer tok");
  });

  it("creates the customer with split street and phone, registers with our nameservers, maps ACT/REQ/FAI", async () => {
    const f = fakeFetch({
      "POST /v1/auth/login": ok({ token: "tok" }),
      "POST /v1/customers": ok({ handle: "KS123456-SI" }),
      "POST /v1/domains": ok({ id: 4242, status: "REQ" }),
      "GET /v1/domains/4242": ok({ status: "ACT" }),
    });
    const op = openproviderRegistrar({ username: "u", password: "p", baseUrl: base, fetch: f });
    const { handle } = await op.createContact({ kind: "person", firstName: "Ana", lastName: "Kos", street: "Glavni trg 3a", postalCode: "2000", city: "Maribor", country: "SI", phone: "+38641123456", email: "ana@primer.si" });
    expect(handle).toBe("KS123456-SI");
    expect(f.seen.find((s) => s.url.endsWith("/customers"))!.body).toEqual({
      name: { first_name: "Ana", last_name: "Kos" },
      address: { street: "Glavni trg", number: "3", suffix: "a", zipcode: "2000", city: "Maribor", country: "SI" },
      phone: { country_code: "+386", area_code: "41", subscriber_number: "123456" },
      email: "ana@primer.si",
    });
    expect(await op.register({ name: "pekarnakvas.si", ownerHandle: handle, years: 1, nameservers: ["ana.ns.x", "bor.ns.x"] })).toEqual({ id: "4242", status: "pending" });
    expect(f.seen.find((s) => s.method === "POST" && s.url.endsWith("/domains"))!.body).toMatchObject({
      domain: { name: "pekarnakvas", extension: "si" },
      owner_handle: "KS123456-SI",
      period: 1,
      name_servers: [{ name: "ana.ns.x", seq_nr: 1 }, { name: "bor.ns.x", seq_nr: 2 }],
    });
    expect(await op.registration("4242")).toBe("active");
  });

  it("looks a domain up in our account by its full name (ListDomains), ignoring other and deleted names", async () => {
    const f = fakeFetch({
      "POST /v1/auth/login": ok({ token: "tok" }),
      "GET /v1/domains": ok({
        results: [
          { id: 1, status: "ACT", is_deleted: true, domain: { name: "pekarnakvas", extension: "si" } },
          { id: 4242, status: "REQ", is_deleted: false, domain: { name: "pekarnakvas", extension: "si" } },
        ],
        total: 2,
      }),
    });
    const op = openproviderRegistrar({ username: "u", password: "p", baseUrl: base, fetch: f });
    expect(await op.lookup("PekarnaKvas.si")).toEqual({ id: "4242", status: "pending" });
    const get = f.seen.find((s) => s.method === "GET")!;
    expect(new URL(get.url).pathname).toBe("/v1/domains");
    expect(Object.fromEntries(new URL(get.url).searchParams)).toEqual({ full_name: "pekarnakvas.si", is_deleted: "false", limit: "10" });
    expect(await op.lookup("drugo.si")).toBeNull();
    const none = openproviderRegistrar({ username: "u", password: "p", baseUrl: base, fetch: fakeFetch({ "POST /v1/auth/login": ok({ token: "tok" }), "GET /v1/domains": ok({ total: 0 }) }) });
    expect(await none.lookup("pekarnakvas.si")).toBeNull();
  });

  it("a non-zero code is an error; a refused login is permanent", async () => {
    const op = openproviderRegistrar({ username: "u", password: "bad", baseUrl: base, fetch: fakeFetch({ "POST /v1/auth/login": { code: 196, desc: "Authentication/Authorization Failed" } }) });
    const e = await op.check(["a.si"]).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(DomainProviderError);
    expect((e as DomainProviderError).permanent).toBe(true);
  });

  it("splits Slovene streets and phone numbers into Openprovider's fields", () => {
    expect(splitStreet("Trubarjeva cesta 12")).toEqual({ street: "Trubarjeva cesta", number: "12", suffix: "" });
    expect(splitStreet("Ulica 5. maja 7B")).toEqual({ street: "Ulica 5. maja", number: "7", suffix: "b" });
    expect(splitStreet("Brez številke")).toEqual({ street: "Brez številke", number: "", suffix: "" });
    expect(splitPhone("+38615001234")).toEqual({ country_code: "+386", area_code: "1", subscriber_number: "5001234" });
    expect(splitPhone("+38631555666")).toEqual({ country_code: "+386", area_code: "31", subscriber_number: "555666" });
    expect(() => splitPhone("+4930123456")).toThrow(DomainProviderError);
  });
});

describe("Cloudflare adapter (skeleton, documented shapes)", () => {
  const env = (result: unknown) => ({ success: true, errors: [], messages: [], result });
  const opts = { apiToken: "t", accountId: "acc", saasZoneId: "saas", cnameTarget: "povezava.postavi.example", workerScript: "postavi-edge" };

  it("adds a zone with originless proxied records and the Worker's routes, and reads zone + certificate status", async () => {
    const f = fakeFetch({
      "POST /client/v4/zones": env({ id: "z1", name: "pekarnakvas.si", name_servers: ["ana.ns.cloudflare.com", "bob.ns.cloudflare.com"], status: "pending" }),
      "/dns_records": env({ id: "r" }),
      "/workers/routes": env({ id: "w" }),
      "GET /client/v4/zones/z1": env({ id: "z1", status: "active" }),
      "GET /client/v4/zones/z1/ssl/verification": env([{ certificate_status: "active" }]),
    });
    const cf = cloudflareEdge({ ...opts, fetch: f });
    expect(await cf.addZone("pekarnakvas.si")).toEqual({ zoneId: "z1", nameservers: ["ana.ns.cloudflare.com", "bob.ns.cloudflare.com"] });
    expect(f.seen[0]!.body).toEqual({ account: { id: "acc" }, name: "pekarnakvas.si", type: "full" });
    expect(f.seen.filter((s) => s.url.endsWith("/dns_records")).map((s) => s.body)).toEqual([
      { type: "AAAA", content: "100::", proxied: true, ttl: 1, name: "pekarnakvas.si", comment: "Postavi: spletna stran" },
      { type: "AAAA", content: "100::", proxied: true, ttl: 1, name: "www.pekarnakvas.si", comment: "Postavi: spletna stran" },
    ]);
    expect(f.seen.filter((s) => s.url.endsWith("/workers/routes")).map((s) => s.body)).toEqual([
      { pattern: "pekarnakvas.si/*", script: "postavi-edge" },
      { pattern: "www.pekarnakvas.si/*", script: "postavi-edge" },
    ]);
    expect(f.seen[0]!.headers.authorization).toBe("Bearer t");
    expect(await cf.zone("z1")).toEqual({ status: "active", certificate: "active" });
  });

  it("a zone that exists already (a repeated step) is found instead", async () => {
    const f = fakeFetch({
      "POST /client/v4/zones": { success: false, errors: [{ code: 1061, message: "already exists" }], result: null },
      "GET /client/v4/zones": env([{ id: "z9", name_servers: ["a.ns.cloudflare.com"] }]),
      "/dns_records": { success: false, errors: [{ code: 81057, message: "record exists" }], result: null },
      "/workers/routes": env({ id: "w" }),
    });
    expect(await cloudflareEdge({ ...opts, fetch: f }).addZone("pekarnakvas.si")).toEqual({ zoneId: "z9", nameservers: ["a.ns.cloudflare.com"] });
    expect(f.seen.find((s) => s.method === "GET")!.url).toContain("/zones?name=pekarnakvas.si");
  });

  it("adds a custom hostname validated over HTTP and maps its status and certificate", async () => {
    const f = fakeFetch({
      "POST /client/v4/zones/saas/custom_hostnames": env({ id: "ch1", hostname: "www.a.si", status: "pending", ssl: { status: "initializing" } }),
      "GET /client/v4/zones/saas/custom_hostnames/ch1": env({ id: "ch1", status: "pending", ssl: { status: "validation_timed_out", validation_errors: [{ message: "CAA blocks" }] }, verification_errors: ["custom hostname does not CNAME to this zone."] }),
    });
    const cf = cloudflareEdge({ ...opts, fetch: f });
    expect(await cf.addHostname("www.a.si")).toEqual({ id: "ch1" });
    expect(f.seen[0]!.body).toEqual({ hostname: "www.a.si", ssl: { method: "http", type: "dv" } });
    expect(await cf.hostname("ch1")).toEqual({ status: "pending", certificate: "failed", errors: ["custom hostname does not CNAME to this zone.", "CAA blocks"] });
    expect(cf.cnameTarget).toBe("povezava.postavi.example");
  });

  it("finds a custom hostname that exists already, reads active_redeploying as serving and a blocked one as failed", async () => {
    const f = fakeFetch({
      "POST /client/v4/zones/saas/custom_hostnames": { success: false, errors: [{ code: 1406, message: "Duplicate custom hostname found." }], result: null },
      "GET /client/v4/zones/saas/custom_hostnames?hostname=www.a.si": env([{ id: "ch7", hostname: "www.a.si", status: "pending" }]),
      "GET /client/v4/zones/saas/custom_hostnames/ch7": env({ id: "ch7", status: "active_redeploying", ssl: { status: "active" } }),
      "GET /client/v4/zones/saas/custom_hostnames/ch8": env({ id: "ch8", status: "pending_blocked", ssl: { status: "pending_validation" } }),
    });
    const cf = cloudflareEdge({ ...opts, fetch: f });
    expect(await cf.addHostname("www.a.si")).toEqual({ id: "ch7" });
    expect(await cf.hostname("ch7")).toEqual({ status: "active", certificate: "active", errors: [] });
    expect(await cf.hostname("ch8")).toEqual({ status: "failed", certificate: "pending", errors: [] });
  });

  it("removes a custom hostname; one already gone is fine, a refused token is a permanent error", async () => {
    const f = fakeFetch({ "DELETE /client/v4/zones/saas/custom_hostnames/ch1": env({ id: "ch1" }) });
    const cf = cloudflareEdge({ ...opts, fetch: f });
    await cf.removeHostname("ch1");
    expect(f.seen.map((s) => [s.method, new URL(s.url).pathname])).toEqual([["DELETE", "/client/v4/zones/saas/custom_hostnames/ch1"]]);
    await cf.removeHostname("gone"); // the fake answers 404 for unknown routes
    const denied = (async () => new Response(JSON.stringify({ success: false, errors: [{ code: 10000, message: "Authentication error" }], result: null }), { status: 403 })) as unknown as typeof fetch;
    const err = await cloudflareEdge({ ...opts, fetch: denied }).removeHostname("ch1").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DomainProviderError);
    expect((err as DomainProviderError).permanent).toBe(true);
    const unauthorized = (async () => new Response("{}", { status: 401 })) as unknown as typeof fetch;
    expect(((await cloudflareEdge({ ...opts, fetch: unauthorized }).hostname("ch1").catch((e: unknown) => e)) as DomainProviderError).permanent).toBe(true);
    const busy = (async () => new Response("{}", { status: 503 })) as unknown as typeof fetch;
    expect(((await cloudflareEdge({ ...opts, fetch: busy }).hostname("ch1").catch((e: unknown) => e)) as DomainProviderError).permanent).toBe(false);
  });

  it("registered domains need the account id and the Worker's script (off until M7b)", async () => {
    const cf = cloudflareEdge({ apiToken: "t", saasZoneId: "saas", cnameTarget: "povezava.postavi.si", fetch: fakeFetch({}) });
    await expect(cf.addZone("a.si")).rejects.toThrow(/account id/);
  });

  it("is built from env (token and zone id); missing variables are named, never their values", async () => {
    expect(cloudflareEdgeFromEnv({}, "povezava.postavi.si")).toEqual({ edge: null, missing: ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ZONE_ID"] });
    expect(cloudflareEdgeFromEnv({ CLOUDFLARE_API_TOKEN: "secret", CLOUDFLARE_ZONE_ID: " " }, "povezava.postavi.si")).toEqual({ edge: null, missing: ["CLOUDFLARE_ZONE_ID"] });
    const f = fakeFetch({ "POST /client/v4/zones/zone-1/custom_hostnames": env({ id: "ch1" }) });
    const built = cloudflareEdgeFromEnv({ CLOUDFLARE_API_TOKEN: "secret", CLOUDFLARE_ZONE_ID: "zone-1" }, "povezava.postavi.si", { fetch: f });
    expect(built.edge?.kind).toBe("cloudflare");
    expect(built.edge?.cnameTarget).toBe("povezava.postavi.si");
    await built.edge!.addHostname("www.a.si");
    expect(f.seen[0]!.headers.authorization).toBe("Bearer secret");
  });
});

describe("providers from config", () => {
  const domains = (edge: "fake" | "cloudflare-saas") => ({ providers: { registrar: "fake" as const, edge, dns: "fake" as const }, connect: { cnameTarget: "povezava.postavi.si" } });

  it("the fake edge points owners at config's CNAME target", () => {
    const p = domainProvidersFor(domains("fake"));
    expect(p.edge.kind).toBe("fake");
    expect(p.edge.cnameTarget).toBe("povezava.postavi.si");
    expect(p.registrar.kind).toBe("fake");
  });

  it("Cloudflare for SaaS without its env is an unconfigured edge whose calls fail transiently; with it, the real adapter", async () => {
    const p = domainProvidersFromEnv(domains("cloudflare-saas"), {});
    expect(p.edge.kind).toBe(UNCONFIGURED_EDGE);
    const err = (await p.edge.addHostname("www.a.si").catch((e: unknown) => e)) as DomainProviderError;
    expect(err).toBeInstanceOf(DomainProviderError);
    expect(err.permanent).toBe(false);
    expect(err.message).toContain("CLOUDFLARE_API_TOKEN");
    expect(domainProvidersFromEnv(domains("cloudflare-saas"), { CLOUDFLARE_API_TOKEN: "t", CLOUDFLARE_ZONE_ID: "z" }).edge.kind).toBe("cloudflare");
  });
});

describe("site_domains provisioning bookkeeping (migration 18)", () => {
  it("claims once, keeps due rows for the sweep, and claims the live email once", async () => {
    const db = await createDb("pglite://memory");
    await migrate(db);
    const repo = new Repo(db);
    const s = await repo.createSite({ name: "x", slug: "x", intake: { description: "x", photoAssetIds: [], scope: "home" } });
    await repo.domains.start(s.id, "x.si", "registered", { registrant: { firstName: "A" } });
    expect(await repo.domains.due()).toEqual(["x.si"]);
    expect(await repo.domains.claim("x.si", 60)).not.toBeNull();
    expect(await repo.domains.claim("x.si", 60, true)).toBeNull();
    await repo.domains.progress("x.si", { step: "zone", detail: { ownerHandle: "H" }, forget: ["registrant"], nextInSeconds: 120 });
    const row = (await repo.domains.get("x.si"))!;
    expect(row.detail).toEqual({ ownerHandle: "H" });
    expect(row.lease_until).toBeNull();
    expect(await repo.domains.due()).toEqual([]);
    await repo.domains.progress("x.si", { status: "active", notify: "pending", nextInSeconds: null });
    const [due] = await repo.domains.dueNotifications(5);
    expect(due!.hostname).toBe("x.si");
    expect(await repo.domains.claimNotification("x.si", 0)).toBe(true);
    expect(await repo.domains.claimNotification("x.si", 0)).toBe(false);
    expect((await repo.domains.get("x.si"))!.active_at).not.toBeNull();
    await db.close();
  });

  it("a run lets go only of its own lease: one that ran out and was taken over stays with the new holder", async () => {
    const db = await createDb("pglite://memory");
    await migrate(db);
    const repo = new Repo(db);
    const s = await repo.createSite({ name: "y", slug: "y", intake: { description: "y", photoAssetIds: [], scope: "home" } });
    await repo.domains.start(s.id, "y.si", "registered", {});
    const first = (await repo.domains.claim("y.si", 60))!;
    expect(first.lease).toEqual(expect.any(String));
    await db.query("update site_domains set lease_until = now() - interval '1 second' where hostname = 'y.si'");
    const second = (await repo.domains.claim("y.si", 60))!;
    expect(second.lease).not.toBe(first.lease);
    // The first run's finally and progress write leave the second run's lease alone.
    await repo.domains.release("y.si", first.lease);
    await repo.domains.progress("y.si", { step: "zone", lease: first.lease });
    const held = (await repo.domains.get("y.si"))!;
    expect(held.step).toBe("zone");
    expect(held.lease_until).not.toBeNull();
    expect(await repo.domains.claim("y.si", 60, true)).toBeNull();
    // Its own lease, released, is gone.
    await repo.domains.release("y.si", second.lease);
    expect((await repo.domains.get("y.si"))!.lease_until).toBeNull();
    await db.close();
  });
});
