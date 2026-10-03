import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { migrateSpec, type SiteSpec } from "@sb/spec";
import { renderPage } from "../src/index.ts";

const golden = (id: string) => migrateSpec(JSON.parse(readFileSync(new URL(`../../../tools/eval/golden/${id}.json`, import.meta.url), "utf8"))) as SiteSpec;
const privacyOf = (spec: SiteSpec) => spec.pages.find((p) => p.kind === "privacy")!;
const CONSENT_JS = /<script src="[^"]*\/js\/consent\.js" defer="">/;

describe("cookie settings on the privacy page", () => {
  it("loads consent.js and the notice (closed until asked for) when the site has consent-gated embeds", () => {
    // pekarna-kvas has a contact section (map behind consent) and a privacy page that promises the footer button.
    const spec = golden("pekarna-kvas");
    const out = renderPage(spec, privacyOf(spec));
    expect(out).toContain("»Nastavitve piškotkov« v nogi");
    expect(out).toMatch(CONSENT_JS);
    expect(out).toContain('data-consent-open=""');
    expect(out).toMatch(/<section id="consent" class="consent" aria-labelledby="consent-title" data-consent-notice="" data-consent-on-request="" hidden="">/);
  });

  it("opens the notice on its own only on pages with embeds", () => {
    const spec = golden("pekarna-kvas");
    const contactPage = spec.pages.find((p) => p.sections.some((s) => s.type === "contact"))!;
    const out = renderPage(spec, contactPage);
    expect(out).toMatch(CONSENT_JS);
    expect(out).not.toContain("data-consent-on-request");
    const js = readFileSync(new URL("../../components/islands/consent.js", import.meta.url), "utf8");
    expect(js).toContain('!notice.hasAttribute("data-consent-on-request")');
  });

  it("leaves consent.js off the privacy page of a site without consent-gated embeds", () => {
    // frizerstvo-lana's only contact section is the call-out, which has no map: nothing on the site asks for consent.
    const spec = golden("frizerstvo-lana");
    expect(spec.pages.flatMap((p) => p.sections).filter((s) => s.type === "contact").map((s) => s.variant)).toEqual(["call-out"]);
    const out = renderPage(spec, privacyOf(spec));
    expect(out).not.toMatch(CONSENT_JS);
    expect(out).not.toContain("data-consent-notice");
  });

  it("shows no cookie notice on a page whose contact is the call-out (no map), and does with a map", () => {
    const spec = golden("frizerstvo-lana");
    const home = renderPage(spec, spec.pages[0]!);
    expect(home).not.toMatch(CONSENT_JS);
    expect(home).not.toContain("data-consent-notice");
    const withMap = structuredClone(spec);
    const call = withMap.pages[0]!.sections.find((s) => s.type === "contact")!;
    call.variant = "stacked";
    expect(renderPage(withMap, withMap.pages[0]!)).toMatch(CONSENT_JS);
  });
});
