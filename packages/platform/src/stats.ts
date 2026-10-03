import type { Db } from "./db.ts";

export type StatKind = "visits" | "calls" | "directions" | "forms";
export const STAT_KINDS: readonly StatKind[] = ["visits", "calls", "directions", "forms"];

export type StatTotals = Record<StatKind, number>;
const ZERO: StatTotals = { visits: 0, calls: 0, directions: 0, forms: 0 };

type Sums = Record<StatKind, string | number | null>;
const totalsOf = (r: Sums | undefined): StatTotals =>
  r ? { visits: Number(r.visits ?? 0), calls: Number(r.calls ?? 0), directions: Number(r.directions ?? 0), forms: Number(r.forms ?? 0) } : { ...ZERO };

/**
 * Cookieless counts per published site and day (site_stats), and the monthly report emails
 * (stats_reports). Only totals: nothing here identifies a visitor.
 */
export class SiteStats {
  constructor(private readonly db: Db) {}

  /** Adds one to a site's count for `day` (YYYY-MM-DD, in the reporting time zone). */
  async bump(siteId: string, kind: StatKind, day: string): Promise<void> {
    // The column name comes from the fixed list above, never from the request.
    if (!STAT_KINDS.includes(kind)) throw new Error(`unknown stat ${kind}`);
    await this.db.query(
      `insert into site_stats (site_id, day, ${kind}) values ($1, $2, 1)
       on conflict (site_id, day) do update set ${kind} = site_stats.${kind} + 1`,
      [siteId, day],
    );
  }

  /** Totals over the days [from, to) (YYYY-MM-DD). */
  async totals(siteId: string, from: string, to: string): Promise<StatTotals> {
    const { rows } = await this.db.query<Sums>(
      `select sum(visits) as visits, sum(calls) as calls, sum(directions) as directions, sum(forms) as forms
         from site_stats where site_id = $1 and day >= $2 and day < $3`,
      [siteId, from, to],
    );
    return totalsOf(rows[0]);
  }

  /** Totals over [from, to) for several sites at once (the sites list). */
  async totalsFor(siteIds: string[], from: string, to: string): Promise<Map<string, StatTotals>> {
    const out = new Map<string, StatTotals>();
    if (!siteIds.length) return out;
    const { rows } = await this.db.query<Sums & { site_id: string }>(
      `select site_id, sum(visits) as visits, sum(calls) as calls, sum(directions) as directions, sum(forms) as forms
         from site_stats where site_id = any($1) and day >= $2 and day < $3 group by site_id`,
      [siteIds, from, to],
    );
    for (const r of rows) out.set(r.site_id, totalsOf(r));
    return out;
  }

  /**
   * Published sites with an owner account whose report for `month` (YYYY-MM, ending before `monthEnd`) is
   * due: never tried, or still pending with fewer than `maxAttempts` tries, the last at least
   * `retryAfterMinutes` ago. A site counts for the month if it was published before the month ended or
   * has any counts in it.
   */
  async dueReports(month: string, monthEnd: string, o: { maxAttempts: number; retryAfterMinutes: number; limit: number }): Promise<{ siteId: string; attempts: number }[]> {
    const { rows } = await this.db.query<{ id: string; attempts: number | null }>(
      `select s.id, r.attempts
         from sites s
         left join stats_reports r on r.site_id = s.id and r.month = $1
        where s.account_id is not null and s.published_version is not null
          and (s.published_at < $2::date
               or exists (select 1 from site_stats t where t.site_id = s.id and t.day >= to_date($1, 'YYYY-MM') and t.day < $2::date))
          and (r.site_id is null or (r.status = 'pending' and r.attempts < $3 and r.last_attempt_at < now() - make_interval(mins => $4)))
        order by s.id limit $5`,
      [month, monthEnd, o.maxAttempts, o.retryAfterMinutes, o.limit],
    );
    return rows.map((r) => ({ siteId: r.id, attempts: Number(r.attempts ?? 0) }));
  }

  /** Takes one send attempt for a report; false when another process took it, or it is no longer due. */
  async claimReport(siteId: string, month: string, attempts: number): Promise<boolean> {
    const { rows } = await this.db.query(
      `insert into stats_reports (site_id, month, attempts, last_attempt_at) values ($1, $2, 1, now())
       on conflict (site_id, month) do update set attempts = stats_reports.attempts + 1, last_attempt_at = now()
        where stats_reports.status = 'pending' and stats_reports.attempts = $3
       returning attempts`,
      [siteId, month, attempts],
    );
    return rows.length > 0;
  }

  async setReport(siteId: string, month: string, status: "pending" | "sent" | "none" | "failed"): Promise<void> {
    await this.db.query("update stats_reports set status = $3 where site_id = $1 and month = $2", [siteId, month, status]);
  }

  async report(siteId: string, month: string): Promise<{ status: string; attempts: number } | null> {
    const { rows } = await this.db.query<{ status: string; attempts: number }>("select status, attempts from stats_reports where site_id = $1 and month = $2", [siteId, month]);
    return rows[0] ? { status: rows[0].status, attempts: Number(rows[0].attempts) } : null;
  }
}
