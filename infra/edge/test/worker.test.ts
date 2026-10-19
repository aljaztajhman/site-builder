import { describe, expect, it } from "vitest";
import { RESERVED_SITE_LABELS } from "../../../packages/platform/src/reserved-labels.ts";
import worker, { RESERVED_LABELS, SITE_HOST_HEADER, SITE_PROXY_SECRET_HEADER, SITE_VISITOR_IP_HEADER, handle, isPlatformOwnHost, type Env } from "../src/worker.ts";
import { SITE_HOST_HEADER as APP_HOST_HEADER, SITE_PROXY_SECRET_HEADER as APP_SECRET_HEADER, SITE_VISITOR_IP_HEADER as APP_IP_HEADER } from "../../../apps/web/src/site-hosts.ts";

const env: Env = { ORIGIN: "https://web-production.up.railway.app", SITE_PROXY_SECRET: "s3cret-for-tests", PLATFORM_DOMAIN: "postavi.si" };

/** A fetch that records what the Worker sent and answers 200 (or what `answer` returns). */
function recorder(answer: () => Response = () => new Response("ok")) {
  const seen: Request[] = [];
  const fetcher = (async (input: RequestInfo | URL) => {
    seen.push(input as Request);
    return answer();
  }) as typeof fetch;
  return { seen, fetcher };
}

describe("edge Worker", () => {
  it("forwards method, path, query, body and headers to the origin, naming the visitor's hostname with the secret", async () => {
    const { seen, fetcher } = recorder();
    const r = await handle(
      new Request("https://www.pekarnakvas.si/kontakt/_submit?x=1&y=2", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", origin: "https://www.pekarnakvas.si", "user-agent": "Telefon", "cf-connecting-ip": "203.0.113.7" },
        body: "ime=Ana&sporocilo=Zdravo",
      }),
      env,
      fetcher,
    );
    expect(r.status).toBe(200);
    expect(seen).toHaveLength(1);
    const sent = seen[0]!;
    expect(sent.url).toBe("https://web-production.up.railway.app/kontakt/_submit?x=1&y=2");
    expect(sent.method).toBe("POST");
    expect(sent.redirect).toBe("manual");
    expect(await sent.text()).toBe("ime=Ana&sporocilo=Zdravo");
    expect(sent.headers.get(SITE_HOST_HEADER)).toBe("www.pekarnakvas.si");
    expect(sent.headers.get(SITE_PROXY_SECRET_HEADER)).toBe("s3cret-for-tests");
    expect(sent.headers.get("x-forwarded-proto")).toBe("https");
    expect(sent.headers.get("x-forwarded-host")).toBe("www.pekarnakvas.si");
    expect(sent.headers.get(SITE_VISITOR_IP_HEADER)).toBe("203.0.113.7");
    expect(sent.headers.get("content-type")).toBe("application/x-www-form-urlencoded");
    expect(sent.headers.get("origin")).toBe("https://www.pekarnakvas.si");
    expect(sent.headers.get("user-agent")).toBe("Telefon");
  });

  it("serves platform subdomains of sites and GETs without a body", async () => {
    const { seen, fetcher } = recorder();
    await handle(new Request("https://pekarna-kvas.postavi.si/"), env, fetcher);
    expect(seen[0]!.url).toBe("https://web-production.up.railway.app/");
    expect(seen[0]!.method).toBe("GET");
    expect(seen[0]!.body).toBeNull();
    expect(seen[0]!.headers.get(SITE_HOST_HEADER)).toBe("pekarna-kvas.postavi.si");
  });

  it("never sends the request (or the secret) to another host, whatever the path", async () => {
    for (const path of ["//attacker.example/steal", "///attacker.example/x", "/\\attacker.example/x", "/%2F%2Fattacker.example/x"]) {
      const { seen, fetcher } = recorder();
      await handle(new Request(`https://pekarna-kvas.postavi.si${path}?a=1`), env, fetcher);
      const target = new URL(seen[0]!.url);
      expect(target.origin, path).toBe(env.ORIGIN);
      expect(target.search).toBe("?a=1");
    }
  });

  it("passes the visitor's IP in its own header and drops a forged one", async () => {
    const { seen, fetcher } = recorder();
    await handle(new Request("https://pekarnakvas.si/", { headers: { "cf-connecting-ip": "203.0.113.7", [SITE_VISITOR_IP_HEADER]: "1.1.1.1" } }), env, fetcher);
    expect(seen[0]!.headers.get(SITE_VISITOR_IP_HEADER)).toBe("203.0.113.7");
    const other = recorder();
    await handle(new Request("https://pekarnakvas.si/", { headers: { [SITE_VISITOR_IP_HEADER]: "1.1.1.1" } }), env, other.fetcher);
    expect(other.seen[0]!.headers.get(SITE_VISITOR_IP_HEADER)).toBeNull();
  });

  it("drops incoming copies of the site-host and secret headers", async () => {
    const { seen, fetcher } = recorder();
    await handle(new Request("https://pekarnakvas.si/", { headers: { [SITE_HOST_HEADER]: "app.postavi.si", [SITE_PROXY_SECRET_HEADER]: "guess" } }), env, fetcher);
    expect(seen[0]!.headers.get(SITE_HOST_HEADER)).toBe("pekarnakvas.si");
    expect(seen[0]!.headers.get(SITE_PROXY_SECRET_HEADER)).toBe("s3cret-for-tests");
  });

  it("passes the app's redirects through instead of following them", async () => {
    const { fetcher } = recorder(() => new Response(null, { status: 301, headers: { location: "https://pekarnakvas.si/" } }));
    const r = await handle(new Request("https://www.pekarnakvas.si/"), env, fetcher);
    expect(r.status).toBe(301);
    expect(r.headers.get("location")).toBe("https://pekarnakvas.si/");
  });

  it("never forwards the apex or the platform's own names (404, nothing fetched)", async () => {
    const { seen, fetcher } = recorder();
    for (const host of ["postavi.si", "www.postavi.si", "app.postavi.si", "mail.postavi.si", "APP.postavi.si", "x.mail.postavi.si", "stranko.postavi.si"]) {
      const r = await handle(new Request(`https://${host}/login`), env, fetcher);
      expect(r.status, host).toBe(404);
      expect(r.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    }
    expect(seen).toHaveLength(0);
  });

  it("knows the platform's own hosts; customers' domains and site subdomains are not", () => {
    expect(isPlatformOwnHost("postavi.si.", "postavi.si")).toBe(true);
    expect(isPlatformOwnHost("api.postavi.si", "postavi.si")).toBe(true);
    expect(isPlatformOwnHost("mail-2.postavi.si", "postavi.si")).toBe(false);
    expect(isPlatformOwnHost("www.pekarnakvas.si", "postavi.si")).toBe(false);
    expect(isPlatformOwnHost("app.pekarnakvas.si", "postavi.si")).toBe(false);
    expect(isPlatformOwnHost("notpostavi.si", "postavi.si")).toBe(false);
  });

  it("defaults PLATFORM_DOMAIN to postavi.si and answers 503 when not configured", async () => {
    const { seen, fetcher } = recorder();
    expect((await handle(new Request("https://app.postavi.si/"), { ORIGIN: env.ORIGIN, SITE_PROXY_SECRET: "x" }, fetcher)).status).toBe(404);
    expect((await handle(new Request("https://pekarnakvas.si/"), { ORIGIN: "", SITE_PROXY_SECRET: "x" }, fetcher)).status).toBe(503);
    expect((await handle(new Request("https://pekarnakvas.si/"), { ORIGIN: env.ORIGIN, SITE_PROXY_SECRET: "" }, fetcher)).status).toBe(503);
    expect(seen).toHaveLength(0);
  });

  it("is a module Worker with a fetch handler", () => {
    expect(typeof worker.fetch).toBe("function");
  });

  it("keeps the reserved labels and header names equal to the app's", () => {
    expect([...RESERVED_LABELS].sort()).toEqual([...RESERVED_SITE_LABELS].sort());
    expect(SITE_HOST_HEADER).toBe(APP_HOST_HEADER);
    expect(SITE_PROXY_SECRET_HEADER).toBe(APP_SECRET_HEADER);
    expect(SITE_VISITOR_IP_HEADER).toBe(APP_IP_HEADER);
  });
});
