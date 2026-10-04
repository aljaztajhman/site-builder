import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { migrateSpec, validateSite, type SiteSpec } from "@sb/spec";
import { applyDirectEdit, applyPatches, checkFacts, startCollection, typedOps, typedText } from "../src/index.ts";
import type { Operation } from "fast-json-patch";

const golden = (id: string) => migrateSpec(JSON.parse(readFileSync(new URL(`../../../tools/eval/golden/${id}.json`, import.meta.url), "utf8"))) as SiteSpec;

/** Applies startCollection's operations the way the editor's endpoint does. */
function start(spec: SiteSpec, kind: Parameters<typeof startCollection>[1]): SiteSpec {
  const ops = startCollection(spec, kind);
  if ("error" in ops) throw new Error(ops.error);
  const r = applyDirectEdit(spec, ops);
  expect(r.issues).toEqual([]);
  return r.spec;
}

describe("switching a collection on", () => {
  it("gives the blog a page of its own in the menu, before the legal pages", () => {
    const spec = start(golden("pekarna-kvas"), "blog");
    const page = spec.pages.find((p) => p.slug === "novice")!;
    expect(page.nav).toEqual({ label: "Novice", show: true });
    expect(page.sections).toEqual([{ id: "s_novice", type: "collection", variant: "list", props: { kind: "blog", title: "Novice" } }]);
    expect(spec.pages.indexOf(page)).toBe(1);
    expect(spec.collections).toEqual({ blog: { page: page.id, items: [] } });
    expect(validateSite(spec).issues).toEqual([]);
    expect(startCollection(spec, "blog")).toEqual({ error: "Ta zbirka je že vklopljena." });
  });

  it("moves the services sections' items into the collection, each section showing it in its place", () => {
    const before = golden("avtoservis-mrak");
    const spec = start(before, "services");
    const items = spec.collections!.services!.items;
    // The services page's ten first, then the home page's cards whose names they don't have, each name once.
    const listNames = (before.pages[1]!.sections[1]!.props as { items: { name: string }[] }).items.map((i) => i.name);
    const cardNames = (before.pages[0]!.sections[1]!.props as { items: { title: string }[] }).items.map((i) => i.title).filter((n) => !listNames.includes(n));
    expect(items.map((i) => i.name)).toEqual([...listNames, ...cardNames]);
    // The list's words, with the photo the home page's card showed for the same service.
    expect(items[0]).toEqual({ name: "Redni servis", summary: "Po navodilih proizvajalca, tako da garancija ostane.", image: "img_02" });
    expect(spec.collections!.services!.page).toBe(spec.pages.find((p) => p.slug === "storitve")!.id);
    const home = spec.pages[0]!.sections[1]!;
    expect(home).toMatchObject({ id: before.pages[0]!.sections[1]!.id, type: "collection", variant: "cards", props: { kind: "services", limit: 3 } });
    const list = spec.pages[1]!.sections[1]!;
    expect(list).toMatchObject({ type: "collection", variant: "list", props: { kind: "services" } });
    expect(list.type === "collection" && list.props.limit).toBeUndefined();
    expect(validateSite(spec).issues).toEqual([]);
  });

  it("moves named team members and leaves a name placeholder behind", () => {
    const before = golden("zobozdravstvo-lebar");
    const team = before.pages[0]!.sections.find((s) => s.type === "team")!;
    if (team.type !== "team") throw new Error("team");
    team.props.members.push({ name: { $placeholder: "name" }, role: "medicinska sestra" });
    const spec = start(before, "team");
    expect(spec.collections!.team!.items.map((m) => m.name)).toEqual(team.props.members.slice(0, 2).map((m) => m.name));
  });

  it("is not text the owner typed: a price the model invented stays flagged after the move", () => {
    const before = golden("avtoservis-mrak");
    const list = before.pages[1]!.sections[1]!;
    if (list.type !== "services-list") throw new Error("services-list");
    list.props.items[0]!.price = { amount: 77 };
    const corpus = before.business.name;
    expect(checkFacts(before, corpus).some((f) => f.kind === "price" && f.value === "77")).toBe(true);
    const spec = start(before, "services");
    const flagged = checkFacts(spec, corpus).find((f) => f.kind === "price" && f.value === "77");
    expect(flagged?.path).toBe("/collections/services/items/0/price");
  });

  it("accepts what the owner types into an entry, the event's date and time included", () => {
    const spec = start(golden("pekarna-kvas"), "events");
    const value = { title: "Dan odprtih vrat", date: "2026-11-07", start: "10:00", summary: "Ogled peči ob 10.00, vstop 5 €.", price: { amount: 5 } };
    const ops: Operation[] = [{ op: "add", path: "/collections/events/items/0", value }];
    const r = applyDirectEdit(spec, ops);
    expect(r.issues).toEqual([]);
    const typed = typedText(typedOps(spec, ops)).join("\n");
    expect(checkFacts(r.spec, `${spec.business.name}\n${typed}`).filter((f) => f.path.startsWith("/collections"))).toEqual([]);
  });
});

describe("chat edits", () => {
  it("can't write a collection (the model would be inventing posts)", () => {
    const spec = start(golden("pekarna-kvas"), "blog");
    const r = applyPatches(spec, [{ op: "add", path: "/collections/blog/items/0", value: { title: "Izmišljena novica", date: "2026-10-01", summary: "x", body: ["y"] } }], "");
    expect(r.applied).toBe(0);
    expect(r.issues[0]).toContain("collections are edited by the owner");
    expect(r.spec).toBe(spec);
  });
});

describe("English overlays move into the collection (it-collection-translations)", () => {
  it("services: each item's English name and description come along; the sections' headings keep theirs", () => {
    const before = golden("avtoservis-mrak");
    before.locales = { default: "sl", enabled: ["sl", "en"] };
    before.translations = {
      en: {
        "/pages/1/sections/1/props/title": "Services and prices",
        "/pages/1/sections/1/props/items/0/name": "Regular service",
        "/pages/1/sections/1/props/items/0/description": "By the maker's schedule, so the warranty stays.",
        "/pages/1/sections/1/props/items/1/name": "Oil and filter change",
        // The home page's card for the same service: the list's English comes first.
        "/pages/0/sections/1/props/items/0/title": "Servicing",
        "/pages/0/sections/1/props/items/1/text": "Brakes, clutches, timing belts and diagnostics.",
      },
    };
    const spec = start(before, "services");
    const items = spec.collections!.services!.items;
    const en = spec.translations!.en!;
    expect(en["/collections/services/items/0/name"]).toBe("Regular service");
    expect(en["/collections/services/items/0/summary"]).toBe("By the maker's schedule, so the warranty stays.");
    expect(en["/collections/services/items/1/name"]).toBe("Oil and filter change");
    // "Popravila in diagnostika" exists only as a card: its English text is now its summary.
    const repairs = items.findIndex((i) => i.name === "Popravila in diagnostika");
    expect(en[`/collections/services/items/${repairs}/summary`]).toBe("Brakes, clutches, timing belts and diagnostics.");
    expect(en["/pages/1/sections/1/props/title"]).toBe("Services and prices");
    expect(Object.keys(en).filter((p) => p.includes("/props/items/"))).toEqual([]);
    expect(validateSite(spec).issues).toEqual([]);
  });

  it("team: role and bio come along; a person's name isn't translated, and a placeholder's English stays behind", () => {
    const before = golden("zobozdravstvo-lebar");
    const team = before.pages[0]!.sections[3]!;
    if (team.type !== "team") throw new Error("team");
    team.props.members[1]!.bio = "Skrbi za naročanje.";
    before.locales = { default: "sl", enabled: ["sl", "en"] };
    before.translations = {
      en: {
        "/pages/0/sections/3/props/members/0/role": "DDS, prosthodontics specialist",
        "/pages/0/sections/3/props/members/1/role": "Dental assistant",
        "/pages/0/sections/3/props/members/1/bio": "Looks after appointments.",
      },
    };
    const spec = start(before, "team");
    expect(spec.translations!.en).toEqual({
      "/collections/team/items/0/role": "DDS, prosthodontics specialist",
      "/collections/team/items/1/role": "Dental assistant",
      "/collections/team/items/1/bio": "Looks after appointments.",
    });
    expect(validateSite(spec).issues).toEqual([]);
  });

  it("a site without English gets no translation operations", () => {
    const ops = startCollection(golden("avtoservis-mrak"), "services");
    expect("error" in ops ? [] : ops.filter((o) => o.path.startsWith("/translations"))).toEqual([]);
  });

  it("an entry's English is the owner's own words: not held to the banned phrases (the Slovene isn't either)", () => {
    const spec = start(golden("pekarna-kvas"), "blog");
    spec.locales = { default: "sl", enabled: ["sl", "en"] };
    spec.collections!.blog!.items.push({ title: "Novi kruh 🍞", date: "2026-10-01", summary: "Kruh.", body: ["Kruh."] });
    spec.translations = { en: { "/collections/blog/items/0/title": "New bread 🍞" } };
    expect(validateSite(spec).issues).toEqual([]);
    // A page's English still is.
    spec.translations.en!["/pages/0/sections/0/props/headline"] = "Fresh bread 🍞";
    expect(validateSite(spec).issues.map((i) => i.code)).toEqual(["banned"]);
  });

  it("a new list page is refused only at the spec's page maximum (24), not the old 12", () => {
    const spec = golden("pekarna-kvas");
    const filler = (n: number) => ({ id: `p_x${n}`, kind: "standard" as const, slug: `x${n}`, nav: { label: `X${n}`, show: false }, seo: { title: "X", description: "X" }, sections: structuredClone(spec.pages[0]!.sections.slice(0, 1)).map((s) => ({ ...s, id: `${s.id}_${n}` })) });
    while (spec.pages.length < 12) spec.pages.splice(1, 0, filler(spec.pages.length));
    expect("error" in startCollection(spec, "blog")).toBe(false);
    while (spec.pages.length < 24) spec.pages.splice(1, 0, filler(spec.pages.length));
    expect(startCollection(spec, "blog")).toEqual({ error: "Stran ima že največ strani (24). Najprej odstranite eno od strani." });
  });
});
