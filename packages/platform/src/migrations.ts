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
];

export async function migrate(db: Db): Promise<number[]> {
  await db.query(`create table if not exists schema_migrations (id integer primary key, name text not null, applied_at timestamptz not null default now())`);
  const { rows } = await db.query<{ id: number }>("select id from schema_migrations");
  const applied = new Set(rows.map((r) => Number(r.id)));
  const ran: number[] = [];
  for (const m of MIGRATIONS) {
    if (applied.has(m.id)) continue;
    await db.query("begin");
    try {
      for (const stmt of splitSql(m.sql)) await db.query(stmt);
      await db.query("insert into schema_migrations (id, name) values ($1, $2)", [m.id, m.name]);
      await db.query("commit");
      ran.push(m.id);
    } catch (e) {
      await db.query("rollback");
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
