import { describe, expect, it } from "vitest";
import { MailUnavailableError, RESEND_ENDPOINT, isDisposableEmailDomain, mailerFromEnv, normaliseEmail, resendMailer } from "../src/index.ts";

describe("normaliseEmail", () => {
  it("folds case, +tags and Gmail dots into one key, and keeps the typed address for sending", () => {
    expect(normaliseEmail("  Ana.Novak+stran@GoogleMail.com ")).toEqual({ email: "ana.novak+stran@googlemail.com", key: "ananovak@gmail.com", domain: "gmail.com" });
    expect(normaliseEmail("ananovak@gmail.com")?.key).toBe("ananovak@gmail.com");
    // Dots matter outside Gmail; +tags don't.
    expect(normaliseEmail("Ana.Novak+x@Siol.net")?.key).toBe("ana.novak@siol.net");
    expect(normaliseEmail("info@frizerstvo-lana.si")?.key).toBe("info@frizerstvo-lana.si");
  });

  it("refuses anything that isn't one plain address", () => {
    for (const bad of ["", "ana", "ana@", "@siol.net", "ana@siol", "ana@@siol.net", "ana@siol..net", "a b@siol.net", "ana@siol.net,eva@siol.net", "ana@siol.net\nBcc: x@y.si", "+tag@gmail.com", 42, null, `${"a".repeat(250)}@siol.net`]) {
      expect(normaliseEmail(bad), String(bad)).toBeNull();
    }
  });
});

describe("disposable domains", () => {
  it("refuses listed throwaway domains and their subdomains, not ordinary providers", () => {
    for (const d of ["mailinator.com", "yopmail.com", "guerrillamail.com", "x.mailinator.com", "10minutemail.com", "Temp-Mail.org"]) expect(isDisposableEmailDomain(d), d).toBe(true);
    for (const d of ["gmail.com", "siol.net", "t-2.net", "amis.net", "outlook.com", "frizerstvo-lana.si", "com"]) expect(isDisposableEmailDomain(d), d).toBe(false);
  });
});

describe("mail transports", () => {
  it("posts to Resend's send-email API with the key as a bearer token", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ id: "49a3999c" }), { status: 200 });
    }) as unknown as typeof fetch;
    const m = resendMailer({ apiKey: "re_test_key", from: "Stranko <prijava@stranko.example>", fetch: fake });
    await m.send({ to: "ana@siol.net", subject: "Prijava", text: "povezava", html: "<p>povezava</p>", idempotencyKey: "k1" });
    expect(calls[0]!.url).toBe(RESEND_ENDPOINT);
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer re_test_key");
    expect(headers["idempotency-key"]).toBe("k1");
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ from: "Stranko <prijava@stranko.example>", to: ["ana@siol.net"], subject: "Prijava", text: "povezava", html: "<p>povezava</p>" });
    const refusing = resendMailer({ apiKey: "re_x", from: "a@b.si", fetch: (async () => new Response("domain not verified", { status: 403 })) as unknown as typeof fetch });
    await expect(refusing.send({ to: "ana@siol.net", subject: "s", text: "t" })).rejects.toThrow(/HTTP 403/);
  });

  it("chooses Resend with a key, the console in development, and nothing (with a clear error) when deployed without a key", async () => {
    expect(mailerFromEnv({ RESEND_API_KEY: "re_x", EMAIL_FROM: "a@b.si" }).kind).toBe("resend");
    // Half configured: sends nothing, never stops the server.
    expect(mailerFromEnv({ RESEND_API_KEY: "re_x", NODE_ENV: "production" }).kind).toBe("disabled");
    expect(mailerFromEnv({ RESEND_API_KEY: "re_x" }).kind).toBe("disabled");
    expect(mailerFromEnv({ NODE_ENV: "development" }).kind).toBe("console");
    const off = mailerFromEnv({ NODE_ENV: "production" });
    expect(off.kind).toBe("disabled");
    await expect(off.send({ to: "a@b.si", subject: "s", text: "t" })).rejects.toBeInstanceOf(MailUnavailableError);
  });
});
