import { randomBytes } from "node:crypto";
import type { SiteSpec } from "@sb/spec";
import type { Db } from "./db.ts";

export type SiteStatus = "new" | "generating" | "ready" | "editing" | "publishing" | "failed";

export interface SiteRow {
  id: string;
  slug: string;
  name: string;
  status: SiteStatus;
  current_version: number | null;
  published_version: number | null;
  published_at: string | null;
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
export class Repo {
  constructor(readonly db: Db) {}

  async createSite(input: { name: string; slug: string; intake: Intake }): Promise<SiteRow> {
    const id = newId("site");
    const { rows } = await this.db.query<SiteRow>(
      "insert into sites (id, slug, name, intake) values ($1, $2, $3, $4) returning *",
      [id, input.slug, input.name, JSON.stringify(input.intake)],
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

  async listSites(): Promise<SiteRow[]> {
    const { rows } = await this.db.query<SiteRow>("select * from sites order by created_at desc limit 200");
    return rows;
  }

  async setStatus(id: string, status: SiteStatus): Promise<void> {
    await this.db.query("update sites set status = $2, updated_at = now() where id = $1", [id, status]);
  }

  /**
   * Sites left "generating"/"editing"/"publishing" by a job that died (deploy, crash). Jobs don't
   * retry (they cost money), so these are marked failed with an event and can be re-run by the user.
   */
  async failInterrupted(olderThanMinutes: number): Promise<string[]> {
    const { rows } = await this.db.query<{ id: string }>(
      `update sites set status = 'failed', updated_at = now()
        where status in ('generating', 'editing', 'publishing') and updated_at <= now() - make_interval(mins => $1::integer)
        returning id`,
      [olderThanMinutes],
    );
    for (const r of rows) await this.addEvent({ siteId: r.id, stage: "error", level: "error", message: "Opravilo je bilo prekinjeno (ponovni zagon strežnika). Poskusite znova." });
    return rows.map((r) => r.id);
  }

  async setBrief(id: string, brief: unknown, name?: string): Promise<void> {
    await this.db.query("update sites set brief = $2, name = coalesce($3, name), updated_at = now() where id = $1", [
      id,
      JSON.stringify(brief),
      name ?? null,
    ]);
  }

  /** Stores a new spec version and makes it current. Returns the version number. */
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
    // and insert it. current_version is always the highest version, so +1 is the next free number.
    const { rows } = await this.db.query<{ version: number }>(
      `with claimed as (
         update sites set current_version = coalesce(current_version, 0) + 1, updated_at = now()
          where id = $1 and ($6::integer is null or current_version = $6)
          returning current_version as v
       )
       insert into spec_versions (site_id, version, spec, source, message, patch)
       select $1, v, $2, $3, $4, $5 from claimed
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
    return { version: Number(r.version), spec: typeof r.spec === "string" ? (JSON.parse(r.spec) as SiteSpec) : r.spec };
  }

  /** Operations of every manual (direct editor) change, oldest first. */
  async manualPatches(siteId: string): Promise<unknown[]> {
    const { rows } = await this.db.query<{ patch: unknown }>(
      "select patch from spec_versions where site_id = $1 and source = 'manual' and patch is not null order by version",
      [siteId],
    );
    return rows.map((r) => (typeof r.patch === "string" ? JSON.parse(r.patch) : r.patch));
  }

  async listVersions(siteId: string): Promise<{ version: number; source: string; message: string | null; created_at: string }[]> {
    const { rows } = await this.db.query<{ version: number; source: string; message: string | null; created_at: string }>(
      "select version, source, message, created_at from spec_versions where site_id = $1 order by version desc",
      [siteId],
    );
    return rows;
  }

  async markPublished(siteId: string, version: number): Promise<void> {
    await this.db.query("update sites set published_version = $2, published_at = now(), updated_at = now() where id = $1", [siteId, version]);
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
      `insert into model_calls (site_id, job_id, stage, model, input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens, cost_eur, duration_ms, ok)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [c.siteId, c.jobId, c.stage, c.model, c.inputTokens, c.outputTokens, c.cacheCreationTokens, c.cacheReadTokens, c.costEur, c.durationMs, c.ok],
    );
  }

  /** € spent on model calls since UTC midnight. */
  async spendToday(): Promise<number> {
    const { rows } = await this.db.query<{ total: string | number | null }>(
      "select coalesce(sum(cost_eur), 0) as total from model_calls where created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'",
    );
    return Number(rows[0]?.total ?? 0);
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
