import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DIRECTIONS, SECTION_DEFS, checkDesign, issueMessage, publishBlockers, sectionDef, validateSite, type SiteSpec } from "@sb/spec";
import { applyDirectEdit, defaultSection, editorCatalogue, switchDirection, typedText } from "../src/index.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const golden = (): SiteSpec => JSON.parse(readFileSync(path.join(here, "../../../tools/eval/golden/pekarna-kvas.json"), "utf8")) as SiteSpec;

describe("applyDirectEdit", () => {
  it("applies text, move and remove operations and validates", () => {
    const spec = golden();
    const r = applyDirectEdit(spec, [
      { op: "replace", path: "/pages/0/sections/0/props/headline", value: "Kruh z drožmi iz Kamnika" },
      { op: "move", from: "/pages/0/sections/3", path: "/pages/0/sections/2" },
      { op: "remove", path: "/pages/0/sections/4" },
    ]);
    expect(r.ok).toBe(true);
    expect(r.spec.pages[0]!.sections[0]!.props).toMatchObject({ headline: "Kruh z drožmi iz Kamnika" });
    expect(r.spec.pages[0]!.sections.map((s) => s.id)).toEqual(["s_hero", "s_strip", "s_about", "s_products", "s_hours", "s_contact"]);
    // The input is never mutated.
    expect(spec.pages[0]!.sections[0]!.props).toMatchObject({ headline: "Kruh z drožmi, ki vzhaja čez noč" });
  });

  it("rejects edits that break the schema or the banned list, keeping the old spec", () => {
    const spec = golden();
    for (const ops of [
      [{ op: "replace" as const, path: "/pages/0/sections/0/props/headline", value: "x".repeat(200) }],
      [{ op: "replace" as const, path: "/pages/0/sections/0/props/headline", value: "Dobrodošli v Pekarni Kvas" }],
      [{ op: "remove" as const, path: "/pages/1" }],
      [{ op: "replace" as const, path: "/nope/0", value: 1 }],
    ]) {
      const r = applyDirectEdit(spec, ops);
      expect(r.ok).toBe(false);
      expect(r.spec).toBe(spec);
      expect(r.issues.length).toBeGreaterThan(0);
    }
  });

  it("fixes contrast and ranges on design edits and says what it changed", () => {
    const r = applyDirectEdit(golden(), [
      { op: "replace", path: "/design/colors/text", value: "#dddddd" },
      { op: "replace", path: "/design/radius", value: 12 },
    ]);
    expect(r.ok).toBe(true);
    expect(checkDesign(r.spec.design, DIRECTIONS.find((d) => d.id === r.spec.design.direction))).toEqual([]);
    expect(r.adjustments.join(" ")).toMatch(/Besedilo: barva popravljena na #[0-9a-f]{6} zaradi berljivosti/);
    expect(r.adjustments.join(" ")).toMatch(/Zaobljenost: nastavljeno na 8, kot dovoljuje smer »Toplo in domače«/);
  });
});

describe("applyDirectEdit and the give-away rules", () => {
  it("replaces an em dash the owner types instead of refusing the edit, and says so", () => {
    const r = applyDirectEdit(golden(), [{ op: "replace", path: "/pages/0/sections/0/props/headline", value: "Kruh z drožmi — iz Kamnika" }]);
    expect(r.ok).toBe(true);
    expect(r.spec.pages[0]!.sections[0]!.props).toMatchObject({ headline: "Kruh z drožmi – iz Kamnika" });
    expect(r.adjustments).toEqual(["Besedilo: dolgi pomišljaj (—) smo zamenjali s pomišljajem ( – )"]);
  });

  it("refuses new filler, but a filler phrase the site already had doesn't block an unrelated edit", () => {
    const spec = golden();
    expect(applyDirectEdit(spec, [{ op: "replace", path: "/pages/0/sections/0/props/headline", value: "Vrhunski kruh iz Kamnika" }]).ok).toBe(false);
    // A site made before "vrhunski" was banned.
    (spec.pages[0]!.sections[0]!.props as { headline: string }).headline = "Vrhunski kruh iz Kamnika";
    const unrelated = applyDirectEdit(spec, [{ op: "replace", path: "/pages/0/sections/3/props/heading", value: "Z drožmi iz domače kleti" }]);
    expect(unrelated.ok).toBe(true);
    expect(unrelated.spec.pages[0]!.sections[3]!.props).toMatchObject({ heading: "Z drožmi iz domače kleti" });
    expect(publishBlockers(unrelated.spec).join(" ")).toMatch(/filler: vrhunski/);
    // Writing it somewhere new is still refused, and only the new place is reported.
    const another = applyDirectEdit(spec, [{ op: "replace", path: "/pages/0/sections/3/props/heading", value: "Brezhibno pecivo" }]);
    expect(another.ok).toBe(false);
    expect(another.issues.map((i) => i.path)).toEqual(["/pages/0/sections/3/props/heading"]);
  });

  it("keeps text colours off pure black on a colour edit", () => {
    const r = applyDirectEdit(golden(), [{ op: "replace", path: "/design/colors/text", value: "#000000" }]);
    expect(r.ok).toBe(true);
    expect(r.spec.design.colors.text).not.toBe("#000000");
    expect(r.adjustments.join(" ")).toMatch(/Besedilo: barva popravljena na #[0-9a-f]{6}/);
  });
});

describe("guarded edits", () => {
  it("applies an edit whose guard matches and refuses one whose section moved, in words the owner reads", () => {
    const spec = golden();
    const guard = (si: number, id: string) => ({ op: "test" as const, path: `/pages/0/sections/${si}/id`, value: id });
    const ok = applyDirectEdit(spec, [guard(3, "s_about"), { op: "replace", path: "/pages/0/sections/3/props/heading", value: "Drožmi iz domače kleti" }]);
    expect(ok.ok).toBe(true);
    // s_about is no longer at index 2: nothing is written there.
    const moved = applyDirectEdit(spec, [guard(2, "s_about"), { op: "replace", path: "/pages/0/sections/2/props/heading", value: "x" }]);
    expect(moved.ok).toBe(false);
    expect(moved.spec).toBe(spec);
    expect(issueMessage(moved.issues[0]!)).toMatch(/^razdelek ali stran se je medtem premaknila/);
  });
});

describe("defaultSection", () => {
  const spec = golden();
  it("builds a valid starter section for every non-system section type", () => {
    for (const def of SECTION_DEFS.filter((d) => !d.systemOnly)) {
      const s = defaultSection(spec, def.type, `s_new_${def.type.replace(/-/g, "_")}`);
      expect(s, def.type).not.toBeNull();
      expect(sectionDef(def.type).schema.safeParse(s).success, def.type).toBe(true);
    }
  });

  it("refuses photo sections on a site without photos, and system sections", () => {
    const noPhotos = { ...spec, assets: { images: [] } };
    expect(defaultSection(noPhotos, "gallery", "s_g")).toBeNull();
    expect(defaultSection(noPhotos, "hero-split", "s_h")).toBeNull();
    expect(defaultSection(noPhotos, "text", "s_t")).not.toBeNull();
    expect(defaultSection(spec, "legal", "s_l")).toBeNull();
    const cat = editorCatalogue(noPhotos);
    expect(cat.sections.find((s) => s.type === "gallery")?.canAdd).toBe(false);
  });

  it("blocks publishing until the starter text is replaced", () => {
    const s = defaultSection(spec, "faq", "s_faq")!;
    const withFaq = applyDirectEdit(spec, [{ op: "add", path: "/pages/0/sections/7", value: s }]);
    expect(withFaq.ok).toBe(true);
    expect(validateSite(withFaq.spec).ok).toBe(true);
    expect(publishBlockers(withFaq.spec).filter((b) => b.includes("starter text")).length).toBeGreaterThan(0);
  });
});

describe("switchDirection", () => {
  it("resets tokens to a valid design for every direction and keeps the brand primary where contrast allows", () => {
    for (const d of DIRECTIONS) {
      const design = switchDirection(golden(), d.id);
      expect(design.direction).toBe(d.id);
      expect(checkDesign(design, d)).toEqual([]);
    }
  });
});

describe("typedText", () => {
  it("collects every string value in operations", () => {
    expect(typedText([{ op: "replace", path: "/a", value: { name: "Katja", price: { amount: 2 }, tags: ["x"] } }, { op: "remove", path: "/b" }])).toEqual(["Katja", "2", "x"]);
  });
});

describe("protected paths", () => {
  it("refuses edits to the slug, version and asset identity, but allows alt text", () => {
    const spec = golden();
    for (const op of [
      { op: "replace" as const, path: "/slug", value: "drug-salon" },
      { op: "replace" as const, path: "/specVersion", value: 2 },
      { op: "replace" as const, path: "/assets/logo/file", value: "../../x" },
      { op: "replace" as const, path: "/assets/images/0/src", value: "sites/other/uploads/a.jpg" },
      { op: "remove" as const, path: "/assets/images/0" },
      // origin decides the "Ustvarjeno z UI" label: no edit may set or remove it.
      { op: "add" as const, path: "/assets/images/0/origin", value: "client" },
      { op: "remove" as const, path: "/assets/images/0/origin" },
    ]) {
      const r = applyDirectEdit(spec, [op]);
      expect(r.ok, op.path).toBe(false);
    }
    expect(applyDirectEdit(spec, [{ op: "replace", path: "/assets/images/0/alt", value: "Hlebci kruha na polici" }]).ok).toBe(true);
  });
});
