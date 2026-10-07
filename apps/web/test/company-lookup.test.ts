import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, type AppConfig } from "@sb/config";
import { Repo, createDb, createFsStorage, memoryMailer, migrate, normaliseEmail, type Platform, type Queue } from "@sb/platform";
import type { SiteSpec } from "@sb/spec";
import { createApp } from "../src/app.ts";
import { LOOKUP_MESSAGE, lookupCompany, parseAddress, taxDigits, validTaxNumber } from "../src/company-lookup.ts";
import { adminBrowser, newBrowser, ownerSignIn, type Browser } from "./session-helpers.ts";

/**
 * Legal name and address from a Slovenian tax number via EU VIES (it-zept-lookup). No network: VIES is a fake
 * answering the way the real service did on 2026-10-07 (POST check-vat-number, a fictional company here).
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const PASSWORD = "pw-123456789012";
const URL_ = "https://vies.test/check-vat-number";
/** A fictional number with a valid check digit. */
const TAX = "10000003";

const vies = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const valid = (vatNumber = TAX) =>
  vies({
    countryCode: "SI",
    vatNumber,
    requestDate: "2026-10-07T12:15:48.696Z",
    valid: true,
    requestIdentifier: "",
    name: "PRIMER STORITVE, D.O.O.",
    address: "TESTNA ULICA 12, 1000 LJUBLJANA",
    traderName: "---",
    traderStreet: "---",
    traderPostalCode: "---",
    traderCity: "---",
    traderCompanyType: "---",
    traderNameMatch: "NOT_PROCESSED",
  });
const notValid = () => vies({ countryCode: "SI", vatNumber: TAX, valid: false, name: "---", address: "---" });

describe("asking VIES", () => {
  const deps = (fetch: typeof globalThis.fetch, timeoutMs = 4000) => ({ fetch, url: URL_, timeoutMs });

  it("reads the number as owners type it and checks its FURS check digit before asking", () => {
    expect(taxDigits("SI 1000 0003")).toBe(TAX);
    expect(taxDigits("si10000003")).toBe(TAX);
    expect(taxDigits("1000000")).toBeNull();
    expect(validTaxNumber(TAX)).toBe(true);
    // A public company's number from its own website (Krka, d.d.).
    expect(validTaxNumber("82646716")).toBe(true);
    expect(validTaxNumber("12345678")).toBe(false);
  });

  it("returns the registered name and the address in the spec's parts", async () => {
    const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({ countryCode: "SI", vatNumber: TAX });
      return valid();
    });
    expect(await lookupCompany(`SI${TAX}`, deps(fetch as unknown as typeof globalThis.fetch))).toEqual({
      found: true,
      name: "PRIMER STORITVE, D.O.O.",
      address: { street: "TESTNA ULICA 12", postalCode: "1000", city: "LJUBLJANA" },
    });
    expect(fetch).toHaveBeenCalledOnce();
    expect(parseAddress("ŠMARJEŠKA CESTA 6, 8501 NOVO MESTO")).toEqual({ street: "ŠMARJEŠKA CESTA 6", postalCode: "8501", city: "NOVO MESTO" });
    expect(parseAddress("NEKAJ BREZ POŠTE")).toBeNull();
  });

  it("an invalid number isn't sent; a number VIES doesn't know is said so", async () => {
    const fetch = vi.fn(async () => notValid());
    expect(await lookupCompany("12345678", deps(fetch as unknown as typeof globalThis.fetch))).toEqual({ found: false, reason: "invalid", message: LOOKUP_MESSAGE.invalid });
    expect(fetch).not.toHaveBeenCalled();
    expect(await lookupCompany(TAX, deps(fetch as unknown as typeof globalThis.fetch))).toEqual({ found: false, reason: "not_found", message: LOOKUP_MESSAGE.not_found });
  });

  it("a timeout, a 5xx and an odd answer are 'unavailable'; nothing of VIES's answer is logged", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const hang = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason))));
      const t0 = Date.now();
      expect(await lookupCompany(TAX, deps(hang as unknown as typeof globalThis.fetch, 600))).toMatchObject({ found: false, reason: "unavailable", message: LOOKUP_MESSAGE.unavailable });
      expect(Date.now() - t0).toBeLessThan(3000);
      const down = async () => vies({ actionSucceed: false, errorWrappers: [{ error: "MS_UNAVAILABLE", message: "TAJNO TELO ODGOVORA" }] }, 503);
      expect(await lookupCompany(TAX, deps(down))).toMatchObject({ found: false, reason: "unavailable" });
      const odd = async () => vies({ actionSucceed: false, errorWrappers: [{ error: "SERVICE_UNAVAILABLE", message: "TAJNO TELO ODGOVORA" }] });
      expect(await lookupCompany(TAX, deps(odd))).toMatchObject({ found: false, reason: "unavailable" });
      const notJson = async () => new Response("<html>TAJNO TELO ODGOVORA</html>", { status: 200 });
      expect(await lookupCompany(TAX, deps(notJson))).toMatchObject({ found: false, reason: "unavailable" });
      const refused = async () => {
        throw new TypeError("fetch failed");
      };
      expect(await lookupCompany(TAX, deps(refused))).toMatchObject({ found: false, reason: "unavailable" });
      expect(warn.mock.calls.flat().join(" ")).not.toContain("TAJNO");
    } finally {
      warn.mockRestore();
    }
  });
});

describe("POST /api/sites/:id/company-lookup", () => {
  let platform: Platform;
  let dir: string;
  let config: AppConfig;
  let admin: Browser;
  let golden: SiteSpec;
  const mail = memoryMailer();
  let answer: () => Response | Promise<Response> = () => valid();
  const calls: string[] = [];
  const fakeVies = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push(`${String(url)} ${String(init?.body)}`);
    return answer();
  }) as typeof fetch;

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "sb-company-"));
    const db = await createDb("pglite://memory");
    await migrate(db);
    const queue: Queue = { send: async () => "job", work: async () => undefined, ping: async () => undefined, stop: async () => undefined };
    platform = { db, repo: new Repo(db), storage: createFsStorage(dir), queue, close: () => db.close() };
    const base = loadConfig();
    config = { ...base, companyLookup: { ...base.companyLookup, url: URL_, perViewer: 3 } };
    golden = JSON.parse(await readFile(path.join(here, "../../../tools/eval/golden/instalacije-rebernik.json"), "utf8")) as SiteSpec;
    admin = await adminBrowser((p, init) => app().request(p, init), PASSWORD);
  }, 60_000);
  afterAll(async () => {
    await platform.close();
    await rm(dir, { recursive: true, force: true });
  });

  const app = (c: AppConfig = config) => createApp({ platform, config: c, mailer: mail, viesFetch: fakeVies, auth: { password: PASSWORD, secret: "s".repeat(32), secureCookies: false } });
  const ask = (b: Browser | null, siteId: string, taxNumber: unknown, a = app()) =>
    a.request(`/api/sites/${siteId}/company-lookup`, { method: "POST", headers: { ...(b ? { cookie: b.cookie } : {}), "content-type": "application/json" }, body: JSON.stringify({ taxNumber }) });

  let n = 0;
  async function site(owner: string): Promise<string> {
    const account = await platform.repo.accounts.signIn(owner, normaliseEmail(owner)!.key);
    const spec = structuredClone(golden);
    spec.slug = `podjetje-${++n}`;
    const s = await platform.repo.createSite({ name: spec.slug, slug: spec.slug, intake: { description: "x", photoAssetIds: [], scope: "full" }, accountId: account.id });
    await platform.repo.saveSpec(s.id, spec, "generate");
    return s.id;
  }

  it("answers the site's owner and the admin, and stores nothing", async () => {
    const owner = "lastnica@primer.si";
    const id = await site(owner);
    const before = await platform.repo.getSpec(id);
    const events = await platform.repo.listEvents(id, 0);
    const b = await ownerSignIn((p, init) => app().request(p, init), mail.sent, owner);
    for (const who of [b, admin]) {
      const r = await ask(who, id, `SI ${TAX}`);
      expect(r.status).toBe(200);
      expect(r.headers.get("cache-control")).toBe("no-store");
      expect(await r.json()).toEqual({ found: true, name: "PRIMER STORITVE, D.O.O.", address: { street: "TESTNA ULICA 12", postalCode: "1000", city: "LJUBLJANA" } });
    }
    expect(calls.at(-1)).toBe(`${URL_} {"countryCode":"SI","vatNumber":"${TAX}"}`);
    // Nothing kept: no new version, no event; the owner's fields save what they keep.
    expect((await platform.repo.getSpec(id))?.version).toBe(before?.version);
    expect(await platform.repo.listEvents(id, 0)).toEqual(events);
  });

  it("is the editor's: an anonymous visitor and another account are refused", async () => {
    const id = await site("drugi@primer.si");
    const asked = calls.length;
    expect((await ask(await newBrowser((p, init) => app().request(p, init)), id, TAX)).status).toBe(401);
    expect((await ask(null, id, TAX)).status).toBe(401);
    const other = await ownerSignIn((p, init) => app().request(p, init), mail.sent, "tujec@primer.si");
    expect((await ask(other, id, TAX)).status).toBe(404);
    expect(calls.length).toBe(asked);
  });

  it("an invalid number isn't sent on; VIES down or slow falls back with a Slovene note", async () => {
    const id = await site("tretja@primer.si");
    const asked = calls.length;
    expect(await (await ask(admin, id, "12345678")).json()).toEqual({ found: false, reason: "invalid", message: LOOKUP_MESSAGE.invalid });
    expect(await (await ask(admin, id, 42)).json()).toMatchObject({ found: false, reason: "invalid" });
    expect(calls.length).toBe(asked);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      answer = () => vies({ actionSucceed: false }, 500);
      expect(await (await ask(admin, id, TAX)).json()).toEqual({ found: false, reason: "unavailable", message: LOOKUP_MESSAGE.unavailable });
      answer = () => notValid();
      expect(await (await ask(admin, id, TAX)).json()).toEqual({ found: false, reason: "not_found", message: LOOKUP_MESSAGE.not_found });
      // Off in config: nothing is asked.
      const before = calls.length;
      expect(await (await ask(admin, id, TAX, app({ ...config, companyLookup: { ...config.companyLookup, enabled: false } }))).json()).toMatchObject({ found: false, reason: "unavailable" });
      expect(calls.length).toBe(before);
    } finally {
      answer = () => valid();
      warn.mockRestore();
    }
  });

  it("is rate-limited per viewer (config companyLookup.perViewer)", async () => {
    const owner = "cetrta@primer.si";
    const id = await site(owner);
    const a = app();
    const b = await ownerSignIn((p, init) => a.request(p, init), mail.sent, owner);
    for (let i = 0; i < config.companyLookup.perViewer; i++) expect((await ask(b, id, TAX, a)).status).toBe(200);
    const limited = await ask(b, id, TAX, a);
    expect(limited.status).toBe(429);
    expect(await limited.json()).toMatchObject({ code: "rate_limited", message: LOOKUP_MESSAGE.rateLimited });
    // Another viewer isn't held up by it.
    expect((await ask(admin, id, TAX, a)).status).toBe(200);
  });
});
