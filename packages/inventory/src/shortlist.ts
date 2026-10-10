/**
 * Retrieval, not the whole catalogue (design-studio.md §4.2): the approved assets that fit a dealt stance and a trade,
 * ranked, at most `limit`. Deterministic: the same registry and options give the same list.
 *
 * Ranking per asset: trade fit (registry.tradeScore) weighs most, then the stance, the intents and the ground. Assets a
 * neighbour already uses (`exclude`) rank after every other asset of their kind. Trade-bound kinds (motifs and
 * sub-trade motifs: a drawing that belongs to one trade) are left out when they don't fit the trade at all. The list
 * is balanced across kinds: the kinds take turns (fixed order of ASSET_KINDS), each giving its next best asset, so 82
 * section presets can't crowd out the fonts and palettes. Ties break on the id.
 */
import { ASSET_KINDS, type Asset, type AssetKind, type Ground } from "./schema.ts";
import { tradeScore, type Registry } from "./registry.ts";
import type { Intent } from "@sb/spec";

export interface ShortlistOptions {
  /** "builder" or "builder/electrical". */
  trade: string;
  stance?: string;
  intents?: Intent[];
  ground?: Ground;
  /** Ids of assets neighbours (same-trade sites, this site's earlier looks) used: ranked lower. */
  exclude?: string[];
  /** Only these kinds. */
  kinds?: AssetKind[];
  limit?: number;
}

export const TRADE_BOUND_KINDS: readonly AssetKind[] = ["motif", "submotif"];

export interface Ranked {
  asset: Asset;
  score: number;
  neighbour: boolean;
}

export function scoreAsset(a: Asset, o: ShortlistOptions): number {
  let s = tradeScore(a.tags.trades, o.trade) * 10;
  // The dealt stance outranks a closer trade fit (25 > 30 − 10), not a misfit (0 + 25 < 30).
  if (o.stance && a.tags.stances.includes(o.stance)) s += 25;
  if (o.intents?.length) s += 4 * o.intents.filter((i) => a.tags.intents.includes(i)).length;
  if (o.ground && a.tags.ground.includes(o.ground)) s += 3;
  return s;
}

const byRank = (x: Ranked, y: Ranked): number => Number(x.neighbour) - Number(y.neighbour) || y.score - x.score || (x.asset.id < y.asset.id ? -1 : x.asset.id > y.asset.id ? 1 : 0);

/** The ranked candidates per kind (approved, pickable, fitting), best first. */
export function rankByKind(registry: Registry, o: ShortlistOptions): Map<AssetKind, Ranked[]> {
  const exclude = new Set(o.exclude ?? []);
  const out = new Map<AssetKind, Ranked[]>();
  for (const a of registry.all()) {
    if (a.status !== "approved" || a.pickable === false) continue;
    if (o.kinds && !o.kinds.includes(a.kind)) continue;
    if (TRADE_BOUND_KINDS.includes(a.kind) && tradeScore(a.tags.trades, o.trade) === 0) continue;
    // A section preset for an intent the brief doesn't ask for stays out when intents are given.
    if (o.intents?.length && a.kind === "section" && !a.tags.intents.some((i) => o.intents!.includes(i))) continue;
    const list = out.get(a.kind) ?? [];
    list.push({ asset: a, score: scoreAsset(a, o), neighbour: exclude.has(a.id) });
    out.set(a.kind, list);
  }
  for (const list of out.values()) list.sort(byRank);
  return out;
}

export function shortlist(registry: Registry, o: ShortlistOptions): Asset[] {
  const limit = o.limit ?? 40;
  const ranked = rankByKind(registry, o);
  const queues = ASSET_KINDS.map((k) => ranked.get(k) ?? []).filter((q) => q.length > 0);
  const out: Asset[] = [];
  // Non-neighbours first across all kinds, then neighbours, so a neighbour's asset never displaces a fresh one.
  for (const pass of [false, true]) {
    const qs = queues.map((q) => q.filter((r) => r.neighbour === pass));
    for (let round = 0; out.length < limit; round++) {
      let took = false;
      for (const q of qs) {
        const r = q[round];
        if (!r) continue;
        took = true;
        out.push(r.asset);
        if (out.length >= limit) break;
      }
      if (!took) break;
    }
  }
  return out;
}
