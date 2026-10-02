import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { migrateSpec, type SiteSpec } from "@sb/spec";
import { jsonLd, makeCtx, renderPage } from "../src/index.ts";

const golden = (id: string) => migrateSpec(JSON.parse(readFileSync(new URL(`../../../tools/eval/golden/${id}.json`, import.meta.url), "utf8"))) as SiteSpec;

describe("link URLs at render time", () => {
  it("resolves only http(s) URLs; call and e-mail links still come from the business facts", () => {
    const spec = golden("pekarna-kvas");
    spec.business.bookingUrl = "https://narocila.example.com/kvas";
    const ctx = makeCtx(spec, spec.pages[0]!);
    expect(ctx.href({ url: "https://example.com/a" })).toBe("https://example.com/a");
    expect(ctx.href({ url: "javascript:alert(1)" })).toBeNull();
    expect(ctx.href({ url: "data:text/html,<script>alert(1)</script>" })).toBeNull();
    expect(ctx.href({ action: "booking" })).toBe("https://narocila.example.com/kvas");
    expect(ctx.href({ action: "call" })).toBe(`tel:${spec.business.phone as string}`);
    expect(ctx.href({ action: "email" })).toBe(`mailto:${spec.business.email as string}`);
    expect(ctx.href({ action: "directions" })).toMatch(/^https:\/\/www\.google\.com\/maps\//);

    spec.business.bookingUrl = "javascript:alert(1)";
    expect(makeCtx(spec, spec.pages[0]!).href({ action: "booking" })).toBeNull();
  });

  it("never writes a javascript: link into the page", () => {
    const spec = golden("pekarna-kvas");
    const hero = spec.pages[0]!.sections[0]! as { props: Record<string, unknown> };
    hero.props = { ...hero.props, secondary: { label: "Več", target: { url: "javascript:alert(1)" } } };
    spec.business.social = [{ network: "instagram", url: "javascript:alert(2)" }];
    const out = renderPage(spec, spec.pages[0]!);
    expect(out).not.toMatch(/javascript:/i);
    expect(out).toContain('href="tel:');
  });
});

describe("JSON-LD", () => {
  it("lists the social profiles as sameAs (http(s) only)", () => {
    const spec = golden("pekarna-kvas");
    expect(JSON.parse(jsonLd(spec))).not.toHaveProperty("sameAs");
    spec.business.social = [
      { network: "instagram", url: "https://www.instagram.com/pekarnakvas" },
      { network: "facebook", url: "https://www.facebook.com/pekarnakvas" },
      { network: "tiktok", url: "javascript:alert(1)" },
    ];
    expect(JSON.parse(jsonLd(spec)).sameAs).toEqual(["https://www.instagram.com/pekarnakvas", "https://www.facebook.com/pekarnakvas"]);
  });
});
