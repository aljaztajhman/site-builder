import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, type AppConfig } from "@sb/config";
import { newReleaseId, writeRelease } from "@sb/engine";
import {
  Repo,
  createDb,
  createFsStorage,
  fakeDns,
  fakeEdge,
  fakeRegistrar,
  memoryMailer,
  migrate,
  normaliseEmail,
  type DomainProviders,
  type JobData,
  type Mailer,
  type Platform,
  type Queue,
} from "@sb/platform";
import type { SiteSpec } from "@sb/spec";
import { createApp } from "../src/app.ts";
import { domainLiveMail, sendDomainLiveEmails } from "../src/domain-email.ts";
import { dayIn } from "../src/stats.ts";
import { adminBrowser, ownerSignIn, type Browser } from "./session-helpers.ts";

/**
 * The domain step's API (suggestions with the config price, the holder's details from the site, "Že imam
 * domeno" with its record, starting and re-checking a domain), the owner's "live" email, and the
 * cookieless counts of a site served on its own domain.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const OWNER = "lastnica@primer.si";
const PHONE_UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36";
const PASSWORD = "pw-123456789012";
let platform: Platform;
let dir: string;
let golden: SiteSpec;
let config: AppConfig;
let admin: Browser;
const sent: { [Q in keyof JobData]?: JobData[Q][] } = {};
const enc = new TextEncoder();
const mail = memoryMailer();
let providers: DomainProviders;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sb-domains-"));
  const db = await createDb("pglite://memory");
  await migrate(db);
  const queue: Queue = {
    send: async (name, data) => {
      ((sent as Record<string, unknown[]>)[name] ??= []).push(data);
      return "job";
    },
    work: async () => undefined,
    ping: async () => undefined,
    stop: async () => undefined,
  };
  platform = { db, repo: new Repo(db), storage: createFsStorage(dir), queue, close: () => db.close() };
  golden = JSON.parse(await readFile(path.join(here, "../../../tools/eval/golden/instalacije-rebernik.json"), "utf8")) as SiteSpec;
  const base = loadConfig();
  config = { ...base, domains: { ...base.domains, enabled: true } };
  const edge = fakeEdge({ cnameTarget: "povezava.stranko.example" });
  providers = {
    registrar: fakeRegistrar({ taken: ["instalacijerebernik.si"] }),
    edge,
    dns: fakeDns({ ns: { "rebernik.si": ["dns1.registrar-servers.com"] }, mx: { "rebernik.si": ["mx1.rebernik.si"] } }),
  };
  admin = await adminBrowser((p, init) => app().request(p, init), PASSWORD);
});
afterAll(async () => {
  await platform.close();
  await rm(dir, { recursive: true, force: true });
});

const app = (o: { mailer?: Mailer; enabled?: boolean } = {}) =>
  createApp({
    platform,
    config: o.enabled === false ? { ...config, domains: { ...config.domains, enabled: false } } : config,
    mailer: o.mailer ?? mail,
    appUrl: "https://app.stranko.example",
    platformDomain: "stranko.example",
    siteHostCacheMs: 0,
    domainProviders: providers,
    auth: { password: PASSWORD, secret: "s".repeat(32), secureCookies: false },
  });

const api = (b: Browser, p: string, init: { method?: string; body?: unknown } = {}, a = app()) =>
  a.request(p, { method: init.method ?? "GET", headers: { cookie: b.cookie, "content-type": "application/json" }, ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }) });

let n = 0;
/** The installer's golden site (Matej Rebernik s.p.), owned by OWNER, with a live release. */
async function site(o: { publish?: boolean } = {}): Promise<{ id: string; slug: string }> {
  const slug = `rebernik-${++n}`;
  const spec = structuredClone(golden);
  spec.slug = slug;
  spec.business.phone = "+38641123456";
  spec.business.email = "info@rebernik.si";
  spec.business.address = { street: "Cesta 1", postalCode: "3000", city: "Celje" };
  const account = await platform.repo.accounts.signIn(OWNER, normaliseEmail(OWNER)!.key);
  const s = await platform.repo.createSite({ name: "Instalacije Rebernik", slug, intake: { description: "x", photoAssetIds: [], scope: "full" }, accountId: account.id });
  const v = await platform.repo.saveSpec(s.id, spec, "generate");
  if (o.publish !== false) {
    await platform.repo.markPublished(s.id, v);
    await writeRelease(platform.storage, slug, newReleaseId(v), new Map([[`${slug}/index.html`, enc.encode("<!doctype html><title>Domov</title>")]]));
  }
  return { id: s.id, slug };
}

describe("the domain step's API", () => {
  it("suggests names from the business name with the config price, and prefills the holder from the site", async () => {
    const s = await site();
    const sugg = (await (await api(admin, `/api/sites/${s.id}/domains/suggestions`)).json()) as { suggestions: { name: string; priceEurPerYear: number }[] };
    expect(sugg.suggestions.map((x) => x.name)).toEqual(["instalacije-rebernik.si", "instalacijerebernik-celje.si", "instalacijerebernikcelje.si"]);
    expect(sugg.suggestions.every((x) => x.priceEurPerYear === config.domains.tlds[0]!.priceEurPerYear)).toBe(true);
    const info = (await (await api(admin, `/api/sites/${s.id}/domains`)).json()) as { enabled: boolean; domains: unknown[]; registrant: Record<string, string>; missing: string[]; platformAddress: string };
    expect(info).toMatchObject({ enabled: true, domains: [], missing: [], platformAddress: `https://${s.slug}.stranko.example/` });
    expect(info.registrant).toEqual({ kind: "person", firstName: "Matej", lastName: "Rebernik", street: "Cesta 1", postalCode: "3000", city: "Celje", country: "SI", phone: "+38641123456", email: "info@rebernik.si" });
    expect((info as unknown as { holder: string }).holder).toBe("Matej Rebernik · Cesta 1, 3000 Celje · +386 41 123 456 · info@rebernik.si");
    // Off in config: no suggestions, and starting is refused.
    expect(await (await api(admin, `/api/sites/${s.id}/domains/suggestions`, {}, app({ enabled: false }))).json()).toEqual({ suggestions: [] });
    expect((await api(admin, `/api/sites/${s.id}/domains`, { method: "POST", body: { kind: "registered", hostname: "x.si" } }, app({ enabled: false }))).status).toBe(409);
  });

  it("starts a registration, queues the job, and shows its progress in the editor's state", async () => {
    const s = await site();
    const before = sent.domain?.length ?? 0;
    const info = (await (await api(admin, `/api/sites/${s.id}/domains`)).json()) as { registrant: Record<string, string> };
    const r = await api(admin, `/api/sites/${s.id}/domains`, { method: "POST", body: { kind: "registered", hostname: "instalacije-rebernik.si", registrant: info.registrant } });
    expect(r.status, await r.clone().text()).toBe(200);
    expect(sent.domain!.slice(before)).toEqual([{ hostname: "instalacije-rebernik.si" }]);
    const state = (await (await api(admin, `/api/sites/${s.id}`)).json()) as { domains: { domains: { hostname: string; label: string; stages: { label: string }[] }[] } };
    expect(state.domains.domains[0]).toMatchObject({ hostname: "instalacije-rebernik.si", label: "Registriramo…" });
    expect(state.domains.domains[0]!.stages.map((x) => x.label)).toEqual(["Registriramo domeno", "Varujemo povezavo", "Objavljeno"]);
    // One domain per site.
    const again = await api(admin, `/api/sites/${s.id}/domains`, { method: "POST", body: { kind: "connected", hostname: "rebernik.si" } });
    expect(again.status).toBe(400);
    expect(((await again.json()) as { message: string }).message).toBe("Stran že ima domeno.");
  });

  it("refuses a taken name and an incomplete holder in Slovene", async () => {
    const s = await site();
    const taken = await api(admin, `/api/sites/${s.id}/domains`, { method: "POST", body: { kind: "registered", hostname: "instalacijerebernik.si", registrant: { firstName: "M", lastName: "R", street: "Cesta 1", postalCode: "3000", city: "Celje", country: "SI", phone: "041 123 456", email: "a@b.si" } } });
    expect(taken.status).toBe(400);
    expect(((await taken.json()) as { message: string }).message).toBe("Domena instalacijerebernik.si je zasedena. Izberite drugo ime.");
    const missing = await api(admin, `/api/sites/${s.id}/domains`, { method: "POST", body: { kind: "registered", hostname: "rebernik-novo.si", registrant: { firstName: "M" } } });
    expect(((await missing.json()) as { message: string }).message).toMatch(/^Za registracijo manjka še: priimek, ulica in hišna številka/);
  });

  it("'Že imam domeno' shows the one record, the DNS host and that email stays; never our own domains", async () => {
    const s = await site();
    const plan = await (await api(admin, `/api/sites/${s.id}/domains/inspect`, { method: "POST", body: { hostname: "Rebernik.si" } })).json();
    expect(plan).toEqual({ hostname: "www.rebernik.si", apex: "rebernik.si", record: { type: "CNAME", name: "www", value: "povezava.stranko.example" }, dnsHost: "Namecheap", hasMail: true, pointing: false });
    for (const h of ["shop.stranko.example", "app.stranko.example"]) {
      const r = await api(admin, `/api/sites/${s.id}/domains/inspect`, { method: "POST", body: { hostname: h } });
      expect(r.status).toBe(400);
    }
    const r = await api(admin, `/api/sites/${s.id}/domains`, { method: "POST", body: { kind: "connected", hostname: "rebernik.si" } });
    expect(r.status).toBe(200);
    const state = (await (await api(admin, `/api/sites/${s.id}/domains`)).json()) as { domains: { label: string; connect: unknown }[] };
    expect(state.domains[0]).toMatchObject({ label: "Čakamo na zapis DNS…", connect: { record: { type: "CNAME", name: "www", value: "povezava.stranko.example" }, dnsHost: "Namecheap", hasMail: true, seen: [] } });
  });

  it("'Preveri zdaj' runs the job now; 'Poskusi znova' starts a failed domain again", async () => {
    const s = await site();
    await platform.repo.domains.start(s.id, "www.rebernik-preveri.si", "connected", {});
    const before = sent.domain?.length ?? 0;
    expect((await api(admin, `/api/sites/${s.id}/domains/www.rebernik-preveri.si/check`, { method: "POST", body: {} })).status).toBe(200);
    expect(sent.domain!.slice(before)).toEqual([{ hostname: "www.rebernik-preveri.si", force: true }]);
    await platform.repo.domains.progress("www.rebernik-preveri.si", { status: "failed", failure: "dns_timeout", nextInSeconds: null });
    await api(admin, `/api/sites/${s.id}/domains/www.rebernik-preveri.si/check`, { method: "POST", body: {} });
    expect((await platform.repo.domains.get("www.rebernik-preveri.si"))!).toMatchObject({ status: "pending", failure: null });
    // Another site's domain is not found.
    const other = await site();
    expect((await api(admin, `/api/sites/${other.id}/domains/www.rebernik-preveri.si/check`, { method: "POST", body: {} })).status).toBe(404);
  });

  it("registering and connecting are publishing rights: a free account is refused, a visitor must sign in", async () => {
    const s = await site();
    const owner = await ownerSignIn((p, init) => app().request(p, init), mail.sent, OWNER);
    const r = await api(owner, `/api/sites/${s.id}/domains`, { method: "POST", body: { kind: "connected", hostname: "rebernik.si" } });
    expect(r.status).toBe(403);
    expect(((await r.json()) as { code: string }).code).toBe("paid_only");
    const anon = await app().request(`/api/sites/${s.id}/domains`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect([401, 404]).toContain(anon.status);
  });
});

describe("the owner's 'live' email", () => {
  it("goes once to the owner account, in Slovene, with an idempotency key", async () => {
    const s = await site();
    await platform.repo.domains.start(s.id, "rebernik-zivo.si", "registered", {});
    await platform.repo.domains.progress("rebernik-zivo.si", { status: "active", step: "live", notify: "pending", nextInSeconds: null });
    const m = memoryMailer();
    expect(await sendDomainLiveEmails({ repo: platform.repo, config, mailer: m, appUrl: "https://app.stranko.example" })).toBe(1);
    expect(m.sent).toHaveLength(1);
    expect(m.sent[0]).toMatchObject({ to: OWNER, subject: "Stran je objavljena na rebernik-zivo.si", idempotencyKey: "domain-live-rebernik-zivo.si" });
    expect(m.sent[0]!.text).toContain("https://rebernik-zivo.si/");
    expect(m.sent[0]!.text).toContain("registrirana na vaše ime");
    expect(m.sent[0]!.text).toContain(`https://app.stranko.example/sites/${s.id}`);
    expect(await sendDomainLiveEmails({ repo: platform.repo, config, mailer: m })).toBe(0);
    expect((await platform.repo.domains.get("rebernik-zivo.si"))!.notify).toBe("sent");
  });

  it("retries a failed send and gives up after notify.maxAttempts", async () => {
    const s = await site();
    await platform.repo.domains.start(s.id, "rebernik-napaka.si", "registered", {});
    await platform.repo.domains.progress("rebernik-napaka.si", { status: "active", notify: "pending", nextInSeconds: null });
    const broken: Mailer = { kind: "memory", send: async () => { throw new Error("Resend refused the message: HTTP 500"); } };
    const lines: string[] = [];
    for (let i = 0; i < config.domains.notify.maxAttempts + 1; i++) await sendDomainLiveEmails({ repo: platform.repo, config, mailer: broken, log: (l) => lines.push(l) });
    expect(lines).toHaveLength(config.domains.notify.maxAttempts);
    expect(lines.at(-1)).toMatch(/giving up/);
    expect((await platform.repo.domains.get("rebernik-napaka.si"))!.notify).toBe("failed");
  });

  it("an own domain's email says the domain and the owner's email stay where they are", () => {
    const m = domainLiveMail({ to: "a@b.si", hostname: "www.rebernik.si", siteName: "Instalacije\nRebernik", kind: "connected", dashboardUrl: null });
    expect(m.text).toContain("ostaja pri vašem ponudniku, prav tako vaša e-pošta");
    expect(m.text).toContain("stran Instalacije Rebernik je objavljena");
    expect(m.html).not.toContain("<script");
  });
});

describe("cookieless counts on a site's own domain", () => {
  it("counts the view and the taps stats.js sends to /_hit on the site's own hostname", async () => {
    const s = await site();
    await platform.repo.domains.start(s.id, "rebernik-stevec.si", "registered", {});
    await platform.repo.domains.progress("rebernik-stevec.si", { status: "active", nextInSeconds: null });
    const a = app();
    const host = "rebernik-stevec.si";
    const day = dayIn(config.stats.timeZone);
    const totals = () => platform.repo.stats.totals(s.id, day, dayIn(config.stats.timeZone, new Date(Date.now() + 86400_000)));
    const page = await a.request(`http://${host}/`, { headers: { host, "user-agent": PHONE_UA } });
    expect(page.status).toBe(200);
    for (const kind of ["call", "directions", "call", "nonsense"]) {
      const r = await a.request(`http://${host}/_hit`, { method: "POST", headers: { host, "user-agent": PHONE_UA, "content-type": "text/plain" }, body: kind });
      expect(r.status).toBe(204);
    }
    expect(await totals()).toMatchObject({ visits: 1, calls: 2, directions: 1 });
    // The platform subdomain counts too; the app's own host has no /_hit.
    const sub = `${s.slug}.stranko.example`;
    await a.request(`http://${sub}/_hit`, { method: "POST", headers: { host: sub, "user-agent": PHONE_UA }, body: "call" });
    expect((await totals()).calls).toBe(3);
    const appHost = await a.request("http://app.stranko.example/_hit", { method: "POST", headers: { host: "app.stranko.example", "user-agent": PHONE_UA, cookie: admin.cookie }, body: "call" });
    expect(appHost.status).toBe(404);
    expect((await totals()).calls).toBe(3);
  });
});
