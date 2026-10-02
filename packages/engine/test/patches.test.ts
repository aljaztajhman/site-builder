import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Operation } from "fast-json-patch";
import { checkDesign, contrast, direction, isCreamOrOffWhite, isWarmCream, type SiteSpec } from "@sb/spec";
import { applyPatches } from "../src/index.ts";

const evalDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../tools/eval");
const golden = (id: string) => JSON.parse(readFileSync(path.join(evalDir, "golden", `${id}.json`), "utf8")) as SiteSpec;
const corpus = (id: string) => (JSON.parse(readFileSync(path.join(evalDir, "fixtures", id, "brief.json"), "utf8")) as { description: string }).description;

describe("applyPatches", () => {
  it("reports a wrongly shaped fact as a validation issue instead of throwing (live eval, opening-hours edit)", () => {
    const spec = golden("racunovodstvo-seliskar");
    // What the model guessed when it didn't know the hours format.
    const ops: Operation[] = [
      { op: "replace", path: "/business/hours", value: { mon: [{ open: "08:00", close: "16:00" }], fri: [{ open: "08:00", close: "13:00" }], sat: [], sun: [] } },
    ];
    const r = applyPatches(spec, ops, corpus("racunovodstvo-seliskar"));
    expect(r.issues.length).toBeGreaterThan(0);
    expect(r.issues.join(" ")).toMatch(/business\/hours/);
  });

  it("doesn't let a violation the site already had block an unrelated edit, but still catches a new one", () => {
    const spec = structuredClone(golden("pekarna-kvas"));
    // Left after generation's retries: a number the client never wrote.
    const home = spec.pages[0]!;
    const hero = home.sections[0]!.props as Record<string, unknown>;
    hero.headline = "Kruh peki že 777 dni";
    const c = corpus("pekarna-kvas");
    const unrelated = applyPatches(spec, [{ op: "add", path: "/chrome/header/tone", value: "inverse" }], c);
    expect(unrelated.issues).toEqual([]);
    expect(unrelated.spec.chrome.header.tone).toBe("inverse");
    const invented = applyPatches(spec, [{ op: "replace", path: "/business/phone", value: "+38641999111" }], c);
    expect(invented.issues.join(" ")).toMatch(/business\/phone/);
    expect(invented.issues.join(" ")).not.toMatch(/777/);
  });

  it("replaces em dashes in a chat edit or critique patch instead of rejecting it", () => {
    const spec = golden("pekarna-kvas");
    const r = applyPatches(spec, [{ op: "replace", path: "/pages/0/sections/0/props/intro", value: "Pečemo vsak dan — tudi ob sobotah." }], corpus("pekarna-kvas"));
    expect(r.issues).toEqual([]);
    expect(r.spec.pages[0]!.sections[0]!.props).toMatchObject({ intro: "Pečemo vsak dan – tudi ob sobotah." });
  });

  it("repairs a warmer palette with a cream surface instead of rejecting it (live eval, pekarna-kvas)", () => {
    const spec = golden("pekarna-kvas");
    const ops: Operation[] = [
      { op: "replace", path: "/design/colors/primary", value: "#8f4f1a" },
      { op: "replace", path: "/design/colors/accent", value: "#c47a2c" },
      { op: "replace", path: "/design/colors/surface", value: "#f6ebdc" },
      { op: "replace", path: "/design/colors/background", value: "#fffaf3" },
      { op: "replace", path: "/design/colors/inverse", value: "#3a2416" },
    ];
    const r = applyPatches(spec, ops, corpus("pekarna-kvas"));
    expect(r.issues).toEqual([]);
    const c = r.spec.design.colors;
    expect(isCreamOrOffWhite(c.background)).toBe(false);
    expect(isWarmCream(c.surface)).toBe(false);
    expect(c.primary).toBe("#8f4f1a");
    expect(contrast(c.accent, c.inverse)).toBeGreaterThanOrEqual(3);
    expect(checkDesign(r.spec.design, direction(r.spec.design.direction))).toEqual([]);
  });

  it("leaves non-design edits' colours untouched", () => {
    const spec = golden("pekarna-kvas");
    const r = applyPatches(spec, [{ op: "add", path: "/chrome/header/tone", value: "inverse" }], corpus("pekarna-kvas"));
    expect(r.issues).toEqual([]);
    expect(r.spec.design).toEqual(spec.design);
  });
});
