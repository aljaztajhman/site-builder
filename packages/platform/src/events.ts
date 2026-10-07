import type { AppConfig } from "@sb/config";
import type { Db } from "./db.ts";

/**
 * Stranko's own product analytics (docs/plans/analytics.md Steps 1 and 3, it-analytics): one row per step a
 * visitor takes in the product, and one `generation` row per generation job. Rows name the device only by a
 * keyed hash of its cookie (`device_key`), never by an IP or an email. Raw rows are kept `analytics.keepDays`,
 * then rolled into daily counts (`rollUp`, the worker's housekeeping).
 */

export const EVENT_KINDS = [
  "landing_view",
  "intake_submitted",
  "intake_refused",
  "preview_ready",
  "preview_opened",
  "signin_requested",
  "signin_done",
  "preview_claimed",
  "site_generated",
  "edit_chat",
  "edit_direct",
  "published",
  "exported",
  "plan_changed",
  "limit_hit",
  "upsell_shown",
  "upsell_clicked",
  "domain_connected",
  "generation",
] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export interface ProductEvent {
  kind: EventKind;
  siteId?: string | null;
  accountId?: string | null;
  /** A keyed hash of the device cookie (apps/web analytics.ts deviceKey), never the cookie itself. */
  deviceKey?: string | null;
  tier?: string | null;
  plan?: string | null;
  source?: string | null;
  /** Small facts about the step (a reason code, seconds, €). Never text a person typed, an IP or an email. */
  props?: Record<string, unknown>;
}

export interface ProductEventRow {
  id: number;
  at: string;
  kind: EventKind;
  site_id: string | null;
  account_id: string | null;
  device_key: string | null;
  tier: string | null;
  plan: string | null;
  source: string | null;
  props: Record<string, unknown>;
}

/** Which id ties a funnel step to the step before it. */
export type FunnelLink = "device_key" | "site_id" | "account_id";

/**
 * The funnel, in the order people go through it today. Until billing exists a paid plan comes from the admin's
 * allow-list, which is what makes a whole site and publishing possible, so `plan_changed` sits before them (the
 * plan's draft order, "full sites → published → paid", is the order once paying happens at Objavi).
 */
export const FUNNEL_STEPS: readonly { kind: EventKind; link: FunnelLink | null }[] = [
  { kind: "landing_view", link: null },
  { kind: "intake_submitted", link: "device_key" },
  { kind: "preview_ready", link: "site_id" },
  { kind: "preview_opened", link: "site_id" },
  { kind: "signin_done", link: "device_key" },
  { kind: "preview_claimed", link: "account_id" },
  { kind: "plan_changed", link: "account_id" },
  { kind: "site_generated", link: "account_id" },
  { kind: "published", link: "account_id" },
];

export interface FunnelStep {
  kind: EventKind;
  /** Events of this kind in the window. */
  events: number;
  /** Distinct ids (by the next step's link) that had this step, and how many of them reached the next one after it. */
  from: number | null;
  reached: number | null;
  /** Median seconds from this step to the next (first of each, per id); null when nobody reached it. */
  medianSeconds: number | null;
}

const LINKS = new Set<FunnelLink>(["device_key", "site_id", "account_id"]);
const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

export class ProductEvents {
  constructor(private readonly db: Db) {}

  /**
   * Writes one event. With `onceMinutes`, only when the same kind wasn't written for the same device (and site, and
   * props.where when given) within that many minutes: landing views, upsells shown, previews opened. Returns
   * whether a row was written.
   */
  async add(e: ProductEvent, opts: { onceMinutes?: number } = {}): Promise<boolean> {
    if (!EVENT_KINDS.includes(e.kind)) throw new Error(`unknown event ${e.kind}`);
    const params = [e.kind, e.siteId ?? null, e.accountId ?? null, e.deviceKey ?? null, e.tier ?? null, e.plan ?? null, e.source ?? null, JSON.stringify(e.props ?? {})];
    if (opts.onceMinutes && opts.onceMinutes > 0 && e.deviceKey) {
      const where = typeof e.props?.where === "string" ? e.props.where : null;
      const { rows } = await this.db.query(
        `insert into product_events (kind, site_id, account_id, device_key, tier, plan, source, props)
         select $1, $2, $3, $4, $5, $6, $7, $8::jsonb
          where not exists (
            select 1 from product_events
             where kind = $1 and device_key = $4 and site_id is not distinct from $2
               and ($10::text is null or props->>'where' = $10)
               and at > now() - make_interval(mins => $9))
         returning id`,
        [...params, opts.onceMinutes, where],
      );
      return rows.length > 0;
    }
    await this.db.query(
      `insert into product_events (kind, site_id, account_id, device_key, tier, plan, source, props) values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
      params,
    );
    return true;
  }

  async list(filter: { kind?: EventKind; since?: Date } = {}): Promise<ProductEventRow[]> {
    const { rows } = await this.db.query<ProductEventRow>(
      `select id, at, kind, site_id, account_id, device_key, tier, plan, source, props from product_events
        where ($1::text is null or kind = $1) and ($2::timestamptz is null or at >= $2) order by id`,
      [filter.kind ?? null, filter.since?.toISOString() ?? null],
    );
    return rows.map((r) => ({ ...r, id: Number(r.id), at: new Date(r.at).toISOString() }));
  }

  /**
   * Retention: raw rows older than `keepDays` become daily counts (per day, kind, tier, plan and source) and are
   * deleted, in one transaction with one cutoff, so a row is counted exactly once however often this runs.
   */
  async rollUp(keepDays: number, now = new Date()): Promise<{ rolled: number; days: number }> {
    const cutoff = new Date(now.getTime() - keepDays * 86400_000).toISOString();
    return this.db.transaction(async (q) => {
      const { rows } = await q<{ day: string }>(
        `insert into product_events_daily (day, kind, tier, plan, source, n)
         select (at at time zone 'UTC')::date, kind, coalesce(tier, ''), coalesce(plan, ''), coalesce(source, ''), count(*)
           from product_events where at < $1 group by 1, 2, 3, 4, 5
         on conflict (day, kind, tier, plan, source) do update set n = product_events_daily.n + excluded.n
         returning day`,
        [cutoff],
      );
      const gone = await q<{ id: number }>("delete from product_events where at < $1 returning id", [cutoff]);
      return { rolled: gone.rows.length, days: new Set(rows.map((r) => String(r.day))).size };
    });
  }

  /** Daily counts of one kind (rolled-up days and raw days together), oldest first. */
  async daily(kind: EventKind, from: Date): Promise<{ day: string; n: number }[]> {
    const { rows } = await this.db.query<{ day: string; n: string }>(
      `select to_char(day, 'YYYY-MM-DD') as day, sum(n) as n from (
         select day, n from product_events_daily where kind = $1 and day >= $2::date
         union all
         select (at at time zone 'UTC')::date as day, 1 as n from product_events where kind = $1 and at >= $2
       ) x group by day order by day`,
      [kind, from.toISOString()],
    );
    return rows.map((r) => ({ day: r.day, n: Number(r.n) }));
  }

  /** The funnel over [from, now): events per step, and per transition the conversion and the median time. */
  async funnel(from: Date): Promise<FunnelStep[]> {
    const since = from.toISOString();
    const { rows: counts } = await this.db.query<{ kind: string; n: string }>("select kind, count(*) as n from product_events where at >= $1 group by kind", [since]);
    const events = new Map(counts.map((r) => [r.kind, Number(r.n)]));
    const out: FunnelStep[] = [];
    for (const [i, step] of FUNNEL_STEPS.entries()) {
      const next = FUNNEL_STEPS[i + 1];
      let from: number | null = null;
      let reached: number | null = null;
      let medianSeconds: number | null = null;
      if (next?.link && LINKS.has(next.link)) {
        // The column name comes from the fixed list above, never from a request.
        const k = next.link;
        const { rows } = await this.db.query<{ from_n: string; reached: string; median: string | null }>(
          `with a as (select ${k} as k, min(at) as at from product_events where kind = $1 and at >= $3 and ${k} is not null group by ${k}),
                t as (select a.k, a.at, (select min(b.at) from product_events b where b.kind = $2 and b.${k} = a.k and b.at >= a.at) as reached_at from a)
           select count(*) as from_n, count(reached_at) as reached,
                  percentile_cont(0.5) within group (order by extract(epoch from reached_at - at)) filter (where reached_at is not null) as median
             from t`,
          [step.kind, next.kind, since],
        );
        from = num(rows[0]?.from_n);
        reached = num(rows[0]?.reached);
        medianSeconds = numOrNull(rows[0]?.median);
      }
      out.push({ kind: step.kind, events: events.get(step.kind) ?? 0, from, reached, medianSeconds });
    }
    return out;
  }

  /** Counts of one kind in the window by a props field (refusals by reason, limit hits by which), most first. */
  async countBy(kind: EventKind, field: string, from: Date): Promise<{ value: string; n: number }[]> {
    if (!/^[a-z][a-zA-Z]*$/.test(field)) throw new Error(`bad field ${field}`);
    const { rows } = await this.db.query<{ value: string | null; n: string }>(
      `select props->>$2 as value, count(*) as n from product_events where kind = $1 and at >= $3 group by 1 order by 2 desc, 1 limit 50`,
      [kind, field, from.toISOString()],
    );
    return rows.map((r) => ({ value: r.value ?? "", n: Number(r.n) }));
  }

  /** Median seconds and € of a kind's props.seconds and props.eur per tier (previews ready, whole sites). */
  async medianByTier(kind: EventKind, from: Date): Promise<{ tier: string; n: number; seconds: number | null; eur: number | null }[]> {
    const { rows } = await this.db.query<{ tier: string | null; n: string; seconds: string | null; eur: string | null }>(
      `select tier, count(*) as n,
              percentile_cont(0.5) within group (order by (props->>'seconds')::float) as seconds,
              percentile_cont(0.5) within group (order by (props->>'eur')::float) as eur
         from product_events where kind = $1 and at >= $2 group by tier order by tier`,
      [kind, from.toISOString()],
    );
    return rows.map((r) => ({ tier: r.tier ?? "", n: Number(r.n), seconds: numOrNull(r.seconds), eur: numOrNull(r.eur) }));
  }

  /** The generation rows of the window, newest first (at most `limit`): /admin/engine summarises them. */
  async generations(from: Date, limit = 5000): Promise<ProductEventRow[]> {
    const { rows } = await this.db.query<ProductEventRow>(
      `select id, at, kind, site_id, account_id, device_key, tier, plan, source, props from product_events
        where kind = 'generation' and at >= $1 order by at desc limit $2`,
      [from.toISOString(), limit],
    );
    return rows.map((r) => ({ ...r, id: Number(r.id), at: new Date(r.at).toISOString() }));
  }
}

/**
 * Writes an event when config `analytics.events` is on. Never in the way of what the visitor is doing: a failure
 * to write is logged and ignored.
 */
export async function recordEvent(events: Pick<ProductEvents, "add">, config: Pick<AppConfig, "analytics">, e: ProductEvent, opts: { onceMinutes?: number } = {}): Promise<void> {
  if (!config.analytics.events) return;
  try {
    await events.add(e, opts);
  } catch (err) {
    console.error(`[events] ${e.kind} not written:`, (err as Error).message);
  }
}

// ---------- Engine telemetry (Step 3) ----------

/** One generation job's `generation` event props (apps/worker telemetry.ts writes them). */
export interface GenerationProps {
  scope: "home" | "full";
  outcome: "done" | "failed" | "refused";
  /** Wall-clock seconds of the whole job, and to its first saved version (null when none was saved). */
  seconds: number;
  firstVersionSeconds: number | null;
  /** Every model call's € of the job, and per pipeline stage seconds (wall clock, from the stage log) and €. */
  eur: number;
  stages: Record<string, { seconds: number; eur: number }>;
  /** On failure: the stage that was running (started, never done), and the error's class, not its message. */
  failedStage: string | null;
  error: string | null;
  /** The last check's failed checks by name (axe rule, horizontal scroll, lighthouse category …), and Lighthouse's scores. */
  checksFailed: string[];
  lighthouse: { performance: number; accessibility: number; bestPractices: number; seo: number } | null;
  /** Critique rounds and the issues each round named (the production pipeline has no judge score; the eval's judge is offline). */
  critique: { rounds: number; issues: number[] };
  pictures: number;
  /** Content-stage model calls beyond the first (validation and JSON retries). */
  retries: number;
  caps: { spend: boolean; pictures: boolean };
  direction: string | null;
  hero: string | null;
}

export interface EngineSummary {
  jobs: number;
  outcomes: Record<string, number>;
  medianSeconds: number | null;
  medianFirstVersionSeconds: number | null;
  medianEur: number | null;
  /** Per stage: jobs that ran it, median seconds and €. */
  stages: { stage: string; jobs: number; seconds: number | null; eur: number | null }[];
  failuresByStage: { stage: string; n: number }[];
  checksFailed: { check: string; n: number }[];
  capHits: { spend: number; pictures: number };
  pictures: { jobs: number; total: number };
  retries: number;
  directions: { direction: string; n: number }[];
  /** The slowest jobs, slowest first. */
  slowest: { at: string; siteId: string | null; tier: string | null; seconds: number; eur: number; outcome: string }[];
}

export function median(values: number[]): number | null {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m]! : (v[m - 1]! + v[m]!) / 2;
}

const tally = (values: string[]) => {
  const m = new Map<string, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
};

const PIPELINE_ORDER = ["classify", "brief", "design", "images", "imageGen", "content", "check", "critique"];

/** /admin/engine's numbers from a window's `generation` rows. */
export function engineSummary(rows: Pick<ProductEventRow, "at" | "site_id" | "tier" | "props">[], slowest = 5): EngineSummary {
  const jobs = rows.map((r) => ({ ...r, p: r.props as Partial<GenerationProps> }));
  // In the pipeline's order (jsonb keeps its own key order), stages it doesn't know after them.
  const rank = (s: string) => (PIPELINE_ORDER.indexOf(s) + 1 || PIPELINE_ORDER.length + 1);
  const stageNames = [...new Set(jobs.flatMap((j) => Object.keys(j.p.stages ?? {})))].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  return {
    jobs: jobs.length,
    outcomes: Object.fromEntries(tally(jobs.map((j) => j.p.outcome ?? "unknown"))),
    medianSeconds: median(jobs.map((j) => num(j.p.seconds))),
    medianFirstVersionSeconds: median(jobs.filter((j) => typeof j.p.firstVersionSeconds === "number").map((j) => j.p.firstVersionSeconds as number)),
    medianEur: median(jobs.map((j) => num(j.p.eur))),
    stages: stageNames.map((stage) => {
      const ran = jobs.map((j) => j.p.stages?.[stage]).filter((s): s is { seconds: number; eur: number } => !!s);
      return { stage, jobs: ran.length, seconds: median(ran.map((s) => num(s.seconds))), eur: median(ran.map((s) => num(s.eur))) };
    }),
    failuresByStage: tally(jobs.filter((j) => j.p.outcome === "failed").map((j) => j.p.failedStage ?? "unknown")).map(([stage, n]) => ({ stage, n })),
    checksFailed: tally(jobs.flatMap((j) => j.p.checksFailed ?? [])).map(([check, n]) => ({ check, n })),
    capHits: { spend: jobs.filter((j) => j.p.caps?.spend).length, pictures: jobs.filter((j) => j.p.caps?.pictures).length },
    pictures: { jobs: jobs.filter((j) => num(j.p.pictures) > 0).length, total: jobs.reduce((n, j) => n + num(j.p.pictures), 0) },
    retries: jobs.reduce((n, j) => n + num(j.p.retries), 0),
    directions: tally(jobs.map((j) => j.p.direction).filter((d): d is string => typeof d === "string")).map(([direction, n]) => ({ direction, n })),
    slowest: [...jobs]
      .sort((a, b) => num(b.p.seconds) - num(a.p.seconds))
      .slice(0, slowest)
      .map((j) => ({ at: j.at, siteId: j.site_id, tier: j.tier, seconds: num(j.p.seconds), eur: num(j.p.eur), outcome: j.p.outcome ?? "unknown" })),
  };
}
