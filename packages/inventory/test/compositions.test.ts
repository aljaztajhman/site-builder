import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { STANCES, fillPreset, hasSlotMarker, parsePresetId, presetContext, presetSection, slotValue, validateComposition, validatePreset, walkStrings, type PresetSources } from "@sb/spec";
import { COMPOSITION_PRESETS, inventory, shortlist } from "../src/index.ts";

/**
 * Composition presets (studio-phase1-design.md §5, I3): every preset is well formed, registered as a draft, and, filled
 * by fillPreset from the three fixtures (pekarna-kvas, avtoservis-mrak, instalacije-rebernik), passes the composition
 * guards with 0 issues and 0 repairs and keeps no slot marker, or is cleanly not usable for that business (a slot in
 * its `needs` is empty: a photo hero for a client without photos); every preset fills from at least one fixture. The
 * fixtures (test/fixtures/preset-sources.json) are each golden's business, images and colours, its recorded brief
 * (tools/eval/recordings/<id>/001-brief.json) and the copy of its golden sections per intent; an intent the golden has
 * no section for gets a plain label of the intent as its headline (no facts, no lead), so a preset's heading shows.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
type Fixture = Omit<PresetSources, "copy"> & { copy: Record<string, PresetSources["copy"]> };
const FIXTURES = JSON.parse(readFileSync(path.join(here, "fixtures/preset-sources.json"), "utf8")) as Record<string, Fixture>;
const FIXTURE_IDS = ["pekarna-kvas", "avtoservis-mrak", "instalacije-rebernik"] as const;

/** A fixture's sources for a preset: the section copy of the preset's intent. */
function sourcesFor(fixture: string, intent: string): PresetSources {
  const { copy, ...rest } = FIXTURES[fixture]!;
  return { ...rest, ...(copy[intent] ? { copy: copy[intent] } : {}) };
}

describe("composition presets are registered", () => {
  it("as kind composition drafts with their intent, never in a shortlist until approved", () => {
    const reg = inventory();
    expect(COMPOSITION_PRESETS.length).toBeGreaterThanOrEqual(3);
    for (const p of COMPOSITION_PRESETS) {
      const a = reg.byId(p.id);
      expect(a, p.id).toBeDefined();
      expect(a).toMatchObject({ kind: "composition", status: "draft", bytes: 0, license: "own", phone: "ok" });
      expect(a!.tags.intents).toEqual([parsePresetId(p.id)!.intent]);
    }
    expect(reg.byKind("composition").map((a) => a.id)).toEqual(COMPOSITION_PRESETS.map((p) => p.id));
    expect(shortlist(reg, { trade: "bakery", limit: 500 }).some((a) => a.kind === "composition")).toBe(false);
  });
});

describe.each(COMPOSITION_PRESETS.map((p) => [p.id, p] as const))("%s", (_id, preset) => {
  it("is well formed (markers, fixed copy, needs, reflow) and fills from full sources", () => {
    expect(validatePreset(preset)).toEqual([]);
  });

  it.each(FIXTURE_IDS)("filled from %s: 0 guard issues, 0 repairs, no marker left (or a needed slot is empty)", (fixture) => {
    const intent = parsePresetId(preset.id)!.intent;
    const src = sourcesFor(fixture, intent);
    const r = fillPreset(preset, src);
    if (!r.ok) {
      // Not usable for this business only because a slot it needs has no value there; never a hole or a failed guard.
      expect(r.reason, [...r.missing, ...r.issues].join("; ")).toBe("needs");
      expect(r.missing.length).toBeGreaterThan(0);
      for (const n of r.missing) expect(slotValue(n, src), n).toBeUndefined();
      return;
    }
    expect(r.repairs).toEqual([]);
    const left: string[] = [];
    walkStrings(r.props, (s, p) => {
      if (hasSlotMarker(s)) left.push(`${p}: ${s}`);
    });
    expect(left).toEqual([]);
    expect(validateComposition(presetSection(preset, r.props), presetContext(src))).toEqual([]);
  });

  it("fills from at least one fixture, and its stance tags are real stances", () => {
    const intent = parsePresetId(preset.id)!.intent;
    expect(FIXTURE_IDS.some((f) => fillPreset(preset, sourcesFor(f, intent)).ok)).toBe(true);
    const stances = new Set(STANCES.map((s) => s.id));
    for (const s of preset.tags?.stances ?? []) expect(stances.has(s), s).toBe(true);
  });
});

describe("what the fixtures drop", () => {
  const fill = (id: string, fixture: string) => {
    const preset = COMPOSITION_PRESETS.find((p) => p.id === id)!;
    const r = fillPreset(preset, sourcesFor(fixture, parsePresetId(id)!.intent));
    if (!r.ok) throw new Error(r.reason);
    return r;
  };
  const place = (r: ReturnType<typeof fill>, id: string) => r.props.elements.find((e) => e.id === id)?.desk;

  it("instalacije-rebernik has no photos: the hero drops its photo and the headline takes the width", () => {
    const r = fill("composition/hero/split-photo", "instalacije-rebernik");
    expect(r.dropped).toEqual([{ id: "e_photo", kind: "image", missing: ["images[0]"] }]);
    expect(place(r, "e_title")).toMatchObject({ col: 1, span: 10 });
    expect(fill("composition/hero/split-photo", "pekarna-kvas").dropped).toEqual([]);
  });

  it("no lead for the services copy: the heading holds both rows beside the list", () => {
    const r = fill("composition/services/list-beside", "avtoservis-mrak");
    expect(r.dropped.map((d) => d.id)).toEqual(["e_t"]);
    expect(place(r, "e_h")).toMatchObject({ row: 1, rowSpan: 2 });
    const list = r.props.elements.find((e) => e.kind === "list");
    expect(list?.kind === "list" && list.items).toEqual(["Redni servis", "Menjava olja in filtrov", "Zavore", "Sklopke", "Zobati jermeni", "Izpušni sistemi"]);
  });

  it("no hours (instalacije-rebernik): the hours drop and the heading widens; no lead (pekarna-kvas): the contact lines move up", () => {
    const r = fill("composition/contact/details-hours", "instalacije-rebernik");
    expect(r.dropped).toEqual([{ id: "e_hours", kind: "hours", missing: ["business.hours"] }]);
    expect(place(r, "e_h")!.span).toBe(12);
    const p = fill("composition/contact/details-hours", "pekarna-kvas");
    expect(p.dropped.map((d) => d.id)).toEqual(["e_t"]);
    expect(place(p, "e_c")).toMatchObject({ row: 2, rowSpan: 2 });
  });
});
