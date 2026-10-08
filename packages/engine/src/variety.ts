/**
 * The variety engine (docs/plans/variety-engine.md, Steps 1–2), behind config `variety.families`:
 * - a site seed from the site id picks among equally good options, so the same site always renders the same;
 * - a trade template is a family (palettes, font pairs, heroes) instead of one page, and the logo's colours go into
 *   its colour roles, the family's palettes being the fallback;
 * - no two sites of one trade (the same town first) share direction, palette family, font pair and hero
 *   (awayFromNeighbours; the landing showcases stay avoided too);
 * - "Ustvari znova" moves the seed and avoids the look it replaces.
 * No model call; contrast is enforced in code afterwards (enforceDesign).
 */
import { DIRECTIONS, acceptedFontPairs, deltaE, familyOf, hexToHsl, hslToHex, type Colors, type Design, type Direction, type SiteSpec } from "@sb/spec";
import type { Swatch } from "./palette.ts";

/** FNV-1a, 32 bit: a stable number from a string. */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** The site's seed: its id, plus what a regeneration moves it by (the look it replaces). */
export function siteSeed(siteId: string, moveBy = ""): number {
  return hash32(moveBy ? `${siteId}#${moveBy}` : siteId);
}

/** `options` in an order fixed by the seed and a salt (each choice gets its own salt so they vary independently). */
export function seededOrder<T>(options: readonly T[], seed: number, salt: string): T[] {
  return options
    .map((o, i) => ({ o, k: hash32(`${seed}:${salt}:${i}`) }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.o);
}

/** What makes two sites read as one template (the neighbour check and the eval's collision count). */
export interface LookKey {
  direction: string;
  primary: string;
  band: string;
  fontPair: string;
  /** The homepage's first section, "type:variant". */
  hero: string;
}

/** A look from a design and its homepage's first section (null: none). */
export function keyOf(design: Design, hero: { type: string; variant: string } | null): LookKey {
  const c = design.colors;
  return { direction: design.direction, primary: c.primary, band: c.band ?? c.primary, fontPair: design.fontPair, hero: hero ? `${hero.type}:${hero.variant}` : "none" };
}

export function lookKey(spec: Pick<SiteSpec, "design" | "pages">): LookKey {
  const home = spec.pages.find((p) => p.kind === "home") ?? spec.pages[0];
  return keyOf(spec.design, home?.sections[0] ?? null);
}

/** ΔE under which two primaries (and two bands) are one palette family. */
export const SAME_PALETTE_DELTA_E = 10;

export function sameLook(a: LookKey, b: LookKey): boolean {
  return (
    a.direction === b.direction &&
    a.fontPair === b.fontPair &&
    a.hero === b.hero &&
    deltaE(a.primary, b.primary) < SAME_PALETTE_DELTA_E &&
    deltaE(a.band, b.band) < SAME_PALETTE_DELTA_E
  );
}

/** A logo colour usable in a colour role: saturated enough, neither near-white nor near-black. */
function usable(hex: string): boolean {
  const { s, l } = hexToHsl(hex);
  return s >= 0.25 && l >= 0.15 && l <= 0.8;
}

/**
 * The logo's colours in the template's roles (Step 1): the strongest usable logo colour becomes primary (and the band
 * where the template's band is its primary), a second clearly different one the accent (and the band where the
 * template has its own band colour). Null when the logo gives nothing usable: the family palette stays.
 */
export function brandColours(base: Colors, logo: Swatch[]): Colors | null {
  const colours = logo.filter((s) => s.source === "logo").map((s) => s.hex).filter(usable);
  const first = colours[0];
  if (!first) return null;
  const second = colours.find((h) => deltaE(h, first) > 25);
  const ownBand = base.band !== undefined && base.band !== base.primary;
  const out: Colors = { ...base, primary: first, accent: second ?? first };
  if (base.band !== undefined) out.band = ownBand ? (second ?? base.band) : first;
  return out;
}

export interface FamilyPick {
  paletteId: string;
  colors: Colors;
  fontPair: string;
  hero: string;
  /** "brand": the logo's colours in the roles; "seed": the family palette the seed chose. */
  colourSource: "brand" | "seed";
}

/**
 * The template family's look for one site: brand colours when the logo gives them, else a palette; a font pair and a
 * hero; in the seed's order, the first combination no neighbour has. `pictures`: whether the site has any picture
 * (heroes that need one are left out otherwise). Undefined when the direction is not a template.
 */
export function pickFromFamily(
  dir: Direction,
  o: { seed: number; logo: Swatch[]; pictures: boolean; neighbours: LookKey[] },
): FamilyPick | undefined {
  const family = familyOf(dir);
  if (!family) return undefined;
  const brand = brandColours(family.palettes[0]!.colors, o.logo);
  const palettes = brand ? [{ id: "brand", colors: brand }, ...seededOrder(family.palettes, o.seed, "palette")] : seededOrder(family.palettes, o.seed, "palette");
  const fonts = seededOrder(family.fontPairs, o.seed, "font");
  const needsPicture = (h: string) => h.startsWith("hero-split:") || h.startsWith("hero-image:");
  const heroes = seededOrder(family.heroes.filter((h) => o.pictures || !needsPicture(h)), o.seed, "hero");
  let first: FamilyPick | undefined;
  for (const p of palettes) {
    for (const fontPair of fonts) {
      for (const hero of heroes) {
        const pick: FamilyPick = { paletteId: p.id, colors: p.colors, fontPair, hero, colourSource: p.id === "brand" ? "brand" : "seed" };
        first ??= pick;
        const key: LookKey = { direction: dir.id, primary: p.colors.primary, band: p.colors.band ?? p.colors.primary, fontPair, hero };
        if (!o.neighbours.some((n) => sameLook(n, key))) return pick;
      }
    }
  }
  // Every combination is taken (more neighbours than the family has looks): the seed's first.
  return first;
}

/** Turned around the hue wheel by `deg`. */
const turn = (hex: string, deg: number): string => {
  const hsl = hexToHsl(hex);
  return hslToHex({ ...hsl, h: (hsl.h + deg + 360) % 360 });
};

/**
 * A design no neighbour shares (Step 2, replaces awayFromShowcases as the general rule; showcases stay avoided):
 * another of the direction's accepted font pairs first, then the brand colours turned around the hue wheel. The
 * caller enforces contrast afterwards, or passes `finish` (contrast enforcement) to have each candidate checked as it
 * will render, so enforcement cannot move it back onto a neighbour. Returns the design unchanged when it collides with
 * nobody.
 */
export function awayFromNeighbours(design: Design, dir: Direction, hero: string, neighbours: LookKey[], seed: number, finish: (d: Design) => Design = (d) => d): Design {
  const key = (d: Design): LookKey => ({ direction: d.direction, primary: d.colors.primary, band: d.colors.band ?? d.colors.primary, fontPair: d.fontPair, hero });
  if (!neighbours.some((n) => sameLook(n, key(design)))) return design;
  for (const fontPair of seededOrder(acceptedFontPairs(dir), seed, "away-font")) {
    const d = finish({ ...design, fontPair });
    if (!neighbours.some((n) => sameLook(n, key(d)))) return d;
  }
  for (let step = 1; step <= 8; step++) {
    const c = { ...design.colors, primary: turn(design.colors.primary, 40 * step), accent: turn(design.colors.accent, 40 * step) };
    if (design.colors.band !== undefined) c.band = turn(design.colors.band, 40 * step);
    const d = finish({ ...design, colors: c });
    if (!neighbours.some((n) => sameLook(n, key(d)))) return d;
  }
  return design;
}

/**
 * Two non-template directions that fit the business type, chosen by the seed: offered to the design step beside the
 * trade template instead of the template being forced.
 */
export function fittingDirections(businessType: string, seed: number, exclude: string[] = []): Direction[] {
  const fit = DIRECTIONS.filter((d) => !d.template && d.bestFor.includes(businessType as never) && !exclude.includes(d.id));
  return seededOrder(fit, seed, "directions").slice(0, 2);
}
