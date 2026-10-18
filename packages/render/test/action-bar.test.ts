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

  it("hides the hero's own call button on a phone when the bar shows it from the start", () => {
    const spec = golden("pekarna-kvas");
    const home = spec.pages[0]!;
    // pekarna's hero: "Pokličite" + a page link, the bar from the start: two call buttons stacked on a phone.
    const out = renderPage(spec, home);
    expect(out).toContain('class="has-action-bar bar-covers-hero-call"');
    expect(out).toMatch(/<a href="tel:[^"]+" data-action="call" class="btn btn--primary"/);
    // The hero offers call and directions: the bar waits for it to scroll away, so the hero keeps its button.
    const both = structuredClone(spec);
    const hero = both.pages[0]!.sections[0]! as { props: Record<string, unknown> };
    hero.props = { ...hero.props, secondary: { label: "Navodila za pot", target: { action: "directions" } } };
    expect(renderPage(both, both.pages[0]!)).toContain('<body data-imagery="offset-block" class="has-action-bar">');
    // No bar: nothing hidden.
    const noBar = structuredClone(spec);
    noBar.chrome.mobileActionBar = false;
    expect(renderPage(noBar, noBar.pages[0]!)).not.toContain("bar-covers-hero-call");
  });

  it("hides the hero's own directions on a phone when the bar shows them from the start (M1: the link sat under the bar)", () => {
    const spec = golden("pekarna-kvas");
    const hero = spec.pages[0]!.sections[0]! as { props: Record<string, unknown> };
    hero.props = { ...hero.props, primary: { label: "Kako do nas", target: { action: "directions" } }, secondary: undefined };
    expect(renderPage(spec, spec.pages[0]!)).toContain('class="has-action-bar bar-covers-hero-directions"');
  });

  it("the header that carries call and directions: the hero doesn't repeat them on a phone", () => {
    const spec = golden("pekarna-kvas");
    spec.design.skeleton = { header: "bar", actions: "header", footer: "columns", footerTone: "alt", width: "contained", cards: "filled", buttons: "soft", dividers: "motif", photoRatio: "standard" };
    const hero = spec.pages[0]!.sections[0]! as { props: Record<string, unknown> };
    hero.props = { ...hero.props, secondary: { label: "Navodila za pot", target: { action: "directions" } } };
    expect(renderPage(spec, spec.pages[0]!)).toMatch(/<body [^>]*class="header-covers-hero-call header-covers-hero-directions"/);
  });
});

describe("the call and the directions at most twice on a phone (markRepeatedActions)", () => {
  const actions = (html: string, re: RegExp) => [...html.slice(html.indexOf("<main")).matchAll(/<a\b[^>]*>/g)].map((m) => m[0]).filter((t) => re.test(t));

  it("marks every call action after the first in the page; the bar's and the header's stay", () => {
    // instalacije-rebernik: a call in the hero, the steps, the service area and the closing band (5 with the bar, review M1).
    const spec = golden("instalacije-rebernik");
    const out = renderPage(spec, spec.pages[0]!);
    const calls = actions(out.slice(0, out.indexOf('class="action-bar')), /data-action="call"/);
    expect(calls.length).toBeGreaterThanOrEqual(3);
    expect(calls.filter((t) => !t.includes("data-repeat"))).toHaveLength(1);
    expect(calls[0]).not.toContain("data-repeat");
    expect(out.slice(out.indexOf('class="action-bar'))).not.toContain("data-repeat");
  });

  it("marks later directions links whichever component drew them, and leaves phone numbers and fact objects alone", () => {
    const spec = golden("pekarna-kvas");
    const out = renderPage(spec, spec.pages[0]!);
    const dirs = actions(out.slice(0, out.indexOf('class="action-bar')), /google\.com\/maps/);
    expect(dirs.length).toBeGreaterThanOrEqual(2);
    expect(dirs.filter((t) => !t.includes("data-repeat"))).toHaveLength(1);
    expect(actions(out, /href="tel:[^"]*"(?![^>]*data-action)/).every((t) => !t.includes("data-repeat"))).toBe(true);
  });

  it("marks nothing without a bar, a floating button or a header that carries the actions", () => {
    const spec = golden("instalacije-rebernik");
    spec.chrome.mobileActionBar = false;
    spec.chrome.header.cta = "none";
    expect(renderPage(spec, spec.pages[0]!)).not.toContain("data-repeat");
  });

  it("at every width when a sticky header carries the action (review 50 at 1280 px), on phones only when only the bar does", () => {
    // instalacije-rebernik: the chrome header's call button scrolls away with the header, so at desktop width the page's
    // own calls stay (review: the closing band lost its call).
    const spec = golden("instalacije-rebernik");
    const chrome = renderPage(spec, spec.pages[0]!);
    expect(chrome).toContain('data-repeat=""');
    expect(chrome).not.toContain('data-repeat="all"');
    // The header that carries call and directions (actions "header"): both kinds at every width.
    const header = golden("pekarna-kvas");
    header.design.skeleton = { header: "bar", actions: "header", footer: "columns", footerTone: "alt", width: "contained", cards: "filled", buttons: "soft", dividers: "motif", photoRatio: "standard" };
    const out = renderPage(header, header.pages[0]!);
    const repeats = [...out.matchAll(/<a data-repeat="([^"]*)"[^>]*>/g)];
    expect(repeats.some((m) => m[0].includes("google.com/maps"))).toBe(true);
    // Except in a closing band, which keeps its button at desktop width (hidden on phones only).
    const band = out.slice(out.search(/<section\b[^>]*\bs-cta\b/));
    expect(repeats.filter((m) => !band.includes(m[0])).every((m) => m[1] === "all")).toBe(true);
    expect(band).not.toContain('data-repeat="all"');
  });
});
