/**
 * pnpm db:migrate-check [--file <dump.sql | dump.sql.gz>] [--allow-shrink]
 *
 * Restores a backup into MIGRATE_CHECK_DATABASE_URL (an empty throwaway database; anything with tables is
 * refused) and runs the pending migrations against it, ours then pg-boss's, as the app does at start
 * (docs/dev/workflow.md §4). The backup is --file, or else the newest one in the bucket (storage variables as
 * for the app). Fails when a migration fails, or when a table outside pg-boss lost rows: a migration that
 * drops or rewrites data needs the owner's approval in HQ first, and then --allow-shrink.
 */
import { appendFileSync, readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { loadConfig } from "@sb/config";
import { MIGRATIONS, assertEmptyDatabase, createDb, createQueue, latestBackupSql, migrateRestored, restoreSql, storageFromEnv } from "../src/index.ts";

const args = process.argv.slice(2);
const fileArg = args.includes("--file") ? args[args.indexOf("--file") + 1] : undefined;
const allowShrink = args.includes("--allow-shrink");
const url = process.env.MIGRATE_CHECK_DATABASE_URL;
if (!url) {
  console.error("MIGRATE_CHECK_DATABASE_URL is not set (an empty throwaway Postgres database)");
  process.exit(2);
}
if (url === process.env.DATABASE_URL) {
  console.error("MIGRATE_CHECK_DATABASE_URL is the app's DATABASE_URL; the check needs a throwaway database");
  process.exit(2);
}

const config = loadConfig();
let source: { name: string; sql: Uint8Array };
if (fileArg) {
  const data = readFileSync(fileArg);
  source = { name: fileArg, sql: fileArg.endsWith(".gz") ? gunzipSync(data) : data };
} else {
  const latest = await latestBackupSql(storageFromEnv(), config.backups.prefix);
  if (!latest) {
    console.error(`no backup under ${config.backups.prefix} in the bucket`);
    process.exit(1);
  }
  source = { name: latest.key, sql: latest.sql };
}

const db = await createDb(url);
const lines: string[] = [];
const say = (s: string) => {
  console.log(s);
  lines.push(s);
};
let ok = false;
try {
  await assertEmptyDatabase(db);
  const t0 = Date.now();
  await restoreSql(url, source.sql);
  say(`restored ${source.name} (${source.sql.length} bytes of SQL) in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  const names = new Map(MIGRATIONS.map((m) => [m.id, m.name]));
  const r = await migrateRestored(db, async () => {
    const queue = await createQueue(db, url, { heartbeatSeconds: config.worker.heartbeatSeconds });
    await queue.stop();
  });
  say(`backup had migrations up to ${Math.max(0, ...r.before)}; ran ${r.ran.length}${r.ran.length ? `: ${r.ran.map((id) => `${id} ${names.get(id)}`).join(", ")}` : ""}; pg-boss started`);
  const changed = Object.keys({ ...r.rowsBefore, ...r.rowsAfter }).filter((t) => r.rowsBefore[t] !== r.rowsAfter[t] && !t.startsWith("pgboss."));
  for (const t of changed) say(`rows ${t}: ${r.rowsBefore[t] ?? "—"} → ${r.rowsAfter[t] ?? "dropped"}`);
  if (!changed.length) say(`rows: unchanged in ${Object.keys(r.rowsAfter).filter((t) => !t.startsWith("pgboss.")).length} tables`);
  if (r.shrunk.length && !allowShrink) say(`FAILED: rows lost in ${r.shrunk.join(", ")}; a migration that drops or rewrites data needs the owner's approval in HQ, then --allow-shrink`);
  else if (r.shrunk.length) say(`rows lost in ${r.shrunk.join(", ")} (allowed: --allow-shrink)`);
  ok = !r.shrunk.length || allowShrink;
} catch (e) {
  say(`FAILED: ${(e as Error).message.split("\n")[0]}`);
  console.error(e);
} finally {
  await db.close();
}
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Migrate-check\n\n${lines.map((l) => `- ${l}`).join("\n")}\n\n`);
process.exitCode = ok ? 0 : 1;
