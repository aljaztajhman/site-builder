import path from "node:path";
import { mkdirSync } from "node:fs";
import pg from "pg";
import { PGlite } from "@electric-sql/pglite";

export interface QueryResult<T> {
  rows: T[];
}

export type Query = <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<QueryResult<T>>;

/** The small database surface the app uses; satisfied by a pg Pool and by PGlite. */
export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
  /** Runs `fn` in one transaction on one connection: committed when it resolves, rolled back when it throws. */
  transaction<T>(fn: (query: Query) => Promise<T>): Promise<T>;
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
      transaction: <T>(fn: (query: Query) => Promise<T>) =>
        lite.transaction(async (tx) =>
          fn((async <R>(sql: string, params?: unknown[]) => ({ rows: (await tx.query<R>(sql, params as never[])).rows })) as Query),
        ),
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
    async transaction<T>(fn: (query: Query) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      try {
        await client.query("begin");
        const r = await fn((async <R>(sql: string, params?: unknown[]) => ({ rows: (await client.query(sql, params)).rows as R[] })) as Query);
        await client.query("commit");
        return r;
      } catch (e) {
        await client.query("rollback").catch(() => undefined);
        throw e;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}
