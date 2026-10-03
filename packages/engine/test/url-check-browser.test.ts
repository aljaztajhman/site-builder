import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { loadConfig, type AppConfig } from "@sb/config";
import { UrlRefusedError, checkUrl, launchCheckBrowser, type CheckBrowser } from "../src/index.ts";

/**
 * The website checker on real pages in Chromium. Two names point at one local server: Chromium maps both
 * to 127.0.0.1 (--host-resolver-rules), while the checker's own resolver says public.test is public and
 * inner.test private, so the private-address guard is exercised the way it runs in the worker.
 */

const HEAD = '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{font:17px/1.5 sans-serif;margin:0;padding:16px}a.btn{display:inline-block;padding:14px 18px;margin:8px 0}</style>';
const PAGES: Record<string, string> = {
  "/good": `<!doctype html><html lang="sl"><head>${HEAD}<title>Frizer</title></head><body><header><a class="btn" href="tel:+38641123456">Pokliči</a></header><main><p>Striženje in barvanje v Kranju.</p></main><footer><p>Ana Novak s.p., Glavni trg 3, 4000 Kranj, <a href="mailto:info@frizer.test">info@frizer.test</a>, matična številka 6543210, ID za DDV SI12345678</p></footer></body></html>`,
  "/bad": `<!doctype html><html><head><meta charset="utf-8"><title>Stara stran</title><script>document.cookie="_ga=GA1.1.123; path=/";document.cookie="_fbp=fb.1.2; path=/";</script></head><body><div style="width:900px"><p style="font-size:12px">Dobrodošli na naši spletni strani.</p><a href="/x" style="font-size:9px">x</a> <a href="/y" style="font-size:9px">y</a></div></body></html>`,
  "/leaky": `<!doctype html><html lang="sl"><head>${HEAD}</head><body><main><p>Stran, ki kliče notranje naslove.</p><img src="http://inner.test:PORT/secret.png" alt=""><iframe src="http://inner.test:PORT/frame"></iframe></main><script>fetch("http://inner.test:PORT/api").catch(()=>{});</script></body></html>`,
};

let server: Server;
let port: number;
const hits: string[] = [];
let cb: CheckBrowser;
let config: AppConfig;
const resolve = async (h: string) => (h === "inner.test" ? ["10.0.0.5"] : h === "public.test" ? ["93.184.216.34"] : []);
// Node's own requests (the redirect walk) go to the same server; the test setup allows only 127.0.0.1.
const localFetch = ((u: URL | string, init?: RequestInit) => {
  const url = new URL(String(u));
  url.hostname = "127.0.0.1";
  return fetch(url, init);
}) as typeof fetch;

beforeAll(async () => {
  server = createServer((req, res) => {
    const host = (req.headers.host ?? "").split(":")[0]!;
    hits.push(`${host}${req.url}`);
    if (req.url === "/to-inner") {
      res.writeHead(302, { location: `http://inner.test:${port}/` }).end();
      return;
    }
    const body = PAGES[req.url ?? ""];
    if (!body) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(body.replaceAll("PORT", String(port)));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  port = (server.address() as AddressInfo).port;
  const base = loadConfig();
  config = { ...base, checker: { ...base.checker, lighthouse: false, settleMs: 300, pageTimeoutMs: 15_000 } };
  cb = await launchCheckBrowser([`--host-resolver-rules=MAP public.test 127.0.0.1, MAP inner.test 127.0.0.1`]);
}, 60_000);

afterAll(async () => {
  await cb?.close();
  server?.close();
});

const check = (path: string) => checkUrl(`http://public.test:${port}${path}`, { browser: cb, config, anyPort: true, resolve, fetch: localFetch });

describe("checkUrl in Chromium", () => {
  it("a good small-business page passes everything it can measure", async () => {
    const r = await check("/good");
    expect(r.finalUrl).toBe(`http://public.test:${port}/good`);
    expect(r.phone).toMatchObject({ width: 360, viewportMeta: true, horizontalScroll: false, smallText: 0, hasCallLink: true, callInViewport: true });
    expect(r.company).toEqual({ companyForm: true, address: true, email: true, registration: true, taxNumber: true });
    expect(r.cookiesBeforeConsent).toEqual([]);
    expect(r.speed).toBeNull();
    expect(r.lang).toBe("sl");
  }, 60_000);

  it("an old page: not fitted to phones, tiny links, small text, tracking cookies before consent", async () => {
    const r = await check("/bad");
    expect(r.phone).toMatchObject({ viewportMeta: false, hasCallLink: false, callInViewport: false });
    expect(r.phone.tinyTargets).toBeGreaterThanOrEqual(2);
    expect(r.cookiesBeforeConsent.map((c) => `${c.name}:${c.kind}`).sort()).toEqual(["_fbp:ads", "_ga:analytics"]);
    expect(r.company.registration).toBe(false);
  }, 60_000);

  it("never lets the browser reach a private address, from a page or through a redirect", async () => {
    hits.length = 0;
    const r = await check("/leaky");
    expect(r.phone.width).toBe(360);
    expect(hits).toContain("public.test/leaky");
    expect(hits.filter((h) => h.startsWith("inner.test"))).toEqual([]);

    hits.length = 0;
    await expect(check("/to-inner")).rejects.toBeInstanceOf(UrlRefusedError);
    expect(hits.filter((h) => h.startsWith("inner.test"))).toEqual([]);
  }, 60_000);
});
