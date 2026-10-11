import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BusinessType, IMAGE_TREATMENTS, Imagery, MASKS, STANCES, contrast, mix, subtypeFits } from "@sb/spec";
import { STARTER_NAMES, VOCAB_DIR } from "@sb/render";
import { MASK_DRAFTS, TREATMENT_DRAFTS, addedNames, inventory, paletteOf, shippedColors } from "../src/index.ts";

/** The I4 imagery drafts (I4a masks, I4b treatments): registered as drafts, tagged with real trades and stances, and dim's contrast promise. */
const registry = inventory();
const added = { mask: addedNames(MASKS, STARTER_NAMES.masks), treatment: addedNames(IMAGE_TREATMENTS, STARTER_NAMES.treatments) };
const tables = { mask: MASK_DRAFTS, treatment: TREATMENT_DRAFTS };
const stanceIds = new Set(STANCES.map((s) => s.id));

describe.each(["mask", "treatment"] as const)("%s drafts", (kind) => {
  it("every name a batch added has a draft entry, and every entry is in the vocab list", () => {
    expect(Object.keys(tables[kind]).sort()).toEqual([...added[kind]].sort());
  });

  it("each is registered as a draft of its kind, with bytes of its own (its partial's rules)", () => {
    for (const n of added[kind]) {
      const a = registry.byId(`${kind}/${n}`);
      expect(a, n).toBeDefined();
      expect(a!.status, n).toBe("draft");
      expect(a!.license, n).toBe("own");
      expect(a!.bytes, n).toBeGreaterThan(0);
    }
  });

  it("tags only real trades and stance ids", () => {
    for (const [n, d] of Object.entries(tables[kind])) {
      for (const s of d.stances) expect(stanceIds.has(s), `${n}: stance ${s}`).toBe(true);
      for (const t of d.trades) {
        const [type, sub] = t.split("/");
        expect(BusinessType.safeParse(type).success, `${n}: trade ${t}`).toBe(true);
        if (sub) expect(subtypeFits(type as BusinessType, sub), `${n}: trade ${t}`).toBe(true);
      }
      expect(d.mood.length, n).toBeGreaterThan(0);
    }
  });
});

it("no added treatment reuses a site imagery name (the asset would merge with design.imagery's)", () => {
  for (const n of added.treatment) expect((Imagery.options as readonly string[]).includes(n), n).toBe(false);
});

describe("dim: onInverse text holds 4.5:1 on any part of the photo, in every palette", () => {
  const css = readFileSync(`${VOCAB_DIR}/treatments/dim.css`, "utf8");
  const brightness = Number(/brightness\(([\d.]+)\)/.exec(css)![1]);
  const veil = Number(/opacity:\s*([\d.]+)/.exec(css)![1]);
  // brightness(b) caps each channel at b, saturate(<1) keeps channels within their range: the lightest pixel is grey b.
  const grey = `#${Math.round(255 * brightness)
    .toString(16)
    .padStart(2, "0")
    .repeat(3)}`;

  it("reads its numbers from the partial", () => {
    expect(brightness).toBeGreaterThan(0);
    expect(brightness).toBeLessThan(1);
    expect(veil).toBeGreaterThan(0);
    expect(/saturate\(0?\.\d+\)/.test(css)).toBe(true);
  });

  it.each(registry.byKind("palette").map((a) => [a.id] as const))("%s", (id) => {
    const p = paletteOf(id)!;
    // A curated palette (main's drafts) belongs to no direction: it renders as stored.
    for (const colors of p.direction ? [p.colors, shippedColors(p.colors, p.direction)] : [p.colors]) {
      // The veil (inverse at `veil`) over the lightest pixel: per channel a convex mix, so every other pixel is darker.
      const lightest = mix(colors.inverse, grey, veil);
      expect(contrast(colors.onInverse, lightest), `${colors.onInverse} on ${lightest}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
