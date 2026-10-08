/**
 * "Druga podoba" (docs/plans/variety-engine.md Step 2, HQ sb-druga-podoba = one-plus-switch), behind config
 * `variety.families`: the same text and photos re-dressed in another look of the site's template family, chosen in
 * code. No model call, nothing reserved or spent.
 *
 * - The looks of a family are its palettes × font pairs × the heroes the site's own hero can become without losing or
 *   needing anything: the hero keeps its props exactly and only its type or variant changes, so a hero becomes another
 *   only where the other's (strict) schema takes the same props (hero-split ↔ hero-image, hero-type large ↔
 *   with-facts). A signature hero (the plate, the receipt, the label) carries texts no other hero has, and a type-only
 *   hero has no photo: those keep their hero and change palette and fonts (changing them needs a content call, Step 5).
 * - The looks run in one cycle fixed by the site's seed, each step changing the palette (and the fonts where it can);
 *   a tap takes the next look after the current one that is not the current look and no neighbour of the same trade
 *   has (sameLook, as the generator), else the next that is not the current look.
 * - With config `variety.skeleton` on, each look also gets another skeleton (pickSkeleton, away from the neighbours'
 *   frames and the current one) and its centred section per page (pickCentred). Nothing else of applySkeleton runs:
 *   the rhythm and the hero's eyebrow are content, and stay.
 * - Everything else of the spec is untouched: texts, photos, facts, the owner's own edits, translations. The design
 *   keeps its tokens (radius, sizes, weights); contrast is enforced in code (enforceDesign) and showcases are avoided
 *   (awayFromShowcases), as in the generator. The caller saves it through the direct editor's path, which validates
 *   it and holds it to the viewer's plan.
 */
import {
  awayFromShowcases,
  deltaE,
  enforceDesign,
  familyOf,
  sectionDef,
  DIRECTIONS,
  type Colors,
  type Design,
  type Direction,
  type FamilyPalette,
  type Page,
  type SiteSpec,
  type Skeleton,
} from "@sb/spec";
import { pickCentred, pickSkeleton } from "./skeleton.ts";
import { hash32, keyOf, sameLook, seededOrder, type LookKey } from "./variety.ts";

type Section = Page["sections"][number];

/** The owner-facing refusal for a site whose style has no family of looks. */
export const NO_FAMILY_MESSAGE = "Za ta slog drugih podob še nimamo. Drugačen videz lahko izberete med slogi spodaj.";
export const NO_OTHER_LOOK_MESSAGE = "Druge podobe za to stran ni: vse možne že uporabljajo podobne strani.";

/** One look of a family: a palette (by id), a font pair and the homepage hero ("type:variant"). */
export interface LookOption {
  paletteId: string;
  fontPair: string;
  hero: string;
}

const heroKey = (s: { type: string; variant: string }) => `${s.type}:${s.variant}`;

const homeIndex = (spec: Pick<SiteSpec, "pages">): number => {
  const i = spec.pages.findIndex((p) => p.kind === "home");
  return i >= 0 ? i : 0;
};

/** The site's direction when it has a family of looks (a trade template), else undefined. */
export function lookFamilyDirection(spec: Pick<SiteSpec, "design">): Direction | undefined {
  const dir = DIRECTIONS.find((d) => d.id === spec.design.direction);
  return dir && familyOf(dir) ? dir : undefined;
}

/** Whether "Druga podoba" can dress this site (its direction has a family). */
export function hasLookFamily(spec: Pick<SiteSpec, "design">): boolean {
  return lookFamilyDirection(spec) !== undefined;
}

/**
 * The hero as `target` ("type:variant") with exactly the same props, or null when that would lose or need anything:
 * the target's schema (strict) must take the props as they are. Signature heroes change neither type nor variant
 * (each variant reads its props differently).
 */
export function heroAs(section: Section, target: string): Section | null {
  if (heroKey(section) === target) return section;
  const [type, variant] = target.split(":");
  if (!type || !variant) return null;
  if (type === "hero-signature" || section.type === "hero-signature") return null;
  let def;
  try {
    def = sectionDef(type);
  } catch {
    return null;
  }
  if (def.group !== "heroes" || type === "page-header") return null;
  const next = { ...section, type, variant } as unknown as Section;
  return def.schema.safeParse(next).success ? next : null;
}

/** ΔE of primary and band: how far a design's colours are from a palette's. */
const colourDistance = (a: Colors, b: Colors): number => deltaE(a.primary, b.primary) + deltaE(a.band ?? a.primary, b.band ?? b.primary);

/** A family palette's colours as a look renders them with this design's other tokens: contrast enforced, showcases avoided. */
const dressedColours = (design: Design, dir: Direction, colors: Colors, fontPair: string): Design =>
  awayFromShowcases(enforceDesign({ ...design, colors: { ...colors }, fontPair }, dir), dir);

/** The family palette closest to the site's colours (as the look would render them, so a look matches itself exactly). */
function nearestPalette(colors: Colors, palettes: readonly FamilyPalette[], dir: Direction, design: Design): FamilyPalette {
  let best = palettes[0]!;
  let bestD = Infinity;
  for (const p of palettes) {
    const d = colourDistance(colors, dressedColours(design, dir, p.colors, design.fontPair).colors);
    if (d < bestD) {
      best = p;
      bestD = d;
    }
  }
  return best;
}

/**
 * The family's looks for this site in the order a tap walks them (round and round): all palette × font pair × reachable
 * hero combinations in the seed's order, rearranged so that each step changes the palette (and the font pair) wherever
 * the family allows. Null when the direction has no family.
 */
export function lookCycle(spec: Pick<SiteSpec, "design" | "pages">, seed: number): LookOption[] | null {
  const dir = lookFamilyDirection(spec);
  const family = dir && familyOf(dir);
  if (!family) return null;
  const hero = spec.pages[homeIndex(spec)]?.sections[0];
  const own = hero ? heroKey(hero) : "none";
  // The site's own hero, and the family's heroes it can become as it is.
  const heroes = hero ? [...new Set([own, ...family.heroes.filter((h) => heroAs(hero, h) !== null)])] : [own];
  const all: LookOption[] = [];
  for (const p of seededOrder(family.palettes, seed, "podoba-palette")) {
    for (const fontPair of seededOrder(family.fontPairs, seed, "podoba-font")) {
      for (const h of heroes) all.push({ paletteId: p.id, fontPair, hero: h });
    }
  }
  // Greedy from each starting look of the seed's order; the order whose steps (the last back to the first included)
  // change the palette and the font pair most often wins, the earliest start on a tie.
  const seeded = seededOrder(all, seed, "podoba-cycle");
  const step = (a: LookOption, b: LookOption) => (a.paletteId !== b.paletteId ? (a.fontPair !== b.fontPair ? 2 : 1) : 0);
  let out: LookOption[] = [];
  let best = -1;
  for (let start = 0; start < seeded.length; start++) {
    const left = [...seeded.slice(start), ...seeded.slice(0, start)];
    const order: LookOption[] = [left.shift()!];
    while (left.length) {
      const last = order[order.length - 1]!;
      const i = [left.findIndex((l) => step(last, l) === 2), left.findIndex((l) => step(last, l) === 1), 0].find((x) => x >= 0)!;
      order.push(left.splice(i, 1)[0]!);
    }
    const score = order.reduce((n, l, i) => n + step(l, order[(i + 1) % order.length]!), 0);
    if (score > best) {
      best = score;
      out = order;
    }
  }
  return out;
}

/** Where the site's current look sits in the cycle: its nearest palette, its font pair and hero; -1 when not in it. */
export function currentLookIndex(spec: Pick<SiteSpec, "design" | "pages">, cycle: readonly LookOption[]): number {
  const dir = lookFamilyDirection(spec);
  const family = dir && familyOf(dir);
  if (!dir || !family) return -1;
  const palette = nearestPalette(spec.design.colors, family.palettes, dir, spec.design);
  const hero = spec.pages[homeIndex(spec)]?.sections[0];
  const own = hero ? heroKey(hero) : "none";
  return cycle.findIndex((l) => l.paletteId === palette.id && l.fontPair === spec.design.fontPair && l.hero === own);
}

export interface AnotherLookInput {
  /** The site's seed (siteSeed of its id). */
  seed: number;
  /** The looks of the same trade's sites, the same town first (repo.neighbourLooks → keyOf). */
  neighbours: LookKey[];
  /** With config variety.skeleton on: the same sites' skeletons; the look gets another skeleton too. */
  skeleton?: { neighbours: Skeleton[] };
}

export type AnotherLook =
  | { ok: true; spec: SiteSpec; look: LookOption & { skeleton?: Skeleton }; index: number; key: LookKey }
  | { ok: false; reason: "no_family" | "no_other_look"; message: string };

/** The spec dressed in one look: the family palette and font pair in the design, the hero as that hero. */
function dress(spec: SiteSpec, dir: Direction, look: LookOption): { spec: SiteSpec; hero: Section | undefined } | null {
  const family = familyOf(dir)!;
  const palette = family.palettes.find((p) => p.id === look.paletteId)!;
  const hi = homeIndex(spec);
  const home = spec.pages[hi];
  const first = home?.sections[0];
  const hero = first ? heroAs(first, look.hero) : undefined;
  if (hero === null) return null;
  const design = dressedColours(spec.design, dir, palette.colors, look.fontPair);
  const pages = hero === first || !home || !hero ? spec.pages : spec.pages.map((p, i) => (i === hi ? { ...p, sections: [hero, ...p.sections.slice(1)] } : p));
  return { spec: { ...spec, design, pages }, hero };
}

/**
 * The next look for this site (see the module comment). Deterministic for one seed, one spec and one set of
 * neighbours. The result's spec differs from the input only in its design and, where the look's hero differs, the
 * homepage hero's type or variant.
 */
export function anotherLook(spec: SiteSpec, o: AnotherLookInput): AnotherLook {
  const dir = lookFamilyDirection(spec);
  const cycle = lookCycle(spec, o.seed);
  if (!dir || !cycle) return { ok: false, reason: "no_family", message: NO_FAMILY_MESSAGE };
  const hi = homeIndex(spec);
  const now = lookKeyOf(spec, hi);
  const at = currentLookIndex(spec, cycle);
  let order = cycle.map((_, k) => (at + 1 + k) % cycle.length).filter((k) => k !== at);
  if (at < 0) {
    // Not one of the family's looks (other fonts or hero, the logo's colours): the first tap changes the palette too.
    const near = nearestPalette(spec.design.colors, familyOf(dir)!.palettes, dir, spec.design).id;
    order = [...order.filter((k) => cycle[k]!.paletteId !== near), ...order.filter((k) => cycle[k]!.paletteId === near)];
  }
  const dressed = order.flatMap((k) => {
    const d = dress(spec, dir, cycle[k]!);
    if (!d) return [];
    const key = keyOf(d.spec.design, d.hero ?? null);
    return sameLook(now, key) ? [] : [{ k, d, key }];
  });
  const pick = dressed.find((x) => !o.neighbours.some((n) => sameLook(n, x.key))) ?? dressed[0];
  if (!pick) return { ok: false, reason: "no_other_look", message: NO_OTHER_LOOK_MESSAGE };
  let out = pick.d.spec;
  const look: LookOption & { skeleton?: Skeleton } = { ...cycle[pick.k]! };
  if (o.skeleton) {
    // Its own seed per look; the current frame counts as taken, so the frame changes with the look.
    const seed = hash32(`${o.seed}:podoba-skeleton:${pick.k}`);
    const taken = spec.design.skeleton ? [...o.skeleton.neighbours, spec.design.skeleton] : o.skeleton.neighbours;
    const picked = pickSkeleton({ seed, dir, design: out.design, hero: out.pages[hi]?.sections[0], business: out.business, hasLogo: out.assets.logo !== undefined, neighbours: taken });
    const centred = pickCentred(out.pages, { seed, dir });
    const skeleton: Skeleton = centred.length ? { ...picked, centred } : picked;
    out = { ...out, design: { ...out.design, skeleton } };
    look.skeleton = skeleton;
  }
  return { ok: true, spec: out, look, index: pick.k, key: pick.key };
}

function lookKeyOf(spec: SiteSpec, hi: number): LookKey {
  const first = spec.pages[hi]?.sections[0];
  return keyOf(spec.design, first ?? null);
}
