import { describe, expect, it } from "vitest";
import { businessWords, coreWords, domainLabels, nameWords, suggestDomains } from "../src/domain-names.ts";

describe("domain names from a business name", () => {
  it("folds Slovene letters to ASCII and drops the legal form", () => {
    expect(nameWords("Čevljarstvo Šuštar & Žnidaršič")).toEqual(["cevljarstvo", "sustar", "in", "znidarsic"]);
    expect(nameWords("Đurić")).toEqual(["dzuric"]);
    expect(businessWords("Pekarna Kvas, s.p.")).toEqual(["pekarna", "kvas"]);
    expect(businessWords("Novak d.o.o.")).toEqual(["novak"]);
    expect(businessWords("Inštalacije Rebernik, d. o. o.")).toEqual(["instalacije", "rebernik"]);
    expect(coreWords("Gostilna pri Zlati Žlici")).toEqual(["gostilna", "zlati", "zlici"]);
  });

  it("offers the whole name first, then hyphenated, shorter and with the town", () => {
    expect(domainLabels("Pekarna Kvas, s.p.", { town: "Ljubljana" })).toEqual(["pekarnakvas", "pekarna-kvas", "pekarnakvas-ljubljana", "pekarnakvasljubljana", "kvas"]);
    expect(domainLabels("Gostilna pri Zlati Žlici")).toEqual(["gostilnaprizlatizlici", "gostilna-pri-zlati-zlici", "gostilnazlatizlici", "gostilna-zlati-zlici", "zlatizlici"]);
    expect(domainLabels("Frizer Ana", { town: "Ana" })).toEqual(["frizerana", "frizer-ana", "ana"]);
  });

  it("never proposes an invalid label", () => {
    expect(domainLabels("!!!")).toEqual([]);
    expect(domainLabels("A")).toEqual([]);
    for (const l of domainLabels(`${"Zelo ".repeat(20)}dolgo ime`)) {
      expect(l.length).toBeLessThanOrEqual(63);
      expect(l).toMatch(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/);
    }
  });

  it("orders full names by TLD, .si first, and caps the list", () => {
    expect(suggestDomains("Pekarna Kvas", { tlds: ["si", ".com"], limit: 4 })).toEqual(["pekarnakvas.si", "pekarna-kvas.si", "kvas.si", "pekarnakvas.com"]);
  });
});
