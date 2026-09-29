import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyDirectEdit } from "@sb/engine";
import { collectPlaceholders, publishBlockers, type SiteSpec } from "@sb/spec";
import { fillPlaceholderOps } from "../src/placeholder-fill.ts";

const goldenDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../golden");

describe("fillPlaceholderOps", () => {
  const files = readdirSync(goldenDir).filter((f) => f.endsWith(".json"));
  it("covers the golden specs", () => expect(files.length).toBe(10));
  for (const f of files) {
    it(`fills every placeholder in ${f} with a value the schema accepts`, () => {
      const spec = JSON.parse(readFileSync(path.join(goldenDir, f), "utf8")) as SiteSpec;
      const r = applyDirectEdit(spec, fillPlaceholderOps(spec));
      expect(r.ok ? [] : r.issues).toEqual([]);
      const filled = r.ok ? r.spec : spec;
      expect(collectPlaceholders(filled)).toEqual([]);
      expect(publishBlockers(filled).filter((b) => !b.includes("starter text"))).toEqual([]);
    });
  }
});
