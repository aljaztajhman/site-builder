import type { Db } from "./db.ts";
import { POOLS, type Pool } from "./usage.ts";

/**
 * Cost history for the admin (/admin/costs): what model and image calls cost over a window of UTC days,
 * read from `model_calls` (and `ai_jobs` for whole runs). Only settled calls count; pending rows (a call's
 * reservation while it is in flight, `Usage.reserveCall`) are reported apart, at their estimate.
 */

/** A pool, or "untagged": calls with no tier (eval runs, rows from before tiers were logged). */
export type CostPool = Pool | "untagged";
export const COST_POOLS: readonly CostPool[] = [...POOLS, "untagged"];

/** What one kind of run (a generation of a homepage or a whole site, a chat edit, photo descriptions) cost. */
export type RunKind = "generate:home" | "generate:full" | "edit" | "alt";
export const RUN_KINDS: readonly RunKind[] = ["generate:home", "generate:full", "edit", "alt"];

export interface RunStats {
  kind: RunKind;
  runs: number;
  eur: number;
  /** € per run. */
  median: number;
  p90: number;
}

export interface StageStats {
  stage: string;
  calls: number;
  /** Runs the stage was part of: an ai_jobs row, else one queue job of one site, else the call alone. */
  runs: number;
  eur: number;
  /** € per run of this stage. */
  median: number;
  p90: number;
}

export interface CostDay {
  /** UTC day, YYYY-MM-DD. */
  day: string;
  eur: number;
  calls: number;
  pools: Record<CostPool, number>;
  /** Runs started that day per kind: how many and their € (all their settled calls, whenever logged). */
  runs: Record<RunKind, { runs: number; eur: number }>;
}

export interface TopAccount {
  accountId: string;
  email: string | null;
  calls: number;
  sites: number;
  eur: number;
}

export interface TopSite {
  siteId: string;
  name: string | null;
  slug: string | null;
  accountId: string | null;
  /** The owner's address, when the site has an account. */
  ownerEmail: string | null;
  calls: number;
  eur: number;
}

export interface CostReport {
  days: number;
  /** First instant of the window (UTC midnight) and its end (exclusive). */
  from: string;
  to: string;
  eur: number;
  calls: number;
  /** Newest day first, every day of the window (days without calls at 0). */
  perDay: CostDay[];
  runs: RunStats[];
  stages: StageStats[];
  topAccounts: TopAccount[];
  topSites: TopSite[];
  /** Calls in flight now (their reservations at the estimate), whatever their day; not in any number above. */
  pending: { calls: number; eur: number; oldest: string | null };
}

const DAY = 86_400_000;
const n = (v: unknown): number => Number(v ?? 0);
const dayOf = (d: Date) => d.toISOString().slice(0, 10);
const UTC_DAY = "to_char(created_at at time zone 'utc', 'YYYY-MM-DD')";
const POOL_OF = "(case when tier = 'admin' then 'paid' when tier in ('anonymous', 'free', 'paid') then tier else 'untagged' end)";

/** One row per run with its € (settled calls only), for the runs started in [$1, $2). */
const RUNS = `
  select j.id, (case when j.kind = 'generate' then 'generate:' || (case when j.scope = 'full' then 'full' else 'home' end) else j.kind end) as kind,
         to_char(j.created_at at time zone 'utc', 'YYYY-MM-DD') as day, sum(m.cost_eur)::float8 as eur
    from ai_jobs j join model_calls m on m.ai_job_id = j.id and not m.pending
   where j.kind in ('generate', 'edit', 'alt') and j.created_at >= $1 and j.created_at < $2
   group by j.id`;

export class CostHistory {
  constructor(private readonly db: Db) {}

  /** The last `days` UTC days up to `now` (today included), with the top `top` accounts and sites. */
  async report({ days, now = new Date(), top = 10 }: { days: number; now?: Date; top?: number }): Promise<CostReport> {
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const from = new Date(today - (days - 1) * DAY);
    const to = new Date(today + DAY);
    const w = [from.toISOString(), to.toISOString()];
    const q = <T>(sql: string, params: unknown[] = w) => this.db.query<T>(sql, params).then((r) => r.rows);

    const empty = (): CostDay["runs"] => Object.fromEntries(RUN_KINDS.map((k) => [k, { runs: 0, eur: 0 }])) as CostDay["runs"];
    const perDay: CostDay[] = [];
    for (let t = today; t >= from.getTime(); t -= DAY) {
      perDay.push({ day: dayOf(new Date(t)), eur: 0, calls: 0, pools: { anonymous: 0, free: 0, paid: 0, untagged: 0 }, runs: empty() });
    }
    const byDay = new Map(perDay.map((d) => [d.day, d]));

    const pools = await q<{ day: string; pool: CostPool; eur: unknown; calls: unknown }>(
      `select ${UTC_DAY} as day, ${POOL_OF} as pool, sum(cost_eur) as eur, count(*) as calls
         from model_calls where not pending and created_at >= $1 and created_at < $2 group by 1, 2`,
    );
    for (const r of pools) {
      const d = byDay.get(r.day);
      if (!d) continue;
      d.pools[r.pool] += n(r.eur);
      d.eur += n(r.eur);
      d.calls += n(r.calls);
    }

    const runDays = await q<{ day: string; kind: RunKind; runs: unknown; eur: unknown }>(`with runs as (${RUNS}) select day, kind, count(*) as runs, sum(eur) as eur from runs group by 1, 2`);
    for (const r of runDays) {
      const d = byDay.get(r.day);
      if (d && r.kind in d.runs) d.runs[r.kind] = { runs: n(r.runs), eur: n(r.eur) };
    }

    const runRows = await q<{ kind: RunKind; runs: unknown; eur: unknown; median: unknown; p90: unknown }>(
      `with runs as (${RUNS})
       select kind, count(*) as runs, sum(eur) as eur,
              percentile_cont(0.5) within group (order by eur) as median, percentile_cont(0.9) within group (order by eur) as p90
         from runs group by kind`,
    );
    const runs = RUN_KINDS.flatMap((kind) => {
      const r = runRows.find((x) => x.kind === kind);
      return r ? [{ kind, runs: n(r.runs), eur: n(r.eur), median: n(r.median), p90: n(r.p90) }] : [];
    });

    // A stage's € per run: its calls summed per ai_jobs row, else per queue job of one site, else alone.
    const stageRows = await q<{ stage: string; calls: unknown; runs: unknown; eur: unknown; median: unknown; p90: unknown }>(
      `with per as (
         select stage, coalesce('a' || ai_job_id::text, 'q' || site_id || ':' || job_id, 'c' || id::text) as run, sum(cost_eur)::float8 as eur, count(*) as calls
           from model_calls where not pending and created_at >= $1 and created_at < $2 group by 1, 2)
       select stage, sum(calls) as calls, count(*) as runs, sum(eur) as eur,
              percentile_cont(0.5) within group (order by eur) as median, percentile_cont(0.9) within group (order by eur) as p90
         from per group by stage order by sum(eur) desc, stage`,
    );
    const stages = stageRows.map((r) => ({ stage: r.stage, calls: n(r.calls), runs: n(r.runs), eur: n(r.eur), median: n(r.median), p90: n(r.p90) }));

    const accountRows = await q<{ account_id: string; email: string | null; calls: unknown; sites: unknown; eur: unknown }>(
      `select m.account_id, a.email, count(*) as calls, count(distinct m.site_id) as sites, sum(m.cost_eur) as eur
         from model_calls m left join accounts a on a.id = m.account_id
        where not m.pending and m.created_at >= $1 and m.created_at < $2 and m.account_id is not null
        group by m.account_id, a.email order by sum(m.cost_eur) desc, m.account_id limit $3`,
      [...w, top],
    );
    const topAccounts = accountRows.map((r) => ({ accountId: r.account_id, email: r.email, calls: n(r.calls), sites: n(r.sites), eur: n(r.eur) }));

    const siteRows = await q<{ site_id: string; name: string | null; slug: string | null; account_id: string | null; owner_email: string | null; calls: unknown; eur: unknown }>(
      `select m.site_id, s.name, s.slug, s.account_id, a.email as owner_email, count(*) as calls, sum(m.cost_eur) as eur
         from model_calls m left join sites s on s.id = m.site_id left join accounts a on a.id = s.account_id
        where not m.pending and m.created_at >= $1 and m.created_at < $2 and m.site_id is not null
        group by m.site_id, s.name, s.slug, s.account_id, a.email order by sum(m.cost_eur) desc, m.site_id limit $3`,
      [...w, top],
    );
    const topSites = siteRows.map((r) => ({ siteId: r.site_id, name: r.name, slug: r.slug, accountId: r.account_id, ownerEmail: r.owner_email, calls: n(r.calls), eur: n(r.eur) }));

    const p = (await q<{ calls: unknown; eur: unknown; oldest: string | Date | null }>("select count(*) as calls, coalesce(sum(cost_eur), 0) as eur, min(created_at) as oldest from model_calls where pending", []))[0];
    const oldest = p?.oldest ? new Date(p.oldest).toISOString() : null;

    return {
      days,
      from: from.toISOString(),
      to: to.toISOString(),
      eur: perDay.reduce((s, d) => s + d.eur, 0),
      calls: perDay.reduce((s, d) => s + d.calls, 0),
      perDay,
      runs,
      stages,
      topAccounts,
      topSites,
      pending: { calls: n(p?.calls), eur: n(p?.eur), oldest },
    };
  }
}
