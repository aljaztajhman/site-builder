import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { keepUnchangedOwnerEdits, markOwnerEdits, migrateSpec, type SiteSpec } from "../src/index.ts";

/** The owner's own texts (spec v14 ownerEdits, it-keep-owner-edits): what a direct edit marks, what a chat edit keeps. */
const golden = () => migrateSpec(JSON.parse(readFileSync(new URL("../../../tools/eval/golden/pekarna-kvas.json", import.meta.url), "utf8"))) as SiteSpec;
const products = (s: SiteSpec) => s.pages[0]!.sections[2]! as unknown as { id: string; props: { items: { name: string; price: unknown }[] } };

describe("markOwnerEdits", () => {
  it("marks each plain value the owner typed, by section id, and never a picture or page id", () => {
    const after = golden();
    (after.pages[0]!.sections[0]!.props as { headline: string }).headline = "Naš kruh";
    products(after).props.items[4]!.price = { amount: 2.5 };
    const marks = markOwnerEdits(after, [
      { path: "/pages/0/sections/0/props/headline", value: "Naš kruh" },
      // An editor form sends a whole item; typedOps reduces it to what changed (a priced item keeps its name).
      { path: "/pages/0/sections/2/props/items/4", value: { name: "Polnozrnate žemlje", price: { amount: 2.5 } } },
      { path: "/pages/0/sections/0/props/image", value: "img_02" },
      // Outside a section's props: business facts are kept by keepOwnerFacts already; design isn't text.
      { path: "/business/phone", value: "+38641000111" },
      { path: "/pages/0/sections/0/variant", value: "image-left" },
    ]);
    expect(marks).toEqual([
      { section: "s_hero", path: "/props/headline" },
      { section: "s_products", path: "/props/items/4/name" },
      { section: "s_products", path: "/props/items/4/price/amount" },
    ]);
  });

  it("keeps earlier marks, once each, and drops those whose section or value is gone", () => {
    const after = golden();
    after.ownerEdits = [
      { section: "s_hero", path: "/props/headline" },
      { section: "s_gone", path: "/props/title" },
      { section: "s_about", path: "/props/nothing/here" },
    ];
    expect(markOwnerEdits(after, [{ path: "/pages/0/sections/0/props/headline", value: "x" }])).toEqual([{ section: "s_hero", path: "/props/headline" }]);
    expect(markOwnerEdits({ ...after, ownerEdits: [{ section: "s_gone", path: "/props/title" }] }, [])).toBeUndefined();
  });
});

describe("keepUnchangedOwnerEdits", () => {
  it("keeps a mark only where the assistant left the owner's value as it was", () => {
    const before = golden();
    before.ownerEdits = [
      { section: "s_hero", path: "/props/headline" },
      { section: "s_hero", path: "/props/intro" },
    ];
    const after = structuredClone(before);
    (after.pages[0]!.sections[0]!.props as { intro: string }).intro = "Krajši uvod.";
    expect(keepUnchangedOwnerEdits(before, after)).toEqual([{ section: "s_hero", path: "/props/headline" }]);
    after.pages[0]!.sections.splice(0, 1);
    expect(keepUnchangedOwnerEdits(before, after)).toBeUndefined();
  });
});
