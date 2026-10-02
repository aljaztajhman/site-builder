import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Operation } from "fast-json-patch";
import { getAt, listEdits, parsePriceInput, priceValue, publishChecklist, readList, validateSite, type ListAt, type ListItem, type PatchOp, type SiteSpec } from "@sb/spec";
import { applyDirectEdit, checkFacts, typedText } from "../src/index.ts";

/**
 * The price-list and menu editor's operations as the server receives them: built by @sb/spec/price-edit
 * against the spec, applied and validated by applyDirectEdit (the /patch endpoint's path), and the
 * owner's typed prices passing the fact check.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (id: string): SiteSpec => JSON.parse(readFileSync(path.join(here, `../../../tools/eval/golden/${id}.json`), "utf8")) as SiteSpec;
const description = (id: string): string => (JSON.parse(readFileSync(path.join(here, `../../../tools/eval/fixtures/${id}/brief.json`), "utf8")) as { description: string }).description;

/** frizerstvo-lana: Cenik (grouped) on page 1: Striženje (3 items), Barvanje in pričeske (4, two placeholders). */
const SALON: ListAt = { page: 1, section: 1, id: "s_prices" };
/** gostilna-zlata-zlica: Jedilni list (two-column) on page 1: Vsak dan (1), Ob nedeljah (1), Z jedilnega lista (5). */
const INN: ListAt = { page: 1, section: 1, id: "s_menu" };

function apply(spec: SiteSpec, ops: PatchOp[] | null): SiteSpec {
  expect(ops, "the editor offers this change").not.toBeNull();
  const r = applyDirectEdit(spec, ops as Operation[]);
  expect(r.issues).toEqual([]);
  expect(r.ok).toBe(true);
  return r.spec;
}

const groups = (spec: SiteSpec, at: ListAt) => readList(spec, at)!.groups;
const names = (spec: SiteSpec, at: ListAt) => groups(spec, at).map((g) => `${g.name ?? "-"}: ${g.items.map((i) => i.name).join(", ")}`);

describe("price list editing as spec patches (frizerstvo-lana)", () => {
  it("adds, renames, moves and deletes groups", () => {
    let s = read("frizerstvo-lana");
    s = apply(s, listEdits.addGroup(s, SALON));
    expect(names(s, SALON)).toEqual(["Striženje: Žensko striženje s fenom, Moško striženje, Otroško striženje", "Barvanje in pričeske: Barvanje, Pramene, Fen frizura, Svečana pričeska", "Nova skupina: Nova postavka"]);
    // The new group and item are starter text with a missing price: publishing waits for the owner.
    const blockers = publishChecklist(s).map((b) => `${b.kind} ${b.path}`);
    expect(blockers).toContain("starter /pages/1/sections/1/props/groups/2/name");
    expect(blockers).toContain("starter /pages/1/sections/1/props/groups/2/items/0/name");
    expect(blockers).toContain("placeholder /pages/1/sections/1/props/groups/2/items/0/price");

    s = apply(s, listEdits.renameGroup(s, SALON, 2, "  Nega las "));
    s = apply(s, listEdits.moveGroup(s, SALON, 2, 0));
    expect(groups(s, SALON).map((g) => g.name)).toEqual(["Nega las", "Striženje", "Barvanje in pričeske"]);
    s = apply(s, listEdits.moveGroup(s, SALON, 0, 1));
    expect(groups(s, SALON).map((g) => g.name)).toEqual(["Striženje", "Nega las", "Barvanje in pričeske"]);
    s = apply(s, listEdits.removeGroup(s, SALON, 1));
    expect(groups(s, SALON).map((g) => g.name)).toEqual(["Striženje", "Barvanje in pričeske"]);
    // A price-list group may lose its name; nothing to do when it has none.
    s = apply(s, listEdits.renameGroup(s, SALON, 0, ""));
    expect(groups(s, SALON)[0]!.name).toBeUndefined();
    expect(listEdits.renameGroup(s, SALON, 0, " ")).toEqual([]);
    expect(listEdits.renameGroup(s, SALON, 0, "x".repeat(61))).toBeNull();
  });

  it("refuses what the spec can't hold: the last group, a ninth group, unknown indices", () => {
    let s = read("frizerstvo-lana");
    s = apply(s, listEdits.removeGroup(s, SALON, 0));
    expect(listEdits.removeGroup(s, SALON, 0)).toBeNull();
    for (let n = groups(s, SALON).length; n < 8; n++) s = apply(s, listEdits.addGroup(s, SALON));
    expect(listEdits.addGroup(s, SALON)).toBeNull();
    expect(listEdits.moveGroup(s, SALON, 0, 8)).toBeNull();
    expect(listEdits.moveGroup(s, SALON, 0, -1)).toBeNull();
    expect(listEdits.renameGroup(s, SALON, 9, "x")).toBeNull();
  });

  it("adds, edits, moves and deletes items, with every field the editor has", () => {
    let s = read("frizerstvo-lana");
    s = apply(s, listEdits.addItem(s, SALON, 0));
    const edited: ListItem = { name: "Striženje šiška", note: " samo šiška ", price: priceValue(parsePriceInput("5,50") as { kind: "ok"; amount: number; from: boolean }, { unit: "/ obisk" }) };
    s = apply(s, listEdits.setItem(s, SALON, 0, 3, edited));
    expect(groups(s, SALON)[0]!.items[3]).toEqual({ name: "Striženje šiška", note: "samo šiška", price: { amount: 5.5, unit: "/ obisk" } });

    // "od" and unavailable; then unavailable cleared again leaves no trace.
    s = apply(s, listEdits.setItem(s, SALON, 0, 3, { ...groups(s, SALON)[0]!.items[3]!, price: { amount: 6, from: true }, unavailable: true }));
    expect(groups(s, SALON)[0]!.items[3]).toEqual({ name: "Striženje šiška", note: "samo šiška", price: { amount: 6, from: true }, unavailable: true });
    s = apply(s, listEdits.setItem(s, SALON, 0, 3, { ...groups(s, SALON)[0]!.items[3]!, unavailable: false }));
    expect(groups(s, SALON)[0]!.items[3]!.unavailable).toBeUndefined();

    // Up, down, and into the other group (to its end).
    s = apply(s, listEdits.moveItem(s, SALON, 0, 3, 0, 2));
    expect(groups(s, SALON)[0]!.items.map((i) => i.name)).toEqual(["Žensko striženje s fenom", "Moško striženje", "Striženje šiška", "Otroško striženje"]);
    s = apply(s, listEdits.moveItem(s, SALON, 0, 0, 0, 1));
    expect(groups(s, SALON)[0]!.items.map((i) => i.name)).toEqual(["Moško striženje", "Žensko striženje s fenom", "Striženje šiška", "Otroško striženje"]);
    s = apply(s, listEdits.moveItem(s, SALON, 0, 2, 1, groups(s, SALON)[1]!.items.length));
    expect(groups(s, SALON)[1]!.items.at(-1)!.name).toBe("Striženje šiška");
    s = apply(s, listEdits.removeItem(s, SALON, 1, 4));
    expect(groups(s, SALON)[1]!.items.map((i) => i.name)).toEqual(["Barvanje", "Pramene", "Fen frizura", "Svečana pričeska"]);
    expect(validateSite(s).issues).toEqual([]);
  });

  it("refuses an empty name, the last item, moves out of range and a 21st item", () => {
    let s = read("frizerstvo-lana");
    expect(listEdits.setItem(s, SALON, 0, 0, { name: "  ", price: { amount: 1 } })).toBeNull();
    expect(listEdits.setItem(s, SALON, 0, 9, { name: "x", price: { amount: 1 } })).toBeNull();
    expect(listEdits.moveItem(s, SALON, 0, 0, 0, 3)).toBeNull();
    expect(listEdits.moveItem(s, SALON, 0, 0, 0, 0)).toBeNull();
    for (let n = 3; n > 1; n--) s = apply(s, listEdits.removeItem(s, SALON, 0, 0));
    expect(listEdits.removeItem(s, SALON, 0, 0)).toBeNull();
    // Moving the only item out would leave an empty group.
    expect(listEdits.moveItem(s, SALON, 0, 0, 1, 0)).toBeNull();
    for (let n = groups(s, SALON)[1]!.items.length; n < 20; n++) s = apply(s, listEdits.addItem(s, SALON, 1));
    expect(listEdits.addItem(s, SALON, 1)).toBeNull();
    expect(validateSite(s).ok).toBe(true);
  });

  it("is refused when the section moved before the save went out (the guard), in the builder and on the server", () => {
    const s = read("frizerstvo-lana");
    const ops = listEdits.removeItem(s, SALON, 0, 0)!;
    // Meanwhile the owner moved the price list below the next section.
    const moved = apply(s, [{ op: "move", from: "/pages/1/sections/1", path: "/pages/1/sections/2" }]);
    expect(listEdits.removeItem(moved, SALON, 0, 0)).toBeNull();
    const r = applyDirectEdit(moved, ops as Operation[]);
    expect(r.ok).toBe(false);
    expect(readList(moved, { ...SALON, section: 2 })!.groups[0]!.items).toHaveLength(3);
  });

  it("keeps English overlays on the items they translate when items and groups move or go", () => {
    let s = read("frizerstvo-lana");
    const p = "/pages/1/sections/1/props/groups";
    s.locales = { default: "sl", enabled: ["sl", "en"] };
    s.translations = { en: { [`${p}/0/items/0/name`]: "Women's cut and blow-dry", [`${p}/0/items/2/name`]: "Children's cut", [`${p}/1/name`]: "Colour and styling", [`${p}/1/items/0/note`]: "ammonia-free colours", "/pages/1/sections/1/props/title": "Cuts, colour and styling" } };
    expect(validateSite(s).issues).toEqual([]);
    s = apply(s, listEdits.moveItem(s, SALON, 0, 0, 0, 2));
    s = apply(s, listEdits.moveGroup(s, SALON, 1, 0));
    s = apply(s, listEdits.removeItem(s, SALON, 1, 0));
    s = apply(s, listEdits.moveItem(s, SALON, 0, 0, 1, 1));
    const en = s.translations!.en!;
    // Every overlay still points at the Slovene text it translates.
    const pairs = Object.entries(en).map(([ptr, text]) => [getAt(s, ptr), text]);
    expect(pairs).toEqual(expect.arrayContaining([
      ["Žensko striženje s fenom", "Women's cut and blow-dry"],
      ["Otroško striženje", "Children's cut"],
      ["Barvanje in pričeske", "Colour and styling"],
      ["Striženje, barvanje in pričeske", "Cuts, colour and styling"],
    ]));
    expect(getAt(s, Object.keys(en).find((k) => en[k] === "ammonia-free colours")!)).toBe("barve brez amoniaka");
    // Removing the item drops its overlay.
    const parts = Object.keys(en).find((k) => en[k] === "Women's cut and blow-dry")!.split("/");
    s = apply(s, listEdits.removeItem(s, SALON, Number(parts[7]), Number(parts[9])));
    expect(Object.values(s.translations!.en!)).not.toContain("Women's cut and blow-dry");
    expect(Object.values(s.translations!.en!)).toContain("Children's cut");
  });
});

describe("menu editing as spec patches (gostilna-zlata-zlica)", () => {
  it("edits dishes with description, tags and unavailable; a category keeps its name", () => {
    let s = read("gostilna-zlata-zlica");
    s = apply(s, listEdits.setItem(s, INN, 2, 2, { name: "Ričet", description: "s prekajenimi rebrci", tags: ["local"], price: { amount: 7.2 }, unavailable: true, note: "ignored on a menu" }));
    expect(groups(s, INN)[2]!.items[2]).toEqual({ name: "Ričet", description: "s prekajenimi rebrci", tags: ["local"], price: { amount: 7.2 }, unavailable: true });
    expect(listEdits.renameGroup(s, INN, 0, "")).toBeNull();
    s = apply(s, listEdits.renameGroup(s, INN, 0, "Malica"));
    s = apply(s, listEdits.addGroup(s, INN));
    expect(groups(s, INN).at(-1)).toEqual({ name: "Nova skupina", items: [{ name: "Nova jed", price: { $placeholder: "price" } }] });
    s = apply(s, listEdits.moveGroup(s, INN, 3, 0));
    s = apply(s, listEdits.removeGroup(s, INN, 0));
    expect(groups(s, INN).map((g) => g.name)).toEqual(["Malica", "Ob nedeljah", "Z jedilnega lista"]);
    expect(validateSite(s).issues).toEqual([]);
  });
});

describe("fact check: prices the owner typed count as the owner's facts", () => {
  /** The fact-check corpus as the pipeline builds it: intake text plus the editor's saved operations. */
  const corpus = (id: string, saves: (PatchOp[] | null)[]) => [description(id), ...saves.flatMap((ops) => typedText((ops ?? []) as Operation[]))].join("\n");
  const prices = (s: SiteSpec) => checkFacts(s, description("frizerstvo-lana")).filter((v) => v.kind === "price");

  it("accepts a missing price the owner fills in, typed the Slovene or the English way", () => {
    const s0 = read("frizerstvo-lana");
    for (const typed of ["35", "35,00 €", "35.5", "od 35"]) {
      const parsed = parsePriceInput(typed) as { kind: "ok"; amount: number; from: boolean };
      const ops = listEdits.setItem(s0, SALON, 1, 1, { ...groups(s0, SALON)[1]!.items[1]!, price: priceValue(parsed) });
      const s1 = apply(s0, ops);
      expect(checkFacts(s1, corpus("frizerstvo-lana", [ops])), typed).toEqual([]);
      // The same price without the owner's save is invented.
      expect(prices(s1).map((v) => v.path), typed).toContain("/pages/1/sections/1/props/groups/1/items/1/price");
    }
  });

  it("keeps a client's price checked after the owner renames the item, moves it or marks it unavailable", () => {
    let s = read("frizerstvo-lana");
    const saves: (PatchOp[] | null)[] = [];
    const save = (ops: PatchOp[] | null) => {
      saves.push(ops);
      s = apply(s, ops);
    };
    save(listEdits.setItem(s, SALON, 0, 1, { ...groups(s, SALON)[0]!.items[1]!, name: "Striženje za gospode" }));
    save(listEdits.moveItem(s, SALON, 0, 1, 1, 4));
    save(listEdits.setItem(s, SALON, 1, 4, { ...groups(s, SALON)[1]!.items[4]!, unavailable: true }));
    expect(groups(s, SALON)[1]!.items[4]).toEqual({ name: "Striženje za gospode", price: { amount: 15 }, unavailable: true });
    expect(checkFacts(s, corpus("frizerstvo-lana", saves))).toEqual([]);
  });

  it("still flags a price nobody typed: another item's amount moved onto an item is not the owner's fact", () => {
    const s0 = read("frizerstvo-lana");
    const ownerSave = listEdits.setItem(s0, SALON, 1, 1, { ...groups(s0, SALON)[1]!.items[1]!, price: { amount: 35 } });
    const s1 = apply(s0, ownerSave);
    // The assistant (not the editor) then changes "Moško striženje" to 28 €, the women's price.
    const s2 = apply(s1, [{ op: "replace", path: "/pages/1/sections/1/props/groups/0/items/1/price", value: { amount: 28 } }]);
    expect(checkFacts(s2, corpus("frizerstvo-lana", [ownerSave])).map((v) => v.path)).toEqual(["/pages/1/sections/1/props/groups/0/items/1/price"]);
  });
});
