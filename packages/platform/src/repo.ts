import { randomBytes } from "node:crypto";
import { SPEC_VERSION, migrateSpec, type SiteSpec } from "@sb/spec";
import type { Db } from "./db.ts";
import { Accounts } from "./accounts.ts";
import { Usage, type Tier } from "./usage.ts";

export type SiteStatus = "new" | "generating" | "ready" | "editing" | "publishing" | "failed";

export interface SiteRow {
  id: string;
  slug: string;
  name: string;
  status: SiteStatus;
  current_version: number | null;
  published_version: number | null;
  published_at: string | null;
  /** The owner's account; null for sites the admin made and for unclaimed anonymous previews. */
  account_id: string | null;
  /** The device that made an unclaimed anonymous preview (deleted after tiers.anonymous.keepDays); null once claimed. */
  device_id: string | null;
  /** Set while a publish writes its release (claimPublish); null otherwise. */
  publishing_since: string | null;
  /** The highest img_NN number ever issued on this site (claimImageNumbers). */
  photo_seq: number;
  /** The highest img_gN number ever issued on this site (claimImageNumbers). */
  generated_seq: number;
  intake: Intake;
  brief: unknown;
  created_at: string;
  updated_at: string;
}

export interface Intake {
  description: string;
  logoAssetId?: string;
  photoAssetIds: string[];
  /** Facts the client typed in structured fields, if any (none in phase 1's form). */
  scope: "home" | "full";
  /** The classifier's answer when the intake already asked it (junk check); the pipeline then doesn't ask again. */
  classification?: { businessType: string; confidence: number };
}

export interface AssetRow {
  id: string;
  site_id: string;
  kind: "logo" | "photo" | "media";
  storage_key: string;
  mime: string;
  width: number | null;
  height: number | null;
  bytes: number;
  original_name: string | null;
}

export interface EventRow {
  id: string;
  site_id: string;
  job_id: string | null;
  stage: string;
  level: "info" | "warn" | "error";
  message: string;
  data: unknown;
  created_at: string;
}

export interface ChatRow {
  id: string;
  site_id: string;
  role: "user" | "assistant";
  content: string;
  result: unknown;
  created_at: string;
}

export interface ModelCallRow {
  siteId: string | null;
  jobId: string | null;
  stage: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  costEur: number;
  durationMs: number;
  ok: boolean;
  /** Whose spend it is: the tier's pool, the account's allowance, the job that held its estimate. */
  tier?: Tier | null;
  accountId?: string | null;
  aiJobId?: string | number | null;
}

/** One row of a site's version list. */
export interface VersionListRow {
  version: number;
  source: string;
  message: string | null;
  created_at: string;
  /** Published at some point (every publish is kept by retention). */
  published: boolean;
}

/** Which versions retention keeps (config `versions.retention`). */
export interface RetentionPolicy {
  keepAllDays: number;
  timeZone: string;
}

/** A version retention removed: what it referenced (its spec's `assets`, raw as stored) and its stored size. */
export interface PrunedVersion {
  version: number;
  assets: unknown;
  bytes: number;
}

/** A save was based on a version that is no longer current (someone else saved in between). */
export class VersionConflictError extends Error {
  constructor(
    readonly siteId: string,
    readonly baseVersion: number | null,
  ) {
    super(`Site ${siteId} changed since version ${baseVersion}`);
    this.name = "VersionConflictError";
  }
}

export function newId(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}

/** Data access. Plain SQL; every query is parameterised. */
export interface FormMessageRow {
  id: string;
  section_id: string;
  name: string;
  email: string;
  phone: string | null;
  message: string;
  created_at: string;
}

export class Repo {
  /** Accounts, allow-list, magic-link tokens and sessions. */
  readonly accounts: Accounts;

  /** Model spend per tier, queued jobs and their held estimates, anonymous previews. */
  readonly usage: Usage;

  constructor(readonly db: Db) {
    this.accounts = new Accounts(db);
    this.usage = new Usage(db);
  }

  async createSite(input: { id?: string; name: string; slug: string; intake: Intake; accountId?: string | null; deviceId?: string | null }): Promise<SiteRow> {
    const id = input.id ?? newId("site");
    const { rows } = await this.db.query<SiteRow>(
      "insert into sites (id, slug, name, intake, account_id, device_id) values ($1, $2, $3, $4, $5, $6) returning *",
      [id, input.slug, input.name, JSON.stringify(input.intake), input.accountId ?? null, input.deviceId ?? null],
    );
    return rows[0]!;
  }

  async uniqueSlug(base: string): Promise<string> {
    const clean = base.slice(0, 40).replace(/-+$/g, "") || "stran";
    for (let i = 0; i < 50; i++) {
      const slug = i === 0 ? clean : `${clean}-${i + 1}`;
      const { rows } = await this.db.query("select 1 from sites where slug = $1", [slug]);
      if (rows.length === 0) return slug;
    }
    return `${clean}-${randomBytes(3).toString("hex")}`;
  }

  async getSite(id: string): Promise<SiteRow | null> {
    const { rows } = await this.db.query<SiteRow>("select * from sites where id = $1", [id]);
    return rows[0] ?? null;
  }

  async getSiteBySlug(slug: string): Promise<SiteRow | null> {
    const { rows } = await this.db.query<SiteRow>("select * from sites where slug = $1", [slug]);
    return rows[0] ?? null;
  }

  /** Newest first: every site (admin), or one account's. */
  async listSites(filter: { accountId?: string } = {}): Promise<SiteRow[]> {
    const { rows } = filter.accountId
      ? await this.db.query<SiteRow>("select * from sites where account_id = $1 order by created_at desc limit 200", [filter.accountId])
      : await this.db.query<SiteRow>("select * from sites order by created_at desc limit 200");
    return rows;
  }

  async setStatus(id: string, status: SiteStatus): Promise<void> {
    await this.db.query("update sites set status = $2, updated_at = now() where id = $1", [id, status]);
  }

  /** Sets `to` only while the site is still in one of `from`; false when another job moved it meanwhile. */
  async setStatusIf(id: string, from: SiteStatus | SiteStatus[], to: SiteStatus): Promise<boolean> {
    const { rows } = await this.db.query("update sites set status = $3, updated_at = now() where id = $1 and status = any($2::text[]) returning id", [id, [from].flat(), to]);
    return rows.length > 0;
  }

  /**
   * Sites left "generating"/"editing"/"publishing" by a job that died (deploy, crash). Jobs don't
   * retry (they cost money), so these are marked failed with an event and can be re-run by the user.
   */
  async failInterrupted(olderThanMinutes: number): Promise<string[]> {
    // A site whose job still waits in the queue or runs (an overlapping deploy, a backlog) isn't
    // interrupted. pg-boss expires a job whose worker died (15 min), so it stops counting as live.
    const queue = (await this.db.query<{ t: string | null }>("select to_regclass('pgboss.job')::text as t")).rows[0]?.t;
    const live = queue ? "and not exists (select 1 from pgboss.job j where j.state in ('created', 'retry', 'active') and j.data->>'siteId' = sites.id)" : "";
    const { rows } = await this.db.query<{ id: string }>(
      `update sites set status = 'failed', updated_at = now()
        where status in ('generating', 'editing', 'publishing') and updated_at <= now() - make_interval(mins => $1::integer) ${live}
        returning id`,
      [olderThanMinutes],
    );
    for (const r of rows) await this.addEvent({ siteId: r.id, stage: "error", level: "error", message: "Opravilo je bilo prekinjeno (ponovni zagon strežnika). Poskusite znova." });
    return rows.map((r) => r.id);
  }

  /**
   * Issues `count` image numbers never issued on this site before (img_NN for "photo", img_gN for
   * "generated"): each image's files are named by its id, so a reissued id would overwrite the pictures
   * older versions show. `floor`: a number already in use that the counter may not know of (a spec saved
   * without claiming, the intake photos numbered 1..N). Atomic: concurrent claims never share a number.
   */
  async claimImageNumbers(siteId: string, kind: "photo" | "generated", count: number, floor = 0): Promise<number[]> {
    if (count <= 0) return [];
    const col = kind === "photo" ? "photo_seq" : "generated_seq";
    const { rows } = await this.db.query<{ last: number | string }>(`update sites set ${col} = greatest(${col}, $2::integer) + $3::integer where id = $1 returning ${col} as last`, [
      siteId,
      floor,
      count,
    ]);
    if (!rows[0]) throw new Error(`Site ${siteId} not found`);
    const last = Number(rows[0].last);
    return Array.from({ length: count }, (_, i) => last - count + 1 + i);
  }

  async setBrief(id: string, brief: unknown, name?: string): Promise<void> {
    await this.db.query("update sites set brief = $2, name = coalesce($3, name), updated_at = now() where id = $1", [
      id,
      JSON.stringify(brief),
      name ?? null,
    ]);
  }

  /**
   * Stores a new spec version and makes it current. Returns the version number.
   * A "generate" save is a (re)generation ("Ustvari znova", retry, homepage → full site): the version it
   * replaces is marked `keep_reason = 'replaced'`, so retention never removes it (sb-keep-replaced).
   */
  async saveSpec(
    siteId: string,
    spec: SiteSpec,
    source: "generate" | "critique" | "edit" | "manual" | "revert",
    message?: string,
    patch?: unknown,
    /** The version this change was based on. When given and no longer current, nothing is saved. */
    baseVersion?: number | null,
  ): Promise<number> {
    // One statement: claim the next version on the site row (row lock serialises concurrent saves)
    // and insert it. current_version is always the highest version, so +1 is the next free number and
    // v - 1 is the version this save replaces (the current one is never pruned).
    const { rows } = await this.db.query<{ version: number }>(
      `with claimed as (
         update sites set current_version = coalesce(current_version, 0) + 1, updated_at = now()
          where id = $1 and ($6::integer is null or current_version = $6)
          returning current_version as v
       ),
       keep_replaced as (
         update spec_versions set keep_reason = 'replaced'
          where $3::text = 'generate' and site_id = $1 and version = (select v - 1 from claimed)
       )
       insert into spec_versions (site_id, version, spec, source, message, patch)
       select $1, v, $2, $3::text, $4, $5 from claimed
       returning version`,
      [siteId, JSON.stringify(spec), source, message ?? null, patch === undefined ? null : JSON.stringify(patch), baseVersion ?? null],
    );
    if (!rows[0]) throw new VersionConflictError(siteId, baseVersion ?? null);
    return Number(rows[0].version);
  }

  async getSpec(siteId: string, version?: number): Promise<{ version: number; spec: SiteSpec } | null> {
    const { rows } = await this.db.query<{ version: number; spec: SiteSpec | string }>(
      version === undefined
        ? "select v.version, v.spec from spec_versions v join sites s on s.id = v.site_id and s.current_version = v.version where v.site_id = $1"
        : "select version, spec from spec_versions where site_id = $1 and version = $2",
      version === undefined ? [siteId] : [siteId, version],
    );
    const r = rows[0];
    if (!r) return null;
    const stored = (typeof r.spec === "string" ? JSON.parse(r.spec) : r.spec) as { specVersion?: unknown };
    // Specs are stored as written; older versions are migrated on read, so every caller sees the current version.
    const spec = typeof stored.specVersion === "number" && stored.specVersion < SPEC_VERSION ? migrateSpec(stored) : (stored as SiteSpec);
    return { version: Number(r.version), spec };
  }

  /** Operations of every manual (direct editor) change, oldest first, including those of pruned versions. */
  async manualPatches(siteId: string): Promise<unknown[]> {
    const { rows } = await this.db.query<{ patch: unknown }>(
      `select patch from (
         select version, patch from spec_versions where site_id = $1 and source = 'manual' and patch is not null
         union all
         select version, patch from pruned_patches where site_id = $1
       ) p order by version`,
      [siteId],
    );
    return rows.map((r) => (typeof r.patch === "string" ? JSON.parse(r.patch) : r.patch));
  }

  /** What the editor's poll compares: one small query instead of the whole site state. */
  async pulse(siteId: string): Promise<{ status: string; version: number | null; chat: number; lastEvent: number } | null> {
    const { rows } = await this.db.query<{ status: string; version: number | null; chat: string | number; last_event: string | number }>(
      `select s.status, s.current_version as version,
              (select count(*) from chat_messages c where c.site_id = s.id) as chat,
              (select coalesce(max(e.id), 0) from site_events e where e.site_id = s.id) as last_event
         from sites s where s.id = $1`,
      [siteId],
    );
    const r = rows[0];
    return r ? { status: r.status, version: r.version === null ? null : Number(r.version), chat: Number(r.chat), lastEvent: Number(r.last_event) } : null;
  }

  /** The kept versions, newest first. `published`: this version was published at some point (or is live). */
  async listVersions(siteId: string): Promise<VersionListRow[]> {
    const { rows } = await this.db.query<VersionListRow>(
      `select v.version, v.source, v.message, v.created_at,
              (v.version = s.published_version or exists (select 1 from site_publishes p where p.site_id = v.site_id and p.version = v.version)) as published
         from spec_versions v join sites s on s.id = v.site_id
        where v.site_id = $1 order by v.version desc`,
      [siteId],
    );
    return rows.map((r) => ({ ...r, version: Number(r.version), published: r.published === true }));
  }

  /** The highest kept version at or below `version` (retention may have pruned that one), or null. */
  async nearestVersion(siteId: string, version: number): Promise<number | null> {
    const { rows } = await this.db.query<{ v: number | null }>("select max(version) as v from spec_versions where site_id = $1 and version <= $2", [siteId, version]);
    return rows[0]?.v === null || rows[0]?.v === undefined ? null : Number(rows[0].v);
  }

  /** Sites that have a version older than `before`, so retention may have something to remove there. */
  async sitesWithVersionsBefore(before: Date): Promise<string[]> {
    const { rows } = await this.db.query<{ id: string }>(
      "select s.id from sites s where exists (select 1 from spec_versions v where v.site_id = s.id and v.created_at < $1) order by s.id",
      [before.toISOString()],
    );
    return rows.map((r) => r.id);
  }

  /**
   * Retention (config `versions.retention`): removes the versions of one site that are older than today
   * and the `keepAllDays` whole days before it, except the last version of each day, every version that
   * was ever published, every version a regeneration replaced (`keep_reason`), and the current one.
   * Days are local days in `timeZone`. Versions themselves never
   * change; the direct-editor operations of removed manual versions move to pruned_patches, so the text
   * the owner typed stays part of the fact corpus.
   *
   * One statement: it locks the site row (a save waits until it is done) and archives and deletes
   * together. Running it again removes nothing more. Returns what each removed version referenced
   * (`assets`, raw as stored) and its stored size, so the caller can remove files nothing else uses.
   */
  async pruneVersions(siteId: string, policy: RetentionPolicy, now = new Date()): Promise<PrunedVersion[]> {
    const { rows } = await this.db.query<{ version: number; assets: unknown; bytes: number | string }>(
      `with site as (
         select id, current_version, published_version from sites where id = $1 for update
       ),
       v as (
         select version, keep_reason, (created_at at time zone $2::text)::date as day from spec_versions where site_id = $1
       ),
       last_of_day as (
         select max(version) as version from v group by day
       ),
       doomed as (
         select v.version from v, site
          where v.day < ($3::timestamptz at time zone $2::text)::date - $4::integer
            and v.version not in (select version from last_of_day)
            and v.keep_reason is null
            and v.version is distinct from site.current_version
            and v.version is distinct from site.published_version
            and not exists (select 1 from site_publishes p where p.site_id = $1 and p.version = v.version)
       ),
       archived as (
         insert into pruned_patches (site_id, version, patch)
         select site_id, version, patch from spec_versions
          where site_id = $1 and version in (select version from doomed) and source = 'manual' and patch is not null
         on conflict do nothing
       ),
       removed as (
         delete from spec_versions where site_id = $1 and version in (select version from doomed)
         returning version, spec -> 'assets' as assets, pg_column_size(spec) as bytes
       )
       select version, assets, bytes from removed order by version`,
      [siteId, policy.timeZone, now.toISOString(), policy.keepAllDays],
    );
    return rows.map((r) => ({ version: Number(r.version), assets: typeof r.assets === "string" ? JSON.parse(r.assets) : r.assets, bytes: Number(r.bytes) }));
  }

  /** What every kept version references (`assets` as stored), for deciding which files are still used. */
  async versionAssets(siteId: string): Promise<{ version: number; assets: unknown }[]> {
    const { rows } = await this.db.query<{ version: number; assets: unknown }>(
      "select version, spec -> 'assets' as assets from spec_versions where site_id = $1 order by version",
      [siteId],
    );
    return rows.map((r) => ({ version: Number(r.version), assets: typeof r.assets === "string" ? JSON.parse(r.assets) : r.assets }));
  }

  /** Version count and size: as Postgres stores them (compressed) and as JSON text, for retention reports. */
  async versionStats(siteId: string): Promise<{ versions: number; bytes: number; jsonBytes: number }> {
    const { rows } = await this.db.query<{ n: number | string; bytes: number | string | null; json_bytes: number | string | null }>(
      "select count(*) as n, sum(pg_column_size(spec)) as bytes, sum(octet_length(spec::text)) as json_bytes from spec_versions where site_id = $1",
      [siteId],
    );
    return { versions: Number(rows[0]?.n ?? 0), bytes: Number(rows[0]?.bytes ?? 0), jsonBytes: Number(rows[0]?.json_bytes ?? 0) };
  }

  // ---------- Contact form messages ----------

  async addFormMessage(m: { siteId: string; sectionId: string; name: string; email: string; phone: string | null; message: string; senderKey: string }): Promise<string> {
    const { rows } = await this.db.query<{ id: string }>(
      "insert into form_messages (site_id, section_id, name, email, phone, message, sender_key) values ($1, $2, $3, $4, $5, $6, $7) returning id",
      [m.siteId, m.sectionId, m.name, m.email, m.phone, m.message, m.senderKey],
    );
    // The sender key only serves the rate limits (10 minutes, 1 day); the privacy policy promises it's gone after a day.
    await this.db.query("update form_messages set sender_key = '' where sender_key <> '' and created_at < now() - interval '1 day'");
    return String(rows[0]!.id);
  }

  /** Messages a site received in the last `minutes`, optionally from one sender (rate limits). */
  async countFormMessages(siteId: string, minutes: number, senderKey?: string): Promise<number> {
    const { rows } = await this.db.query<{ n: string | number }>(
      `select count(*) as n from form_messages where site_id = $1 and created_at > now() - make_interval(mins => $2::integer)${senderKey ? " and sender_key = $3" : ""}`,
      senderKey ? [siteId, minutes, senderKey] : [siteId, minutes],
    );
    return Number(rows[0]?.n ?? 0);
  }

  async listFormMessages(siteId: string): Promise<FormMessageRow[]> {
    const { rows } = await this.db.query<FormMessageRow>(
      "select id, section_id, name, email, phone, message, created_at from form_messages where site_id = $1 order by id desc limit 500",
      [siteId],
    );
    return rows.map((r) => ({ ...r, id: String(r.id) }));
  }

  async deleteFormMessage(siteId: string, id: string): Promise<boolean> {
    if (!/^\d+$/.test(id)) return false;
    const { rows } = await this.db.query("delete from form_messages where site_id = $1 and id = $2 returning id", [siteId, id]);
    return rows.length > 0;
  }

  /** Makes `version` the live one and records the publish (retention keeps every published version). */
  /** Claims the site for one publish; false while another publish (younger than `staleMinutes`) holds it. */
  async claimPublish(siteId: string, staleMinutes = 10): Promise<boolean> {
    const { rows } = await this.db.query(
      `update sites set publishing_since = now()
        where id = $1 and (publishing_since is null or publishing_since < now() - make_interval(mins => $2::integer))
        returning id`,
      [siteId, staleMinutes],
    );
    return rows.length > 0;
  }

  async releasePublish(siteId: string): Promise<void> {
    await this.db.query("update sites set publishing_since = null where id = $1", [siteId]);
  }

  async markPublished(siteId: string, version: number, release?: string): Promise<void> {
    await this.db.query(
      `with publish as (insert into site_publishes (site_id, version, release) values ($1, $2, $3))
       update sites set published_version = $2, published_at = now(), updated_at = now() where id = $1`,
      [siteId, version, release ?? null],
    );
  }

  async addAsset(a: Omit<AssetRow, "id"> & { id?: string }): Promise<AssetRow> {
    const id = a.id ?? newId("asset");
    const { rows } = await this.db.query<AssetRow>(
      `insert into assets (id, site_id, kind, storage_key, mime, width, height, bytes, original_name)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning *`,
      [id, a.site_id, a.kind, a.storage_key, a.mime, a.width, a.height, a.bytes, a.original_name],
    );
    return rows[0]!;
  }

  async listAssets(siteId: string): Promise<AssetRow[]> {
    const { rows } = await this.db.query<AssetRow>("select * from assets where site_id = $1 order by created_at, id", [siteId]);
    return rows;
  }

  /** Forgets uploads whose files were removed (retention). Returns how many rows went. */
  async deleteAssetsByKey(siteId: string, storageKeys: string[]): Promise<number> {
    if (storageKeys.length === 0) return 0;
    const { rows } = await this.db.query("delete from assets where site_id = $1 and storage_key = any($2::text[]) returning id", [siteId, storageKeys]);
    return rows.length;
  }

  async addEvent(e: { siteId: string; jobId?: string | null; stage: string; level?: EventRow["level"]; message: string; data?: unknown }): Promise<void> {
    await this.db.query("insert into site_events (site_id, job_id, stage, level, message, data) values ($1, $2, $3, $4, $5, $6)", [
      e.siteId,
      e.jobId ?? null,
      e.stage,
      e.level ?? "info",
      e.message,
      e.data === undefined ? null : JSON.stringify(e.data),
    ]);
  }

  async listEvents(siteId: string, afterId = 0): Promise<EventRow[]> {
    const { rows } = await this.db.query<EventRow>("select * from site_events where site_id = $1 and id > $2 order by id limit 500", [
      siteId,
      afterId,
    ]);
    return rows;
  }

  async addChat(siteId: string, role: ChatRow["role"], content: string, result?: unknown): Promise<ChatRow> {
    const { rows } = await this.db.query<ChatRow>(
      "insert into chat_messages (site_id, role, content, result) values ($1, $2, $3, $4) returning *",
      [siteId, role, content, result === undefined ? null : JSON.stringify(result)],
    );
    return rows[0]!;
  }

  async getChat(id: number): Promise<ChatRow | null> {
    const { rows } = await this.db.query<ChatRow>("select * from chat_messages where id = $1", [id]);
    return rows[0] ?? null;
  }

  async listChat(siteId: string): Promise<ChatRow[]> {
    const { rows } = await this.db.query<ChatRow>("select * from chat_messages where site_id = $1 order by id", [siteId]);
    return rows;
  }

  async logModelCall(c: ModelCallRow): Promise<void> {
    await this.db.query(
      `insert into model_calls (site_id, job_id, stage, model, input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens, cost_eur, duration_ms, ok, tier, account_id, ai_job_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [c.siteId, c.jobId, c.stage, c.model, c.inputTokens, c.outputTokens, c.cacheCreationTokens, c.cacheReadTokens, c.costEur, c.durationMs, c.ok, c.tier ?? null, c.accountId ?? null, c.aiJobId ?? null],
    );
  }

  /** € spent on model calls since UTC midnight. */
  /** Model spend today (UTC day), all tiers. */
  spendToday(): Promise<number> {
    return this.usage.spentToday();
  }

  async siteCost(siteId: string): Promise<{ stage: string; calls: number; input: number; output: number; cacheRead: number; cacheWrite: number; eur: number; ms: number }[]> {
    const { rows } = await this.db.query<Record<string, string | number>>(
      `select stage, count(*) as calls, sum(input_tokens) as input, sum(output_tokens) as output,
              sum(cache_read_tokens) as cache_read, sum(cache_creation_tokens) as cache_write,
              sum(cost_eur) as eur, sum(duration_ms) as ms
         from model_calls where site_id = $1 group by stage order by min(id)`,
      [siteId],
    );
    return rows.map((r) => ({
      stage: String(r.stage),
      calls: Number(r.calls),
      input: Number(r.input),
      output: Number(r.output),
      cacheRead: Number(r.cache_read),
      cacheWrite: Number(r.cache_write),
      eur: Number(r.eur),
      ms: Number(r.ms),
    }));
  }
}
