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

/**
 * The editor's schema forms save a whole list at once (a collection's entries, a section's props): a removal or a
 * move arrives as one `replace` of the array. Each element's English follows it (it-collection-translations); it
 * used to stay at its index, on the next entry's text.
 */
describe("translations follow a whole list saved by a form", () => {
  type Item = { name: string; [k: string]: unknown };
  const products = (s: SiteSpec) => (s.pages[0]!.sections[2]!.props as { items: Item[] }).items;

  it("an item removed from a section's list: the others keep their English, its own goes", () => {
    const s0 = translated();
    s0.translations!.en!["/pages/0/sections/2/props/items/1/name"] = "Rye bread";
    s0.translations!.en!["/pages/0/sections/2/props/items/2/name"] = "Butter croissant";
    const before = pairs(s0);
    const s1 = edit(s0, [{ op: "replace", path: "/pages/0/sections/2/props/items", value: products(s0).slice(1) }]);
    expect(s1.translations!.en!["/pages/0/sections/2/props/items/0/name"]).toBe("Rye bread");
    expect(s1.translations!.en!["/pages/0/sections/2/props/items/1/name"]).toBe("Butter croissant");
    expect(pairs(s1).sort()).toEqual(before.filter(([, en]) => en !== "Sourdough loaf").sort());
    expect(validateSite(s1).issues).toEqual([]);
  });

  it("a section's whole props saved with two items swapped: the English swaps with them", () => {
    const s0 = translated();
    s0.translations!.en!["/pages/0/sections/2/props/items/1/name"] = "Rye bread";
    const props = structuredClone(s0.pages[0]!.sections[2]!.props) as { items: Item[] };
    props.items.splice(0, 2, props.items[1]!, props.items[0]!);
    const s1 = edit(s0, [{ op: "replace", path: "/pages/0/sections/2/props", value: props }]);
    expect(pairs(s1).sort()).toEqual(pairs(s0).sort());
    expect(s1.translations!.en!["/pages/0/sections/2/props/items/1/name"]).toBe("Sourdough loaf");
  });

  it("an item whose text was edited in place keeps its English (same length, same place)", () => {
    const s0 = translated();
    const items = structuredClone(products(s0));
    items[0]!.name = "Pirin kruh z drožmi, 1 kg";
    const s1 = edit(s0, [{ op: "replace", path: "/pages/0/sections/2/props/items", value: items }]);
    expect(s1.translations!.en!["/pages/0/sections/2/props/items/0/name"]).toBe("Sourdough loaf");
  });

  it("a collection's entries: a post deleted, another moved, a paragraph removed; each English stays on its text", () => {
    const s0 = translated();
    s0.pages.splice(1, 0, { id: "p_novice", kind: "standard", slug: "novice", nav: { label: "Novice", show: true }, seo: { title: "Novice", description: "Novice pekarne." }, sections: [{ id: "s_novice", type: "collection", variant: "list", props: { kind: "blog", title: "Novice" } }] });
    s0.collections = {
      blog: {
        page: "p_novice",
        items: [
          { title: "Odprli smo", date: "2026-09-01", summary: "Prvi dan.", body: ["Prvi odstavek."] },
          { title: "Rženi kruh ob petkih", date: "2026-09-12", summary: "Nov kruh.", body: ["Pečemo ga ob petkih.", "Naročila po telefonu."] },
          { title: "Tečaj peke", date: "2026-10-01", summary: "Tečaj za začetnike.", body: ["Prijave v pekarni."] },
        ],
      },
    };
    s0.translations = {
      en: {
        "/collections/blog/items/0/title": "We are open",
        "/collections/blog/items/1/title": "Rye bread on Fridays",
        "/collections/blog/items/1/body/1": "Orders by phone.",
        "/collections/blog/items/2/title": "Baking course",
        "/collections/blog/items/2/body/0": "Sign up at the bakery.",
      },
    };
    const items = structuredClone(s0.collections.blog!.items);
    // Deleted the first post; the course moved up above the rye bread.
    const s1 = edit(s0, [{ op: "replace", path: "/collections/blog/items", value: [items[2]!, items[1]!] }]);
    expect(s1.translations!.en).toEqual({
      "/collections/blog/items/0/title": "Baking course",
      "/collections/blog/items/0/body/0": "Sign up at the bakery.",
      "/collections/blog/items/1/title": "Rye bread on Fridays",
      "/collections/blog/items/1/body/1": "Orders by phone.",
    });
    // The rye bread's first paragraph removed: the second paragraph's English moves up with it.
    const next = structuredClone(s1.collections!.blog!.items);
    next[1]!.body = ["Naročila po telefonu."];
    const s2 = edit(s1, [{ op: "replace", path: "/collections/blog/items", value: next }]);
    expect(s2.translations!.en!["/collections/blog/items/1/body/0"]).toBe("Orders by phone.");
    expect(s2.translations!.en!["/collections/blog/items/1/body/1"]).toBeUndefined();
    expect(validateSite(s2).issues).toEqual([]);
  });
});
