import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateSite, type Page } from "@sb/spec";
import { Brief, assembleSpec, checkFacts, contentOutputSchema, designFromChoice, extractJson, uniqueSectionIds, verifyBriefFacts, type ContentOutput } from "../src/index.ts";

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
  // Every recorded first content answer (10/10 fixtures, 2026-09-29) failed validation only on
  // section ids reused across pages, which cost a second full content call each time.
  for (const id of readdirSync(recordingsDir)) {
    it(`${id}: the first content answer validates without a retry`, () => {
      const files = readdirSync(path.join(recordingsDir, id)).sort();
      const answer = (stage: string) => {
        const f = files.find((x) => x.endsWith(`-${stage}.json`));
        return f ? (JSON.parse(readFileSync(path.join(recordingsDir, id, f), "utf8")) as { response: { text: string } }).response.text : undefined;
      };
      const description = (JSON.parse(readFileSync(path.join(evalDir, "fixtures", id, "brief.json"), "utf8")) as { description: string }).description;
      const { brief } = verifyBriefFacts(Brief.parse(JSON.parse(extractJson(answer("brief")!))), description);
      const design = designFromChoice(JSON.parse(extractJson(answer("design")!)));
      const alt = answer("altText");
      const count = alt ? (JSON.parse(extractJson(alt)) as { images: unknown[] }).images.length : 0;
      const images = Array.from({ length: count }, (_, i) => ({ id: `img_${String(i + 1).padStart(2, "0")}`, src: "x", width: 1600, height: 1067, alt: "x" }));
      const content = contentOutputSchema().parse(JSON.parse(extractJson(answer("content")!))) as ContentOutput;
      const spec = assembleSpec({ slug: id, brief, design, assets: { images }, content });
      const v = validateSite(spec);
      expect(v.ok ? [] : v.issues.map((i) => `${i.path}: ${i.message}`)).toEqual([]);
      expect(checkFacts(spec, description)).toEqual([]);
    });
  }
});
