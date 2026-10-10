import { describe, expect, it } from "vitest";
import { ASSET_KINDS, AssetId, KIND_PREFIX, assetId, parseAssetId } from "../src/index.ts";

describe("asset ids (studio-phase1-design.md §4)", () => {
  it("one prefix per kind, distinct, and the renamed and new kinds", () => {
    const prefixes = ASSET_KINDS.map((k) => KIND_PREFIX[k]);
    expect(new Set(prefixes).size).toBe(ASSET_KINDS.length);
    expect(ASSET_KINDS).not.toContain("shape");
    expect(KIND_PREFIX.mask).toBe("mask");
    expect(KIND_PREFIX.wordmark).toBe("wordmark");
    expect(KIND_PREFIX.typeTreatment).toBe("type-treatment");
    expect(KIND_PREFIX.factObject).toBe("fact");
  });

  it("assetId and parseAssetId round-trip every kind", () => {
    for (const kind of ASSET_KINDS) {
      const id = assetId(kind, "some-name");
      expect(id).toBe(`${KIND_PREFIX[kind]}/some-name`);
      expect(AssetId.safeParse(id).success, id).toBe(true);
      expect(parseAssetId(id)).toEqual({ kind, name: "some-name" });
    }
  });

  it("parses the §4 examples", () => {
    expect(parseAssetId("mask/arch")).toEqual({ kind: "mask", name: "arch" });
    expect(parseAssetId("type-treatment/stacked")).toEqual({ kind: "typeTreatment", name: "stacked" });
    expect(parseAssetId("fact/plate")).toEqual({ kind: "factObject", name: "plate" });
    expect(parseAssetId("motif/bakery/peel-line")).toEqual({ kind: "motif", name: "bakery/peel-line" });
    expect(parseAssetId("section/hero-split:image-left")).toEqual({ kind: "section", name: "hero-split:image-left" });
    expect(parseAssetId("wordmark/stamp")).toEqual({ kind: "wordmark", name: "stamp" });
  });

  it("rejects unknown prefixes and malformed ids", () => {
    for (const bad of ["shape/arch", "typeTreatment/stacked", "imagery/duotone", "Font/X", "font/", "font", "/x", "font/a b", "mask/arch/"]) {
      expect(() => parseAssetId(bad), bad).toThrow(/Invalid asset id/);
      expect(AssetId.safeParse(bad).success, bad).toBe(false);
    }
    expect(() => assetId("mask", "Arch")).toThrow(/Invalid asset name/);
  });
});
