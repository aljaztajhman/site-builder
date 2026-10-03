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
}

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
}
