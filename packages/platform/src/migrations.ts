import type pg from "pg";
import type { Db } from "./db.ts";

/** Append-only list of SQL migrations. Never edit an applied one; add a new entry. */
export const MIGRATIONS: { id: number; name: string; sql: string }[] = [
  {
    id: 1,
    name: "initial",
    sql: `
      create table sites (
        id text primary key,
        slug text not null unique,
        name text not null,
        status text not null default 'new',
        current_version integer,
        published_version integer,
        published_at timestamptz,
        intake jsonb not null default '{}'::jsonb,
        brief jsonb,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );

      create table spec_versions (
        site_id text not null references sites(id) on delete cascade,
        version integer not null,
        spec jsonb not null,
        source text not null,
        message text,
        created_at timestamptz not null default now(),
        primary key (site_id, version)
      );

      create table assets (
        id text primary key,
        site_id text not null references sites(id) on delete cascade,
        kind text not null,
        storage_key text not null,
        mime text not null,
        width integer,
        height integer,
        bytes integer not null,
        original_name text,
        created_at timestamptz not null default now()
      );
      create index assets_site on assets(site_id);

      create table site_events (
        id bigserial primary key,
        site_id text not null references sites(id) on delete cascade,
        job_id text,
        stage text not null,
        level text not null default 'info',
        message text not null,
        data jsonb,
        created_at timestamptz not null default now()
      );
      create index site_events_site on site_events(site_id, id);

      create table chat_messages (
        id bigserial primary key,
        site_id text not null references sites(id) on delete cascade,
        role text not null,
        content text not null,
        result jsonb,
        created_at timestamptz not null default now()
      );
      create index chat_messages_site on chat_messages(site_id, id);

      create table model_calls (
        id bigserial primary key,
        site_id text,
        job_id text,
        stage text not null,
        model text not null,
        input_tokens integer not null,
        output_tokens integer not null,
        cache_creation_tokens integer not null default 0,
        cache_read_tokens integer not null default 0,
        cost_eur numeric(12, 6) not null,
        duration_ms integer not null,
        ok boolean not null default true,
        created_at timestamptz not null default now()
      );
      create index model_calls_day on model_calls(created_at);
      create index model_calls_site on model_calls(site_id);
    `,
  },
  {
    id: 2,
    name: "spec_versions.patch",
    sql: `alter table spec_versions add column patch jsonb`,
  },
  {
    id: 3,
    name: "form_messages",
    // sender_key is a keyed hash of the visitor's IP, used only for rate limits; the IP itself is never stored.
    sql: `
      create table form_messages (
        id bigserial primary key,
        site_id text not null references sites(id) on delete cascade,
        section_id text not null,
        name text not null,
        email text not null,
        phone text,
        message text not null,
        sender_key text not null,
        created_at timestamptz not null default now()
      );
      create index form_messages_site on form_messages(site_id, id);
      create index form_messages_sender on form_messages(site_id, sender_key, created_at);
    `,
  },
  {
    id: 4,
    name: "version retention",
    // site_publishes: every publish, so retention keeps every version that was ever published (not only
    // the live one). Backfilled from the publish log and the live version.
    // pruned_patches: the direct-editor operations of pruned manual versions. The fact check reads the
    // text the owner typed from them (Repo.manualPatches), so pruning never turns a typed fact into an
    // "invented" one.
    sql: `
      create table site_publishes (
        id bigserial primary key,
        site_id text not null references sites(id) on delete cascade,
        version integer not null,
        release text,
        created_at timestamptz not null default now()
      );
      create index site_publishes_site on site_publishes(site_id, version);
      insert into site_publishes (site_id, version, created_at)
        select site_id, substring(message from '^Published version ([0-9]+)$')::integer, created_at
          from site_events where stage = 'publish' and message ~ '^Published version [0-9]+$';
      insert into site_publishes (site_id, version, created_at)
        select s.id, s.published_version, coalesce(s.published_at, now()) from sites s
         where s.published_version is not null
           and not exists (select 1 from site_publishes p where p.site_id = s.id and p.version = s.published_version);
      create table pruned_patches (
        site_id text not null references sites(id) on delete cascade,
        version integer not null,
        patch jsonb not null,
        primary key (site_id, version)
      );
    `,
  },
  {
    id: 5,
    name: "accounts",
    // Owner accounts (magic link only). Tokens and sessions are stored as SHA-256 hashes of the random
    // value the browser holds. ip_key is a keyed hash of the requester's IP for rate limits, cleared after a day.
    sql: `
      create table accounts (
        id text primary key,
        email text not null,
        email_key text not null unique,
        created_at timestamptz not null default now(),
        last_login_at timestamptz
      );

      create table allow_list (
        email_key text primary key,
        email text not null,
        note text,
        added_at timestamptz not null default now()
      );

      create table login_tokens (
        token_hash text primary key,
        email text not null,
        email_key text not null,
        next text,
        device_id text,
        ip_key text not null default '',
        created_at timestamptz not null default now(),
        expires_at timestamptz not null,
        used_at timestamptz
      );
      create index login_tokens_email on login_tokens(email_key, created_at);
      create index login_tokens_ip on login_tokens(ip_key, created_at);

      create table sessions (
        token_hash text primary key,
        account_id text not null references accounts(id) on delete cascade,
        created_at timestamptz not null default now(),
        expires_at timestamptz not null
      );
      create index sessions_account on sessions(account_id);

      alter table sites add column account_id text references accounts(id) on delete set null;
      create index sites_account on sites(account_id);
    `,
  },
  {
    id: 5,
    name: "generation_limits",
    // ai_jobs: one row per model job a viewer starts (generate, chat edit), written before it is queued, so
    // its estimated cost is held until its calls are logged; also the admin's pool holds (kind 'hold').
    // sites.device_id: the device that made an unclaimed anonymous preview. ip_key: keyed hash, cleared after a day.
    sql: `
      alter table sites add column device_id text;
      create index sites_device on sites(device_id);

      create table ai_jobs (
        id bigserial primary key,
        kind text not null,
        scope text,
        tier text not null,
        pool text not null,
        account_id text,
        device_id text,
        ip_key text not null default '',
        site_id text,
        estimate_eur numeric(12, 6) not null,
        status text not null default 'queued',
        created_at timestamptz not null default now(),
        expires_at timestamptz,
        finished_at timestamptz
      );
      create index ai_jobs_account on ai_jobs(account_id, kind);
      create index ai_jobs_device on ai_jobs(device_id, kind);
      create index ai_jobs_ip on ai_jobs(ip_key, created_at);
      create index ai_jobs_queued on ai_jobs(status, pool);

      alter table model_calls add column tier text;
      alter table model_calls add column account_id text;
      alter table model_calls add column ai_job_id bigint;
      create index model_calls_ai_job on model_calls(ai_job_id);
      create index model_calls_account on model_calls(account_id, created_at);
    `,
  },
];

type Query = (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;

/**
 * Applies pending migrations. On Postgres all statements run on one dedicated connection (so BEGIN
 * and COMMIT wrap the same session) under an advisory lock, so web and worker starting together
 * never migrate at the same time.
 */
export async function migrate(db: Db): Promise<number[]> {
  if (db.kind === "postgres") {
    const client = await (db.raw as pg.Pool).connect();
    const q: Query = async (sql, params) => ({ rows: (await client.query(sql, params)).rows as Record<string, unknown>[] });
    try {
      await q("select pg_advisory_lock($1)", [MIGRATION_LOCK]);
      return await runMigrations(q);
    } finally {
      await q("select pg_advisory_unlock($1)", [MIGRATION_LOCK]).catch(() => undefined);
      client.release();
    }
  }
  return runMigrations((sql, params) => db.query(sql, params));
}

const MIGRATION_LOCK = 727_274_001;

async function runMigrations(q: Query): Promise<number[]> {
  await q(`create table if not exists schema_migrations (id integer primary key, name text not null, applied_at timestamptz not null default now())`);
  const { rows } = await q("select id from schema_migrations");
  const applied = new Set(rows.map((r) => Number(r.id)));
  const ran: number[] = [];
  for (const m of MIGRATIONS) {
    if (applied.has(m.id)) continue;
    await q("begin");
    try {
      for (const stmt of splitSql(m.sql)) await q(stmt);
      await q("insert into schema_migrations (id, name) values ($1, $2)", [m.id, m.name]);
      await q("commit");
      ran.push(m.id);
    } catch (e) {
      await q("rollback");
      throw e;
    }
  }
  return ran;
}

/** Splits on semicolons at line ends; migrations here contain no procedural bodies. */
function splitSql(sql: string): string[] {
  return sql
    .split(/;\s*\n/)
    .map((s) => s.trim().replace(/;$/, ""))
    .filter(Boolean);
}
