/**
 * pnpm db:restore-drill
 *
 * The restore drill (docs/dev/workflow.md §4): the newest backup in the bucket is restored into a throwaway
 * database on the same server as DATABASE_URL (`drill_<UTC timestamp>`; on Railway that URL's user owns the
 * server), every table's row count is compared with the live database (same tables; live ≥ backup outside
 * pg-boss), a short report is printed and the throwaway database is always dropped. Storage from the same
 * variables as the app. Exits 1 on a mismatch or any failure. Never prints the database URL or keys.
 * psql must be on PATH, its major version at least the server's (Dockerfile.backup has the PostgreSQL 18 client).
 */
import { loadConfig } from "@sb/config";
import { postgresDrillSteps, runRestoreDrill, storageFromEnv } from "../src/index.ts";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(2);
}

let ok = false;
try {
  const r = await runRestoreDrill(postgresDrillSteps(url, storageFromEnv(), loadConfig().backups.prefix));
  for (const l of r.lines) console.log(`restore-drill: ${l}`);
  ok = r.ok;
} catch (e) {
  console.log(`restore-drill: FAILED: ${(e as Error).message.split("\n")[0]}`);
}
console.log(`restore-drill: ${ok ? "ok" : "FAILED"}`);
process.exitCode = ok ? 0 : 1;
