import path from "node:path";
import { mkdirSync } from "node:fs";
import pg from "pg";
import { PGlite } from "@electric-sql/pglite";

export interface QueryResult<T> {
  rows: T[];
}

/** The small database surface the app uses; satisfied by a pg Pool and by PGlite. */
export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
  close(): Promise<void>;
  /** "postgres" for a server, "pglite" for the embedded engine (tests and Docker-less dev). */
  kind: "postgres" | "pglite";
  /** The raw handle, for pg-boss. */
  raw: pg.Pool | PGlite;
}

/**
 * DATABASE_URL forms:
 * - postgres://user:pass@host:5432/db — a real server (Docker Compose locally, Railway Postgres deployed)
 * - pglite://./.data/pg — embedded Postgres in a directory (no Docker)
 * - pglite://memory — in-memory (tests)
 */
export async function createDb(url: string): Promise<Db> {
  if (url.startsWith("pglite://")) {
    const target = url.slice("pglite://".length);
    let dataDir: string | undefined;
    if (target !== "memory") {
      dataDir = path.resolve(target);
      mkdirSync(dataDir, { recursive: true });
    }
    const lite = dataDir ? await PGlite.create(dataDir) : await PGlite.create();
    return {
      kind: "pglite",
      raw: lite,
      query: async <T>(sql: string, params?: unknown[]) => {
        const r = await lite.query<T>(sql, params as never[]);
        return { rows: r.rows };
      },
      close: () => lite.close(),
    };
  }
  const pool = new pg.Pool({
    connectionString: url,
    max: 10,
    ssl: /sslmode=require/.test(url) ? { rejectUnauthorized: false } : undefined,
  });
  return {
    kind: "postgres",
    raw: pool,
    query: async <T>(sql: string, params?: unknown[]) => {
      const r = await pool.query(sql, params);
      return { rows: r.rows as T[] };
    },
    close: () => pool.end(),
  };
}
