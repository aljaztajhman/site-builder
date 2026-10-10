import type { GenomeView } from "@sb/spec";
import type { Db } from "./db.ts";

/** One generated look in the uniqueness registry (look_fingerprints, docs/plans/design-studio.md §5.4). */
export interface LookFingerprint {
  siteId: string;
  generation: number;
  trade: string;
  town: string | null;
  stance: string | null;
  seed: string;
  genome: GenomeView;
  /** The homepage's sections as "intent:type/variant", space-separated (engine studio compositionSignature). */
  composition: string;
  paletteLab: Record<"background" | "primary" | "band" | "accent", [number, number, number]>;
  phash360: string | null;
  phash1280: string | null;
  createdAt?: string;
}

interface Row {
  site_id: string;
  generation: number;
  trade: string;
  town: string | null;
  stance: string | null;
  seed: string;
  genome: GenomeView | string;
  composition: string;
  palette_lab: LookFingerprint["paletteLab"] | string;
  phash_360: string | null;
  phash_1280: string | null;
  created_at: string | Date;
}

const parse = <T>(v: T | string): T => (typeof v === "string" ? (JSON.parse(v) as T) : v);

const fromRow = (r: Row): LookFingerprint => ({
  siteId: r.site_id,
  generation: Number(r.generation),
  trade: r.trade,
  town: r.town,
  stance: r.stance,
  seed: r.seed,
  genome: parse(r.genome),
  composition: r.composition,
  paletteLab: parse(r.palette_lab),
  phash360: r.phash_360,
  phash1280: r.phash_1280,
  createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
});

/**
 * The uniqueness registry: every generated look's fingerprint (previews too; the rows go with the site). The gate
 * (engine studio uniqueEnough) compares a new look with the nearest ones: the same town and the same trade.
 */
export class LookFingerprints {
  constructor(private readonly db: Db) {}

  /** Records a look; recording the same site and generation again replaces it (a re-render after compose). */
  async record(fp: Omit<LookFingerprint, "createdAt">): Promise<void> {
    await this.db.query(
      `insert into look_fingerprints (site_id, generation, trade, town, stance, seed, genome, composition, palette_lab, phash_360, phash_1280)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       on conflict (site_id, generation) do update set
         trade = excluded.trade, town = excluded.town, stance = excluded.stance, seed = excluded.seed, genome = excluded.genome,
         composition = excluded.composition, palette_lab = excluded.palette_lab, phash_360 = excluded.phash_360,
         phash_1280 = excluded.phash_1280, created_at = now()`,
      [
        fp.siteId,
        fp.generation,
        fp.trade,
        fp.town?.trim() || null,
        fp.stance,
        fp.seed,
        JSON.stringify(fp.genome),
        fp.composition,
        JSON.stringify(fp.paletteLab),
        fp.phash360,
        fp.phash1280,
      ],
    );
  }

  /**
   * Other sites' looks the gate compares with: each site's latest generation, of the same trade or in the same town
   * (case-insensitive), the same town first, then the same trade, then the newest. At most `limit`. `excludeSiteId`: the
   * site being designed (its own earlier looks are the deal's `previous`, not neighbours).
   */
  async nearest(o: { trade: string; town: string | null; limit: number; excludeSiteId?: string }): Promise<LookFingerprint[]> {
    if (o.limit <= 0) return [];
    const town = o.town?.trim() || null;
    const { rows } = await this.db.query<Row>(
      `select * from (
         select distinct on (site_id) * from look_fingerprints
          where site_id <> coalesce($4, '') and (trade = $1 or ($2::text is not null and lower(town) = lower($2::text)))
          order by site_id, generation desc
       ) latest
       order by coalesce(lower(town) = lower($2::text), false) desc, (trade = $1) desc, created_at desc, site_id
       limit $3`,
      [o.trade, town, o.limit, o.excludeSiteId ?? null],
    );
    return rows.map(fromRow);
  }

  /** A site's looks, oldest first (its earlier generations' stances are the deal's `previous`). */
  async forSite(siteId: string): Promise<LookFingerprint[]> {
    const { rows } = await this.db.query<Row>("select * from look_fingerprints where site_id = $1 order by generation", [siteId]);
    return rows.map(fromRow);
  }
}
