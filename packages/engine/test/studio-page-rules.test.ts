import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { migrateSpec, repairRepeatedSentences, validateSite, type ComposedProps, type SiteSpec } from "@sb/spec";
import { renderedPageText } from "../src/page-text.ts";
import { repairStudioPage, studioPageIssues, type PageRule } from "../src/studio/page-rules.ts";

/**
 * The Review 50 rules on the studio's composed homepages. The fixtures are real shoot-out pages (pnpm studio:poc --fresh
 * --mode mockup --replay, 2026-10-15, before these repairs), trimmed to the homepage and the legal pages.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const load = (id: string): SiteSpec => migrateSpec(JSON.parse(readFileSync(path.join(here, "fixtures/studio-pages", `${id}.json`), "utf8")));
const home = (spec: SiteSpec) => spec.pages.find((p) => p.kind === "home")!;
const section = (spec: SiteSpec, id: string) => home(spec).sections.find((s) => s.id === id);
const els = (spec: SiteSpec, id: string) => (section(spec, id)!.props as ComposedProps).elements;
const rules = (spec: SiteSpec) => studioPageIssues(spec).map((i) => i.rule);
const count = (spec: SiteSpec, rule: PageRule) => rules(spec).filter((r) => r === rule).length;

describe("the studio's homepage keeps the Review 50 rules", () => {
  it("(a) the hours print their note: the text beside them that says it again goes (sirarna-pr-simnu s_hours)", () => {
    const spec = load("sirarna-pr-simnu");
    expect(count(spec, "sentence")).toBe(1);
    expect(els(spec, "s_hours").map((e) => e.id)).toContain("e_hn");
    repairStudioPage(spec);
    expect(count(spec, "sentence")).toBe(0);
    expect(els(spec, "s_hours").map((e) => e.kind)).toEqual(["heading", "hours"]);
    expect(validateSite(spec).ok).toBe(true);
  });

  it("(a) a list item said again in a later section's list goes there; today's repair alone can't (atelje-bergant)", () => {
    const repeated = "Ogled parcele ali hiše na terenu";
    const items = (spec: SiteSpec, id: string) => (els(spec, id).find((e) => e.kind === "list") as { items: unknown[] }).items;
    const plain = load("atelje-bergant");
    expect(repairRepeatedSentences(plain, renderedPageText).some((l) => l.includes("left it"))).toBe(true);
    const spec = load("atelje-bergant");
    expect(count(spec, "sentence")).toBe(1);
    const lines = repairStudioPage(spec);
    expect(lines.some((l) => l.includes("ogled parcele ali hiše na terenu") && l.includes("dropped it here"))).toBe(true);
    expect(items(spec, "s_story")).toContain(repeated);
    expect(items(spec, "s_highlights")).not.toContain(repeated);
    expect(count(spec, "sentence")).toBe(0);
    expect(validateSite(spec).ok).toBe(true);
  });

  it("(b) beside a map the contact element leaves out the address the map prints (pivovarna-rov s_contact)", () => {
    const spec = load("pivovarna-rov");
    expect(count(spec, "contact")).toBe(1);
    repairStudioPage(spec);
    expect(els(spec, "s_contact").find((e) => e.kind === "contact")).toMatchObject({ show: ["email"] });
    expect(els(spec, "s_contact").some((e) => e.kind === "map")).toBe(true);
    expect(count(spec, "contact")).toBe(0);
    expect(validateSite(spec).ok).toBe(true);
  });

  it("(c) a prices or products section that is a heading and one short line goes (kolesarski s_prices, sirarna s_products)", () => {
    for (const [id, sid] of [
      ["kolesarski-servis-ovinek", "s_prices"],
      ["sirarna-pr-simnu", "s_products"],
    ] as const) {
      const spec = load(id);
      expect(count(spec, "empty"), id).toBe(1);
      const n = home(spec).sections.length;
      repairStudioPage(spec);
      expect(section(spec, sid), id).toBeUndefined();
      expect(home(spec).sections.length, id).toBe(n - 1);
      expect(count(spec, "empty"), id).toBe(0);
      expect(validateSite(spec).ok, id).toBe(true);
    }
  });

  it("(e) the hero's picture again in the story is swapped for one the page doesn't show (steklarstvo-vrhovnik)", () => {
    const spec = load("steklarstvo-vrhovnik");
    expect(count(spec, "image")).toBe(1);
    repairStudioPage(spec);
    expect(els(spec, "s_hero").find((e) => e.kind === "image")).toMatchObject({ image: "img_g1" });
    expect(els(spec, "s_story").find((e) => e.kind === "image")).toMatchObject({ image: "img_g2" });
    expect(count(spec, "image")).toBe(0);
    expect(validateSite(spec).ok).toBe(true);
  });

  it("the hours in full once a page: the contact section's copy goes when an hours section shows them (steklarstvo-vrhovnik)", () => {
    const spec = load("steklarstvo-vrhovnik");
    expect(count(spec, "visit")).toBe(1);
    repairStudioPage(spec);
    expect(els(spec, "s_hours").some((e) => e.kind === "hours")).toBe(true);
    expect(els(spec, "s_contact").some((e) => e.kind === "hours")).toBe(false);
    expect(count(spec, "visit")).toBe(0);
  });

  it("all five pages: nothing left, as valid as before, and a second pass changes nothing", () => {
    for (const id of ["atelje-bergant", "sirarna-pr-simnu", "pivovarna-rov", "kolesarski-servis-ovinek", "steklarstvo-vrhovnik"]) {
      const spec = load(id);
      expect(validateSite(spec).ok, id).toBe(true);
      const lines = repairStudioPage(spec);
      expect(lines.filter((l) => l.startsWith("still")), id).toEqual([]);
      expect(validateSite(spec).ok, id).toBe(true);
      const once = JSON.stringify(spec);
      expect(repairStudioPage(spec), id).toEqual([]);
      expect(JSON.stringify(spec), id).toBe(once);
    }
  }, 60_000);
});
