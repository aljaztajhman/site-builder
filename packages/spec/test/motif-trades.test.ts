import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BusinessType, DIRECTIONS, MOTIFS, MOTIF_TRADES, directionFitsTrade, motifFitsTrade, siteMotif, tradeMotifIssues, worksOnVehicles, type SiteSpec } from "../src/index.ts";

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
    expect(tradeMotifIssues({ ...spec, business: { ...spec.business, type: "car-repair", name: "Avtoservis Hrovat" } })).toEqual([]);
  });
});

/**
 * M1 final check (2026-10-17): an appliance repairer the classifier filed as car-repair drew the licence plate (a "SLO"
 * strip on the phone number and the prices). The plate also needs the site's own words to name vehicles.
 */
describe("the plate needs a business that works on vehicles", () => {
  const rebec = JSON.parse(readFileSync(path.resolve(specs, "../../../tools/eval/test/fixtures/m1/servis-aparatov-rebec.json"), "utf8")) as SiteSpec;
  const mrak = JSON.parse(readFileSync(path.resolve(specs, "../../../tools/eval/golden/avtoservis-mrak.json"), "utf8")) as SiteSpec;
  const plate = DIRECTIONS.find((d) => d.template?.motif === "plate")!;

  it("vehicle words: cars, tyres, bodywork, towing; not a washing machine (avtomat), a button (gumb) or the van one drives", () => {
    for (const t of ["Avtoservis Mrak", "menjava gum", "Vulkanizer Zorman", "karoserijska popravila", "vleka vozil", "servis osebnih vozil", "zamenjava zavornih ploščic", "PNEVMATIKE"]) expect(worksOnVehicles(t), t).toBe(true);
    for (const t of ["Servis gospodinjskih aparatov Rebec", "pralni avtomat", "gumb za vklop", "rezervni del imam v kombiju", "avtor besedila"]) expect(worksOnVehicles(t), t).toBe(false);
    expect(worksOnVehicles(""), "nothing to judge by").toBe(true);
  });

  it("servis-aparatov-rebec (car-repair, tablica): no plate motif, and the check names it", () => {
    expect(rebec.business.type).toBe("car-repair");
    expect(rebec.design.direction).toBe(plate.id);
    expect(siteMotif(rebec)).toEqual({});
    expect(tradeMotifIssues(rebec)).toEqual([{ path: "/design/direction", message: `the plate motif of direction ${plate.id} is for vehicles; nothing on the site names one` }]);
  });

  it("a car repairer keeps the plate (golden avtoservis-mrak on tablica, and rebec's site as a car service)", () => {
    const onPlate = { ...mrak, design: { ...mrak.design, direction: plate.id } };
    expect(siteMotif(onPlate)).toEqual({ motif: "plate" });
    expect(tradeMotifIssues(onPlate)).toEqual([]);
    const asCars = structuredClone(rebec);
    asCars.business.name = "Avtoservis Rebec";
    expect(siteMotif(asCars)).toEqual({ motif: "plate" });
  });

  it("directionFitsTrade with the business's words", () => {
    expect(directionFitsTrade(plate.id, "car-repair", "Servis gospodinjskih aparatov: pralni stroji, hladilniki")).toBe(false);
    expect(directionFitsTrade(plate.id, "car-repair", "Avtoservis: servis vozil vseh znamk")).toBe(true);
    expect(directionFitsTrade(plate.id, "car-repair")).toBe(true);
  });
});

describe("siteMotif gates the trade", () => {
  it("a locksmith (builder) on the plate template gets no motif; car repair and callers without a type keep it", () => {
    const plate = DIRECTIONS.find((d) => d.template?.motif === "plate")!;
    expect(siteMotif({ design: { direction: plate.id }, business: { type: "builder" } })).toEqual({});
    expect(siteMotif({ design: { direction: plate.id }, business: { type: "car-repair" } })).toEqual({ motif: "plate" });
    expect(siteMotif({ design: { direction: plate.id }, business: {} })).toEqual({ motif: "plate" });
  });
});
