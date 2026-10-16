import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { repairRepeatedImages, repeatedImageIssues, validateSite, walkStrings, type SiteSpec } from "../src/index.ts";

/**
 * An image at most once per page (the outside review of 50 pages, 2026-10-14). The three real cases are the saved
 * specs of that review: the hero's picture again in a later section.
 */
const specs = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../eval/outside-review/review50-specs");
const load = (id: string, file = "spec-generated.json"): SiteSpec => JSON.parse(readFileSync(path.join(specs, id, file), "utf8")) as SiteSpec;

const usesPerPage = (spec: SiteSpec) =>
  spec.pages.map((p) => {
    const ids = new Set(spec.assets.images.map((i) => i.id));
    const n = new Map<string, number>();
    walkStrings(p.sections, (v) => {
      if (ids.has(v)) n.set(v, (n.get(v) ?? 0) + 1);
    });
    return n;
  });

describe("an image at most once per page", () => {
  it("finds the hero's photo again in a later section (trgovina-oljka-in-sol, products)", () => {
    const spec = load("trgovina-oljka-in-sol", "spec-regenerated.json");
    const issues = repeatedImageIssues(spec);
    expect(issues.map((i) => i.path)).toEqual(["/pages/0/sections/" + spec.pages[0]!.sections.findIndex((s) => s.id === "s_products") + "/props/items/0/image"]);
  });

  it("every photo is on the page already: the product drops its optional repeat (trgovina-oljka-in-sol)", () => {
    const spec = load("trgovina-oljka-in-sol", "spec-regenerated.json");
    const log = repairRepeatedImages(spec);
    expect(log).toEqual([expect.stringMatching(/items\/0\/image: img_01 is already shown higher on the page; dropped it here/)]);
    expect(repeatedImageIssues(spec)).toEqual([]);
    expect(validateSite(spec).ok).toBe(true);
  });

  it("swaps the later use for a photo the page doesn't show, the hero untouched", () => {
    const spec = load("trgovina-oljka-in-sol", "spec-regenerated.json");
    spec.assets.images.push({ ...spec.assets.images[1]!, id: "img_06", src: spec.assets.images[1]!.src.replace("02", "06") });
    expect(validateSite(spec).ok).toBe(true);
    const hero = spec.pages[0]!.sections[0]!;
    const heroBefore = JSON.stringify(hero.props);
    const log = repairRepeatedImages(spec);
    expect(log).toEqual([expect.stringMatching(/items\/0\/image: img_01 is already shown higher on the page; used img_06 instead/)]);
    expect(repeatedImageIssues(spec)).toEqual([]);
    expect(JSON.stringify(hero.props)).toBe(heroBefore);
    expect(validateSite(spec).ok).toBe(true);
    for (const n of usesPerPage(spec)) for (const c of n.values()) expect(c).toBe(1);
  });

  it("with two generated pictures, both on the page: the later section keeps the spec valid (cvetlicarna-marjetica)", () => {
    const spec = load("cvetlicarna-marjetica");
    expect(repeatedImageIssues(spec)).toHaveLength(1);
    const before = JSON.stringify(spec);
    // image-text requires its image and the hero shows both pictures: it stays, and the log says so.
    expect(repairRepeatedImages(spec)).toEqual([expect.stringMatching(/sections\/2\/props\/image: img_g2 .* left it \(no other image fits and the section needs one\)/)]);
    expect(JSON.stringify(spec)).toBe(before);
  });

  it("drops an optional second photo when no other fits (salon-tina: the team's inset was the hero's photo)", () => {
    const spec = load("salon-tina");
    const team = spec.pages[0]!.sections.find((s) => s.id === "s_team")!;
    expect(repeatedImageIssues(spec)).toHaveLength(1);
    const log = repairRepeatedImages(spec);
    expect(log.join("\n")).toMatch(/s?ections\/\d+\/props\/inset: img_01 is already shown higher on the page; (used img_02 instead|dropped it here)/);
    expect(repeatedImageIssues(spec)).toEqual([]);
    expect(validateSite(spec).ok).toBe(true);
    expect((team.props as { image?: string }).image).toBeDefined();
  });

  it("never swaps a portrait for another picture; drops it instead", () => {
    const spec = load("trgovina-oljka-in-sol", "spec-regenerated.json");
    const heroImage = (spec.pages[0]!.sections[0]!.props as { image: string }).image;
    spec.pages[0]!.sections.push({
      id: "s_people",
      type: "team",
      variant: "grid",
      props: { title: "Ekipa", members: [{ name: { $placeholder: "name" }, role: "Prodaja", image: heroImage }] },
    } as unknown as SiteSpec["pages"][number]["sections"][number]);
    const before = validateSite(spec);
    if (!before.ok) throw new Error(before.issues.map((i) => `${i.path} ${i.message}`).join("\n"));
    const log = repairRepeatedImages(spec);
    const people = spec.pages[0]!.sections.find((s) => s.id === "s_people")!;
    expect(log.join("\n")).toMatch(/members\/0\/image: .* dropped it here/);
    expect((people.props as { members: { image?: string }[] }).members[0]!.image).toBeUndefined();
    expect(validateSite(spec).ok).toBe(true);
  });

  it("leaves a page that shows each image once as it is", () => {
    const spec = load("trgovina-oljka-in-sol");
    const before = JSON.stringify(spec);
    expect(repeatedImageIssues(spec)).toEqual([]);
    expect(repairRepeatedImages(spec)).toEqual([]);
    expect(JSON.stringify(spec)).toBe(before);
  });
});
