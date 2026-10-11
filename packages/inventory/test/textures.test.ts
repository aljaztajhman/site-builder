import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BusinessType, STANCES, SUBTYPES, TEXTURES, TEXTURE_META, contrast, direction, mix, repairComposition, validateComposition, type Colors, type ComposedSection } from "@sb/spec";
import { STARTER_NAMES, VOCAB_DIR, vocabFamilySheets } from "@sb/render";
import { PATTERN_TILES, TEXTURE_TAGS, applyDecisions, detectPattern, inventory, paletteOf, registeredAssets, shippedColors, textureNames, texturePartial } from "../src/index.ts";
import { SHEET_PALETTES } from "../scripts/pages.ts";

/**
 * Section textures (docs/plans/studio-phase1-design.md §5 I4c): each TEXTURES name beyond the starters is one CSS
 * partial painted in the section's text colour through one SVG data-URI tile, registered as a draft, free of dot and
 * grid patterns, and quiet enough that text on it keeps its contrast where the texture is darkest (its max alpha).
 */
const names = textureNames();
const registry = inventory();

/**
 * The grounds a section can have and the colour a texture paints on each (the section's currentColor: text on paper
 * and alt, onInverse on inverse, onBand on band), with the text roles held at 4.5:1 on that ground (spec CONTRAST_RULES).
 */
const GROUNDS: { ground: keyof Colors; ink: keyof Colors; text: (keyof Colors)[] }[] = [
  { ground: "background", ink: "text", text: ["text", "muted"] },
  { ground: "surface", ink: "text", text: ["text", "muted"] },
  { ground: "inverse", ink: "onInverse", text: ["onInverse"] },
  { ground: "band", ink: "onBand", text: ["onBand"] },
];

/** Text roles under 4.5:1 on each ground with the texture at its max alpha (the ground mixed toward the ink). */
function misses(c: Colors, alpha: number): string[] {
  const out: string[] = [];
  for (const g of GROUNDS) {
    const ground = c[g.ground];
    const ink = c[g.ink];
    if (!ground || !ink) continue;
    const under = mix(ink, ground, alpha);
    for (const fg of g.text) {
      const ratio = contrast(c[fg]!, under);
      if (ratio < 4.5) out.push(`${fg} on ${g.ground} ${ratio.toFixed(2)}`);
    }
  }
  return out;
}

describe("textures: names, partials, assets", () => {
  it("every TEXTURES name beyond the starters has a partial, tags and a draft asset; nothing else is registered as a texture", () => {
    expect(names.length).toBe(TEXTURES.length - STARTER_NAMES.textures.length);
    for (const n of names) {
      expect(texturePartial(n), n).toBeDefined();
      expect(TEXTURE_TAGS[n], n).toBeDefined();
      expect(registry.byId(`texture/${n}`)?.status, n).toBe("draft");
    }
    expect(registry.byKind("texture").map((a) => a.id).sort()).toEqual(names.map((n) => `texture/${n}`).sort());
    expect(Object.keys(TEXTURE_TAGS).sort()).toEqual([...names].sort());
  });

  it("tags name real stances and trades", () => {
    const stances = new Set(STANCES.map((s) => s.id));
    const trades = new Set<string>([...BusinessType.options, ...Object.entries(SUBTYPES).flatMap(([t, subs]) => subs.map((s) => `${t}/${s}`))]);
    for (const n of names) {
      for (const s of TEXTURE_TAGS[n]!.stances) expect(stances.has(s), `${n}: stance ${s}`).toBe(true);
      for (const t of TEXTURE_TAGS[n]!.trades) expect(trades.has(t), `${n}: trade ${t}`).toBe(true);
    }
  });

  it.each(names)("%s: one rule on its own class, painted in currentColor through one SVG tile, no gradient, low alpha", (n) => {
    const p = texturePartial(n)!;
    const rules = p.css.replace(/\/\*[\s\S]*?\*\//g, "").match(/[^{}]+\{/g)!.map((s) => s.replace("{", "").trim());
    expect(rules).toEqual([`.cx-tex-${n}::before`]);
    const outsideTile = p.css.replace(p.tile, "");
    expect(outsideTile).toMatch(/background:\s*currentColor;/);
    expect(outsideTile).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|gradient|blur|filter:/i);
    expect(outsideTile.match(/url\(/g)).toHaveLength(1);
    expect(p.tile).not.toMatch(/gradient|feGaussianBlur|<image|href=/i);
    expect(p.maxAlpha).toBeGreaterThan(0);
    expect(p.maxAlpha).toBeLessThanOrEqual(0.12);
  });

  it.each(names)("%s: the tile checked is the tile shipped, and it passes the dot/grid detector", (n) => {
    const p = texturePartial(n)!;
    expect(PATTERN_TILES[`texture/${n}`]?.tile).toBe(p.tile);
    expect(detectPattern(p.tile)).toEqual({ ok: true });
  });

  it("the textures family sheet holds every partial", () => {
    const sheet = vocabFamilySheets().textures;
    expect(sheet.names).toEqual([...names].sort());
    for (const n of names) expect(sheet.css).toContain(`.cx-tex-${n}::before{`);
  });
});

describe("textures: text keeps its contrast at the texture's max alpha", () => {
  it.each(names)("%s: in the two sheet palettes, on paper, alt, inverse and band", (n) => {
    const alpha = texturePartial(n)!.maxAlpha;
    for (const id of SHEET_PALETTES) {
      const d = direction(id);
      expect(misses(shippedColors(d.palette.fallback, d), alpha), id).toEqual([]);
    }
  });

  /**
   * The invariant (spec G27, composition/blend-meta.ts): in every registered palette, on every ground, with every texture,
   * either each text role keeps its threshold against the ground blended with the texture's ink at its max alpha, or the
   * guard rejects the combination and the repair drops the texture. A section is built per ground with every text role the
   * ground carries (muted too on paper and alt); the thresholds are the guards' (4.5 for these body-size texts).
   */
  const TONES = [
    { tone: "default", ground: "background", ink: "text", roles: ["text", "muted"] },
    { tone: "alt", ground: "surface", ink: "text", roles: ["text", "muted"] },
    { tone: "inverse", ground: "inverse", ink: "onInverse", roles: ["onInverse"] },
    { tone: "band", ground: "band", ink: "onBand", roles: ["onBand"] },
  ] as const;

  const textAt = (id: string, row: number, color?: string) => ({
    id,
    kind: "text",
    paragraphs: ["Kruh pečemo ob štirih zjutraj."],
    ...(color ? { color } : {}),
    desk: { col: 1, span: 6, row },
    phone: { order: row - 1, span: "full" },
  });
  const sectionFor = (tone: string, roles: readonly string[], texture: string): ComposedSection =>
    ({
      id: "s_t",
      type: "composed",
      variant: "free",
      tone,
      props: { intent: "story", width: "wide", rows: roles.length, elements: roles.map((r, i) => textAt(`e_${i}`, i + 1, r)), surface: { texture } },
    }) as unknown as ComposedSection;
  const colorsOf = (id: string): Colors => {
    const p = paletteOf(id)!;
    // A curated palette (main's drafts) belongs to no direction: it renders as stored.
    return p.direction ? shippedColors(p.colors, p.direction) : p.colors;
  };
  const textureIssues = (s: ComposedSection, colors: Colors) => validateComposition(s, { colors }).filter((i) => i.path === "/props/surface/texture");

  it.each(names)("%s: in every registered palette and on every ground, the blended contrast holds or the guard rejects and the repair drops the texture", (n) => {
    const alpha = texturePartial(n)!.maxAlpha;
    for (const a of registry.byKind("palette")) {
      const colors = colorsOf(a.id);
      for (const t of TONES) {
        const ground = t.ground === "band" ? (colors.band ?? colors.primary) : colors[t.ground];
        const ink = t.ink === "onBand" ? (colors.onBand ?? colors.onPrimary) : colors[t.ink];
        const under = mix(ink, ground, alpha);
        const fg = (r: string) => (r === "onBand" ? (colors.onBand ?? colors.onPrimary) : colors[r as keyof Colors]!);
        const holds = t.roles.every((r) => contrast(fg(r), under) >= 4.5);
        const s = sectionFor(t.tone, t.roles, n);
        const flagged = textureIssues(s, colors);
        const where = `${a.id} ${t.tone}`;
        if (holds) expect(flagged, where).toEqual([]);
        else {
          expect(flagged.length, where).toBeGreaterThan(0);
          const r = repairComposition(s, { colors });
          expect(r.repairs.some((l) => l.startsWith("/props/surface/texture: ")), where).toBe(true);
          expect((r.section.props.surface as { texture?: string } | undefined)?.texture, where).toBeUndefined();
          expect(textureIssues(r.section, colors), where).toEqual([]);
        }
      }
    }
  });
});

describe("textures: the guard is exercised by the curated palettes", () => {
  it("rejects a texture on a band in the palettes that sit just over 4.5:1 (measured 11 Oct 2026), and on muted text in others", () => {
    const rejected = new Set<string>();
    for (const a of registry.byKind("palette")) {
      const p = paletteOf(a.id)!;
      const colors = p.direction ? shippedColors(p.colors, p.direction) : p.colors;
      for (const n of names) {
        for (const [tone, role] of [["band", "onBand"], ["default", "muted"]] as const) {
          const s = {
            id: "s_t",
            type: "composed",
            variant: "free",
            tone,
            props: { intent: "story", width: "wide", rows: 1, elements: [{ id: "e_0", kind: "text", paragraphs: ["Kruh."], color: role, desk: { col: 1, span: 6, row: 1 }, phone: { order: 0, span: "full" } }], surface: { texture: n } },
          } as unknown as ComposedSection;
          if (validateComposition(s, { colors }).some((i) => i.path === "/props/surface/texture")) rejected.add(`${a.id} ${tone}`);
        }
      }
    }
    for (const id of ["palette/cevi-hot-cold", "palette/etiketa-terracotta", "palette/nasmeh-teal", "palette/tablica-blue"]) expect(rejected.has(`${id} band`), id).toBe(true);
    expect([...rejected].some((r) => r.endsWith(" default"))).toBe(true);
  });
});

describe("textures: the meta table the guard reads is the CSS", () => {
  it("TEXTURE_META names every texture with the alpha its partial (or the core sheet, for the starters) paints", () => {
    const core = readFileSync(path.join(VOCAB_DIR, "..", "composed.css"), "utf8");
    const starter = Number(/\.cx-tex-grain::before,\s*\.cx-tex-lines::before \{[^}]*?opacity:\s*([\d.]+)/.exec(core)![1]);
    expect(TEXTURE_META.none.maxAlpha).toBe(0);
    expect(TEXTURE_META.grain.maxAlpha).toBe(starter);
    expect(TEXTURE_META.lines.maxAlpha).toBe(starter);
    for (const n of names) expect(TEXTURE_META[n as keyof typeof TEXTURE_META].maxAlpha, n).toBe(texturePartial(n)!.maxAlpha);
  });

  it("a decision approving a texture gives the asset id the designer catalogue reads (`texture/<name>`)", () => {
    const approved = applyDecisions(registeredAssets(), { "texture/stone": { status: "approved", at: "2026-10-11T00:00:00.000Z" } })
      .filter((a) => a.status === "approved" && a.kind === "texture")
      .map((a) => a.id);
    expect(approved).toEqual(["texture/stone"]);
  });
});
