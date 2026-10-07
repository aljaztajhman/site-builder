import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, type AppConfig } from "@sb/config";
import { newReleaseId, writeRelease } from "@sb/engine";
import { siteFiles } from "@sb/render";
import { Repo, createDb, createFsStorage, memoryMailer, migrate, type Platform, type Queue } from "@sb/platform";
import type { SiteSpec } from "@sb/spec";
import { createApp } from "../src/app.ts";
import type { BotCheck } from "../src/turnstile.ts";
import { CF_BEACON_ENDPOINT, CF_BEACON_SCRIPT } from "../src/beacon.tsx";
import { uiUrl } from "../src/ui/assets.ts";
import { adminBrowser } from "./session-helpers.ts";

/**
 * Cloudflare Web Analytics (docs/plans/analytics.md step 2): the beacon and its CSP only on the landing page, the
 * login page and the privacy policy, only on config analytics.cloudflare.hosts; never on the dashboard, the
 * editor, admin, previews, published sites (a golden, rendered and published) or the landing's example sites.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const HOST = "stranko.einvoicecheck.eu";
const TOKEN = "3fad897f56c14335aaccffae0a58ad9b";
const PASSWORD = "pw-123456789012";
const SNIPPET = `<script type="module" src="${CF_BEACON_SCRIPT}" data-cf-beacon="{&quot;token&quot;:&quot;${TOKEN}&quot;}"></script>`;

let platform: Platform;
let dir: string;
let config: AppConfig;
let siteId: string;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sb-beacon-"));
  const db = await createDb("pglite://memory");
  await migrate(db);
  const queue: Queue = { send: async () => "job", work: async () => undefined, ping: async () => undefined, stop: async () => undefined };
  platform = { db, repo: new Repo(db), storage: createFsStorage(dir), queue, close: () => db.close() };
  config = loadConfig();
  // A golden site, rendered by the component library and published, also on its own domain.
  const golden = JSON.parse(await readFile(path.join(here, "../../../tools/eval/golden/pekarna-kvas.json"), "utf8")) as SiteSpec;
  const s = await platform.repo.createSite({ name: "Pekarna Kvas", slug: "pekarna-kvas", intake: { description: "x", photoAssetIds: [], scope: "full" } });
  siteId = s.id;
  const v = await platform.repo.saveSpec(s.id, golden, "generate");
  await platform.repo.markPublished(s.id, v);
  await writeRelease(platform.storage, "pekarna-kvas", newReleaseId(v), siteFiles({ ...golden, slug: "pekarna-kvas" }, new Map()));
});
afterAll(async () => {
  await platform.close();
  await rm(dir, { recursive: true, force: true });
});

const botOn: BotCheck = { mode: "on", siteKey: "0x4AAAAAAAtest", verify: async () => true };

const makeApp = (o: { cloudflare?: AppConfig["analytics"]["cloudflare"]; appUrl?: string; botCheck?: BotCheck } = {}) =>
  createApp({
    platform,
    config: { ...config, analytics: { ...config.analytics, cloudflare: o.cloudflare ?? { token: TOKEN, hosts: [HOST] } } },
    mailer: memoryMailer(),
    appUrl: o.appUrl ?? `https://${HOST}`,
    platformDomain: "stranko.example",
    siteHostCacheMs: 0,
    auth: { password: PASSWORD, secret: "s".repeat(32), secureCookies: false },
    ...(o.botCheck ? { botCheck: o.botCheck } : {}),
  });
type App = ReturnType<typeof makeApp>;
const get = (app: App, host: string, p: string, cookie?: string) => app.request(`http://${host}${p}`, { headers: { host, ...(cookie ? { cookie } : {}) } });
const csp = (r: Response) => r.headers.get("content-security-policy") ?? "";
const directive = (r: Response, name: string) => csp(r).split(";").map((d) => d.trim()).find((d) => d.startsWith(`${name} `)) ?? "";

/** No trace of the beacon in the body or the CSP. */
async function none(r: Response, what: string) {
  expect(await r.clone().text(), what).not.toContain("cloudflareinsights");
  expect(csp(r), what).not.toContain("cloudflareinsights");
}

describe("Cloudflare Web Analytics beacon", () => {
  it("is in config: the token and the one hostname", () => {
    expect(config.analytics.cloudflare).toEqual({ token: TOKEN, hosts: [HOST] });
  });

  it("is on the landing page, the login page and the privacy policy on the configured host, with the CSP it needs", async () => {
    const app = makeApp();
    for (const p of ["/", "/?primer=gostilna", "/login", "/zasebnost"]) {
      const r = await get(app, HOST, p);
      expect(r.status, p).toBe(200);
      const body = await r.text();
      expect(body, p).toContain(SNIPPET);
      expect(body.split("cloudflareinsights").length - 1, p).toBe(1);
      expect(directive(r, "script-src"), p).toBe(`script-src 'self' ${CF_BEACON_SCRIPT}`);
      expect(directive(r, "connect-src"), p).toBe(`connect-src 'self' ${CF_BEACON_ENDPOINT}`);
      // Everything else stays as strict as before.
      expect(csp(r), p).toContain("default-src 'self'");
      expect(csp(r), p).toContain("frame-ancestors 'none'");
    }
    // The privacy policy names it.
    expect(await (await get(app, HOST, "/zasebnost")).text()).toContain("Cloudflare Web Analytics");
  });

  it("adds to Turnstile's sources on the landing page instead of replacing them", async () => {
    const r = await get(makeApp({ botCheck: botOn }), HOST, "/");
    expect(directive(r, "script-src")).toBe(`script-src 'self' https://challenges.cloudflare.com ${CF_BEACON_SCRIPT}`);
    expect(directive(r, "frame-src")).toBe("frame-src 'self' https://challenges.cloudflare.com");
    expect(directive(r, "connect-src")).toBe(`connect-src 'self' ${CF_BEACON_ENDPOINT}`);
    expect(await r.text()).toContain(SNIPPET);
  });

  it("is not there on any other host: local, tests, the railway.app address", async () => {
    for (const [app, host] of [
      [makeApp(), "localhost"],
      [makeApp(), "127.0.0.1"],
      [makeApp({ appUrl: "https://web-production-1234.up.railway.app" }), "web-production-1234.up.railway.app"],
    ] as const) {
      for (const p of ["/", "/login", "/zasebnost"]) {
        const r = await get(app, host, p);
        expect(r.status, `${host}${p}`).toBe(200);
        await none(r, `${host}${p}`);
        expect(directive(r, "connect-src")).toBe("connect-src 'self'");
      }
    }
  });

  it("is not there without a token, even on the configured host", async () => {
    const app = makeApp({ cloudflare: { token: null, hosts: [HOST] } });
    for (const p of ["/", "/login", "/zasebnost"]) await none(await get(app, HOST, p), p);
    expect(await (await get(app, HOST, "/zasebnost")).text()).not.toContain("Cloudflare Web Analytics");
  });

  it("is never on the dashboard, the editor, admin, previews, published sites or the landing's example sites", async () => {
    const app = makeApp();
    const { cookie } = await adminBrowser(app.request.bind(app), PASSWORD);
    const pages: [string, string, string?][] = [
      ["/sites", HOST, cookie],
      [`/sites/${siteId}`, HOST, cookie],
      ["/admin", HOST, cookie],
      ["/pogoji", HOST],
      ["/dostopnost", HOST],
      ["/pregled", HOST],
      [`/preview/${siteId}/index.html`, HOST, cookie],
      ["/s/pekarna-kvas/", HOST],
      ["/", "pekarna-kvas.stranko.example"],
      [uiUrl("examples/primer-frizer/index.html"), HOST],
    ];
    for (const [p, host, c] of pages) {
      const r = await get(app, host, p, c);
      expect(r.status, `${host}${p}`).toBe(200);
      await none(r, `${host}${p}`);
    }
    // The published golden is the real rendered site.
    expect(await (await get(app, HOST, "/s/pekarna-kvas/")).text()).toContain("Pekarna Kvas");
    // A form posted back to the login page (an error page) is not a page view.
    await none(await app.request(`http://${HOST}/login`, { method: "POST", headers: { host: HOST, origin: `http://${HOST}` }, body: new URLSearchParams({ password: "nope" }) }), "POST /login");
  });
});
