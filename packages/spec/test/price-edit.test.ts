import { describe, expect, it } from "vitest";
import {
  LIST_SHAPE,
  MENU_TAGS,
  MenuTag,
  cleanItem,
  formatPrice,
  menuSection,
  movedIndex,
  parsePriceInput,
  priceInputValue,
  priceLabel,
  priceList,
  priceValue,
  toModelJsonSchema,
} from "../src/index.ts";

const NBSP = " ";
const ok = (amount: number, from = false) => ({ kind: "ok" as const, amount, from });

describe("price input (Slovene formatting)", () => {
  it("reads the ways owners type a price", () => {
    expect(parsePriceInput("12.5")).toEqual(ok(12.5));
    expect(parsePriceInput("12,50")).toEqual(ok(12.5));
    expect(parsePriceInput("12 €")).toEqual(ok(12));
    expect(parsePriceInput("12€")).toEqual(ok(12));
    expect(parsePriceInput("€ 12,50")).toEqual(ok(12.5));
    expect(parsePriceInput("12,- EUR")).toEqual(ok(12));
    expect(parsePriceInput("12 evrov")).toEqual(ok(12));
    expect(parsePriceInput(" 7,9 ")).toEqual(ok(7.9));
    expect(parsePriceInput(`12,50${NBSP}€`)).toEqual(ok(12.5));
    expect(parsePriceInput("0")).toEqual(ok(0));
  });

  it("reads thousands with dots or spaces, and the English 1,200.50", () => {
    expect(parsePriceInput("1.200")).toEqual(ok(1200));
    expect(parsePriceInput("1.200,50 €")).toEqual(ok(1200.5));
    expect(parsePriceInput("1 200")).toEqual(ok(1200));
    expect(parsePriceInput("12.500")).toEqual(ok(12500));
    expect(parsePriceInput("1,200.50")).toEqual(ok(1200.5));
  });

  it("takes »od« from the field", () => {
    expect(parsePriceInput("od 25 €")).toEqual(ok(25, true));
    expect(parsePriceInput("Od 45")).toEqual(ok(45, true));
  });

  it("treats an empty field as a missing price", () => {
    expect(parsePriceInput("")).toEqual({ kind: "empty" });
    expect(parsePriceInput("   ")).toEqual({ kind: "empty" });
  });

  it("refuses what can't be a price, with a Slovene reason", () => {
    for (const bad of ["abc", "12,555", "12.5.0", "-5", "1,200", "1e3", "2000000", "12,50 / kos", "15 na osebo"]) {
      const r = parsePriceInput(bad);
      expect(r.kind, bad).toBe("error");
      expect((r as { message: string }).message, bad).toMatch(/[a-zčšž]/);
    }
    expect((parsePriceInput("12 / kos") as { message: string }).message).toMatch(/Enota/);
    expect((parsePriceInput("1,200") as { message: string }).message).toContain("1.200 €");
  });

  it("writes an amount back for editing without grouping, decimals with a comma", () => {
    expect(priceInputValue(12.5)).toBe("12,50");
    expect(priceInputValue(12)).toBe("12");
    expect(priceInputValue(1200.05)).toBe("1200,05");
    for (const a of [0, 4.2, 9.99, 1200, 1200.5]) expect(parsePriceInput(priceInputValue(a))).toEqual(ok(a));
  });

  it("labels a price as the site shows it: comma, no-break space, euro sign after", () => {
    expect(priceLabel({ amount: 12.5 })).toBe(`12,50${NBSP}€`);
    expect(priceLabel({ amount: 28 })).toBe(`28${NBSP}€`);
    expect(priceLabel({ amount: 45, from: true, unit: "/ kos" })).toBe(`od 45${NBSP}€ / kos`);
    expect(priceLabel({ amount: 1200 })).toBe(formatPrice(1200));
    expect(priceLabel({ $placeholder: "price" })).toBeNull();
    // The owner's "Cena po dogovoru": words where the amount would be.
    expect(priceLabel({ onRequest: true })).toBe("po dogovoru");
  });

  it("builds the spec value: placeholder when empty, »od« and unit kept", () => {
    expect(priceValue({ kind: "empty" })).toEqual({ $placeholder: "price" });
    expect(priceValue(ok(12.5), { unit: " / kos " })).toEqual({ amount: 12.5, unit: "/ kos" });
    expect(priceValue(ok(25, true))).toEqual({ amount: 25, from: true });
    expect(priceValue(ok(25), { from: true, unit: "" })).toEqual({ amount: 25, from: true });
  });
});

describe("list shapes match the spec", () => {
  /** The schema's limits, read from the JSON Schema the model and the editor get. */
  const limits = (schema: Record<string, unknown>, groups: string, items: string, detail: string) => {
    const props = (schema as { properties: Record<string, { maxItems: number; items: { properties: Record<string, { maxItems?: number; maxLength?: number; items?: { properties: Record<string, { maxLength?: number }> } }>; required?: string[] } }> }).properties;
    const g = props[groups]!;
    const it = g.items.properties[items]!;
    return {
      maxGroups: g.maxItems,
      groupNameMax: g.items.properties.name!.maxLength,
      groupNameRequired: (g.items.required ?? []).includes("name"),
      maxItems: it.maxItems,
      nameMax: it.items!.properties.name!.maxLength,
      detailMax: it.items!.properties[detail]!.maxLength,
    };
  };

  it("price-list and menu limits are the schema's", () => {
    for (const [type, def] of [["price-list", priceList], ["menu", menuSection]] as const) {
      const s = LIST_SHAPE[type];
      expect(limits(toModelJsonSchema(def.props), s.groups, s.items, s.detail), type).toEqual({
        maxGroups: s.maxGroups,
        groupNameMax: s.groupNameMax,
        groupNameRequired: s.groupNameRequired,
        maxItems: s.maxItems,
        nameMax: s.nameMax,
        detailMax: s.detailMax,
      });
    }
  });

  it("menu tags are the spec's", () => expect([...MENU_TAGS]).toEqual([...MenuTag.options]));

  it("an item cleaned for saving is valid in its section, with »unavailable« only when true", () => {
    const item = cleanItem("price-list", { name: " Barvanje ", note: " ", description: "x", tags: ["vegan"], unavailable: false, price: { amount: 45, from: false, unit: " " } });
    expect(item).toEqual({ name: "Barvanje", price: { amount: 45 } });
    const dish = cleanItem("menu", { name: "Ričet", note: "x", description: " s prekajenim ", tags: ["local"], unavailable: true, price: { $placeholder: "price" } });
    expect(dish).toEqual({ name: "Ričet", description: "s prekajenim", tags: ["local"], unavailable: true, price: { $placeholder: "price" } });
    const section = (type: "price-list" | "menu", it: object) =>
      type === "menu"
        ? menuSection.schema.safeParse({ id: "s_m", type, variant: "classic", props: { title: "Jedi", categories: [{ name: "Juhe", dishes: [it] }] } })
        : priceList.schema.safeParse({ id: "s_p", type, variant: "table", props: { title: "Cenik", groups: [{ items: [it] }] } });
    expect(section("price-list", item).success).toBe(true);
    expect(section("menu", dish).success).toBe(true);
    // A price "po dogovoru" is saved as exactly { onRequest: true }, whatever else the fields held.
    const asked = cleanItem("price-list", { name: "Pramene", price: { onRequest: true, amount: 5, unit: "x" } as never });
    expect(asked).toEqual({ name: "Pramene", price: { onRequest: true } });
    expect(section("price-list", asked).success).toBe(true);
    expect(section("menu", cleanItem("menu", { name: "Ričet", price: { onRequest: true } })).success).toBe(true);
  });
});

describe("movedIndex (JSON Patch move semantics)", () => {
  it("follows an element and its neighbours", () => {
    const after = (n: number, from: number, to: number) => {
      const a = Array.from({ length: n }, (_, i) => i);
      a.splice(to, 0, ...a.splice(from, 1));
      return a;
    };
    for (const [from, to] of [[0, 3], [3, 0], [1, 2], [2, 1]] as const) {
      const a = after(5, from, to);
      for (let k = 0; k < 5; k++) expect(a[movedIndex(k, from, to)], `${from}->${to} k=${k}`).toBe(k);
    }
  });
});
