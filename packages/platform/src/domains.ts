import type { Db } from "./db.ts";

export type DomainKind = "registered" | "connected";
export type DomainStatus = "pending" | "active" | "failed";

export interface SiteDomainRow {
  hostname: string;
  site_id: string;
  kind: DomainKind;
  status: DomainStatus;
  /** Where provisioning is (registration, DNS, certificate …); free text owned by the provisioning job. */
  step: string;
  is_primary: boolean;
  /** Providers' ids and the last error. */
  detail: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  active_at: string | null;
  /** Failed attempts of the current step (migration 18). */
  attempts: number;
  /** When the provisioning job runs this domain next; null when nothing is due. */
  next_at: string | null;
  /** A provisioning run holds the domain until then. */
  lease_until: string | null;
  /** Why provisioning failed, as a code (the owner's sentence is worded from it); null otherwise. */
  failure: string | null;
  /** The owner's "your domain is live" email. */
  notify: "none" | "pending" | "sent" | "failed";
  notify_attempts: number;
}

/** What a provisioning run writes back: the step it reached and when it runs next. */
export interface DomainProgress {
  status?: DomainStatus;
  step?: string;
  detail?: Record<string, unknown>;
  /** Detail keys to drop (e.g. the registrant's contact data once the registrar holds it). */
  forget?: string[];
  attempts?: number;
  /** Seconds from now; null clears it (nothing due). */
  nextInSeconds?: number | null;
  failure?: string | null;
  notify?: SiteDomainRow["notify"];
  /** The run's lease (from `claim`): the write lets go of the lease only while it is still this one. */
  lease?: string;
}

/** A domain one provisioning run holds; `lease` names this run's hold (release and progress compare it). */
export type ClaimedDomain = SiteDomainRow & { lease: string };

/** A hostname as stored and looked up: lower case, no port, no trailing dot. Null when it isn't a hostname. */
export function normaliseHostname(raw: string): string | null {
  const host = raw.trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
  if (host.length > 253 || !host.includes(".")) return null;
  // Letters, digits and hyphens per label (IDN names arrive as punycode, xn--…), no label longer than 63.
  return host.split(".").every((l) => /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(l)) ? host : null;
}

/** A site's own domain names (site_domains, migration 16). */
export class SiteDomains {
  constructor(private readonly db: Db) {}

  /** Adds a hostname to a site, pending. The first hostname of a site is its primary. */
  async add(siteId: string, hostname: string, kind: DomainKind): Promise<SiteDomainRow> {
    const host = normaliseHostname(hostname);
    if (!host) throw new Error(`Not a hostname: ${hostname}`);
    const { rows } = await this.db.query<SiteDomainRow>(
      `insert into site_domains (hostname, site_id, kind, is_primary)
       values ($1, $2, $3, not exists (select 1 from site_domains where site_id = $2 and is_primary))
       returning *`,
      [host, siteId, kind],
    );
    return rows[0]!;
  }

  async get(hostname: string): Promise<SiteDomainRow | null> {
    const host = normaliseHostname(hostname);
    if (!host) return null;
    const { rows } = await this.db.query<SiteDomainRow>("select * from site_domains where hostname = $1", [host]);
    return rows[0] ?? null;
  }

  /** The site's hostnames, primary first. */
  async forSite(siteId: string): Promise<SiteDomainRow[]> {
    const { rows } = await this.db.query<SiteDomainRow>("select * from site_domains where site_id = $1 order by is_primary desc, created_at, hostname", [siteId]);
    return rows;
  }

  /** Moves provisioning on; `detail` is merged into what is stored. Becoming active stamps active_at once. */
  async update(hostname: string, change: { status?: DomainStatus; step?: string; detail?: Record<string, unknown> }): Promise<void> {
    await this.db.query(
      `update site_domains set
         status = coalesce($2, status),
         step = coalesce($3, step),
         detail = detail || $4::jsonb,
         active_at = case when coalesce($2, status) = 'active' and active_at is null then now() else active_at end,
         updated_at = now()
       where hostname = $1`,
      [hostname, change.status ?? null, change.step ?? null, JSON.stringify(change.detail ?? {})],
    );
  }

  /** Makes one of the site's hostnames its primary (the others redirect to it). */
  async setPrimary(siteId: string, hostname: string): Promise<void> {
    await this.db.transaction(async (q) => {
      await q("update site_domains set is_primary = false, updated_at = now() where site_id = $1 and is_primary and hostname <> $2", [siteId, hostname]);
      await q("update site_domains set is_primary = true, updated_at = now() where site_id = $1 and hostname = $2", [siteId, hostname]);
    });
  }

  async remove(hostname: string): Promise<void> {
    await this.db.query("delete from site_domains where hostname = $1", [hostname]);
  }

  /** Adds a hostname pending and due now, with what provisioning starts from in `detail`. */
  async start(siteId: string, hostname: string, kind: DomainKind, detail: Record<string, unknown>): Promise<SiteDomainRow> {
    const host = normaliseHostname(hostname);
    if (!host) throw new Error(`Not a hostname: ${hostname}`);
    const { rows } = await this.db.query<SiteDomainRow>(
      `insert into site_domains (hostname, site_id, kind, is_primary, detail, next_at)
       values ($1, $2, $3, not exists (select 1 from site_domains where site_id = $2 and is_primary), $4::jsonb, now())
       returning *`,
      [host, siteId, kind, JSON.stringify(detail)],
    );
    return rows[0]!;
  }

  /**
   * Takes a pending domain for one provisioning run: only when nobody holds it (or the holder's lease ran
   * out, a dead process) and, unless `force`, only when it is due. Null when someone else has it or it isn't pending.
   * The lease's exact expiry (as text, microseconds kept) is the run's token for `release` and `progress`.
   */
  async claim(hostname: string, leaseSeconds: number, force = false): Promise<ClaimedDomain | null> {
    const { rows } = await this.db.query<ClaimedDomain>(
      `update site_domains set lease_until = clock_timestamp() + make_interval(secs => $2::integer)
        where hostname = $1 and status = 'pending'
          and (lease_until is null or lease_until < now())
          and ($3 or next_at is null or next_at <= now())
        returning *, lease_until::text as lease`,
      [hostname, leaseSeconds, force],
    );
    return rows[0] ?? null;
  }

  /** Writes a run's progress and lets go of the lease. */
  async progress(hostname: string, p: DomainProgress): Promise<void> {
    await this.db.query(
      `update site_domains set
         status = coalesce($2, status),
         step = coalesce($3, step),
         detail = (detail || $4::jsonb) - $5::text[],
         attempts = coalesce($6, attempts),
         next_at = case when $7::boolean then (case when $8::integer is null then null else now() + make_interval(secs => $8::integer) end) else next_at end,
         failure = case when $9::boolean then $10 else failure end,
         notify = coalesce($11, notify),
         active_at = case when coalesce($2, status) = 'active' and active_at is null then now() else active_at end,
         lease_until = case when $12::text is null or lease_until = $12::timestamptz then null else lease_until end,
         updated_at = now()
       where hostname = $1`,
      [
        hostname,
        p.status ?? null,
        p.step ?? null,
        JSON.stringify(p.detail ?? {}),
        p.forget ?? [],
        p.attempts ?? null,
        p.nextInSeconds !== undefined,
        p.nextInSeconds ?? null,
        p.failure !== undefined,
        p.failure ?? null,
        p.notify ?? null,
        p.lease ?? null,
      ],
    );
  }

  /**
   * Lets go of this run's lease without changing anything. A lease another run holds by now (ours ran
   * out and it claimed the domain) is left alone.
   */
  async release(hostname: string, lease: string): Promise<void> {
    await this.db.query("update site_domains set lease_until = null where hostname = $1 and lease_until = $2::timestamptz", [hostname, lease]);
  }

  /** Pending domains whose next step is due and that nobody holds: the worker's sweep queues them. */
  async due(limit = 50): Promise<string[]> {
    const { rows } = await this.db.query<{ hostname: string }>(
      `select hostname from site_domains
        where status = 'pending' and next_at is not null and next_at <= now() and (lease_until is null or lease_until < now())
        order by next_at limit $1`,
      [limit],
    );
    return rows.map((r) => r.hostname);
  }

  /** Starts a failed domain over from the step it failed at (the owner tapped "Poskusi znova"). */
  async retry(hostname: string): Promise<boolean> {
    const { rows } = await this.db.query(
      `update site_domains set status = 'pending', attempts = 0, failure = null, next_at = now(), lease_until = null,
              detail = detail - 'stepSince' - 'waits', updated_at = now()
        where hostname = $1 and status = 'failed' returning hostname`,
      [hostname],
    );
    return rows.length > 0;
  }

  /** "Live" emails to send: active domains whose email is pending and not tried too often. */
  async dueNotifications(maxAttempts: number, limit = 50): Promise<SiteDomainRow[]> {
    const { rows } = await this.db.query<SiteDomainRow>(
      "select * from site_domains where notify = 'pending' and status = 'active' and notify_attempts < $1 order by active_at limit $2",
      [maxAttempts, limit],
    );
    return rows;
  }

  /** Takes a pending "live" email for one attempt (counted); of two processes only one gets it. */
  async claimNotification(hostname: string, attempts: number): Promise<boolean> {
    const { rows } = await this.db.query(
      "update site_domains set notify_attempts = notify_attempts + 1 where hostname = $1 and notify = 'pending' and notify_attempts = $2 returning hostname",
      [hostname, attempts],
    );
    return rows.length > 0;
  }

  async setNotification(hostname: string, notify: SiteDomainRow["notify"]): Promise<void> {
    await this.db.query("update site_domains set notify = $2 where hostname = $1", [hostname, notify]);
  }
}
