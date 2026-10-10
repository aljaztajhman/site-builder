import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ComposedProps, GENERATED_IMAGE_INTENTS, Section, SECTION_DEFS, intentOfSection, toModelJsonSchema, validateSite, type SiteSpec } from "../src/index.ts";

/** A composed opener in the spirit of template M (Tablica): the phone as a registration plate beside a workshop photo. */
export const SAMPLE_COMPOSED = {
  id: "s_plate_open",
  type: "composed",
  variant: "free",
  props: {
    intent: "hero",
    width: "wide",
    minHeight: "l",
    rows: 3,
    elements: [
      { id: "e_title", kind: "heading", text: "Servis vseh znamk v Kranju", level: 1, size: 7, weight: 800, measure: "m", desk: { col: 1, span: 7, row: 1 }, phone: { order: 0, span: "full" } },
      { id: "e_plate", kind: "fact", value: "041 555 730", label: "Pokličite za termin", treatment: "plate", size: 5, desk: { col: 1, span: 6, row: 2 }, phone: { order: 1, span: "full" } },
      { id: "e_call", kind: "action", action: "call", label: "Pokliči", style: "primary", desk: { col: 1, span: 3, row: 3, alignY: "start" }, phone: { order: 2, span: "full" } },
      { id: "e_photo", kind: "image", image: "img_delavnica", ratio: "4:5", mask: "cut", desk: { col: 8, span: 5, row: 1, rowSpan: 3, layer: 1 }, phone: { order: 3, span: "full" } },
      { id: "e_mark", kind: "decor", motif: "plate", desk: { col: 11, span: 2, row: 3, layer: 2, shiftY: 1 }, phone: { order: 4, span: "half", hidden: true } },
    ],
  },
} as const;

describe("composed sections (spec v19)", () => {
  it("parse as a Section and keep their intent", () => {
    const parsed = Section.parse(SAMPLE_COMPOSED);
    expect(parsed.type).toBe("composed");
    expect(intentOfSection(parsed)).toBe("hero");
  });

  it("reject unknown element kinds, hex colours in drawings and a missing phone place", () => {
    const bad = (elements: unknown[]) => ComposedProps.safeParse({ ...SAMPLE_COMPOSED.props, elements }).success;
    const ok = SAMPLE_COMPOSED.props.elements[0];
    expect(bad([{ ...ok, kind: "video" }])).toBe(false);
    expect(bad([{ id: "e_d", kind: "decor", svg: { width: 40, height: 40, paths: [{ d: "M0 0L10 10", fill: "#ff0000" }] }, desk: { col: 1, span: 2, row: 1 }, phone: { order: 0, span: "half" } }])).toBe(false);
    const { phone: _p, ...noPhone } = ok;
    expect(bad([noPhone])).toBe(false);
  });

  it("stay out of the model's generation catalogue while the designer is off", () => {
    const def = SECTION_DEFS.find((d) => d.type === "composed");
    expect(def?.designerOnly).toBe(true);
  });

  it("have props the compact catalogue notation can print (no const, no tuple)", () => {
    const text = JSON.stringify(toModelJsonSchema(ComposedProps));
    expect(text).not.toContain('"const"');
    expect(text).not.toContain('"prefixItems"');
  });

  it("take a generated picture where their intent is the opener, a page header or a story; nowhere else", () => {
    // The M sheet: composed sections hero (img_01), services (img_02), story (img_03), every picture generated.
    const sheet = JSON.parse(readFileSync(new URL("../../../tools/eval/composed/m.json", import.meta.url), "utf8")) as SiteSpec;
    for (const img of sheet.assets.images) img.origin = "generated";
    const flagged = (spec: SiteSpec) =>
      validateSite(spec)
        .issues.filter((i) => i.message.includes("AI-generated"))
        .map((i) => [i.path.replace(/\/props\/.*/, ""), i.message]);
    expect(GENERATED_IMAGE_INTENTS).toEqual(["hero", "page-head", "story"]);
    expect(flagged(sheet)).toEqual([["/pages/0/sections/2", expect.stringMatching(/^img_02 is AI-generated and may only be used in .*\(a composed section: intent hero, page-head, story\)$/)]]);
    const intentOf = (spec: SiteSpec, si: number) => spec.pages[0]!.sections[si]!.props as { intent: string };
    const moved = structuredClone(sheet);
    intentOf(moved, 4).intent = "page-head";
    intentOf(moved, 0).intent = "gallery";
    expect(flagged(moved).map(([p]) => p)).toEqual(["/pages/0/sections/0", "/pages/0/sections/2"]);
  });
});
