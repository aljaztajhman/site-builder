import { describe, expect, it } from "vitest";
import { PRACTICAL_FACTS, validateSite, type SiteSpec } from "@sb/spec";
import { PILOT_DRAWINGS, pilotContextPages } from "../scripts/pilot-context.ts";

type Loose = { background?: { kind: string; drawing?: string }[]; top?: { drawing?: string }; elements: { kind: string; drawing?: string; items?: { fact: string }[] }[] };
const sectionsOf = (spec: SiteSpec): Loose[] => spec.pages.find((p) => p.kind === "home")!.sections.map((s) => s.props as unknown as Loose);

describe("pilot in-context pages", () => {
  const pages = pilotContextPages();
  const drawings = pages.filter((p) => p.kind === "drawing");
  const icons = pages.filter((p) => p.kind === "icons");

  it("has 18 drawing entries and 5 icon entries, named drawing-NN / icons-G", () => {
    expect(PILOT_DRAWINGS).toHaveLength(18);
    expect(drawings.map((p) => p.file)).toEqual(Array.from({ length: 18 }, (_, i) => `drawing-${String(i + 1).padStart(2, "0")}.png`));
    expect(icons.map((p) => p.file)).toEqual([1, 2, 3, 4, 5].map((g) => `icons-${g}.png`));
  });

  it("every scene spec validates", () => {
    for (const p of pages)
      for (const s of p.scenes) {
        const v = validateSite(s.spec);
        expect(v.ok ? [] : v.issues.map((i) => `${i.path} ${i.message}`), `${p.file} ${s.name}`).toEqual([]);
      }
  });

  it("each drawing entry uses its drawing in the hero (background or top) and in both decor scenes", () => {
    for (const p of drawings) {
      const id = p.drawing!;
      const by = (name: string) => p.scenes.find((s) => s.name === name)!;
      const hero = sectionsOf(by("A").spec);
      expect(hero.some((s) => s.background?.some((b) => b.drawing === id) || s.top?.drawing === id), p.file).toBe(true);
      for (const n of ["B", "C"]) expect(sectionsOf(by(n).spec).some((s) => s.elements.some((e) => e.kind === "decor" && e.drawing === id)), `${p.file} ${n}`).toBe(true);
      expect(by("A-phone").width).toBe(360);
    }
  });

  it("icon entries show 8 facts each, in PRACTICAL_FACTS order, on light, dark and phone", () => {
    expect(icons.map((p) => p.scenes.map((s) => s.name))).toEqual(icons.map(() => ["light", "dark", "light-phone"]));
    icons.forEach((p, g) => {
      const facts = sectionsOf(p.scenes[0]!.spec).flatMap((s) => s.elements.flatMap((e) => (e.kind === "iconFacts" ? e.items!.map((i) => i.fact) : [])));
      expect(facts).toEqual(PRACTICAL_FACTS.slice(g * 8, g * 8 + 8));
    });
  });
});
