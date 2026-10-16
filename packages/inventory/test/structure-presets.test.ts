import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { STRUCTURES, fillPreset, hasSlotMarker, presetContext, presetSection, readingOrder, slotValue, validateComposition, walkStrings, type ComposedProps, type PresetSources, type Structure } from "@sb/spec";
import { COMPOSITION_PRESETS, Registry, registeredAssets } from "../src/index.ts";

/**
 * Design 5 Wave P, unit P2 (docs/plans/phase-layout-variety.md; docs/plans/design-direction-2026-10.md §2): one hero
 * preset per first-screen structure, `composition/hero/<structure>-1`. Each is filled for a photo-rich business
 * (pekarna-kvas, three photos), a one-photo business (fizioterapija-pregib) and a no-photo one (instalacije-rebernik):
 * 0 guard issues and 0 repairs, or a clean `needs` failure, and the photo-led structures (band, magazine, mosaic, split)
 * are unusable without the client's own photos. On phones the headline, the call and one business fact come first.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
type Fixture = Omit<PresetSources, "copy"> & { copy: Record<string, PresetSources["copy"]> };
const FIXTURES = JSON.parse(readFileSync(path.join(here, "fixtures/preset-sources.json"), "utf8")) as Record<string, Fixture>;

const RICH = "pekarna-kvas";
const ONE = "fizioterapija-pregib";
const NONE = "instalacije-rebernik";

function heroSources(fixture: string): PresetSources {
  const { copy, ...rest } = FIXTURES[fixture]!;
  return { ...rest, ...(copy.hero ? { copy: copy.hero } : {}) };
}

const PHOTO_LED: ReadonlySet<Structure> = new Set(["band", "magazine", "mosaic", "split"]);
/** What each structure fills for: ok, or not usable (a needed slot is empty). */
const EXPECT: Record<Structure, Record<string, "ok" | "needs">> = {
  poster: { [RICH]: "ok", [ONE]: "ok", [NONE]: "ok" },
  band: { [RICH]: "ok", [ONE]: "ok", [NONE]: "needs" },
  magazine: { [RICH]: "ok", [ONE]: "ok", [NONE]: "needs" },
  strata: { [RICH]: "ok", [ONE]: "ok", [NONE]: "ok" },
  mosaic: { [RICH]: "ok", [ONE]: "needs", [NONE]: "needs" },
  field: { [RICH]: "ok", [ONE]: "ok", [NONE]: "ok" },
  ledger: { [RICH]: "ok", [ONE]: "ok", [NONE]: "ok" },
  split: { [RICH]: "ok", [ONE]: "ok", [NONE]: "needs" },
};

const presetOf = (s: Structure) => COMPOSITION_PRESETS.find((p) => p.id === `composition/hero/${s}-1`);

describe("the fixtures", () => {
  it("cover a photo-rich, a one-photo and a no-photo business, with hero copy", () => {
    const clientPhotos = (f: string) => (FIXTURES[f]!.images ?? []).filter((i) => (i.origin ?? "client") === "client").length;
    expect([clientPhotos(RICH), clientPhotos(ONE), clientPhotos(NONE)]).toEqual([3, 1, 0]);
    for (const f of [RICH, ONE, NONE]) expect(FIXTURES[f]!.copy.hero?.headline, f).toBeTruthy();
  });
});

describe("one hero preset per first-screen structure", () => {
  it("each structure has its <structure>-1 preset, tagged with it and registered as a draft", () => {
    const reg = new Registry().registerAll(registeredAssets());
    for (const s of STRUCTURES) {
      const p = presetOf(s);
      expect(p, s).toBeDefined();
      expect(p!.structure).toBe(s);
      expect(reg.byId(p!.id)).toMatchObject({ kind: "composition", status: "draft" });
    }
  });

  describe.each(STRUCTURES.map((s) => [s] as const))("%s-1", (s) => {
    const preset = presetOf(s)!;

    it("photo-led structures need the client's own photo; the others need none", () => {
      const needs = preset.needs ?? [];
      if (PHOTO_LED.has(s)) expect(needs).toContain("photos[0]");
      else expect(needs.some((n) => n.startsWith("photos[") || n.startsWith("images["))).toBe(false);
      expect(needs).toContain("copy.headline");
    });

    it.each([RICH, ONE, NONE])("filled for %s: 0 guard issues and 0 repairs, or a clean needs failure", (fixture) => {
      const src = heroSources(fixture);
      const r = fillPreset(preset, src);
      expect(r.ok ? "ok" : r.reason, r.ok ? "" : [...r.missing, ...r.issues].join("; ")).toBe(EXPECT[s][fixture]);
      if (!r.ok) {
        for (const n of r.missing) expect(slotValue(n, src), n).toBeUndefined();
        if (fixture === NONE) expect(r.missing.some((n) => n.startsWith("photos["))).toBe(true);
        return;
      }
      expect(r.repairs).toEqual([]);
      const left: string[] = [];
      walkStrings(r.props, (v, p) => {
        if (hasSlotMarker(v)) left.push(`${p}: ${v}`);
      });
      expect(left).toEqual([]);
      expect(validateComposition(presetSection(preset, r.props), presetContext(src))).toEqual([]);
    });

    it("on phones the headline, the call and a business fact come first (a leading photo aside)", () => {
      for (const fixture of [RICH, ONE, NONE]) {
        const r = fillPreset(preset, heroSources(fixture));
        if (!r.ok) continue;
        const shown = readingOrder(r.props.elements)
          .map((x) => x.e)
          .filter((e) => !e.phone.hidden);
        const words = (shown[0]?.kind === "image" ? shown.slice(1) : shown).slice(0, 3);
        expect(words.find((e) => e.kind === "heading"), fixture).toMatchObject({ level: 1 });
        expect(words.some((e) => e.kind === "action" && e.action === "call"), fixture).toBe(true);
        expect(words.some((e) => carriesBusinessFact(e)), fixture).toBe(true);
      }
    });
  });
});

/** Whether an element shows a business fact: its address, phone, e-mail or hours note, copied from the business. */
function carriesBusinessFact(e: ComposedProps["elements"][number]): boolean {
  const facts = Object.values(heroFactValues());
  let found = false;
  walkStrings(e, (v) => {
    if (facts.some((f) => f && v.includes(f))) found = true;
  });
  return found;
}

/** The fixtures' business facts as fillPreset writes them. */
function heroFactValues(): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const f of [RICH, ONE, NONE]) {
    const src = heroSources(f);
    for (const slot of ["business.street", "business.town", "business.phone", "business.email", "business.hours.note"]) {
      const v = slotValue(slot, src);
      out[`${f}:${slot}`] = typeof v === "string" ? v : undefined;
    }
  }
  return out;
}
