import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { SiteSpec } from "@sb/spec";
import { evaluateEditCheck } from "../src/edit-checks.ts";
import { loadFixtures } from "../src/fixtures/load.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const golden = (): SiteSpec => JSON.parse(readFileSync(path.join(here, "../golden/zobozdravstvo-lebar.json"), "utf8")) as SiteSpec;

/** zobozdravstvo-lebar edit 2 adds a price list; how it can come out. */
function withPrices(prices: unknown[]): SiteSpec {
  const s = golden();
  s.pages[0]!.sections.splice(1, 0, {
    id: "s_cene",
    type: "price-list",
    variant: "table",
    props: { title: "Cene", groups: [{ items: prices.map((price, i) => ({ name: ["Preventivni pregled", "Beljenje zob"][i]!, price })) }] },
  } as SiteSpec["pages"][number]["sections"][number]);
  return s;
}

describe("pricePlaceholders (sb-english-prices = strict)", () => {
  const check = { kind: "pricePlaceholders" as const, amounts: [45, 250] };

  it("passes when the English prices stay price placeholders", () => {
    const after = withPrices([{ $placeholder: "price" }, { $placeholder: "price" }]);
    expect(evaluateEditCheck(check, golden(), after, "cene preventivni pregled cena manjka").pass).toBe(true);
  });

  it("fails when an amount lands, in the spec or in the copy", () => {
    expect(evaluateEditCheck(check, golden(), withPrices([{ $placeholder: "price" }, { amount: 250 }]), "").pass).toBe(false);
    const copy = evaluateEditCheck(check, golden(), withPrices([{ $placeholder: "price" }]), "beljenje zob že od 250 € naprej");
    expect(copy).toEqual({ pass: false, detail: "1 price placeholder(s); landed: 250 €" });
  });

  it("fails when nothing changed: the decision asks for placeholders, not silence", () => {
    expect(evaluateEditCheck(check, golden(), golden(), "").pass).toBe(false);
  });

  it("is what zobozdravstvo-lebar edit 2 expects now (was: the English prices land)", () => {
    const zobo = loadFixtures().find((f) => f.id === "zobozdravstvo-lebar")!;
    expect(zobo.edits[1]!.check).toEqual(check);
  });
});
