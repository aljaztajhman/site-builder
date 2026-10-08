import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Operation } from "fast-json-patch";
import { addedOnRequest, listEdits, markOwnerEdits, migrateSpec, onRequestPrices, publishChecklist, readList, stripModelOnRequest, validateSite, type ListAt, type PatchOp, type SiteSpec } from "@sb/spec";
import { EDIT_FAILED_REPLY, ModelClient, applyDirectEdit, applyPatches, checkFacts, editSpec, keepOwnerText, typedOps } from "../src/index.ts";
import { loadConfig } from "@sb/config";

/**
 * "Cena po dogovoru" (spec v15, it-price-on-request): the owner's own answer for a price, set per item or for a whole
 * list by direct edits only. It fills the price (no publish blocker, nothing for the fact check), and the model can't
 * write it: a chat edit or the critique that adds one is refused, the generator's answer loses it (stages.ts).
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (id: string): SiteSpec => migrateSpec(JSON.parse(readFileSync(path.join(here, `../../../tools/eval/golden/${id}.json`), "utf8")));
const description = (id: string): string => (JSON.parse(readFileSync(path.join(here, `../../../tools/eval/fixtures/${id}/brief.json`), "utf8")) as { description: string }).description;

/** frizerstvo-lana: Cenik on page 1: Striženje (3 items), Barvanje in pričeske (Pramene and Fen frizura without a price). */
const SALON: ListAt = { page: 1, section: 1, id: "s_prices" };
const INN: ListAt = { page: 1, section: 1, id: "s_menu" };
const ON = { onRequest: true } as const;

function apply(spec: SiteSpec, ops: PatchOp[] | null): SiteSpec {
  expect(ops, "the editor offers this change").not.toBeNull();
  const r = applyDirectEdit(spec, ops as Operation[]);
  expect(r.issues).toEqual([]);
  return r.spec;
}
const items = (s: SiteSpec, at: ListAt) => readList(s, at)!.groups.flatMap((g) => g.items);
const priceBlockers = (s: SiteSpec, prefix: string) => publishChecklist(s).filter((b) => b.path.startsWith(prefix) && b.detail === "price").map((b) => b.path);

describe("the owner's \"Cena po dogovoru\"", () => {
  it("per item: fills the missing price, so it no longer blocks publishing; ticked off again it is missing again", () => {
    const s0 = read("frizerstvo-lana");
    const prefix = "/pages/1/sections/1/";
    expect(priceBlockers(s0, prefix)).toEqual(["/pages/1/sections/1/props/groups/1/items/1/price", "/pages/1/sections/1/props/groups/1/items/2/price"]);
    const pramene = readList(s0, SALON)!.groups[1]!.items[1]!;
    const ops = listEdits.setItem(s0, SALON, 1, 1, { ...pramene, price: { ...ON } });
    const s1 = apply(s0, ops);
    expect(readList(s1, SALON)!.groups[1]!.items[1]).toEqual({ name: "Pramene", price: ON });
    expect(priceBlockers(s1, prefix)).toEqual(["/pages/1/sections/1/props/groups/1/items/2/price"]);
    expect(validateSite(s1).issues).toEqual([]);
    // Nothing for the fact check: no amount was shown.
    expect(checkFacts(s1, description("frizerstvo-lana"))).toEqual([]);
    // Kept by "Ustvari znova" like any value the owner typed.
    expect(markOwnerEdits(s1, typedOps(s0, ops as Operation[]))).toContainEqual({ section: "s_prices", path: "/props/groups/1/items/1/price/onRequest" });
    // Back: the price is missing again (the editor sends a placeholder when the amount field is empty).
    const s2 = apply(s1, listEdits.setItem(s1, SALON, 1, 1, { name: "Pramene", price: { $placeholder: "price" } }));
    expect(priceBlockers(s2, prefix)).toContain("/pages/1/sections/1/props/groups/1/items/1/price");
  });

  it("for the whole list: every item in one save, amounts typed before included; a list already all on request needs nothing", () => {
    const s0 = read("frizerstvo-lana");
    const ops = listEdits.allOnRequest(s0, SALON)!;
    // The guard and one replace per item, only at the price.
    expect(ops[0]).toEqual({ op: "test", path: "/pages/1/sections/1/id", value: "s_prices" });
    expect(ops.slice(1).map((o) => o.path)).toEqual([0, 1, 2].map((i) => `/pages/1/sections/1/props/groups/0/items/${i}/price`).concat([0, 1, 2, 3].map((i) => `/pages/1/sections/1/props/groups/1/items/${i}/price`)));
    const s1 = apply(s0, ops);
    expect(items(s1, SALON).map((i) => i.price)).toEqual(Array(7).fill(ON));
    // Names, notes and the other list on the homepage stay as they were.
    expect(items(s1, SALON).map((i) => i.note ?? "")).toEqual(items(s0, SALON).map((i) => i.note ?? ""));
    expect(s1.pages[0]!.sections[2]).toEqual(s0.pages[0]!.sections[2]);
    expect(priceBlockers(s1, "/pages/1/sections/1/")).toEqual([]);
    expect(validateSite(s1).issues).toEqual([]);
    expect(listEdits.allOnRequest(s1, SALON)).toEqual([]);
    // A moved section is refused (the guard), like every other list edit.
    expect(listEdits.allOnRequest(s0, { ...SALON, id: "s_other" })).toBeNull();
  });

  it("a menu: one dish and the whole menu", () => {
    const s0 = read("gostilna-zlata-zlica");
    const dishes = readList(s0, INN)!.groups[2]!.items;
    const ricet = dishes.findIndex((d) => d.name === "Ričet");
    const s1 = apply(s0, listEdits.setItem(s0, INN, 2, ricet, { ...dishes[ricet]!, price: { ...ON } }));
    expect(readList(s1, INN)!.groups[2]!.items[ricet]).toEqual({ name: "Ričet", price: ON });
    const s2 = apply(s1, listEdits.allOnRequest(s1, INN));
    expect(priceBlockers(s2, "/pages/1/sections/1/")).toEqual([]);
    expect(validateSite(s2).issues).toEqual([]);
  });

  it("from \"Še to potrebujemo\": the price fact's own path takes it (any priced section, not only lists)", () => {
    const s0 = read("pekarna-kvas");
    const missing = publishChecklist(s0).filter((b) => b.detail === "price");
    expect(missing.length).toBeGreaterThan(0);
    const s1 = apply(s0, missing.map((b) => ({ op: "add" as const, path: b.path, value: { ...ON } })));
    expect(publishChecklist(s1).filter((b) => b.detail === "price")).toEqual([]);
    expect(validateSite(s1).issues).toEqual([]);
  });
});

describe("only the owner sets it: the model's edits can't", () => {
  const corpus = description("frizerstvo-lana");

  it("a chat edit or critique patch that adds one is refused with a reason the model can act on, the site unchanged", () => {
    const s0 = read("frizerstvo-lana");
    for (const ops of [
      [{ op: "replace", path: "/pages/1/sections/1/props/groups/1/items/1/price", value: ON }],
      [{ op: "add", path: "/pages/1/sections/1/props/groups/1/items/1/price/onRequest", value: true }, { op: "remove", path: "/pages/1/sections/1/props/groups/1/items/1/price/$placeholder" }, { op: "remove", path: "/pages/1/sections/1/props/groups/1/items/1/price/note" }],
      // Over an amount the client gave, and as a whole new section.
      [{ op: "replace", path: "/pages/1/sections/1/props/groups/0/items/0/price", value: ON }],
      [{ op: "add", path: "/pages/1/sections/3", value: { id: "s_more", type: "price-list", variant: "table", props: { title: "Še", groups: [{ items: [{ name: "Posvet", price: ON }] }] } } }],
    ] as Operation[][]) {
      const r = applyPatches(s0, ops, corpus);
      expect(r.applied, JSON.stringify(ops)).toBe(0);
      expect(r.spec).toBe(s0);
      expect(r.issues.join(" ")).toMatch(/on request.*set by the client in the editor only/);
    }
  });

  it("keeps the owner's own through a chat edit that changes something else, moves the item or rewrites the section", () => {
    const owned = apply(read("frizerstvo-lana"), listEdits.allOnRequest(read("frizerstvo-lana"), SALON));
    const title = applyPatches(owned, [{ op: "replace", path: "/pages/1/sections/1/props/title", value: "Cene" }], corpus);
    expect(title.issues).toEqual([]);
    expect(items(title.spec, SALON).every((i) => i.price && "onRequest" in i.price)).toBe(true);
    const moved = applyPatches(owned, [{ op: "move", from: "/pages/1/sections/1/props/groups/1/items/3", path: "/pages/1/sections/1/props/groups/0/items/0" }], corpus);
    expect(moved.issues).toEqual([]);
    const section = structuredClone(owned.pages[1]!.sections[1]!);
    (section.props as { intro?: string }).intro = "Cene povemo ob obisku.";
    const rewritten = applyPatches(owned, [{ op: "replace", path: "/pages/1/sections/1", value: section }], corpus);
    expect(rewritten.issues).toEqual([]);
    expect(onRequestPrices(rewritten.spec)).toHaveLength(7);
  });

  it("a chat edit through the model: the refusal goes back to the model, and nothing is saved when it insists", async () => {
    const s0 = read("frizerstvo-lana");
    const sent: string[] = [];
    const answer = JSON.stringify({ reply: "Pramene so zdaj po dogovoru.", patches: [{ op: "replace", path: "/pages/1/sections/1/props/groups/1/items/1/price", value: ON }] });
    const client = new ModelClient({
      config: loadConfig(),
      spentToday: async () => 0,
      onCall: async () => undefined,
      transport: {
        async send(req) {
          sent.push(JSON.stringify(req.messages.at(-1)!.content));
          return { text: answer, stopReason: "end_turn", usage: { input_tokens: 10, output_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }, model: "replay" };
        },
      },
    });
    const r = await editSpec(client, { spec: s0, message: "Cena pramenov je po dogovoru.", corpus, retries: 1 });
    expect(r.changed).toBe(false);
    expect(r.reply).toBe(EDIT_FAILED_REPLY);
    expect(r.spec).toBe(s0);
    expect(sent).toHaveLength(2);
    expect(sent[1]).toMatch(/set by the client in the editor only/);
  });

  it("the generator's answer and anything else the model wrote: stripped back to a price placeholder, the owner's kept", () => {
    const owned = apply(read("frizerstvo-lana"), listEdits.setItem(read("frizerstvo-lana"), SALON, 1, 1, { name: "Pramene", price: { ...ON } }));
    // A new generation (nothing before it): every one goes.
    const fresh = structuredClone(owned);
    expect(stripModelOnRequest(fresh, null)).toEqual(["/pages/1/sections/1/props/groups/1/items/1/price"]);
    expect(readList(fresh, SALON)!.groups[1]!.items[1]!.price).toEqual({ $placeholder: "price" });
    expect(validateSite(fresh).issues).toEqual([]);
    // After the model saw the owner's: theirs stays, one the model added on another item goes.
    const after = structuredClone(owned);
    (after.pages[1]!.sections[1]!.props as { groups: { items: { price: unknown }[] }[] }).groups[1]!.items[2]!.price = { ...ON };
    expect(addedOnRequest(owned, after)).toEqual(["/pages/1/sections/1/props/groups/1/items/2/price"]);
    expect(stripModelOnRequest(after, owned)).toEqual(["/pages/1/sections/1/props/groups/1/items/2/price"]);
    expect(readList(after, SALON)!.groups[1]!.items.map((i) => i.price)).toEqual([{ amount: 45, from: true }, ON, { $placeholder: "price" }, { amount: 40, from: true }]);
  });

  it("\"Ustvari znova\" keeps the owner's choice where the regenerated item still has no price", () => {
    const s0 = read("frizerstvo-lana");
    const ops = listEdits.setItem(s0, SALON, 1, 1, { name: "Pramene", price: { ...ON } });
    const owned = apply(s0, ops);
    owned.ownerEdits = markOwnerEdits(owned, typedOps(s0, ops as Operation[]));
    // The regeneration: new section ids, the price list as the brief had it (Pramene without a price).
    const regenerated = read("frizerstvo-lana");
    for (const p of regenerated.pages) for (const sec of p.sections) sec.id = `${sec.id}_n`;
    stripModelOnRequest(regenerated, null);
    const kept = keepOwnerText(owned, regenerated);
    expect(readList(kept.spec, { ...SALON, id: "s_prices_n" })!.groups[1]!.items[1]).toEqual({ name: "Pramene", price: ON });
    expect(validateSite(kept.spec).issues).toEqual([]);
  });
});
