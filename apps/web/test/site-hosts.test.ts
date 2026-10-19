import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, type AppConfig } from "@sb/config";
import { newReleaseId, writeRelease } from "@sb/engine";
import { sharedBundle } from "@sb/render";
import { Repo, createDb, createFsStorage, memoryMailer, migrate, type Platform, type Queue } from "@sb/platform";
import type { SiteSpec } from "@sb/spec";
import { createApp } from "../src/app.ts";
import { SITE_HOST_HEADER, SITE_PROXY_SECRET_HEADER, sitePath, siteHostResolver } from "../src/site-hosts.ts";
import { dayIn } from "../src/stats.ts";

/** Published sites on their own hostnames and on <slug>.<PLATFORM_DOMAIN> (custom-domains plan). */

const here = path.dirname(fileURLToPath(import.meta.url));
let platform: Platform;
let dir: string;
let golden: SiteSpec;
let config: AppConfig;
const enc = new TextEncoder();
const PROXY_SECRET = "p".repeat(40);

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sb-hosts-"));
  const db = await createDb("pglite://memory");
  await migrate(db);
  const queue: Queue = { send: async () => "job", work: async () => undefined, ping: async () => undefined, stop: async () => undefined };
  platform = { db, repo: new Repo(db), storage: createFsStorage(dir), queue, close: () => db.close() };
  golden = JSON.parse(await readFile(path.join(here, "../../../tools/eval/golden/pekarna-kvas.json"), "utf8")) as SiteSpec;
  config = loadConfig();
});
afterAll(async () => {
  await platform.close();
  await rm(dir, { recursive: true, force: true });
});

const app = (o: { indexSiteHosts?: boolean } = {}) =>
  createApp({
    platform,
    config: o.indexSiteHosts === undefined ? config : { ...config, seo: { ...config.seo, indexSiteHosts: o.indexSiteHosts } },
    mailer: memoryMailer(),
    appUrl: "https://app.postavi.example",
    platformDomain: "postavi.example",
    siteHostCacheMs: 0,
    siteProxySecret: PROXY_SECRET,
    auth: { password: "pw-123456789012", secret: "s".repeat(32), secureCookies: false },
  });
const get = (host: string, p: string, init: RequestInit = {}) => app().request(`http://${host}${p}`, { ...init, headers: { host, ...(init.headers as Record<string, string> | undefined) } });

/** A site with a home page, a subpage and a picture in its live release; published unless told otherwise. */
async function site(slug: string, o: { publish?: boolean } = {}): Promise<string> {
  const spec = structuredClone(golden);
  spec.slug = slug;
  const s = await platform.repo.createSite({ name: slug, slug, intake: { description: "x", photoAssetIds: [], scope: "full" } });
  const v = await platform.repo.saveSpec(s.id, spec, "generate");
  if (o.publish === false) return s.id;
  await platform.repo.markPublished(s.id, v);
  await writeRelease(
    platform.storage,
    slug,
    newReleaseId(v),
    new Map([
      [`${slug}/index.html`, enc.encode(`<!doctype html><title>${slug} domov</title>`)],
      [`${slug}/kontakt/index.html`, enc.encode(`<!doctype html><title>${slug} kontakt</title>`)],
      [`${slug}/404.html`, enc.encode("<!doctype html><title>Ni strani</title>")],
      [`${slug}/media/a.webp`, enc.encode("img")],
    ]),
  );
  return s.id;
}

describe("sitePath", () => {
  it("puts a site's files under /s/<slug>/ and the shared bundle under /s/_shared/", () => {
    expect(sitePath("pekarna", "/")).toBe("/s/pekarna/");
    expect(sitePath("pekarna", "/kontakt/")).toBe("/s/pekarna/kontakt/");
    expect(sitePath("pekarna", "/_shared/abc/site.css")).toBe("/s/_shared/abc/site.css");
    expect(sitePath("pekarna", "/admin")).toBe("/s/pekarna/admin");
  });
});

describe("a site's own domain", () => {
  it("serves the live release at the root, pages, media and the 404 page, without cookies", async () => {
    const id = await site("pekarna-domena");
    await platform.repo.domains.add(id, "pekarnadomena.si", "registered");
    // Pending: not served yet (the app answers as usual).
    expect(await (await get("pekarnadomena.si", "/")).text()).not.toContain("pekarna-domena domov");
    await platform.repo.domains.update("pekarnadomena.si", { status: "active", step: "live" });

    const home = await get("pekarnadomena.si", "/");
    expect(home.status).toBe(200);
    expect(await home.text()).toContain("pekarna-domena domov");
    expect(home.headers.get("set-cookie")).toBeNull();
    expect(home.headers.get("content-security-policy")).toContain("default-src 'self'");
    expect(await (await get("pekarnadomena.si", "/kontakt/")).text()).toContain("pekarna-domena kontakt");
    expect(await (await get("PekarnaDomena.si:443", "/media/a.webp")).text()).toBe("img");
    const miss = await get("pekarnadomena.si", "/nic/");
    expect(miss.status).toBe(404);
    expect(await miss.text()).toContain("Ni strani");
  });

  it("never reaches the dashboard, API, admin or another site from a site's host", async () => {
    const id = await site("zaprta-vrata");
    await site("druga-stran");
    await platform.repo.domains.add(id, "zaprtavrata.si", "connected");
    await platform.repo.domains.update("zaprtavrata.si", { status: "active" });
    for (const p of ["/sites", "/admin", "/api/sites", "/login", "/s/druga-stran/"]) {
      const r = await get("zaprtavrata.si", p);
      expect(r.status, p).toBe(404);
      expect(await r.text(), p).not.toContain("druga-stran domov");
    }
  });

  it("serves the shared bundle (stylesheet, fonts, scripts) at /_shared/", async () => {
    const id = await site("skupne-datoteke");
    await platform.repo.domains.add(id, "skupne.si", "registered");
    await platform.repo.domains.update("skupne.si", { status: "active" });
    const bundle = sharedBundle();
    const r = await get("skupne.si", `/_shared/${bundle.hash}/site.css`);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("text/css");
  });

  it("redirects a site's other names (www) to its primary hostname, path and query kept", async () => {
    const id = await site("glavna-domena");
    await platform.repo.domains.add(id, "glavna.si", "registered");
    await platform.repo.domains.add(id, "www.glavna.si", "registered");
    await platform.repo.domains.update("glavna.si", { status: "active" });
    await platform.repo.domains.update("www.glavna.si", { status: "active" });
    const r = await get("www.glavna.si", "/kontakt/?a=1");
    expect(r.status).toBe(301);
    expect(r.headers.get("location")).toBe("https://glavna.si/kontakt/?a=1");
  });

  it("answers 404 on a site's domain while nothing is published there", async () => {
    const id = await site("neobjavljena", { publish: false });
    await platform.repo.domains.add(id, "neobjavljena.si", "registered");
    await platform.repo.domains.update("neobjavljena.si", { status: "active" });
    const r = await get("neobjavljena.si", "/");
    expect(r.status).toBe(404);
    expect(r.headers.get("x-robots-tag")).toContain("noindex");
  });
});

describe("behind the edge Worker", () => {
  it("serves the forwarded hostname only with the right secret", async () => {
    const id = await site("prek-workerja");
    await platform.repo.domains.add(id, "prekworkerja.si", "registered");
    await platform.repo.domains.update("prekworkerja.si", { status: "active" });
    // The Worker reaches the app at its own address and names the site in a header.
    const via = (secret: string) => get("app.postavi.example", "/kontakt/", { headers: { "x-postavi-site-host": "prekworkerja.si", "x-postavi-proxy-secret": secret } });
    expect(await (await via(PROXY_SECRET)).text()).toContain("prek-workerja kontakt");
    for (const wrong of ["", "x", "q".repeat(40)]) expect(await (await via(wrong)).text()).not.toContain("prek-workerja kontakt");
  });

  it("never serves the app through the Worker: a pending domain or an unknown name is a 404", async () => {
    const id = await site("na-cakanju");
    await platform.repo.domains.add(id, "nacakanju.si", "connected");
    for (const host of ["nacakanju.si", "neznano.example", "app.postavi.example"]) {
      const res = await get("app.postavi.example", "/prijava", { headers: { "x-postavi-site-host": host, "x-postavi-proxy-secret": PROXY_SECRET } });
      expect(res.status, host).toBe(404);
      expect(res.headers.get("set-cookie"), host).toBeNull();
    }
  });

  it("uses the x-postavi-* header names", () => {
    expect([SITE_HOST_HEADER, SITE_PROXY_SECRET_HEADER]).toEqual(["x-postavi-site-host", "x-postavi-proxy-secret"]);
  });

  it("lets the stats beacon in with the site's Origin and no Sec-Fetch-Site only when the secret matched", async () => {
    const id = await site("beacon-worker");
    await platform.repo.domains.add(id, "beaconworker.si", "registered");
    await platform.repo.domains.update("beaconworker.si", { status: "active" });
    const calls = async () => (await platform.repo.stats.totals(id, dayIn(config.stats.timeZone), dayIn(config.stats.timeZone, new Date(Date.now() + 86400_000)))).calls;
    // The browser on https://beaconworker.si posts to /_hit; the app sees Railway's Host (here the app's).
    const hit = (secret: string | null) =>
      get("app.postavi.example", "/_hit", {
        method: "POST",
        headers: { origin: "https://beaconworker.si", "content-type": "text/plain", [SITE_HOST_HEADER]: "beaconworker.si", ...(secret === null ? {} : { [SITE_PROXY_SECRET_HEADER]: secret }) },
        body: "call",
      });
    expect((await hit(PROXY_SECRET)).status).toBe(204);
    expect(await calls()).toBe(1);
    for (const wrong of [null, "x"]) expect((await hit(wrong)).status).toBe(403);
    expect(await calls()).toBe(1);
    // Another site's Origin is still another site, secret or not.
    const other = await get("app.postavi.example", "/_hit", {
      method: "POST",
      headers: { origin: "https://drugastran.si", [SITE_HOST_HEADER]: "beaconworker.si", [SITE_PROXY_SECRET_HEADER]: PROXY_SECRET },
      body: "call",
    });
    expect(other.status).toBe(403);
  });
});

describe("platform subdomains", () => {
  it("serve a published site at <slug>.<PLATFORM_DOMAIN>; anything else there is a 404", async () => {
    await site("poddomena");
    await site("ni-objavljena", { publish: false });
    expect(await (await get("poddomena.postavi.example", "/")).text()).toContain("poddomena domov");
    expect((await get("ni-objavljena.postavi.example", "/")).status).toBe(404);
    expect((await get("ne-obstaja.postavi.example", "/")).status).toBe(404);
    expect((await get("a.b.postavi.example", "/")).status).toBe(404);
  });

  it("never treat the platform's own names (app., mail., www. …) as a site, even when such a slug exists", async () => {
    // A slug from before the reserved list (uniqueSlug no longer gives one out).
    await site("mail");
    const resolve = siteHostResolver({ repo: platform.repo, platformDomain: "postavi.example", appHosts: [], cacheMs: 0 });
    for (const host of ["mail.postavi.example", "www.postavi.example", "APP.postavi.example", "api.postavi.example"]) expect(await resolve(host), host).toEqual({ missing: true });
    expect(await resolve("poddomena.postavi.example")).not.toBeNull();
    const r = await get("mail.postavi.example", "/");
    expect(await r.text()).not.toContain("mail domov");
    // Not the app either: a DNS slip that sends www. or admin. here gets a 404, never the dashboard or a cookie.
    for (const host of ["mail.postavi.example", "www.postavi.example", "admin.postavi.example"]) {
      const res = await get(host, "/prijava");
      expect(res.status, host).toBe(404);
      expect(res.headers.get("set-cookie"), host).toBeNull();
    }
  });

  it("leave the app's own hosts alone", async () => {
    const r = await get("app.postavi.example", "/health");
    expect(r.status).toBe(200);
    expect((await get("localhost", "/health")).status).toBe(200);
  });
});

describe("indexing (config seo.indexSiteHosts)", () => {
  it("is off by default: every answer says noindex", async () => {
    await site("pekarna-index");
    expect((await get("pekarna-index.postavi.example", "/")).headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });

  it("when on, lets a site on its own hostname be indexed, never the app's /s/ path or dashboard", async () => {
    await site("pekarna-index-on");
    const on = app({ indexSiteHosts: true });
    const ask = (host: string, p: string) => on.request(`http://${host}${p}`, { headers: { host } });
    const home = await ask("pekarna-index-on.postavi.example", "/");
    expect(home.status).toBe(200);
    expect(home.headers.get("x-robots-tag")).toBeNull();
    expect((await ask("app.postavi.example", "/s/pekarna-index-on/")).headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect((await ask("app.postavi.example", "/")).headers.get("x-robots-tag")).toBe("noindex, nofollow");
    // A hostname with nothing published stays out of the index too.
    expect((await ask("nothing-here.postavi.example", "/")).headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });
});

describe("site_domains", () => {
  it("normalises hostnames, makes the first one primary and stamps active_at once", async () => {
    const id = await site("zapisi-domen", { publish: false });
    const a = await platform.repo.domains.add(id, "Zapisi.SI.", "registered");
    expect(a.hostname).toBe("zapisi.si");
    expect(a.is_primary).toBe(true);
    const b = await platform.repo.domains.add(id, "www.zapisi.si", "registered");
    expect(b.is_primary).toBe(false);
    await expect(platform.repo.domains.add(id, "not a host", "connected")).rejects.toThrow();
    await platform.repo.domains.update("zapisi.si", { status: "active", detail: { registrarId: 7 } });
    const first = (await platform.repo.domains.get("zapisi.si"))!.active_at;
    await platform.repo.domains.update("zapisi.si", { status: "active", detail: { certificate: "ok" } });
    const row = (await platform.repo.domains.get("zapisi.si"))!;
    expect(row.active_at).toEqual(first);
    expect(row.detail).toEqual({ registrarId: 7, certificate: "ok" });
    await platform.repo.domains.setPrimary(id, "www.zapisi.si");
    expect((await platform.repo.domains.forSite(id)).map((d) => [d.hostname, d.is_primary])).toEqual([
      ["www.zapisi.si", true],
      ["zapisi.si", false],
    ]);
  });
});
