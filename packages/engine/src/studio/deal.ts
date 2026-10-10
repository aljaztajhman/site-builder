/**
 * The design seed and what it deals (docs/plans/design-studio.md §5.1–5.3). Pure and deterministic: the same seed and
 * inputs deal the same stances, cards and references, so a run replays from its recordings. No model call. Nothing in
 * the pipeline calls this yet (the studio stages come later, behind the designer switch).
 */
import { CARDS, REFERENCES, STANCES, stanceFitsSubtype, type BusinessSubtype, type BusinessType, type CardRequirement, type ConstraintCard, type Reference, type Stance, type StanceFamily } from "@sb/spec";
import { inClientText, type Concept } from "../concept.ts";
import { hash32, siteSeed } from "../variety.ts";

/**
 * The design seed of a site's generation: siteSeed (the variety engine's) in base 36, at least 6 characters. Generation 0
 * is the site's own seed (seedNumber(designSeed(id, 0)) === siteSeed(id)); each "Ustvari znova" moves it to the next
 * generation.
 */
export function designSeed(siteId: string, generation: number): string {
  if (!Number.isInteger(generation) || generation < 0) throw new Error(`generation must be a whole number ≥ 0, not ${generation}`);
  const n = generation === 0 ? siteSeed(siteId) : siteSeed(siteId, `g${generation}`);
  return n.toString(36).padStart(6, "0");
}

/** The seed as the variety engine's number (seededOrder and friends take it). */
export function seedNumber(seed: string): number {
  return Number.parseInt(seed, 36) >>> 0;
}

/** A uniform number in (0, 1) from the seed, a salt and an index. */
function unit(seed: string, salt: string, i: number | string): number {
  return (hash32(`${seed}:${salt}:${i}`) + 0.5) / 2 ** 32;
}

/**
 * Weights of the deal. A stance starts at 1; each concept cue it matches adds; each same-trade neighbour that used it
 * multiplies by `neighbour` (registry, §5.4), so a common stance becomes rare but never impossible.
 */
export const DEAL_WEIGHTS = { goal: 0.5, angle: 0.5, material: 0.75, maxMaterials: 2, local: 0.5, neighbour: 0.35 } as const;

/** At most this many stances of one family in a deal (§5.2). */
export const MAX_PER_FAMILY = 2;

export type ConceptCues = Partial<Pick<Concept, "goal" | "angle" | "materials" | "localAnchor">>;

/** Whether a stance may be dealt for a trade: on its fit list (or "*"), not on its never-list. */
/** The stance fits the trade (and its sub-trade, when known): fit list, never list, subOnly/subNever (spec studio/deck.ts). */
export function stanceFits(stance: Stance, trade: BusinessType, subtype?: BusinessSubtype): boolean {
  return stanceFitsSubtype(stance, trade, subtype);
}

/** The stance's weight for this concept (before neighbours): 1 plus each cue it matches. */
export function conceptWeight(stance: Stance, concept: ConceptCues | undefined): number {
  const cues = stance.cues;
  if (!concept || !cues) return 1;
  let w = 1;
  if (concept.goal && cues.goals?.includes(concept.goal)) w += DEAL_WEIGHTS.goal;
  if (concept.angle && cues.angles?.includes(concept.angle)) w += DEAL_WEIGHTS.angle;
  const materials = (concept.materials ?? []).join(" ");
  if (materials && cues.materials) {
    const hits = cues.materials.filter((m) => inClientText(m, materials)).length;
    w += DEAL_WEIGHTS.material * Math.min(DEAL_WEIGHTS.maxMaterials, hits);
  }
  if (concept.localAnchor && cues.local) w += DEAL_WEIGHTS.local;
  return w;
}

export interface DealStancesInput {
  seed: string;
  trade: BusinessType;
  /** The business's sub-trade (brief concept), when known: stances limited to other sub-trades are left out. */
  subtype?: BusinessSubtype | undefined;
  concept?: ConceptCues | undefined;
  /** Looks of other sites of this trade (and town): their stances are dealt less often. */
  neighbours: readonly { stance: string | null | undefined }[];
  /** This site's earlier generations' stances: not dealt again while others remain. */
  previous: readonly string[];
  count?: number;
  /** The deck (default the starter deck). */
  deck?: readonly Stance[];
}

/**
 * Deals `count` stances (default 6, one per concept): the deck filtered by trade fit and never-list, weighted by fit to
 * the concept and down-weighted by the neighbours' stances, then drawn by the seed without replacement (weighted
 * sampling by key u^(1/w)), at most two of one family. A previous generation's stance is dealt only when nothing else
 * remains. Fewer than `count` when the deck can't fill it within the rules.
 */
export function dealStances(input: DealStancesInput): Stance[] {
  const count = input.count ?? 6;
  const deck = input.deck ?? STANCES;
  const used = new Map<string, number>();
  for (const n of input.neighbours) if (n.stance) used.set(n.stance, (used.get(n.stance) ?? 0) + 1);
  const ranked = deck
    .filter((s) => stanceFits(s, input.trade, input.subtype))
    .map((s) => {
      const w = conceptWeight(s, input.concept) * DEAL_WEIGHTS.neighbour ** (used.get(s.id) ?? 0);
      return { s, key: Math.log(unit(input.seed, "stance", s.id)) / w };
    })
    .sort((a, b) => b.key - a.key || (a.s.id < b.s.id ? -1 : 1))
    .map((x) => x.s);
  const previous = new Set(input.previous);
  const out: Stance[] = [];
  const perFamily = new Map<StanceFamily, number>();
  const take = (pool: Stance[]) => {
    for (const s of pool) {
      if (out.length >= count) return;
      if ((perFamily.get(s.family) ?? 0) >= MAX_PER_FAMILY || out.includes(s)) continue;
      out.push(s);
      perFamily.set(s.family, (perFamily.get(s.family) ?? 0) + 1);
    }
  };
  take(ranked.filter((s) => !previous.has(s.id)));
  take(ranked.filter((s) => previous.has(s.id)));
  return out;
}

/** Whether a card may go with this trade and stance family (absent appliesTo: any). */
export function cardApplies(
  card: ConstraintCard,
  o: { trade?: BusinessType | undefined; family?: StanceFamily | undefined; has?: readonly CardRequirement[] | undefined; f1b?: boolean | undefined },
): boolean {
  // Cards that need composition language v2 wait until it lands (o.f1b).
  if (card.needs === "f1b" && !o.f1b) return false;
  const a = card.appliesTo;
  if (!a) return true;
  // What the client's input has (photos, prices …); a card needing something missing doesn't apply. Unknown: no limit.
  if (a.requires && o.has && !a.requires.every((req) => o.has!.includes(req))) return false;
  if (a.trades && o.trade && !a.trades.includes(o.trade)) return false;
  if (a.families && o.family && !a.families.includes(o.family)) return false;
  return true;
}

/** `n` distinct constraint cards in the seed's order (one per concept), those that apply to the trade and family. */
export function dealCards(
  seed: string,
  n: number,
  o: { trade?: BusinessType; family?: StanceFamily; has?: readonly CardRequirement[]; f1b?: boolean; deck?: readonly ConstraintCard[] } = {},
): ConstraintCard[] {
  return (o.deck ?? CARDS)
    .filter((c) => cardApplies(c, o))
    .map((c) => ({ c, k: unit(seed, "card", c.id) }))
    .sort((a, b) => a.k - b.k)
    .slice(0, Math.max(0, n))
    .map((x) => x.c);
}

/**
 * The references the director is shown (default 3): at most one made for the trade (so it sees what good looks like
 * there without being handed the trade's template), the rest from other trades and the landing studies, by seed.
 */
export function dealReferences(seed: string, trade: BusinessType, count = 3, deck: readonly Reference[] = REFERENCES): Reference[] {
  const order = (rs: readonly Reference[]) =>
    rs
      .map((r) => ({ r, k: unit(seed, "reference", r.id) }))
      .sort((a, b) => a.k - b.k)
      .map((x) => x.r);
  const own = order(deck.filter((r) => r.trades.includes(trade))).slice(0, 1);
  const others = order(deck.filter((r) => !r.trades.includes(trade)));
  return [...own, ...others].slice(0, Math.max(0, count));
}
