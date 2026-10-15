import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BusinessType, DIRECTIONS, MOTIFS, MOTIF_TRADES, directionFitsTrade, motifFitsTrade, tradeMotifIssues, type SiteSpec } from "../src/index.ts";

/** Motifs carry the trades they fit: the outside review found the licence plate on a locksmith's site. */
const specs = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../eval/outside-review/review50-specs");

describe("motifs and trades", () => {
  it("every motif says which trades it fits; the plate is car repair's alone", () => {
    expect(Object.keys(MOTIF_TRADES).sort()).toEqual([...MOTIFS].sort());
    expect(MOTIF_TRADES.plate).toEqual(["car-repair"]);
    for (const t of BusinessType.options) expect(motifFitsTrade("plate", t)).toBe(t === "car-repair");
    expect(motifFitsTrade(undefined, "builder")).toBe(true);
  });

  it("every template's own trades fit its motif", () => {
    for (const d of DIRECTIONS.filter((x) => x.template)) for (const t of d.template!.firstFor) expect(directionFitsTrade(d.id, t), `${d.id} for ${t}`).toBe(true);
  });

  it("the car-repair template doesn't fit a builder (a locksmith), plain directions fit everyone", () => {
    const plate = DIRECTIONS.find((d) => d.template?.motif === "plate")!;
    expect(directionFitsTrade(plate.id, "builder")).toBe(false);
    expect(directionFitsTrade(plate.id, "car-repair")).toBe(true);
    for (const d of DIRECTIONS.filter((x) => !x.template)) expect(directionFitsTrade(d.id, "builder")).toBe(true);
  });

  it("names the plate on the locksmith of the outside review (kljucavnicarstvo-hrovat)", () => {
    const spec = JSON.parse(readFileSync(path.join(specs, "kljucavnicarstvo-hrovat/spec-regenerated.json"), "utf8")) as SiteSpec;
    expect(spec.business.type).toBe("builder");
    expect(tradeMotifIssues(spec)).toEqual([{ path: "/design/direction", message: `the plate motif of direction ${spec.design.direction} is for car-repair, not builder` }]);
    expect(tradeMotifIssues({ ...spec, business: { ...spec.business, type: "car-repair" } })).toEqual([]);
  });
});
