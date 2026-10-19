/**
 * pnpm db:backup [--check]
 *
 * Without --check: pg_dump of DATABASE_URL to the bucket as backups/<UTC date>.sql.gz (config backups),
 * backups older than keepDays deleted, then the check. With --check: only the check (newest backup exists, is
 * recent, unpacks, is complete and not much smaller than the one before). Storage from the same variables as
 * the app (STORAGE_DRIVER, S3_* or the Railway bucket's). Ends with one summary line (`backup: ok …` or
 * `backup: FAILED: …`) and exits 1 when the backup or the check fails. Never prints the database URL or keys.
 * Runs nightly as Railway's `backup` cron service (Dockerfile.backup, PostgreSQL 18 client).
 */
import { appendFileSync } from "node:fs";
import { loadConfig } from "@sb/config";
import { checkBackups, pgDump, storageFromEnv, writeBackup } from "../src/index.ts";

const checkOnly = process.argv.includes("--check");
const lines: string[] = [];
const say = (s: string) => {
  console.log(s);
  lines.push(s);
};

let summary: string;
let ok = false;
try {
  const policy = loadConfig().backups;
  const storage = storageFromEnv();
  let wrote = "";
  if (!checkOnly) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    const t0 = Date.now();
    const r = await writeBackup(storage, policy, () => pgDump(url));
    wrote = ` (wrote ${r.key}, ${r.bytes} bytes)`;
    say(`backup: wrote ${r.key}, ${r.bytes} bytes (${r.sqlBytes} bytes of SQL) in ${((Date.now() - t0) / 1000).toFixed(1)} s${r.pruned.length ? `; deleted ${r.pruned.length} older than ${policy.keepDays} days` : ""}`);
  }
  const c = await checkBackups(storage, policy);
  say(c.latest ? `check: ${c.count} backup(s), newest ${c.latest.key} (${c.latest.bytes} bytes)${c.previous ? `, before it ${c.previous.key} (${c.previous.bytes} bytes)` : ""}` : "check: no backups");
  for (const p of c.problems) say(`check FAILED: ${p}`);
  ok = c.ok;
  summary = ok ? `backup: ok${wrote}; ${c.count} backup(s) kept, the newest checked` : `backup: FAILED: the check found ${c.problems.length} problem(s)`;
} catch (e) {
  summary = `backup: FAILED: ${(e as Error).message.split("\n")[0]}`;
}
say(summary);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Backup\n\n${lines.map((l) => `- ${l}`).join("\n")}\n\n`);
process.exitCode = ok ? 0 : 1;
