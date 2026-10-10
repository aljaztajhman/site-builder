import { describe, expect, it } from "vitest";
import { checkFacts } from "@sb/engine";
import { COMPOSED, loadComposed, specIssues } from "../src/compose-sheet.ts";
import { loadFixture } from "../src/fixtures/load.ts";

/**
 * The composed re-expressions of the hand-made templates (tools/eval/composed) use only facts from their fixture's brief:
 * checkFacts reads composed layout (image ratios, decor path data) as layout, so a clean spec can publish, and still
 * reads composed copy (heading text, fact values) as copy, so an invented number is caught. No browser, no model call.
 */
describe("fact check of the composed templates", () => {
  for (const t of COMPOSED) {
    it(`${t.id} ${t.name}: no fact violations against ${t.fixture}`, async () => {
      expect(specIssues(t, await loadComposed(t)).facts).toEqual([]);
    });
  }

  it("still catches an invented number in a composed heading and a composed fact value", async () => {
    const t = COMPOSED[0];
    const spec = await loadComposed(t);
    const home = spec.pages.findIndex((p) => p.kind === "home");
    const sections = spec.pages[home]!.sections;
    const si = sections.findIndex((s) => s.type === "composed" && (s.props as { elements: { kind: string }[] }).elements.some((e) => e.kind === "heading"));
    const els = (sections[si]!.props as { elements: Record<string, unknown>[] }).elements;
    const hi = els.findIndex((e) => e.kind === "heading");
    els[hi]!.text = "Že 37 let ob vaši cesti";
    els.push({ id: "e_invented", kind: "fact", desk: { col: 1, span: 3, row: 1 }, phone: { order: 20, span: "full" }, value: "9431", label: "popravil", treatment: "numeral", size: 4 });
    const found = checkFacts(spec, loadFixture(t.fixture).brief.description).map((f) => `${f.path}: ${f.kind} ${f.value}`);
    expect(found).toEqual([`/pages/${home}/sections/${si}/props/elements/${hi}/text: number 37`, `/pages/${home}/sections/${si}/props/elements/${els.length - 1}/value: number 9431`]);
  });
});
