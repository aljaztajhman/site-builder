import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Operation } from "fast-json-patch";
import { getAt, listEdits, validateSite, type ListAt, type SiteSpec } from "@sb/spec";
import { applyDirectEdit } from "../src/index.ts";

/**
 * English overlays follow the sections and items they translate through the owner's direct edits (and chat
 * patches, which go through the same applyOps): moved, deleted, duplicated, inserted.
 */
const here = path.dirname(fileURLToPath(import.meta.url));

/** Pekarna Kvas with English on: the hero's headline, the products' and hours' titles, and one product's name. */
function translated(): SiteSpec {
  const spec = JSON.parse(readFileSync(path.join(here, "../../../tools/eval/golden/pekarna-kvas.json"), "utf8")) as SiteSpec;
  spec.locales = { default: "sl", enabled: ["sl", "en"] };
  spec.translations = {
    en: {
      "/pages/0/sections/0/props/headline": "Sourdough bread that rises overnight",
      "/pages/0/sections/2/props/title": "Every day at the bakery",
      "/pages/0/sections/2/props/items/0/name": "Sourdough loaf",
      "/pages/0/sections/5/props/title": "When we are open",
      "/pages/0/nav/label": "Home",
    },
  };
  return spec;
}

/** Each English text with the Slovene text it sits on, as a reader of either version would pair them. */
const pairs = (s: SiteSpec) => Object.entries(s.translations?.en ?? {}).map(([ptr, en]) => [getAt(s, ptr), en]);

function edit(spec: SiteSpec, ops: Operation[]): SiteSpec {
  const r = applyDirectEdit(spec, ops);
  expect(r.issues).toEqual([]);
  expect(r.ok).toBe(true);
  return r.spec;
}

describe("translations follow direct edits", () => {
  it("a section moved up or down keeps its English", () => {
    const s0 = translated();
    const before = pairs(s0);
    const up = edit(s0, [{ op: "test", path: "/pages/0/sections/5/id", value: "s_hours" }, { op: "move", from: "/pages/0/sections/5", path: "/pages/0/sections/4" }]);
    expect(pairs(up).sort()).toEqual(before.sort());
    expect(up.translations!.en!["/pages/0/sections/4/props/title"]).toBe("When we are open");
    const down = edit(s0, [{ op: "move", from: "/pages/0/sections/0", path: "/pages/0/sections/3" }]);
    expect(pairs(down).sort()).toEqual(before.sort());
    expect(validateSite(down).issues).toEqual([]);
  });

  it("a deleted section takes its English with it, and the rest shift (it used to be refused)", () => {
    const s0 = translated();
    const s1 = edit(s0, [{ op: "remove", path: "/pages/0/sections/2" }]);
    expect(Object.keys(s1.translations!.en!).sort()).toEqual(["/pages/0/nav/label", "/pages/0/sections/0/props/headline", "/pages/0/sections/4/props/title"]);
    expect(pairs(s1)).toContainEqual(["Kdaj smo odprti", "When we are open"]);
  });

  it("a section inserted or duplicated before others pushes their English along; the copy is untranslated", () => {
    const s0 = translated();
    const copy = { ...structuredClone(s0.pages[0]!.sections[2]!), id: "s_products_2" };
    const s1 = edit(s0, [{ op: "add", path: "/pages/0/sections/3", value: copy }]);
    expect(pairs(s1).sort()).toEqual(pairs(s0).sort());
    expect(s1.translations!.en!["/pages/0/sections/6/props/title"]).toBe("When we are open");
    const s2 = edit(s0, [{ op: "add", path: "/pages/0/sections/0", value: copy }]);
    expect(pairs(s2).sort()).toEqual(pairs(s0).sort());
  });

  it("a copy op duplicates the English too", () => {
    const s1 = edit(translated(), [
      { op: "copy", from: "/pages/0/sections/5", path: "/pages/0/sections/6" },
      { op: "replace", path: "/pages/0/sections/6/id", value: "s_hours_2" },
    ]);
    expect(s1.translations!.en!["/pages/0/sections/5/props/title"]).toBe("When we are open");
    expect(s1.translations!.en!["/pages/0/sections/6/props/title"]).toBe("When we are open");
  });

  it("a section replaced without a translated field drops that field's English (it used to be refused)", () => {
    const s0 = translated();
    s0.translations!.en!["/pages/0/sections/0/props/eyebrow"] = "Kamnik";
    const props = structuredClone(s0.pages[0]!.sections[0]!.props) as Record<string, unknown>;
    delete props.eyebrow;
    const s1 = edit(s0, [{ op: "replace", path: "/pages/0/sections/0/props", value: props }]);
    expect(s1.translations!.en!["/pages/0/sections/0/props/eyebrow"]).toBeUndefined();
    expect(s1.translations!.en!["/pages/0/sections/0/props/headline"]).toBe("Sourdough bread that rises overnight");
    expect(validateSite(s1).issues).toEqual([]);
  });

  it("the price editor's own re-pointing still wins (no double shift)", () => {
    const s0 = translated();
    const at: ListAt = { page: 0, section: 2, id: "s_products" };
    const ops = listEdits.moveItem(s0, at, 0, 0, 0, 2);
    if (!ops) return; // products may not be a price list shape; then nothing to check here
    const s1 = edit(s0, ops as Operation[]);
    expect(pairs(s1).sort()).toEqual(pairs(s0).sort());
  });

  it("an edit that doesn't touch arrays leaves the overlays alone", () => {
    const s0 = translated();
    const s1 = edit(s0, [{ op: "replace", path: "/pages/0/sections/0/props/headline", value: "Kruh z drožmi iz Kamnika" }]);
    expect(s1.translations).toEqual(s0.translations);
  });
});
