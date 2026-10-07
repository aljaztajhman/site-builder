import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "@sb/config";
import { publishChecklist, validateSite, type ImageAsset, type Page, type SiteSpec } from "@sb/spec";
import { Brief, assembleSpec, businessFromBrief, checkFacts, clientWithholdsHours, contentOutputSchema, designFromChoice, extractJson, generatedImageCount, repairContentOutput, uniqueSectionIds, verifyBriefFacts, type ContentOutput } from "../src/index.ts";

const config = loadConfig();
const evalDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../tools/eval");
const recordingsDir = path.join(evalDir, "recordings");

const section = (id: string, props: Record<string, unknown> = {}) => ({ id, type: "cta", variant: "band", props }) as unknown as Page["sections"][number];
const page = (id: string, sections: Page["sections"]) => ({ id, kind: "standard", slug: id.slice(2), nav: { label: "x", show: true }, seo: { title: "x", description: "x" }, sections }) as Page;

describe("uniqueSectionIds", () => {
  it("renames later duplicates with the page as suffix and keeps the first page's ids", () => {
    const pages = uniqueSectionIds([page("p_home", [section("s_head"), section("s_cta")]), page("p_storitve", [section("s_head"), section("s_cta")])]);
    expect(pages.flatMap((p) => p.sections.map((s) => s.id))).toEqual(["s_head", "s_cta", "s_head_storitve", "s_cta_storitve"]);
  });

  it("points links at the renamed section of the linked page only", () => {
    const link = (p: string) => ({ label: "Več", target: { page: p, section: "s_cta" } });
    const pages = uniqueSectionIds([
      page("p_home", [section("s_cta", { primary: link("p_kontakt") })]),
      page("p_kontakt", [section("s_cta", { primary: link("p_home") })]),
    ]);
    expect((pages[0]!.sections[0]!.props as { primary: { target: unknown } }).primary.target).toEqual({ page: "p_kontakt", section: "s_cta_kontakt" });
    expect((pages[1]!.sections[0]!.props as { primary: { target: unknown } }).primary.target).toEqual({ page: "p_home", section: "s_cta" });
  });
});

describe("assembleSpec on recorded full-site answers", () => {
  // 2026-09-29: every recorded first content answer (10/10) failed validation only on section ids reused
  // across pages, which cost a second full content call each time; assembly now renames them.
  // Re-recorded 2026-10-01: 8/10 first answers validated. Two were rejected and cost a retry:
  // kmetija-grabnar for `" link": null` (now repaired: key trimmed, null dropped) and instalacije-rebernik
  // for a 64-character home SEO title (now shortened). The latter also puts a generated picture in
  // services-cards, which the schema failure hid; that isn't mechanical, so it still needs the retry and is
  // pinned here, so any other first-answer failure still fails.
  const rejectedFirstAnswers: Record<string, string[]> = {
    "instalacije-rebernik": ["/pages/0/sections/2/props/items/1/image: img_g2 is AI-generated and may only be used in hero-split, hero-image, hero-signature, image-text, page-header"],
  };

  // Site recordings only: junk/ holds the junk-check calibration's classify calls (pnpm eval:junk), not a site.
  for (const id of readdirSync(recordingsDir).filter((d) => d !== "junk")) {
    const files = readdirSync(path.join(recordingsDir, id)).sort();
    const answers = (stage: string) =>
      files.filter((x) => x.endsWith(`-${stage}.json`)).map((f) => (JSON.parse(readFileSync(path.join(recordingsDir, id, f), "utf8")) as { response: { text: string } }).response.text);
    const fixture = JSON.parse(readFileSync(path.join(evalDir, "fixtures", id, "brief.json"), "utf8")) as { description: string; photos: unknown[] };
    const { brief } = verifyBriefFacts(Brief.parse(JSON.parse(extractJson(answers("brief")[0]!))), fixture.description);
    const design = designFromChoice(JSON.parse(extractJson(answers("design")[0]!)));
    const alt = answers("altText")[0];
    const count = alt ? (JSON.parse(extractJson(alt)) as { images: unknown[] }).images.length : 0;
    const photos: ImageAsset[] = Array.from({ length: count }, (_, i) => ({ id: `img_${String(i + 1).padStart(2, "0")}`, src: "x", width: 1600, height: 1067, alt: "x" }));
    // The pictures the pipeline generates for a site with too few photos (the eval records them live).
    const wanted = generatedImageCount(config, fixture.photos.length, true, "full").wanted;
    const generated: ImageAsset[] = brief.imageIdeas.slice(0, wanted).map((idea, i) => ({ id: `img_g${i + 1}`, src: "x", width: 1536, height: 1024, alt: idea.alt.slice(0, 180), origin: "generated" }));
    const issues = (text: string): string[] => {
      // As generateContent does: mechanical repairs, then validation.
      const data: unknown = JSON.parse(extractJson(text));
      repairContentOutput(data);
      const parsed = contentOutputSchema().safeParse(data);
      if (!parsed.success) return parsed.error.issues.map((i) => `/${i.path.join("/")}: ${i.message}`);
      const spec = assembleSpec({ slug: id, brief, design, assets: { images: [...photos, ...generated] }, content: parsed.data as ContentOutput });
      const v = validateSite(spec);
      return [...(v.ok ? [] : v.issues.map((i) => `${i.path}: ${i.message}`)), ...checkFacts(spec, fixture.description).map((f) => `${f.path}: ${f.kind} "${f.value}"`)];
    };
    const content = answers("content");

    it(`${id}: the first content answer validates without a retry${rejectedFirstAnswers[id] ? " (except the pinned model mistake)" : ""}`, () => {
      expect(issues(content[0]!)).toEqual(rejectedFirstAnswers[id] ?? []);
    });

    it(`${id}: the content answer the pipeline kept validates`, () => {
      expect(issues(content.at(-1)!)).toEqual([]);
    });
  }
});

describe("opening hours the client won't publish", () => {
  const id = "racunovodstvo-seliskar";
  const files = readdirSync(path.join(recordingsDir, id)).sort();
  const answer = (stage: string) =>
    (JSON.parse(readFileSync(path.join(recordingsDir, id, files.findLast((f) => f.endsWith(`-${stage}.json`))!), "utf8")) as { response: { text: string } }).response.text;
  const fixture = JSON.parse(readFileSync(path.join(evalDir, "fixtures", id, "brief.json"), "utf8")) as { description: string };
  const { brief } = verifyBriefFacts(Brief.parse(JSON.parse(extractJson(answer("brief")))), fixture.description);
  const design = designFromChoice(JSON.parse(extractJson(answer("design"))));
  const content = (): ContentOutput => {
    const data: unknown = JSON.parse(extractJson(answer("content")));
    repairContentOutput(data);
    return contentOutputSchema().parse(data) as ContentOutput;
  };
  // The pictures generated for a site without photos, as the pipeline adds them.
  const assets = {
    images: brief.imageIdeas
      .slice(0, generatedImageCount(config, 0, true, "full").wanted)
      .map((idea, i): ImageAsset => ({ id: `img_g${i + 1}`, src: "x", width: 1536, height: 1024, alt: idea.alt.slice(0, 180), origin: "generated" })),
  };
  const wish = "Delovnega časa tudi ne bi pisali, ker se stranke vedno prej najavijo po telefonu.";
  const hoursBlockers = (spec: SiteSpec) => publishChecklist(spec).filter((b) => b.detail === "hours");

  it("dates the accessibility statement and the footer's year on the Slovenian day the site is made", () => {
    // 23:30 UTC on New Year's Eve is already 1 January in Ljubljana.
    const spec = assembleSpec({ slug: id, brief, design, assets, content: content(), now: new Date("2026-12-31T23:30:00Z") });
    expect(spec.chrome.footer.year).toBe(2027);
    const statement = spec.pages.find((p) => p.kind === "accessibility")!.sections[0]!;
    expect(statement.type === "legal" && statement.props).toEqual({ kind: "accessibility", date: "2027-01-01" });
    const privacy = spec.pages.find((p) => p.kind === "privacy")!.sections[0]!;
    expect(privacy.type === "legal" && privacy.props).toEqual({ kind: "privacy" });
    expect(validateSite(spec).ok).toBe(true);
  });

  it("the accountant's own words: no hours placeholder, nothing about hours blocks publishing", () => {
    expect(fixture.description).toContain(wish);
    expect(brief.facts.hours).toBeNull();
    const spec = assembleSpec({ slug: id, brief, design, assets, content: content(), hoursWithheld: clientWithholdsHours(fixture.description) });
    expect(spec.business.hours).toBeUndefined();
    expect(validateSite(spec).ok).toBe(true);
    expect(hoursBlockers(spec)).toEqual([]);
  });

  it("an opening-hours section the model added anyway is left out (it could only show a placeholder)", () => {
    const withSection = content();
    withSection.pages[0]!.sections.splice(1, 0, { id: "s_hours", type: "opening-hours", variant: "table", props: { title: "Delovni čas" } } as unknown as Page["sections"][number]);
    const kept = assembleSpec({ slug: id, brief, design, assets, content: structuredClone(withSection) });
    expect(hoursBlockers(kept).length).toBeGreaterThan(0);
    const spec = assembleSpec({ slug: id, brief, design, assets, content: withSection, hoursWithheld: true });
    expect(spec.pages.flatMap((p) => p.sections).some((s) => s.type === "opening-hours")).toBe(false);
    expect(hoursBlockers(spec)).toEqual([]);
  });

  it("hours simply missing keep their placeholder, which blocks publishing until filled", () => {
    const description = fixture.description.replace(wish, "");
    expect(clientWithholdsHours(description)).toBe(false);
    const spec = assembleSpec({ slug: id, brief, design, assets, content: content(), hoursWithheld: clientWithholdsHours(description) });
    expect(spec.business.hours).toEqual({ $placeholder: "hours" });
    expect(hoursBlockers(spec)).toEqual([{ path: "/business/hours", kind: "placeholder", detail: "hours" }]);
  });

  it("stated hours win over the wish", () => {
    const withHours = { ...brief, facts: { ...brief.facts, hours: [{ from: "mon" as const, to: "fri" as const, open: "08:00", close: "16:00", closed: false }] } };
    expect(businessFromBrief(withHours, { hoursWithheld: true }).hours).toMatchObject({ entries: [{ from: "mon", to: "fri", open: "08:00", close: "16:00" }] });
    expect(businessFromBrief(brief, { hoursWithheld: true }).hours).toBeUndefined();
    expect(businessFromBrief(brief).hours).toEqual({ $placeholder: "hours" });
  });
});
