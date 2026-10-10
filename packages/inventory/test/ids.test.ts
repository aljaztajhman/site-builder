import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ImageElement, KIND_PREFIX as SPEC_KIND_PREFIX } from "@sb/spec";
import { ASSET_KINDS, KIND_PREFIX, assetId, inventory, parseAssetId } from "../src/index.ts";

/** The asset id scheme is @sb/spec's (studio-phase1-design.md §4); the inventory only re-exports it. */
describe("asset ids", () => {
  const assets = inventory().all();

  it("the inventory's table is @sb/spec's", () => {
    expect(KIND_PREFIX).toBe(SPEC_KIND_PREFIX);
  });

  it("every registered id parses to its kind and round-trips", () => {
    for (const a of assets) {
      const { kind, name } = parseAssetId(a.id);
      expect(kind, a.id).toBe(a.kind);
      expect(assetId(kind, name)).toBe(a.id);
    }
  });

  it("image masks are kind mask (was shape)", () => {
    const masks = ImageElement.shape.mask.unwrap().options.filter((m) => m !== "none");
    expect(inventory().byKind("mask").map((a) => a.id)).toEqual(masks.map((m) => `mask/${m}`));
    expect((ASSET_KINDS as readonly string[]).includes("shape")).toBe(false);
    expect(assets.some((a) => a.id.startsWith("shape/"))).toBe(false);
  });

  it("KIND_PREFIX and the prefix table are defined only in packages/spec/src/assets.ts", () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
    const home = path.join(root, "packages", "spec", "src", "assets.ts");
    const skip = new Set(["node_modules", "dist", ".git", ".turbo", "coverage"]);
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (skip.has(e.name)) continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(ts|tsx|mts|js|mjs)$/.test(e.name)) files.push(p);
      }
    };
    for (const top of ["apps", "packages", "tools", "eval"]) walk(path.join(root, top));
    // A definition of the constant (assigned, optionally typed) or a kind → prefix row of the table.
    const definition = /\bKIND_PREFIX\s*(?::[^=;]+)?=|\btypeTreatment\s*:\s*["']type-treatment["']|\bfactObject\s*:\s*["']fact["']/;
    const offenders = files.filter((f) => f !== home && definition.test(readFileSync(f, "utf8"))).map((f) => path.relative(root, f));
    expect(files.length).toBeGreaterThan(100);
    expect(offenders).toEqual([]);
  });
});
