import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Registry, assetSlug, inventory, inventoryJson, shortlist, tradeScore, writeInventoryJson, type Asset } from "../src/index.ts";

const base = (id: string, kind: Asset["kind"], more: Partial<Asset> = {}): Asset => ({
  id,
  kind,
  tags: { trades: [], stances: [], intents: [], mood: [], ground: [], density: [], ...more.tags },
  phone: "ok",
  bytes: 0,
  license: "own",
  status: "approved",
  ...more,
});

describe("registry", () => {
  it("validates records: id prefix per kind, tag shapes, duplicates", () => {
    const r = new Registry();
    r.register(base("font/a", "font"));
    expect(() => r.register(base("font/a", "font"))).toThrow(/Duplicate/);
    expect(() => r.register(base("palette/x", "font"))).toThrow(/prefix/);
    expect(() => r.register(base("Font/X", "font"))).toThrow(/Invalid/);
    expect(() => r.register({ ...base("fact/x", "factObject"), status: "maybe" } as unknown as Asset)).toThrow(/Invalid/);
    expect(r.register(base("fact/seal", "factObject")).id).toBe("fact/seal");
    expect(r.register(base("section/hero-split:image-left", "section")).id).toBe("section/hero-split:image-left");
  });

  it("byId, byKind and query by tags", () => {
    const r = new Registry().registerAll([
      base("motif/pipes", "motif", { tags: { trades: ["builder", "builder/plumbing"], stances: [], intents: [], mood: [], ground: ["white"], density: [] } }),
      base("motif/crust", "motif", { tags: { trades: ["bakery"], stances: [], intents: [], mood: [], ground: ["white"], density: [] } }),
      base("palette/night", "palette", { tags: { trades: [], stances: ["docket"], intents: [], mood: ["cool"], ground: ["dark"], density: [] } }),
      base("palette/rejected", "palette", { status: "rejected" }),
    ]);
    expect(r.byId("motif/crust")!.kind).toBe("motif");
    expect(r.byKind("palette").map((a) => a.id)).toEqual(["palette/night", "palette/rejected"]);
    // An asset without trades fits any trade.
    expect(r.query({ trades: ["builder/plumbing"] }).map((a) => a.id)).toEqual(["motif/pipes", "palette/night", "palette/rejected"]);
    expect(r.query({ trades: ["builder/electrical"], kind: "motif" })).toEqual([]);
    expect(r.query({ ground: ["dark"], stances: ["docket"] }).map((a) => a.id)).toEqual(["palette/night"]);
    expect(r.query({ kind: "palette", status: "approved" }).map((a) => a.id)).toEqual(["palette/night"]);
    expect(r.counts()).toEqual({ motif: 2, palette: 2 });
  });

  it("trade fit: exact trade, the type, any trade, another trade of the type", () => {
    expect(tradeScore(["builder/electrical"], "builder/electrical")).toBe(3);
    expect(tradeScore(["builder"], "builder/electrical")).toBe(2);
    expect(tradeScore([], "builder/electrical")).toBe(1);
    expect(tradeScore(["builder", "builder/plumbing"], "builder/electrical")).toBe(0);
    expect(tradeScore(["builder", "builder/plumbing"], "builder")).toBe(3);
    expect(tradeScore(["bakery"], "builder")).toBe(0);
  });
});

describe("shortlist", () => {
  const r = inventory();

  it("is deterministic, at most `limit`, approved and pickable only, every id once", () => {
    const a = shortlist(r, { trade: "builder/electrical" });
    const b = shortlist(r, { trade: "builder/electrical" });
    expect(a.map((x) => x.id)).toEqual(b.map((x) => x.id));
    expect(a).toHaveLength(40);
    expect(new Set(a.map((x) => x.id)).size).toBe(40);
    expect(a.every((x) => x.status === "approved" && x.pickable !== false)).toBe(true);
    expect(shortlist(r, { trade: "bakery", limit: 7 })).toHaveLength(7);
  });

  it("keeps a trade's own motif and leaves out motifs of other trades", () => {
    const ids = shortlist(r, { trade: "builder/electrical", kinds: ["motif", "submotif"] }).map((a) => a.id);
    expect(ids).toEqual(["submotif/wire"]);
    expect(shortlist(r, { trade: "builder/plumbing", kinds: ["motif", "submotif"] }).map((a) => a.id)).toEqual(["motif/pipes"]);
    expect(shortlist(r, { trade: "car-repair", kinds: ["motif"] }).map((a) => a.id)).toEqual(["motif/plate"]);
  });

  it("ranks trade fit first, and neighbours' assets after every fresh one", () => {
    const fonts = shortlist(r, { trade: "car-repair", kinds: ["font"], limit: 50 }).map((a) => a.id);
    const carFonts = r.byKind("font").filter((a) => a.tags.trades.includes("car-repair")).map((a) => a.id);
    expect(fonts.slice(0, carFonts.length).sort()).toEqual(carFonts.sort());
    const top = fonts[0]!;
    const again = shortlist(r, { trade: "car-repair", kinds: ["font"], limit: 50, exclude: [top] }).map((a) => a.id);
    expect(again.at(-1)).toBe(top);
    expect(again).toHaveLength(fonts.length);
  });

  it("filters section presets by the intents asked for and favours the ground", () => {
    const s = shortlist(r, { trade: "restaurant", intents: ["menu", "hours"], kinds: ["section"], limit: 50 });
    expect(s.length).toBeGreaterThan(0);
    expect(s.every((a) => a.tags.intents.some((i) => i === "menu" || i === "hours"))).toBe(true);
    const dark = shortlist(r, { trade: "restaurant", ground: "dark", kinds: ["palette"], limit: 3 }).map((a) => a.id);
    expect(dark[0]).toBe("palette/dark-elegant");
  });

  it("a stance tag outranks trade fit, and the list mixes kinds", () => {
    const reg = new Registry().registerAll([
      ...r.all().filter((a) => a.kind === "palette"),
      base("palette/docket-blue", "palette", { tags: { trades: [], stances: ["workshop-docket"], intents: [], mood: [], ground: ["white"], density: [] } }),
    ]);
    expect(shortlist(reg, { trade: "car-repair", stance: "workshop-docket", limit: 1 })[0]!.id).toBe("palette/docket-blue");
    const kinds = new Set(shortlist(r, { trade: "dental" }).map((a) => a.kind));
    expect(kinds.size).toBeGreaterThanOrEqual(8);
  });
});

describe("inventory.json", () => {
  it("lists id, kind, tags, status and thumbnail for every asset", () => {
    const r = inventory();
    const json = inventoryJson(r, (id) => (id.startsWith("font/") ? `font/${assetSlug(id)}-1280.jpg` : null));
    expect(json.assets).toHaveLength(r.size);
    expect(json.counts.section).toBe(r.byKind("section").length);
    expect(json.assets[0]).toEqual({ id: "font/inter-tight", kind: "font", tags: r.byId("font/inter-tight")!.tags, status: "approved", thumbnail: "font/font--inter-tight-1280.jpg" });
    expect(assetSlug("section/hero-split:image-left")).toBe("section--hero-split--image-left");
    const dir = mkdtempSync(path.join(tmpdir(), "inv-"));
    try {
      const file = path.join(dir, "inventory.json");
      writeInventoryJson(file, r, () => null);
      expect(JSON.parse(readFileSync(file, "utf8")).assets).toHaveLength(r.size);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
