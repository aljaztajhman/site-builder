import { describe, expect, it, vi } from "vitest";
import { ComposedProps, DRAWINGS, PRACTICAL_FACTS, validateSite } from "@sb/spec";
import { Registry, compositionAssets, type Asset, type AssetKind } from "../src/index.ts";
import { PRESET_FIXTURES, PRESET_SOURCE, WORDMARK_NAMES, pagesFor, presetsFromFixtures } from "../scripts/pages-v2.ts";
import { emptySheetHtml, sheetGroups, sheetHtml, type Shot } from "../scripts/sheet-html.ts";

const asset = (id: string, kind: AssetKind, more: Partial<Asset> = {}): Asset => ({
  id,
  kind,
  tags: { trades: [], stances: [], intents: [], mood: [], ground: [], density: [] },
  phone: "ok",
  bytes: 0,
  license: "own",
  status: "draft",
  ...more,
});

/** Per kind: assets with a render source today (the drawings, the preset motions, the sample facts). */
const CASES: [AssetKind, string[]][] = [
  ["motif", DRAWINGS.filter((id) => id.startsWith("motif/"))],
  ["ornament", DRAWINGS.filter((id) => id.startsWith("ornament/"))],
  ["motion", ["motion/reveal", "motion/unmask"]],
  ["icon", PRACTICAL_FACTS.map((f) => `icon/line/${f}`)],
  ["wordmark", ["wordmark/plain"]],
  ["divider", ["divider/rule", "divider/rope-line"]],
  ["texture", ["texture/stone", "texture/gouge"]],
];

const shotsOf = (a: Asset): Shot[] => pagesFor(a).map((p) => ({ asset: a.id, variant: p.variant, label: p.label, width: 360, file: `/out/x/${p.variant}.jpg`, problems: [] }));

describe("contact sheets of the composition-language kinds", () => {
  for (const [kind, ids] of CASES) {
    it(`${kind}: every registered asset gets valid pages and a row`, () => {
      const registry = new Registry().registerAll(ids.map((id) => asset(id, kind)));
      const assets = registry.byKind(kind);
      expect(assets.map((a) => a.id)).toEqual(ids);
      for (const a of assets) {
        const pages = pagesFor(a);
        expect(pages.length, a.id).toBeGreaterThan(0);
        for (const p of pages) {
          expect(p.asset).toBe(a.id);
          if (p.kind !== "site") continue;
          const v = validateSite(p.spec);
          expect(v.ok ? [] : v.issues.map((i) => `${i.path} ${i.message}`), `${a.id} ${p.variant}`).toEqual([]);
        }
      }
      const html = sheetHtml(kind, assets, assets.flatMap(shotsOf), "/out");
      for (const id of ids) expect(html).toContain(`<h2>${id}</h2>`);
    });

    it(`${kind}: an empty kind gives a sheet with a note`, () => {
      expect(sheetGroups(kind, [])).toEqual([]);
      const html = emptySheetHtml(kind);
      expect(html).toContain(`No ${kind} assets are registered yet`);
      expect(html).toContain("0 assets");
    });
  }

  it("motion pages carry the preset and put it on a section after the opener", () => {
    const pages = pagesFor(asset("motion/reveal", "motion"));
    expect(pages.every((p) => p.kind === "site" && p.motion === "reveal")).toBe(true);
    const spec = (pages[0] as { spec: { pages: { sections: { props: { motion?: string } }[] }[] } }).spec;
    const sections = spec.pages[0]!.sections;
    expect(sections[0]!.props.motion).toBeUndefined();
    expect(sections[1]!.props.motion).toBe("reveal");
  });

  it("wordmark: 20 names, each with č š ž somewhere across the list, the longest about 40 characters", () => {
    expect(new Set(WORDMARK_NAMES).size).toBe(20);
    expect(pagesFor(asset("wordmark/plain", "wordmark"))).toHaveLength(20);
    const all = WORDMARK_NAMES.join("");
    for (const ch of "čšž") expect(all).toContain(ch);
    expect(Math.max(...WORDMARK_NAMES.map((n) => n.length))).toBeGreaterThanOrEqual(35);
  });

  it("wordmark: a style that isn't in WORDMARK_STYLES warns and says so on every page; a known one is silent", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const known = pagesFor(asset("wordmark/plain", "wordmark"));
      expect(warn).not.toHaveBeenCalled();
      expect(known.some((p) => p.label.includes("NOT IN WORDMARK_STYLES"))).toBe(false);
      const unknown = pagesFor(asset("wordmark/chalk", "wordmark"));
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]![0])).toContain('style "chalk"');
      expect(unknown).toHaveLength(20);
      expect(unknown.every((p) => p.label.startsWith("NOT IN WORDMARK_STYLES"))).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });

  it("composition: takes a list of ComposedProps, one set of pages per preset; none yet gives a row with a note", () => {
    const a = asset("composition/story-a", "composition", { tags: { trades: [], stances: [], intents: ["story"], mood: [], ground: [], density: [] } });
    expect(pagesFor(a)).toEqual([]);
    expect(sheetHtml("composition", [a], [], "/out")).toContain("no render source yet");
    const props = ComposedProps.parse({
      intent: "story",
      width: "contained",
      rows: 1,
      elements: [{ id: "e_h", kind: "heading", text: "Kruh", level: 2, size: 4, desk: { col: 1, span: 6, row: 1 }, phone: { order: 0, span: "full" } }],
    });
    const before = PRESET_SOURCE.current;
    PRESET_SOURCE.current = () => [{ fixture: "pekarna-kvas", props }];
    try {
      const pages = pagesFor(a);
      expect(pages).toHaveLength(6);
      for (const p of pages) if (p.kind === "site") expect(validateSite(p.spec).ok).toBe(true);
    } finally {
      PRESET_SOURCE.current = before;
    }
  });

  it("composition: a registered preset's sheet is fillPreset from the three fixtures, each page a valid site", () => {
    expect(PRESET_SOURCE.current).toBe(presetsFromFixtures);
    for (const a of compositionAssets()) {
      const filled = presetsFromFixtures(a);
      expect(filled.map((f) => f.fixture), a.id).toEqual([...PRESET_FIXTURES]);
      const pages = pagesFor(a);
      expect(pages.length, a.id).toBe(filled.length * 6);
      for (const p of pages) if (p.kind === "site") expect(validateSite(p.spec).ok, `${a.id} ${p.variant}`).toBe(true);
    }
  });

  it("composition sheets are split by intent", () => {
    const mk = (id: string, intent?: "story" | "services") => asset(id, "composition", { tags: { trades: [], stances: [], intents: intent ? [intent] : [], mood: [], ground: [], density: [] } });
    const groups = sheetGroups("composition", [mk("composition/a", "story"), mk("composition/b", "services"), mk("composition/c", "story"), mk("composition/d")]);
    expect(groups.map((g) => [g.name, g.assets.map((x) => x.id)])).toEqual([
      ["services", ["composition/b"]],
      ["story", ["composition/a", "composition/c"]],
      ["untagged", ["composition/d"]],
    ]);
  });
});
