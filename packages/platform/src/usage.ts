import type { Db, Query } from "./db.ts";

/**
 * Model spend per tier and the jobs that are still allowed to spend. Every model job a viewer starts
 * is an `ai_jobs` row written before it is queued (its estimate is held until its calls are logged);
 * every logged call carries its tier, account and job, so the real cost replaces the estimate.
 */

export type Tier = "anonymous" | "free" | "paid" | "admin";
export type Pool = "anonymous" | "free" | "paid";
export const POOLS: readonly Pool[] = ["anonymous", "free", "paid"];
/** The admin's jobs share the paid pool: a flood of free previews never blocks them. */
export const poolOf = (tier: Tier): Pool => (tier === "admin" ? "paid" : tier);

/** "alt": photo descriptions (the vision model) for photos the owner added in the editor. */
export type AiJobKind = "generate" | "edit" | "alt" | "hold";
/** "interrupted": the worker stopped (deploy, crash) before the job finished; like "failed", it isn't counted. */
export type AiJobStatus = "queued" | "done" | "failed" | "refused" | "released" | "interrupted";

export interface AiJobRow {
  id: string;
  kind: AiJobKind;
  scope: string | null;
  tier: Tier;
  pool: Pool;
  account_id: string | null;
  device_id: string | null;
  site_id: string | null;
  estimate_eur: number;
  status: AiJobStatus;
  created_at: string;
  expires_at: string | null;
  /** When a worker began it; null while it waits in the queue. */
  started_at: string | null;
  /** What it covers for the per-account caps: photos for "alt", 1 otherwise. */
  units: number;
}

/**
 * SQL: the job's pg-boss job still waits or runs (`j` is the ai_jobs row). pg-boss fails a job whose
 * worker stopped sending heartbeats, so a dead process's job stops being live within a minute or two.
 */
const LIVE_IN_QUEUE = "exists (select 1 from pgboss.job q where q.state in ('created', 'retry', 'active') and q.data->>'aiJobId' = j.id::text)";

export interface Spend {
  /** € logged. */
  spent: number;
  /** € still held for queued jobs (each: its estimate minus what it has logged so far). */
  held: number;
}

const TODAY = "date_trunc('day', now() at time zone 'utc') at time zone 'utc'";
/** Model calls' tier → pool, in SQL. */
const POOL_OF = "(case when tier = 'admin' then 'paid' else tier end)";
/** What a queued job may still spend. */
const HELD = "greatest(j.estimate_eur - coalesce((select sum(m.cost_eur) from model_calls m where m.ai_job_id = j.id), 0), 0)";
/** Jobs that hold money now: queued, and (holds) not expired. */
const LIVE = "j.status = 'queued' and (j.expires_at is null or j.expires_at > now())";

/** Reads (and the one write that reserves a job), on any query function: the pool or a transaction. */
export class UsageQueries {
  constructor(protected readonly q: Query) {}

  /** € spent by every model and image call since UTC midnight (the global cap's measure). */
  async spentToday(): Promise<number> {
    const { rows } = await this.q<{ n: string | number }>(`select coalesce(sum(cost_eur), 0) as n from model_calls where created_at >= ${TODAY}`);
    return Number(rows[0]?.n ?? 0);
  }

  /** One pool today: logged € and € held by its queued jobs and holds. */
  async pool(pool: Pool): Promise<Spend> {
    const spent = await this.q<{ n: string | number }>(`select coalesce(sum(cost_eur), 0) as n from model_calls where created_at >= ${TODAY} and ${POOL_OF} = $1`, [pool]);
    const held = await this.q<{ n: string | number }>(`select coalesce(sum(${HELD}), 0) as n from ai_jobs j where ${LIVE} and j.pool = $1`, [pool]);
    return { spent: Number(spent.rows[0]?.n ?? 0), held: Number(held.rows[0]?.n ?? 0) };
  }

  /** A paid account's AI spend since `since` (its allowance period), counting only its charged jobs. */
  async accountSpend(accountId: string, since: Date): Promise<Spend> {
    const spent = await this.q<{ n: string | number }>(
      "select coalesce(sum(cost_eur), 0) as n from model_calls where account_id = $1 and tier = 'paid' and ai_job_id is not null and created_at >= $2",
      [accountId, since.toISOString()],
    );
    const held = await this.q<{ n: string | number }>(`select coalesce(sum(${HELD}), 0) as n from ai_jobs j where ${LIVE} and j.account_id = $1 and j.tier = 'paid'`, [accountId]);
    return { spent: Number(spent.rows[0]?.n ?? 0), held: Number(held.rows[0]?.n ?? 0) };
  }

  /**
   * Jobs of one kind that count against an allowance: queued or done (failed, refused and interrupted jobs
   * don't). With `allStatuses`, every attempt counts (the per-IP limit). With `units`, their units are
   * summed instead (photos of "alt" jobs).
   */
  async countJobs(f: { kind: "generate" | "edit" | "alt"; tiers: Tier[]; accountId?: string; deviceId?: string; ipKey?: string; sinceHours?: number; allStatuses?: boolean; units?: boolean }): Promise<number> {
    const where = ["kind = $1", "tier = any($2::text[])"];
    const params: unknown[] = [f.kind, f.tiers];
    const add = (sql: string, v: unknown) => {
      params.push(v);
      where.push(sql.replace("?", `$${params.length}`));
    };
    if (f.accountId) add("account_id = ?", f.accountId);
    if (f.deviceId) add("device_id = ?", f.deviceId);
    if (f.ipKey) add("ip_key = ?", f.ipKey);
    if (f.sinceHours) add("created_at > now() - make_interval(hours => ?::integer)", f.sinceHours);
    if (!f.allStatuses) where.push("status in ('queued', 'done')");
    const { rows } = await this.q<{ n: string | number }>(`select ${f.units ? "coalesce(sum(units), 0)" : "count(*)"} as n from ai_jobs where ${where.join(" and ")}`, params);
    return Number(rows[0]?.n ?? 0);
  }

  async insertJob(j: { kind: AiJobKind; scope?: string | null; tier: Tier; accountId?: string | null; deviceId?: string | null; ipKey?: string; siteId?: string | null; estimateEur: number; expiresInMinutes?: number; units?: number }): Promise<string> {
    const { rows } = await this.q<{ id: string | number }>(
      `insert into ai_jobs (kind, scope, tier, pool, account_id, device_id, ip_key, site_id, estimate_eur, expires_at, units)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, case when $10::integer is null then null else now() + make_interval(mins => $10::integer) end, $11)
       returning id`,
      [j.kind, j.scope ?? null, j.tier, poolOf(j.tier), j.accountId ?? null, j.deviceId ?? null, j.ipKey ?? "", j.siteId ?? null, j.estimateEur, j.expiresInMinutes ?? null, j.units ?? 1],
    );
    return String(rows[0]!.id);
  }
}

const QUOTA_LOCK = 727_274_002;

export class Usage extends UsageQueries {
  constructor(private readonly db: Db) {
    super(db.query.bind(db) as Query);
  }

  /**
   * Runs `fn` holding the one quota lock (across processes): the counts it reads can't change before
   * its insert, so ten requests at once still get one free preview. `fn` must use only the queries it
   * is handed (on PGlite any other query would wait for this transaction).
   */
  async withQuotaLock<T>(fn: (u: UsageQueries) => Promise<T>): Promise<T> {
    return this.db.transaction(async (q) => {
      await q("select pg_advisory_xact_lock($1)", [QUOTA_LOCK]);
      return fn(new UsageQueries(q));
    });
  }

  async getJob(id: string | number): Promise<AiJobRow | null> {
    if (!/^\d+$/.test(String(id))) return null;
    const { rows } = await this.db.query<AiJobRow & { estimate_eur: string | number; id: string | number }>("select * from ai_jobs where id = $1", [id]);
    const r = rows[0];
    return r ? { ...r, id: String(r.id), estimate_eur: Number(r.estimate_eur) } : null;
  }

  async setJobSite(id: string, siteId: string): Promise<void> {
    await this.db.query("update ai_jobs set site_id = $2 where id = $1", [id, siteId]);
  }

  /**
   * An anonymous upload ticket's job, taken for its upload: once (one statement), by the device it was
   * issued to, while still queued. False when it was used, released or isn't this device's.
   */
  async claimTicketJob(id: string, deviceId: string, siteId: string): Promise<boolean> {
    if (!/^\d+$/.test(id)) return false;
    const { rows } = await this.db.query(
      "update ai_jobs set site_id = $3 where id = $1 and device_id = $2 and kind = 'generate' and status = 'queued' and site_id is null returning id",
      [id, deviceId, siteId],
    );
    return rows.length > 0;
  }

  /** A new ticket for this device ends its earlier unused ones (an abandoned upload doesn't use up the preview). */
  async releaseUnclaimedTickets(deviceId: string): Promise<number> {
    const { rows } = await this.db.query(
      "update ai_jobs set status = 'failed', finished_at = now() where device_id = $1 and kind = 'generate' and status = 'queued' and site_id is null returning id",
      [deviceId],
    );
    return rows.length;
  }

  /** The job is over: its logged calls are now its whole cost. Only a queued job changes. */
  async finishJob(id: string | number, status: Exclude<AiJobStatus, "queued">): Promise<void> {
    await this.db.query("update ai_jobs set status = $2, finished_at = now() where id = $1 and status = 'queued'", [id, status]);
  }

  /** A worker began the job: from now on it is stale only when it runs too long (endStaleJobs). */
  async startJob(id: string | number): Promise<void> {
    if (!/^\d+$/.test(String(id))) return;
    await this.db.query("update ai_jobs set started_at = now() where id = $1 and status = 'queued' and started_at is null", [id]);
  }

  /** The SQL that says a job is still waiting or running in pg-boss, or "false" when there is no queue (tests, seeds). */
  private async liveInQueue(): Promise<string> {
    const queue = (await this.db.query<{ t: string | null }>("select to_regclass('pgboss.job')::text as t")).rows[0]?.t;
    return queue ? LIVE_IN_QUEUE : "false";
  }

  /** € logged by one job's calls. */
  async jobCost(id: string | number): Promise<number> {
    const { rows } = await this.db.query<{ n: string | number }>("select coalesce(sum(cost_eur), 0) as n from model_calls where ai_job_id = $1", [id]);
    return Number(rows[0]?.n ?? 0);
  }

  /** Every pool's logged € between two instants (the daily spend line). Untagged calls (eval, older rows) apart. */
  async spendByPool(from: Date, to: Date): Promise<Record<Pool | "untagged", number>> {
    const { rows } = await this.db.query<{ pool: string | null; n: string | number }>(
      `select ${POOL_OF} as pool, coalesce(sum(cost_eur), 0) as n from model_calls where created_at >= $1 and created_at < $2 group by 1`,
      [from.toISOString(), to.toISOString()],
    );
    const out: Record<Pool | "untagged", number> = { anonymous: 0, free: 0, paid: 0, untagged: 0 };
    for (const r of rows) out[r.pool && (POOLS as readonly string[]).includes(r.pool) ? (r.pool as Pool) : "untagged"] += Number(r.n);
    return out;
  }

  // ---------- The admin's pool holds (pause a pool; the deployed smoke test empties the free pools) ----------

  async hold(pool: Pool, eur: number, minutes: number): Promise<string> {
    const tier: Tier = pool;
    return this.insertJob({ kind: "hold", tier, estimateEur: eur, expiresInMinutes: minutes });
  }

  async releaseHolds(pool?: Pool): Promise<number> {
    const { rows } = await this.db.query(
      `update ai_jobs set status = 'released', finished_at = now() where kind = 'hold' and status = 'queued'${pool ? " and pool = $1" : ""} returning id`,
      pool ? [pool] : [],
    );
    return rows.length;
  }

  async holds(): Promise<{ pool: Pool; eur: number; until: string }[]> {
    const { rows } = await this.db.query<{ pool: Pool; estimate_eur: string | number; expires_at: string }>(
      "select pool, estimate_eur, expires_at from ai_jobs j where kind = 'hold' and " + LIVE + " order by id",
    );
    return rows.map((r) => ({ pool: r.pool, eur: Number(r.estimate_eur), until: r.expires_at }));
  }

  /** Whose spend a site's untracked calls are (photo descriptions): its owner's tier and account; the admin's when it has none. */
  async siteOwner(siteId: string): Promise<{ tier: Tier; accountId: string | null }> {
    const { rows } = await this.db.query<{ account_id: string | null; device_id: string | null; allowed: string | null }>(
      `select s.account_id, s.device_id, l.added_at as allowed
         from sites s left join accounts a on a.id = s.account_id left join allow_list l on l.email_key = a.email_key
        where s.id = $1`,
      [siteId],
    );
    const r = rows[0];
    if (r?.account_id) return { tier: r.allowed ? "paid" : "free", accountId: r.account_id };
    return { tier: r?.device_id ? "anonymous" : "admin", accountId: null };
  }

  // ---------- Anonymous previews ----------

  /** On sign-in: the device's unclaimed previews (and their jobs) become the account's. */
  async claimDevice(deviceId: string, accountId: string): Promise<string[]> {
    const { rows } = await this.db.query<{ id: string }>(
      "update sites set account_id = $2, device_id = null, updated_at = now() where device_id = $1 and account_id is null returning id",
      [deviceId, accountId],
    );
    if (rows.length) await this.db.query("update ai_jobs set account_id = $2 where device_id = $1 and account_id is null and kind <> 'hold'", [deviceId, accountId]);
    return rows.map((r) => r.id);
  }

  /** The device's unclaimed previews, newest first. */
  async deviceSites(deviceId: string): Promise<{ id: string; created_at: string }[]> {
    const { rows } = await this.db.query<{ id: string; created_at: string }>(
      "select id, created_at from sites where device_id = $1 and account_id is null order by created_at desc",
      [deviceId],
    );
    return rows;
  }

  /** Unclaimed anonymous previews older than `days`. */
  async expiredAnonymousSites(days: number): Promise<string[]> {
    const { rows } = await this.db.query<{ id: string }>(
      "select id from sites where account_id is null and device_id is not null and created_at < now() - make_interval(secs => $1::double precision)",
      [days * 86400],
    );
    return rows.map((r) => r.id);
  }

  // ---------- Housekeeping ----------

  /**
   * Queued jobs no worker finished (deploy, crash) stop holding money; expired holds end. A started job is
   * stale `minutes` after it started (not after it was queued: a backlog doesn't end a job that hasn't run
   * yet). A job that never started is stale `minutes` after it was queued only when pg-boss has no waiting
   * or running job for it (an unused upload ticket, a send that never happened).
   */
  async endStaleJobs(minutes: number): Promise<number> {
    const live = await this.liveInQueue();
    const { rows } = await this.db.query(
      `update ai_jobs j set status = case when kind = 'hold' then 'released' else 'failed' end, finished_at = now()
        where status = 'queued' and (
          (kind = 'hold' and expires_at <= now())
          or (kind <> 'hold' and started_at is not null and started_at < now() - make_interval(mins => $1::integer))
          or (kind <> 'hold' and started_at is null and created_at < now() - make_interval(mins => $1::integer) and not ${live})
        )
        returning id`,
      [minutes],
    );
    return rows.length;
  }

  /**
   * Started jobs whose pg-boss job is no longer waiting or running (its worker died, or shut down and failed
   * it) are marked interrupted: they hold nothing and aren't counted. Without a queue table nothing changes.
   */
  async interruptOrphans(): Promise<string[]> {
    const live = await this.liveInQueue();
    if (live === "false") return [];
    const { rows } = await this.db.query<{ id: string | number }>(
      `update ai_jobs j set status = 'interrupted', finished_at = now()
        where status = 'queued' and kind <> 'hold' and started_at is not null and not ${live}
        returning id`,
    );
    return rows.map((r) => String(r.id));
  }

  /** IP keys serve only the 24-hour limit; the privacy policy says they're gone after a day. */
  async clearOldIpKeys(): Promise<void> {
    await this.db.query("update ai_jobs set ip_key = '' where ip_key <> '' and created_at < now() - interval '1 day'");
  }
}
