import { describe, expect, it } from "vitest";
import { UrlRefusedError, classifyCookies, companyFacts, hostIsPrivate, isPrivateAddress, normaliseUrl, openPublicUrl, urlCheckFindings, type UrlCheckResult } from "../src/index.ts";

/** The public website checker's pure parts: which addresses it opens, what it reads, how it words it. */

describe("normaliseUrl", () => {
  it("takes what people type and refuses what isn't a public web address", () => {
    expect(normaliseUrl("www.pekarna-kvas.si")?.href).toBe("https://www.pekarna-kvas.si/");
    expect(normaliseUrl("  http://frizer.si/o-nas#top ")?.href).toBe("http://frizer.si/o-nas");
    expect(normaliseUrl("https://frizer.si:443/")?.href).toBe("https://frizer.si/");
    for (const bad of ["", "ftp://frizer.si", "file:///etc/passwd", "javascript:alert(1)", "https://user:pw@frizer.si", "https://frizer.si:8080", "localhost", "http://intranet", "http://db.railway.internal", "router.local", "a b.si"]) {
      expect(normaliseUrl(bad), bad).toBeNull();
    }
    expect(normaliseUrl("http://127.0.0.1:5000", { anyPort: true })?.port).toBe("5000");
  });
});

describe("private addresses", () => {
  it("knows the private, loopback, link-local and reserved ranges", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "::", "fd12:3456::1", "fe80::1", "::ffff:10.0.0.1", "ff02::1"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ["93.184.216.34", "172.32.0.1", "8.8.8.8", "2a00:1450:4001::200e", "::ffff:8.8.8.8"]) expect(isPrivateAddress(ip), ip).toBe(false);
  });

  it("refuses a name if any of its addresses is private (no DNS in tests)", async () => {
    const dns: Record<string, string[]> = { "pekarna.si": ["93.184.216.34"], "mixed.si": ["93.184.216.34", "10.0.0.2"], "empty.si": [] };
    const resolve = async (h: string) => {
      if (!(h in dns)) throw new Error("ENOTFOUND");
      return dns[h]!;
    };
    expect(await hostIsPrivate("pekarna.si", resolve)).toBe(false);
    expect(await hostIsPrivate("mixed.si", resolve)).toBe(true);
    expect(await hostIsPrivate("empty.si", resolve)).toBe(true);
    expect(await hostIsPrivate("[::1]", resolve)).toBe(true);
    await expect(hostIsPrivate("nope.si", resolve)).rejects.toBeInstanceOf(UrlRefusedError);
  });
});

describe("openPublicUrl: redirects followed by hand", () => {
  const resolve = async (h: string) => (h === "inner.si" ? ["10.0.0.5"] : ["93.184.216.34"]);
  const site = (routes: Record<string, { status: number; location?: string }>) => {
    const asked: string[] = [];
    const doFetch = (async (u: URL | string) => {
      const url = new URL(String(u));
      asked.push(url.href);
      const r = routes[url.href] ?? { status: 404 };
      return new Response(null, { status: r.status, headers: r.location ? { location: r.location } : {} });
    }) as typeof fetch;
    return { asked, doFetch };
  };

  it("lands where the redirects end", async () => {
    const s = site({ "http://frizer.si/": { status: 301, location: "https://frizer.si/" }, "https://frizer.si/": { status: 302, location: "/domov" }, "https://frizer.si/domov": { status: 200 } });
    const r = await openPublicUrl(new URL("http://frizer.si/"), { maxRedirects: 5, timeoutMs: 1000, resolve, fetch: s.doFetch });
    expect(r.url.href).toBe("https://frizer.si/domov");
  });

  it("never requests a private hop, an internal name or a non-web scheme", async () => {
    for (const location of ["http://inner.si/admin", "http://10.0.0.5/", "http://169.254.169.254/latest/meta-data", "http://db.railway.internal/", "file:///etc/passwd"]) {
      const s = site({ "https://frizer.si/": { status: 302, location } });
      await expect(openPublicUrl(new URL("https://frizer.si/"), { maxRedirects: 5, timeoutMs: 1000, resolve, fetch: s.doFetch }), location).rejects.toMatchObject({ reason: "private" });
      expect(s.asked).toEqual(["https://frizer.si/"]);
    }
  });

  it("stops after too many redirects and reports error pages", async () => {
    const loop = site({ "https://a.si/": { status: 302, location: "https://a.si/" } });
    await expect(openPublicUrl(new URL("https://a.si/"), { maxRedirects: 3, timeoutMs: 1000, resolve, fetch: loop.doFetch })).rejects.toMatchObject({ reason: "redirects" });
    expect(loop.asked).toHaveLength(4);
    const gone = site({});
    await expect(openPublicUrl(new URL("https://a.si/"), { maxRedirects: 3, timeoutMs: 1000, resolve, fetch: gone.doFetch })).rejects.toMatchObject({ reason: "status", message: "Stran je odgovorila z napako 404." });
  });
});

describe("companyFacts (ZEPT)", () => {
  it("finds the company details in a typical footer", () => {
    const footer = "Frizerstvo Lana, Ana Novak s.p., Glavni trg 3, 4000 Kranj · info@frizerstvo-lana.si · Matična št.: 6543210 · ID za DDV: SI12345678";
    expect(companyFacts(footer)).toEqual({ companyForm: true, address: true, email: true, registration: true, taxNumber: true });
    expect(companyFacts("Pekarna Kvas d.o.o. · MŠ 1234567000 · Davčna številka 87654321")).toMatchObject({ companyForm: true, registration: true, taxNumber: true, address: false, email: false });
  });

  it("doesn't take any number or a word ending for a detail", () => {
    expect(companyFacts("Pokličite 041 123 456. Odprto 8–16. Smo sp. zraven trgovine. Leta 2015 smo odprli.")).toEqual({ companyForm: false, address: false, email: false, registration: false, taxNumber: false });
    expect(companyFacts("Pišite nam", true).email).toBe(true);
  });
});

describe("classifyCookies", () => {
  it("sorts analytics, ads and the rest, first or third party", () => {
    const c = classifyCookies(
      [
        { name: "_ga", domain: ".frizer.si" },
        { name: "_fbp", domain: ".frizer.si" },
        { name: "IDE", domain: ".doubleclick.net" },
        { name: "PHPSESSID", domain: "www.frizer.si" },
      ],
      "www.frizer.si",
    );
    expect(c.map((x) => `${x.name}:${x.kind}:${x.thirdParty}`)).toEqual(["_ga:analytics:false", "_fbp:ads:false", "IDE:ads:true", "PHPSESSID:other:false"]);
  });
});

describe("urlCheckFindings", () => {
  const good: UrlCheckResult = {
    url: "https://frizer.si/",
    finalUrl: "https://frizer.si/",
    https: true,
    checkedAt: "2026-10-03T10:00:00Z",
    phone: { width: 360, viewportMeta: true, horizontalScroll: false, tinyTargets: 0, smallPrimaryTargets: 0, smallText: 0, hasCallLink: true, callInViewport: true },
    speed: { performance: 96, lcpMs: 1800 },
    cookiesBeforeConsent: [{ name: "PHPSESSID", domain: "frizer.si", kind: "other", thirdParty: false }],
    company: { companyForm: true, address: true, email: true, registration: true, taxNumber: true },
    lang: "sl",
  };

  it("says what is fine", () => {
    const f = urlCheckFindings(good);
    expect(f.every((x) => x.ok)).toBe(true);
    expect(f.map((x) => x.id)).toEqual(["https", "fit", "targets", "text", "call", "speed", "cookies", "company"]);
    expect(f.find((x) => x.id === "speed")!.detail).toBe("Glavna vsebina se na mobilnem omrežju prikaže v 1,8 s (ocena hitrosti 96/100).");
  });

  it("says what to fix, in Slovene with the right plural", () => {
    const bad: UrlCheckResult = {
      ...good,
      https: false,
      phone: { ...good.phone, horizontalScroll: true, tinyTargets: 3, smallPrimaryTargets: 2, smallText: 1, callInViewport: false },
      speed: { performance: 41, lcpMs: 7340 },
      cookiesBeforeConsent: [
        { name: "_ga", domain: "frizer.si", kind: "analytics", thirdParty: false },
        { name: "_ga_X1", domain: "frizer.si", kind: "analytics", thirdParty: false },
      ],
      company: { companyForm: false, address: true, email: true, registration: false, taxNumber: false },
    };
    const f = Object.fromEntries(urlCheckFindings(bad).map((x) => [x.id, x]));
    expect(Object.values(f).filter((x) => x.ok)).toEqual([]);
    expect(f.targets!.detail).toBe("5 gumbov ali povezav je premajhnih za zanesljiv dotik s prstom.");
    for (const [n, text] of [[1, "1 gumb ali povezava je premajhna"], [2, "2 gumba ali povezavi sta premajhna"], [4, "4 gumbi ali povezave so premajhni"]] as const) {
      expect(urlCheckFindings({ ...bad, phone: { ...bad.phone, tinyTargets: n, smallPrimaryTargets: 0 } }).find((x) => x.id === "targets")!.detail).toBe(`${text} za zanesljiv dotik s prstom.`);
    }
    expect(f.text!.detail).toContain("1 odstavek ima pisavo");
    expect(f.call!.title).toBe("Gumb za klic je predaleč");
    expect(f.speed!.title).toBe("Na telefonu je zelo počasna");
    expect(f.speed!.detail).toContain("7,3 s");
    expect(f.cookies!.detail).toBe("Stran nastavi 2 analitična ali oglaševalska piškotka (_ga, _ga_X1), še preden obiskovalec karkoli izbere. Zakon zahteva privolitev vnaprej.");
    expect(f.company!.detail).toContain("Na prvi strani nismo našli: ime podjetja z obliko (d.o.o., s.p. …), matična številka, davčna številka.");
  });

  it("leaves speed out when Lighthouse didn't run", () => {
    expect(urlCheckFindings({ ...good, speed: null }).map((x) => x.id)).not.toContain("speed");
  });
});
