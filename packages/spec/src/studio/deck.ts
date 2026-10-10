/**
 * The design studio's decks (docs/plans/design-studio.md §5.2–5.3): stances, constraint cards and reference homepages.
 * Data, dealt by the design seed in code (engine studio/deal.ts); the director is told where to go, not just to design.
 *
 * - A stance is a named visual language with enough structure for code to retrieve materials: which trades it fits and
 *   never fits, the ranges it takes on the genome's axes, its signature assets and 1–3 reference homepages. Stances are
 *   visual only: a pitch never implies a fact (no "since 1920", no heritage the client didn't give).
 * - A constraint card pushes one concept away from the safe middle ("the phone number is the hero").
 * - Signatures are asset ids in the one scheme (assets.ts: "<prefix>/<name>", e.g. "mask/arch", "type-treatment/masthead").
 *   The schema checks their shape; resolveSignature (packages/inventory) checks each against the registry: resolved,
 *   pending (its kind's batch has not merged) or unknown (a test fails on any). Shapes are axes.shape, not signatures.
 */
import { z } from "zod";
import { BusinessSubtype, BusinessType, SUBTYPES, subtypesOf } from "../business.ts";
import { AssetId } from "../assets.ts";
import { MotionLevel } from "../composition/vocab.ts";
import { Density, Imagery } from "../design.ts";
import { FONT_PAIRS } from "../fonts.ts";
import { GROUNDS, RHYTHMS, SHAPES } from "../genome.ts";

/** Families of visual language (§5.2); a deal takes at most two stances of one family. */
export const STANCE_FAMILIES = ["print", "signage", "craft", "modernist", "place", "contemporary"] as const;
export type StanceFamily = (typeof STANCE_FAMILIES)[number];

/** Palette character tags (the palette inventory will be tagged with these, §4.1). */
export const PALETTE_TAGS = ["warm", "cool", "neutral", "earth", "signal", "muted", "deep", "bright", "two-colour", "monochrome"] as const;
export type PaletteTag = (typeof PALETTE_TAGS)[number];


const Slug = z.string().regex(/^[a-z0-9-]+$/).max(40);

/** A trade a stance fits: a business type, or "*" for any trade that isn't on its never-list. */
export const TradeFit = z.union([BusinessType, z.enum(["*"])]);

/**
 * What in the brief's concept (engine concept.ts) makes a stance fit better: the goals and angles it serves, the
 * materials (Slovene nouns, matched in their case forms) it suits, and whether a local anchor (a town, valley or
 * landmark the client named) suits it.
 */
export const StanceCues = z.strictObject({
  goals: z.array(Slug).max(6).optional(),
  angles: z.array(Slug).max(7).optional(),
  materials: z.array(z.string().min(2).max(30)).max(16).optional(),
  local: z.boolean().optional(),
});
export type StanceCues = z.infer<typeof StanceCues>;

export const Stance = z.strictObject({
  id: Slug,
  name: z.string().min(1).max(40),
  /** One sentence a designer could pitch; visual only, never a fact. */
  pitch: z.string().min(20).max(260),
  family: z.enum(STANCE_FAMILIES),
  /**
   * Trades it fits. subOnly / subNever narrow a fitting type by its business subtype (business.ts SUBTYPES): a roof-tile
   * stance fits builders only as roofers, a seed packet fits shops but not boutiques. A site without a subtype is judged
   * by its type alone.
   */
  trades: z.strictObject({
    fit: z.array(TradeFit).min(1),
    never: z.array(BusinessType),
    subOnly: z.array(BusinessSubtype).min(1).optional(),
    subNever: z.array(BusinessSubtype).min(1).optional(),
  }),
  /** Rooted in Slovene visual culture (beehive panels, Plečnik, the trail blaze, Yugoslav-era signage …): drawn as a language, never copied. */
  slovene: z.boolean().optional(),
  /** The ranges it takes on the genome's axes (genome-rules.ts GenomeView), plus palette character and motion. */
  axes: z.strictObject({
    ground: z.array(z.enum(GROUNDS)).min(1),
    /** Font pair ids (fonts.ts) until the pairing inventory has stance tags. */
    type: z.array(z.string()).min(1),
    palette: z.array(z.enum(PALETTE_TAGS)).min(1),
    imagery: z.array(Imagery).min(1),
    shape: z.array(z.enum(SHAPES)).min(1),
    density: z.array(Density).min(1),
    rhythm: z.array(z.enum(RHYTHMS)).min(1).optional(),
    motion: MotionLevel,
  }),
  /** Asset ids typical of it: fact objects, type treatments, ornaments, masks. */
  signatures: z.array(AssetId).min(1).max(8),
  /** 1–3 reference homepages showing it done well (references.ts). */
  references: z.array(Slug).min(1).max(3),
  /** What it turns into when done badly. */
  avoid: z.string().min(10).max(200),
  cues: StanceCues.optional(),
});
export type Stance = z.infer<typeof Stance>;

/** What a card needs from the client's input to work (photos: owner or generated pictures; several-photos: three or more). */
export const CARD_REQUIREMENTS = ["photos", "several-photos", "prices", "hours", "phone", "address"] as const;
export type CardRequirement = (typeof CARD_REQUIREMENTS)[number];

export const ConstraintCard = z.strictObject({
  id: Slug,
  /** The constraint as the director reads it. */
  text: z.string().min(10).max(160),
  /** Only for these trades or stance families, and only when the client's input has everything in `requires`; absent: any. */
  appliesTo: z
    .strictObject({
      trades: z.array(BusinessType).min(1).optional(),
      families: z.array(z.enum(STANCE_FAMILIES)).min(1).optional(),
      requires: z.array(z.enum(CARD_REQUIREMENTS)).min(1).optional(),
    })
    .optional(),
  /**
   * "f1b": today's composition language (spec v19) can't say it; it needs composition language v2 (design-studio.md §7:
   * transitions, background layers, sticky columns, marquee, sticker, map). Not to be dealt before that lands.
   */
  needs: z.enum(["f1b"]).optional(),
});
export type ConstraintCard = z.infer<typeof ConstraintCard>;

/** A reference homepage (docs/design/templates/templates.json for now): id is its name in lowercase ASCII. */
export const Reference = z.strictObject({
  id: Slug,
  /** The template's letter in templates.json. */
  template: z.string().regex(/^[A-Z]$/),
  name: z.string().min(1),
  /** Business types it was made for; empty: none of ours (the swim-school landing studies). */
  trades: z.array(BusinessType),
});
export type Reference = z.infer<typeof Reference>;

const SUBTYPE_PARENT = new Map<BusinessSubtype, BusinessType>(
  (Object.entries(SUBTYPES) as [BusinessType, readonly BusinessSubtype[]][]).flatMap(([type, subs]) => subs.map((s) => [s, type] as const)),
);

/**
 * Whether a stance fits a trade and, when the site has one, its subtype: on its fit list (or "*"), off its never-list,
 * not on subNever, and on subOnly when subOnly names subtypes of this type. (The engine's stanceFits judges the type alone.)
 */
export function stanceFitsSubtype(stance: Stance, type: BusinessType, subtype?: BusinessSubtype): boolean {
  const t = stance.trades;
  if (t.never.includes(type) || !(t.fit.includes(type) || t.fit.includes("*"))) return false;
  if (!subtype) return true;
  if (t.subNever?.includes(subtype)) return false;
  const only = t.subOnly?.filter((s) => subtypesOf(type).includes(s)) ?? [];
  return only.length === 0 || only.includes(subtype);
}

/** The issues of a deck (empty: fine): schema, unique ids, known font pairs, assets and references. */
export function deckIssues(stances: readonly unknown[], cards: readonly unknown[], references: readonly Reference[]): string[] {
  const out: string[] = [];
  const pairs = new Set(FONT_PAIRS.map((p) => p.id));
  const refs = new Set(references.map((r) => r.id));
  const seen = new Set<string>();
  for (const raw of stances) {
    const r = Stance.safeParse(raw);
    if (!r.success) {
      out.push(`stance ${(raw as { id?: string }).id ?? "?"}: ${r.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
      continue;
    }
    const s = r.data;
    if (seen.has(s.id)) out.push(`stance ${s.id}: duplicate id`);
    seen.add(s.id);
    for (const t of s.axes.type) if (!pairs.has(t)) out.push(`stance ${s.id}: unknown font pair ${t}`);
    for (const ref of s.references) if (!refs.has(ref)) out.push(`stance ${s.id}: unknown reference ${ref}`);
    const fit = s.trades.fit.filter((t) => t !== "*");
    for (const t of fit) if (s.trades.never.includes(t)) out.push(`stance ${s.id}: ${t} both fits and never`);
    for (const sub of [...(s.trades.subOnly ?? []), ...(s.trades.subNever ?? [])]) {
      const type = SUBTYPE_PARENT.get(sub);
      if (!type || !stanceFitsSubtype(s, type)) out.push(`stance ${s.id}: subtype ${sub} of a type it doesn't fit`);
    }
  }
  const cardIds = new Set<string>();
  for (const raw of cards) {
    const r = ConstraintCard.safeParse(raw);
    if (!r.success) out.push(`card ${(raw as { id?: string }).id ?? "?"}: ${r.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
    else if (cardIds.has(r.data.id)) out.push(`card ${r.data.id}: duplicate id`);
    else cardIds.add(r.data.id);
  }
  return out;
}
