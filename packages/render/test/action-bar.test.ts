import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { migrateSpec, type SiteSpec } from "@sb/spec";
import { renderPage } from "../src/index.ts";

const golden = (id: string) => migrateSpec(JSON.parse(readFileSync(new URL(`../../../tools/eval/golden/${id}.json`, import.meta.url), "utf8"))) as SiteSpec;

describe("phone call bar", () => {
  it("waits for the hero to scroll away only when the hero itself offers call and directions", () => {
    const spec = golden("pekarna-kvas");
    const home = spec.pages[0]!;
    const hero = home.sections[0]! as { props: Record<string, unknown> };
    // pekarna's hero: call + "Kaj pečemo" (a page link), so the bar stays from the start.
    expect(renderPage(spec, home)).toContain('class="action-bar"');
    const both = structuredClone(spec);
    const bothHero = both.pages[0]!.sections[0]! as { props: Record<string, unknown> };
    bothHero.props = { ...hero.props, secondary: { label: "Navodila za pot", target: { action: "directions" } } };
    const out = renderPage(both, both.pages[0]!);
    expect(out).toContain('class="action-bar action-bar--after-hero"');
    // Other pages open with a page header, so the bar is there from the start.
    expect(renderPage(both, both.pages[1]!)).toContain('class="action-bar"');
  });
});
