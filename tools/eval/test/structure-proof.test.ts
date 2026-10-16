// Design 5 Wave P (docs/plans/phase-layout-variety.md "Wave P · Proof first"): the proof harness's pure parts.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { repoRoot } from "@sb/config";
import { STRUCTURES, migrateSpec, validateSite, type SiteSpec, type Structure } from "@sb/spec";
import {
  PHOTO_LED,
  applyStructure,
  assignChrome,
  assignStructures,
  chromeKey,
  proofPageOf,
  structureFits,
  type ProofPage,
} from "../src/structure-proof.ts";

const page = (id: string, o: Partial<ProofPage> = {}): ProofPage => ({
  id,
  business: o.business ?? id,
  trade: o.trade ?? `trade-${id}`,
  town: o.town ?? `town-${id}`,
  clientPhotos: o.clientPhotos ?? 0,
  aiPictures: o.aiPictures ?? 0,
});

const counts = (m: Map<string, Structure>) => {
  const c = new Map<Structure, number>();
  for (const s of m.values()) c.set(s, (c.get(s) ?? 0) + 1);
  return c;
};

describe("structureFits (direction §3 and owner D2)", () => {
  it("photo-led structures need a client photo, or AI pictures when the business has no client photo (D2)", () => {
    expect(PHOTO_LED).toEqual(expect.arrayContaining(["band", "mosaic", "split", "magazine"]));
    expect(structureFits("band", page("a", { clientPhotos: 1 }))).toBe(true);
    expect(structureFits("band", page("a"))).toBe(false);
    expect(structureFits("band", page("a", { aiPictures: 1 }))).toBe(true);
    expect(structureFits("mosaic", page("a", { clientPhotos: 2 }))).toBe(false);
    expect(structureFits("mosaic", page("a", { clientPhotos: 3 }))).toBe(true);
    // A business with one client photo: the AI pictures don't count towards a mosaic (D2: AI leads only without a client photo).
    expect(structureFits("mosaic", page("a", { clientPhotos: 1, aiPictures: 3 }))).toBe(false);
  });
  it("poster, field, ledger and strata fit any business", () => {
    for (const s of ["poster", "field", "ledger", "strata"] as const) expect(structureFits(s, page("a"))).toBe(true);
  });
});

describe("assignStructures", () => {
  const ten = Array.from({ length: 10 }, (_, i) => page(`p${i}`, { aiPictures: 2 }));
  it("keeps every structure at or under 25 % of the set", () => {
    const m = assignStructures(ten);
    expect(m.size).toBe(10);
    for (const n of counts(m).values()) expect(n).toBeLessThanOrEqual(2);
  });
  it("only assigns what fits each page", () => {
    const pages = [page("a", { clientPhotos: 5 }), page("b"), page("c", { clientPhotos: 1 }), page("d", { aiPictures: 2 })];
    const m = assignStructures(pages);
    for (const p of pages) expect(structureFits(m.get(p.id)!, p)).toBe(true);
  });
  it("gives a business's two pages (generated, regenerated) different structures", () => {
    const pages = [page("x-gen", { business: "x", clientPhotos: 4 }), page("x-regen", { business: "x", clientPhotos: 4 })];
    const m = assignStructures(pages);
    expect(m.get("x-gen")).not.toBe(m.get("x-regen"));
  });
  it("gives pages of one trade different structures", () => {
    const pages = Array.from({ length: 6 }, (_, i) => page(`g${i}`, { trade: "gostilna", clientPhotos: 4 }));
    const m = assignStructures([...pages, ...Array.from({ length: 18 }, (_, i) => page(`o${i}`, { clientPhotos: i % 3 }))]);
    expect(new Set(pages.map((p) => m.get(p.id))).size).toBe(6);
  });
  it("is deterministic and honours overrides", () => {
    expect([...assignStructures(ten)]).toEqual([...assignStructures(ten)]);
    expect(assignStructures(ten, { overrides: { p3: "ledger" } }).get("p3")).toBe("ledger");
  });
  it("uses all eight structures on a 50-page set with enough photos", () => {
    const fifty = Array.from({ length: 50 }, (_, i) => page(`q${i}`, { business: `b${i >> 1}`, clientPhotos: i % 5 }));
    const m = assignStructures(fifty);
    expect(new Set(m.values()).size).toBe(STRUCTURES.length);
    for (const n of counts(m).values()) expect(n).toBeLessThanOrEqual(12);
  });
});

describe("assignChrome", () => {
  it("gives every page of a set its own chrome (header family, header tone, phone action)", () => {
    const pages = Array.from({ length: 50 }, (_, i) => page(`c${i}`));
    const chrome = assignChrome(pages);
    expect(new Set([...chrome.values()].map(chromeKey)).size).toBe(50);
    for (const c of chrome.values()) expect(c.header).not.toBe("overlay"); // overlay needs a signature photo hero
  });
});

describe("applyStructure on a saved Review 50 page", () => {
  const dir = path.join(repoRoot, "eval/outside-review/review50-specs");
  const load = (id: string): SiteSpec => migrateSpec(JSON.parse(readFileSync(path.join(dir, id, "spec-generated.json"), "utf8")));

  it("replaces the homepage's first section with the filled preset, from the page's own hero copy", () => {
    const spec = load("frizerstvo-lana");
    const hero = spec.pages[0]!.sections[0]!;
    const headline = (hero.props as { headline: string }).headline;
    const r = applyStructure(spec, "poster", { header: "stacked", tone: "band", actions: "float" });
    expect(r.ok).toBe(true);
    const first = r.spec.pages[0]!.sections[0]!;
    expect(first.type).toBe("composed");
    expect(first.id).toBe(hero.id);
    expect(JSON.stringify(first.props)).toContain(headline);
    expect(r.spec.design.skeleton?.header).toBe("stacked");
    expect(r.spec.design.skeleton?.actions).toBe("float");
    expect(r.spec.chrome.header.tone).toBe("band");
    expect(validateSite(r.spec).ok).toBe(true);
    expect(r.issues).toEqual([]); // the page rules (studio/page-rules.ts) hold after the repair
    expect(spec.pages[0]!.sections[0]!.type).not.toBe("composed"); // the input is not mutated
  });

  it("fills a photo-led structure from client photos only when the business has them", () => {
    const withPhotos = applyStructure(load("gostilna-zlata-zlica"), "mosaic", { header: "word", tone: "default", actions: "bar" });
    expect(withPhotos.ok).toBe(true);
    const ids = JSON.stringify(withPhotos.spec.pages[0]!.sections[0]!.props).match(/img_\w+/g) ?? [];
    const clientIds = new Set(withPhotos.spec.assets.images.filter((i) => (i.origin ?? "client") === "client").map((i) => i.id));
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(clientIds.has(id)).toBe(true);
  });

  it("reads a proof page's facts from the spec", () => {
    const p = proofPageOf("gostilna-zlata-zlica-gen", load("gostilna-zlata-zlica"), { business: "gostilna-zlata-zlica", trade: "gostilna" });
    expect(p.clientPhotos).toBe(8);
    expect(p.town).toBeTruthy();
  });
});
