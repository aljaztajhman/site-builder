import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { migrateSpec, validateSite, type SiteSpec } from "@sb/spec";
import { keepOwnerText } from "../src/index.ts";

/**
 * "Ustvari znova" keeps the owner's own texts (it-keep-owner-edits): the regenerated site has new section ids and
 * its own texts; each marked value goes to the section of the same type in the same place, and never onto another
 * item of a list.
 */
const golden = () => migrateSpec(JSON.parse(readFileSync(new URL("../../../tools/eval/golden/pekarna-kvas.json", import.meta.url), "utf8"))) as SiteSpec;
type Item = { name: string; price: unknown; unit?: string };
const items = (s: SiteSpec) => (s.pages[0]!.sections.find((x) => x.type === "products")!.props as { items: Item[] }).items;
const hero = (s: SiteSpec) => s.pages[0]!.sections[0]!.props as { headline: string; intro: string };

/** The owner's version: a headline and a price typed in the editor, a renamed item with its price. */
function owners(): SiteSpec {
  const s = golden();
  hero(s).headline = "Naš kruh vzhaja čez noč";
  items(s)[4]!.price = { amount: 2.5 };
  items(s)[1] = { name: "Rženi hlebec", price: { amount: 4.1 } };
  s.ownerEdits = [
    { section: "s_hero", path: "/props/headline" },
    { section: "s_products", path: "/props/items/4/name" },
    { section: "s_products", path: "/props/items/4/price/amount" },
    { section: "s_products", path: "/props/items/1/name" },
    { section: "s_products", path: "/props/items/1/price/amount" },
  ];
  return s;
}

/** What a regeneration writes: new section ids, its own headline, the list as the brief had it. */
function regenerated(): SiteSpec {
  const s = golden();
  for (const p of s.pages) for (const sec of p.sections) sec.id = `${sec.id}_n`;
  hero(s).headline = "Pekarna z drožmi v Kamniku";
  return s;
}

describe("keepOwnerText", () => {
  it("puts the owner's texts and prices where the regenerated site has the same place, by the new section ids", () => {
    const r = keepOwnerText(owners(), regenerated());
    expect(hero(r.spec).headline).toBe("Naš kruh vzhaja čez noč");
    // The missing price (a placeholder in the regenerated list) takes the owner's, on the item of the same name.
    expect(items(r.spec)[4]).toMatchObject({ name: "Polnozrnate žemlje", price: { amount: 2.5 } });
    // The item the owner renamed comes back whole, in its place.
    expect(items(r.spec)[1]).toEqual({ name: "Rženi hlebec", price: { amount: 4.1 } });
    expect(r.dropped).toEqual([]);
    expect(r.kept).toEqual([
      "/pages/0/sections/0/props/headline",
      "/pages/0/sections/2/props/items/4/name",
      "/pages/0/sections/2/props/items/4/price/amount",
      "/pages/0/sections/2/props/items/1/name",
      "/pages/0/sections/2/props/items/1/price/amount",
    ]);
    expect(r.spec.ownerEdits?.map((m) => m.section)).toEqual(["s_hero_n", "s_products_n", "s_products_n", "s_products_n", "s_products_n"]);
    expect(validateSite(r.spec).issues).toEqual([]);
  });

  it("never puts a price on another item: a list in another order keeps the regenerated item and says what wasn't kept", () => {
    const now = regenerated();
    items(now).reverse();
    const own = owners();
    own.ownerEdits = [{ section: "s_products", path: "/props/items/4/price/amount" }];
    const r = keepOwnerText(own, now);
    expect(items(r.spec)).toEqual(items(now));
    expect(r.kept).toEqual([]);
    expect(r.dropped).toEqual(["Domov › Izdelki › Postavke (5.) › Cena › Znesek (€)"]);
  });

  it("drops what has no place in the new site, or would make it invalid, and keeps the rest", () => {
    const now = regenerated();
    now.pages[0]!.sections = now.pages[0]!.sections.filter((s) => s.type !== "about");
    const own = owners();
    (own.pages[0]!.sections.find((s) => s.type === "about")!.props as { heading: string }).heading = "O nas";
    // A greeting as the headline is on the banned list (it slipped in somehow): it would make the new site invalid.
    hero(own).headline = "Dobrodošli";
    hero(own).intro = "Pečemo vsak dan razen nedelje.";
    own.ownerEdits = [
      { section: "s_about", path: "/props/heading" },
      { section: "s_hero", path: "/props/headline" },
      { section: "s_hero", path: "/props/intro" },
    ];
    const r = keepOwnerText(own, now);
    expect(r.kept).toEqual(["/pages/0/sections/0/props/intro"]);
    expect(r.dropped).toEqual(["Domov › O nas › Naslov", "Domov › Uvod s fotografijo › Naslov"]);
    expect(hero(r.spec).headline).toBe(hero(now).headline);
    expect(hero(r.spec).intro).toBe("Pečemo vsak dan razen nedelje.");
    expect(validateSite(r.spec).ok).toBe(validateSite(now).ok);
  });

  it("does nothing for a site without marks", () => {
    const r = keepOwnerText(golden(), regenerated());
    expect(r).toEqual({ spec: regenerated(), kept: [], dropped: [] });
  });
});
