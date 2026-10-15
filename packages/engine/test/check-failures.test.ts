import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "@sb/config";
import type { SiteSpec } from "@sb/spec";
import { failuresOf, type SiteCheckReport } from "../src/index.ts";

/** What the checks report that the critique pass and the eval read (failuresOf), for the outside review's rules. */
const specs = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../eval/outside-review/review50-specs");
const load = (id: string, file: string): SiteSpec => JSON.parse(readFileSync(path.join(specs, id, file), "utf8")) as SiteSpec;

const empty = (): SiteCheckReport => ({
  validation: [],
  facts: [],
  placeholders: 0,
  pages: [],
  lighthouse: null,
  lighthousePages: [],
  pageShots: [],
  screenshots: { mobile: new Uint8Array(), mobileFull: new Uint8Array(), desktop: new Uint8Array(), desktopFirst: new Uint8Array() },
  composition: null,
  failures: [],
});

describe("failuresOf", () => {
  const config = loadConfig();

  it("names an image shown twice on one page", () => {
    const f = failuresOf(load("trgovina-oljka-in-sol", "spec-regenerated.json"), empty(), config);
    expect(f).toContainEqual(expect.stringMatching(/^same image twice on a page: \/pages\/0\/sections\/2\/props\/items\/0\/image image img_01 is already shown higher on this page$/));
  });

  it("has no line for a trade-foreign motif: the renderer doesn't draw it (spec siteMotif), so the critique couldn't fix it", () => {
    expect(failuresOf(load("kljucavnicarstvo-hrovat", "spec-regenerated.json"), empty(), config).join("\n")).not.toMatch(/motif/);
  });

  it("is quiet about images when each is shown once", () => {
    const f = failuresOf(load("trgovina-oljka-in-sol", "spec-generated.json"), empty(), config);
    expect(f.join("\n")).not.toMatch(/same image/);
  });
});
