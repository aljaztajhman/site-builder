import type pg from "pg";
import type { Db } from "./db.ts";

/**
 * SQL (`s` is the site): its current version was saved by a generation ('generate' or its 'critique') after
 * the site's last run started (every run logs "classify start" first), so the last run saved it.
 */
const SAVED_BY_LAST_RUN = `exists (
        select 1 from spec_versions v
         where v.site_id = s.id and v.version = s.current_version and v.source in ('generate', 'critique')
           and v.created_at >= (select max(e.created_at) from site_events e where e.site_id = s.id and e.stage = 'classify' and e.message = 'start'))`;

/** Append-only list of SQL migrations. Never edit or rename an applied one (the name identifies it); add a new entry. */
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
    id: 6,
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
  {
    id: 7,
    name: "publish_lock",
    // Set while one publish writes its release: a second publish of the same site waits its turn instead
    // of deleting the first one's half-written files. A stale value (a crashed publish) expires.
    sql: `
      alter table sites add column publishing_since timestamptz;
    `,
  },
  {
    id: 8,
    name: "spec_versions.keep_reason",
    // Why retention keeps a version forever regardless of its day; null = the normal rules. 'replaced': the
    // version an "Ustvari znova" (a generation) replaced (sb-keep-replaced). Backfilled for every kept
    // version that a generation followed.
    sql: `
      alter table spec_versions add column keep_reason text;
      update spec_versions v set keep_reason = 'replaced'
       where exists (select 1 from spec_versions n where n.site_id = v.site_id and n.version = v.version + 1 and n.source = 'generate');
    `,
  },
  {
    id: 9,
    name: "sites.image_seq",
    // The highest image number ever issued on a site, so an id is never issued twice (Repo.claimImageNumbers):
    // photo_seq for the owner's img_NN, generated_seq for generated img_gN. Their files are named by the id,
    // so a reissued id overwrote the pictures older versions show. Backfilled from every stored version and
    // the intake photos (the pipeline numbers those img_01..N).
    sql: `
      alter table sites add column photo_seq integer not null default 0;
      alter table sites add column generated_seq integer not null default 0;
      update sites s set
        photo_seq = greatest(
          case when jsonb_typeof(s.intake -> 'photoAssetIds') = 'array' then jsonb_array_length(s.intake -> 'photoAssetIds') else 0 end,
          coalesce((select max(substring(img ->> 'id' from '^img_([0-9]{1,9})$')::integer)
             from spec_versions v
             cross join lateral jsonb_array_elements(case when jsonb_typeof(v.spec -> 'assets' -> 'images') = 'array' then v.spec -> 'assets' -> 'images' else '[]'::jsonb end) img
            where v.site_id = s.id), 0)),
        generated_seq = coalesce((select max(substring(img ->> 'id' from '^img_g([0-9]{1,9})$')::integer)
             from spec_versions v
             cross join lateral jsonb_array_elements(case when jsonb_typeof(v.spec -> 'assets' -> 'images') = 'array' then v.spec -> 'assets' -> 'images' else '[]'::jsonb end) img
            where v.site_id = s.id), 0);
    `,
  },
  {
    id: 10,
    name: "ai_jobs.started_at",
    // started_at: when a worker began the job (null while it waits in the queue), so a stale job is measured
    // from its start, not from when it was queued. units: what the job covers, for per-account caps that
    // count more than jobs (photos in an 'alt' job; 1 otherwise).
    sql: `
      alter table ai_jobs add column started_at timestamptz;
      alter table ai_jobs add column units integer not null default 1;
    `,
  },
  {
    id: 11,
    name: "form_messages.notify",
    // The owner's email notification for each contact-form message. notify_status: 'none' (nobody to tell:
    // the site has no owner account, or the message came before notifications existed), 'pending' (being
    // sent, or waiting for a retry), 'sent', 'failed' (attempts used up). notify_attempts counts sends tried;
    // notify_at is the last attempt. The message itself is always stored first, so a failed send loses nothing.
    // form_messages_sender_all serves the per-visitor limit across all sites.
    sql: `
      alter table form_messages add column notify_status text not null default 'none';
      alter table form_messages add column notify_attempts integer not null default 0;
      alter table form_messages add column notify_at timestamptz;
      create index form_messages_notify on form_messages(notify_status, created_at);
      create index form_messages_sender_all on form_messages(sender_key, created_at);
    `,
  },
  {
    id: 12,
    name: "model_calls.pending",
    // A paid call's reservation under the daily cap (Usage.reserveCall): a model_calls row at the call's
    // estimate, pending until the call is over, then settled to its real cost or deleted. Every sum of
    // cost_eur (the cap, the pools, a job's cost) counts calls in flight. One never settled (its process
    // died mid-call) stays booked at its estimate: we may have been billed.
    sql: `alter table model_calls add column pending boolean not null default false`,
  },
  {
    id: 13,
    name: "sites.failed_after_save",
    // A generation that failed after it saved a version (e.g. the deployed Pekarna Kvas, whose critique failed
    // on 2026-09-29) left a usable site "failed"; the worker now leaves such a site "ready". Sites still
    // failed whose current version a generation saved after its last run started get the same.
    sql: `
      insert into site_events (site_id, stage, level, message)
      select s.id, 'check', 'warn', 'Status set back to ready: the failed generation had saved this version'
        from sites s
       where s.status = 'failed' and ${SAVED_BY_LAST_RUN};
      update sites s set status = 'ready', updated_at = now()
       where s.status = 'failed' and ${SAVED_BY_LAST_RUN};
    `,
  },
  {
    id: 14,
    name: "url_checks",
    // The public website checker (/pregled): one row per check, its id the report's unguessable link.
    // url is what the visitor typed (normalised), host for counting; result is the worker's report.
    // ip_key is a keyed hash for the per-visitor limit, cleared after a day; rows go after checker.keepDays.
    sql: `
      create table url_checks (
        id text primary key,
        url text not null,
        host text not null,
        status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
        result jsonb,
        error text,
        ip_key text not null default '',
        device_id text,
        created_at timestamptz not null default now(),
        finished_at timestamptz
      );
      create index url_checks_ip on url_checks(ip_key, created_at);
      create index url_checks_created on url_checks(created_at);
    `,
  },
  {
    id: 15,
    name: "site_stats",
    // Cookieless counts per published site and day (Europe/Ljubljana): page views, taps on call and
    // directions links, contact-form messages. Totals only: nothing about a visitor is stored.
    // stats_reports: the monthly report email per site and month ('YYYY-MM'), sent at most once.
    sql: `
      create table site_stats (
        site_id text not null references sites(id) on delete cascade,
        day date not null,
        visits integer not null default 0,
        calls integer not null default 0,
        directions integer not null default 0,
        forms integer not null default 0,
        primary key (site_id, day)
      );
      create table stats_reports (
        site_id text not null references sites(id) on delete cascade,
        month text not null,
        status text not null default 'pending' check (status in ('pending', 'sent', 'none', 'failed')),
        attempts integer not null default 0,
        last_attempt_at timestamptz not null default now(),
        primary key (site_id, month)
      );
    `,
  },
  {
    id: 17,
    name: "allow_list.plan",
    // sb-tiers: which paid plan an allow-listed account has (Osnovni or Plus); everyone listed so far had the one plan.
    sql: `alter table allow_list add column plan text not null default 'standard' check (plan in ('standard', 'premium'))`,
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
  const { rows } = await q("select id, name from schema_migrations");
  const byId = new Map(rows.map((r) => [Number(r.id), String(r.name)]));
  // A migration is known by its name, so never rename one. A database that ran a branch before a merge
  // gave its migration another number (a Railway PR environment) has it recorded under the old id: its
  // SQL is not run again, only the record moves, and the migration that now owns that id still runs.
  const appliedNames = new Set(rows.map((r) => String(r.name)));
  const ran: number[] = [];
  for (const m of MIGRATIONS) {
    if (byId.get(m.id) === m.name) continue;
    const run = !appliedNames.has(m.name);
    await q("begin");
    try {
      if (run) for (const stmt of splitSql(m.sql)) await q(stmt);
      await q("delete from schema_migrations where name = $1 and id <> $2", [m.name, m.id]);
      await q("insert into schema_migrations (id, name) values ($1, $2) on conflict (id) do update set name = excluded.name", [m.id, m.name]);
      await q("commit");
      if (run) ran.push(m.id);
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
