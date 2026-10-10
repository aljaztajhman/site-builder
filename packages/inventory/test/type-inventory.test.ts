import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { BusinessType, FONTS, FONT_PAIRS, GOOGLE_FONTS_COMMIT, INVENTORY_FONTS, INVENTORY_FONT_PAIRS, allFontFaces, inventoryFontFaces } from "@sb/spec";
import { FONT_TAGS, PAIRING_TAGS, STANCE_FAMILIES, VOICES, fontFile, fontLicenseFile, inventory, shortlist } from "../src/index.ts";

/**
 * The type inventory (design studio I1): the new families and pairings are drafts in the registry, kept out of what
 * sites ship today (FONTS, FONT_PAIRS, the shared bundle), built from google/fonts at a pinned commit, and tagged.
 * The per-asset checks (licence, bytes, Slovene letters) run for them in assets.test.ts.
 */
interface FkFont {
  variationAxes: Record<string, { min: number; max: number; default: number }>;
}
const fontkit = createRequire(import.meta.url)("fontkit") as { create(buf: Buffer): FkFont };
const registry = inventory();

describe("type inventory families", () => {
  const faces = inventoryFontFaces();

  it("are new files, not in FONTS: allFontFaces and the shared bundle are unchanged", () => {
    const shipped = new Set(allFontFaces().map((f) => f.file));
    expect(faces.filter((f) => shipped.has(f.file)).map((f) => f.file)).toEqual([]);
    expect(new Set(faces.map((f) => f.file)).size).toBe(faces.length);
    expect(new Set([...Object.values(FONTS), ...faces].map((f) => f.family)).size).toBe(Object.keys(FONTS).length + faces.length);
  });

  it("leave out the banned safe faces (Inter family, Space Grotesk)", () => {
    expect(faces.filter((f) => /^(Inter|Space Grotesk)\b/.test(f.family)).map((f) => f.family)).toEqual([]);
  });

  it("every family is a tagged draft font asset", () => {
    expect(Object.keys(FONT_TAGS).sort()).toEqual(Object.keys(INVENTORY_FONTS).sort());
    for (const f of faces) {
      const a = registry.byId(`font/${f.file}`);
      expect(a, f.file).toBeDefined();
      expect(a!.status).toBe("draft");
      expect(a!.tags.mood).toContain(f.role);
      expect(a!.tags.stances.length, f.file).toBeGreaterThan(0);
      expect(a!.tags.stances.every((s) => (STANCE_FAMILIES as readonly string[]).includes(s))).toBe(true);
    }
  });

  for (const f of faces) {
    it(`${f.family}: holds exactly its declared weights; licence names its google/fonts source`, () => {
      const wght = fontkit.create(readFileSync(fontFile(f.file))).variationAxes.wght;
      if (f.weights[0] === f.weights[1]) expect(wght).toBeUndefined();
      else expect([wght?.min, wght?.max]).toEqual(f.weights);
      expect(readFileSync(fontLicenseFile(f.file), "utf8").split("\n")[0]).toBe(
        `${f.family}: https://github.com/google/fonts/blob/${GOOGLE_FONTS_COMMIT}/ofl/${f.source}`,
      );
    });
  }
});

describe("type inventory pairings", () => {
  const ids = INVENTORY_FONT_PAIRS.map((p) => p.id);

  it("are new: unique ids, none of today's pairs, today's pairs unchanged in number", () => {
    expect(new Set(ids).size).toBe(ids.length);
    const today = new Set(FONT_PAIRS.map((p) => p.id));
    expect(ids.filter((id) => today.has(id))).toEqual([]);
    const combos = new Set(FONT_PAIRS.map((p) => `${p.heading.file}/${p.body.file}`));
    expect(INVENTORY_FONT_PAIRS.filter((p) => !p.utility && combos.has(`${p.heading.file}/${p.body.file}`)).map((p) => p.id)).toEqual([]);
    expect(FONT_PAIRS).toHaveLength(20);
  });

  it("each uses at least one new family and no banned face", () => {
    const fresh = new Set(inventoryFontFaces().map((f) => f.file));
    for (const p of INVENTORY_FONT_PAIRS) {
      const faces = [p.heading, p.body, ...(p.utility ? [p.utility] : [])];
      expect(faces.some((f) => fresh.has(f.file)), p.id).toBe(true);
      expect(faces.some((f) => f.file === "inter" || f.file === "inter-tight" || f.file === "space-grotesk"), p.id).toBe(false);
    }
  });

  it("a utility face is a mono for figures", () => {
    for (const p of INVENTORY_FONT_PAIRS.filter((x) => x.utility)) expect(p.utility!.fallback, p.id).toBe("monospace");
  });

  it("every pairing has tags (stance families, voice, trades) and is a draft asset with them", () => {
    expect(Object.keys(PAIRING_TAGS).sort()).toEqual([...ids].sort());
    for (const p of INVENTORY_FONT_PAIRS) {
      const t = PAIRING_TAGS[p.id]!;
      expect(t.stances.length, p.id).toBeGreaterThan(0);
      expect(t.voice.length, p.id).toBeGreaterThan(0);
      expect(t.stances.every((s) => (STANCE_FAMILIES as readonly string[]).includes(s)), p.id).toBe(true);
      expect(t.voice.every((v) => (VOICES as readonly string[]).includes(v)), p.id).toBe(true);
      expect(t.trades.every((x) => BusinessType.safeParse(x).success), p.id).toBe(true);
      const a = registry.byId(`pairing/${p.id}`)!;
      expect(a.status).toBe("draft");
      expect(a.tags.stances).toEqual([...t.stances].sort());
      expect(a.tags.trades).toEqual([...t.trades].sort());
      for (const v of t.voice) expect(a.tags.mood).toContain(v);
    }
  });

  it("drafts never reach a shortlist until the owner approves them", () => {
    const s = shortlist(registry, { trade: "bakery", kinds: ["font", "pairing"], limit: 500 });
    expect(s.length).toBeGreaterThan(0);
    expect(s.filter((a) => a.status !== "approved").map((a) => a.id)).toEqual([]);
  });
});
