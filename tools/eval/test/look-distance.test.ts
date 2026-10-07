import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { deltaE, migrateSpec, type SiteSpec } from "@sb/spec";
import { brandFit, lookFeatures, lookSummary, motifFit, pairDistance, screenDistance, screenPrint, specDistance, type LookSite } from "../src/look-distance.ts";

/** The variety measures (docs/plans/variety-engine.md, Step 0), free and offline. */
const here = path.dirname(fileURLToPath(import.meta.url));
const golden = (id: string) => migrateSpec(JSON.parse(readFileSync(path.join(here, "../golden", `${id}.json`), "utf8"))) as SiteSpec;
const png = async (w: number, h: number, svg: string) => new Uint8Array(await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${svg}</svg>`)).png().toBuffer());

describe("look distance", () => {
  it("ΔE: the same colour 0, black and white 100, near colours small", () => {
    expect(deltaE("#336699", "#336699")).toBe(0);
    expect(deltaE("#000000", "#ffffff")).toBeCloseTo(100, 0);
    expect(deltaE("#ffcc00", "#ffcd02")).toBeLessThan(2);
  });

  it("a site against itself is 0; two trade templates are far apart in every part", () => {
    const a = lookFeatures(golden("gostilna-zlata-zlica"));
    const b = lookFeatures(golden("racunovodstvo-seliskar"));
    expect(specDistance(a, a).total).toBe(0);
    const d = specDistance(a, b);
    expect(d.parts.direction).toBe(1);
    expect(d.parts.fontPair).toBe(1);
    expect(d.parts.palette).toBeGreaterThan(0.15);
    expect(d.total).toBeGreaterThan(0.5);
    expect([a.motif, b.motif]).toEqual(["spoon", "ledger"]);
    expect(a.sequence[0]).toMatch(/^hero-signature:/);
  });

  it("the same template with another palette and hero variant is between", () => {
    const base = golden("avtoservis-mrak");
    const twin = structuredClone(base);
    twin.design.colors.primary = "#1f4e9c";
    twin.design.colors.band = "#1f4e9c";
    const d = specDistance(lookFeatures(base), lookFeatures(twin));
    expect(d.parts.direction).toBe(0);
    expect(d.parts.palette).toBeGreaterThan(0.2);
    expect(d.total).toBeGreaterThan(0);
    expect(d.total).toBeLessThan(0.3);
  });

  it("first screens: identical 0; a different layout and colours far", async () => {
    const one = await screenPrint(await png(360, 800, `<rect width="360" height="800" fill="#fff"/><rect y="0" width="360" height="300" fill="#15181c"/><rect x="20" y="340" width="200" height="30" fill="#ffcc00"/>`));
    const same = await screenPrint(await png(360, 800, `<rect width="360" height="800" fill="#fff"/><rect y="0" width="360" height="300" fill="#15181c"/><rect x="20" y="340" width="200" height="30" fill="#ffcc00"/>`));
    const other = await screenPrint(await png(360, 800, `<rect width="360" height="800" fill="#f3e9d8"/><rect x="0" y="420" width="360" height="380" fill="#8a4b2f"/><circle cx="180" cy="200" r="120" fill="#2f6b3a"/>`));
    expect(screenDistance(one, same).structure).toBeCloseTo(0, 9);
    expect(screenDistance(one, same).colour).toBeCloseTo(0, 9);
    const d = screenDistance(one, other);
    expect(d.structure).toBeGreaterThan(0.3);
    // White and cream share the top histogram bin; the dark blocks and the green don't.
    expect(d.colour).toBeGreaterThan(0.5);
  });

  it("summarises within a trade and across trades, and flags pairs a visitor would take for one template", () => {
    const site = (id: string, trade: string, spec: SiteSpec): LookSite => ({ id, trade, features: lookFeatures(spec) });
    const mrak = golden("avtoservis-mrak");
    const twin = structuredClone(mrak);
    const blue = structuredClone(mrak);
    blue.design.colors.primary = "#1f4e9c";
    blue.design.colors.band = "#1f4e9c";
    const s = lookSummary([site("mrak", "car-repair", mrak), site("twin", "car-repair", twin), site("blue", "car-repair", blue), site("kvas", "bakery", golden("pekarna-kvas"))]);
    expect(s.pairs).toHaveLength(6);
    expect(s.withinTrade["car-repair"]!.pairs).toBe(3);
    expect(s.withinTrade["car-repair"]!.min).toBe(0);
    expect(s.acrossTrades!).toBeGreaterThan(s.withinTradeAll!);
    expect(s.collisions.map((p) => `${p.a}/${p.b}`)).toEqual(["mrak/twin"]);
    expect(pairDistance(site("mrak", "car-repair", mrak), site("kvas", "bakery", golden("pekarna-kvas"))).screens).toBeNull();
  });
});

describe("brand fit", () => {
  const f = lookFeatures(golden("avtoservis-mrak"));
  it("fits when a logo colour is close to primary, band or accent; misses otherwise", () => {
    // The golden's primary is a signal red (#c8261b); a logo a shade off it reaches it.
    const fit = brandFit(f, ["#c42a1e"]);
    expect(fit.kind).toBe("fit");
    if (fit.kind === "fit") expect(fit.role).toBe("primary");
    expect(brandFit(f, ["#1f4e9c"]).kind).toBe("miss");
  });
  it("says when there is no logo or the logo has no usable colour", () => {
    expect(brandFit(f, null).kind).toBe("no-logo");
    expect(brandFit(f, ["#777777"]).kind).toBe("no-colour");
  });
});

describe("motif fit", () => {
  it("the plate fits every car trade; the pipes fit plumbing, not an electrician or a carpenter; the label not a florist", () => {
    expect(motifFit("plate", "car-repair")).toBe("fit");
    expect(motifFit("plate", "car-repair", "gume")).toBe("fit");
    expect(motifFit("pipes", "builder")).toBe("fit");
    expect(motifFit("pipes", "builder", "elektro")).toBe("misfit");
    expect(motifFit("pipes", "builder", "mizar")).toBe("misfit");
    expect(motifFit("label", "shop", "cvetličarna")).toBe("misfit");
    expect(motifFit(null, "builder", "elektro")).toBe("no-motif");
  });
});
