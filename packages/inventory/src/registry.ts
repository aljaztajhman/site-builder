import { Asset, type AssetKind, type AssetStatus, type AssetTags } from "./schema.ts";

/** A tag query: every listed field must share at least one value with the asset's tags (an empty asset trade list fits any trade). */
export type TagQuery = Partial<{ [K in keyof AssetTags]: AssetTags[K] }> & { kind?: AssetKind | AssetKind[]; status?: AssetStatus | AssetStatus[] };

/** The typed registry every design asset goes through. Insertion order is kept; ids are unique. */
export class Registry {
  readonly #byId = new Map<string, Asset>();

  /** Validates and adds an asset; throws on an invalid record or a duplicate id. */
  register(input: Asset): Asset {
    const parsed = Asset.safeParse(input);
    if (!parsed.success) throw new Error(`Invalid asset ${String((input as { id?: unknown }).id)}: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
    const asset = parsed.data;
    if (this.#byId.has(asset.id)) throw new Error(`Duplicate asset id: ${asset.id}`);
    this.#byId.set(asset.id, asset);
    return asset;
  }

  registerAll(assets: Iterable<Asset>): this {
    for (const a of assets) this.register(a);
    return this;
  }

  byId(id: string): Asset | undefined {
    return this.#byId.get(id);
  }

  byKind(kind: AssetKind): Asset[] {
    return this.all().filter((a) => a.kind === kind);
  }

  all(): Asset[] {
    return [...this.#byId.values()];
  }

  get size(): number {
    return this.#byId.size;
  }

  /** Assets matching every given field of the query. */
  query(q: TagQuery): Asset[] {
    const kinds = q.kind === undefined ? undefined : ([] as AssetKind[]).concat(q.kind);
    const statuses = q.status === undefined ? undefined : ([] as AssetStatus[]).concat(q.status);
    return this.all().filter((a) => {
      if (kinds && !kinds.includes(a.kind)) return false;
      if (statuses && !statuses.includes(a.status)) return false;
      if (q.trades?.length && a.tags.trades.length && !q.trades.some((t) => tradeFits(a.tags.trades, t))) return false;
      for (const field of ["stances", "intents", "mood", "ground", "density"] as const) {
        const want = q[field] as readonly string[] | undefined;
        if (want?.length && !want.some((w) => (a.tags[field] as readonly string[]).includes(w))) return false;
      }
      return true;
    });
  }

  counts(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const a of this.#byId.values()) out[a.kind] = (out[a.kind] ?? 0) + 1;
    return out;
  }
}

/**
 * How well an asset's trade list fits a trade ("builder" or "builder/electrical"): 3 the exact trade, 2 the business
 * type when the asset doesn't single out other trades of it, 1 an asset for any trade (empty list), 0 no fit. An
 * asset listing builder/plumbing but not builder/electrical is made for other trades of that type: no fit for an
 * electrician (the pipes are a plumber's, not an electrician's).
 */
export function tradeScore(trades: readonly string[], trade: string): 0 | 1 | 2 | 3 {
  if (trades.length === 0) return 1;
  if (trades.includes(trade)) return 3;
  const [type, sub] = trade.split("/") as [string, string | undefined];
  if (!trades.includes(type)) return 0;
  if (!sub) return 2;
  const siblings = trades.filter((t) => t.startsWith(`${type}/`));
  return siblings.length === 0 ? 2 : 0;
}

export const tradeFits = (trades: readonly string[], trade: string): boolean => tradeScore(trades, trade) > 0;
