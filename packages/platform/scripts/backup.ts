/**
 * pnpm db:backup [--check]
 *
 * Without --check: pg_dump of DATABASE_URL to the bucket as backups/<UTC date>.sql.gz (config backups),
 * backups older than keepDays deleted, then the check. With --check: only the check (newest backup exists, is
 * recent, unpacks, is complete and not much smaller than the one before). Storage from the same variables as
 * the app (STORAGE_DRIVER, S3_* or the Railway bucket's). Exits 1 when the check fails. Never prints the
 * database URL or keys.
 */
import { appendFileSync } from "node:fs";
import { loadConfig } from "@sb/config";
import { checkBackups, pgDump, storageFromEnv, writeBackup } from "../src/index.ts";

const checkOnly = process.argv.includes("--check");
const policy = loadConfig().backups;
const storage = storageFromEnv();
const lines: string[] = [];
const say = (s: string) => {
  console.log(s);
  lines.push(s);
};

if (!checkOnly) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set");
    process.exit(2);
  }
  const t0 = Date.now();
  const r = await writeBackup(storage, policy, () => pgDump(url));
  say(`backup: wrote ${r.key}, ${r.bytes} bytes (${r.sqlBytes} bytes of SQL) in ${((Date.now() - t0) / 1000).toFixed(1)} s${r.pruned.length ? `; deleted ${r.pruned.length} older than ${policy.keepDays} days` : ""}`);
}
const c = await checkBackups(storage, policy);
say(c.latest ? `check: ${c.count} backup(s), newest ${c.latest.key} (${c.latest.bytes} bytes)${c.previous ? `, before it ${c.previous.key} (${c.previous.bytes} bytes)` : ""}` : "check: no backups");
for (const p of c.problems) say(`check FAILED: ${p}`);
if (c.ok) say("check: ok");
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Backup\n\n${lines.map((l) => `- ${l}`).join("\n")}\n\n`);
process.exitCode = c.ok ? 0 : 1;
