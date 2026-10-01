import type { AppConfig } from "@sb/config";
import { POOLS, type Platform, type Pool, type Repo } from "@sb/platform";

/**
 * Scheduled work in the worker: expired anonymous previews are deleted with their files, IP hashes and
 * old sign-in tokens are cleared, queued jobs nobody finished stop holding money; and the spend per
 * pool is logged once a day, with a warning when a pool passes `tiers.pools.warnAt`.
 */

export interface Log {
  log(line: string): void;
  warn(line: string): void;
}

/** One housekeeping pass. Returns what it removed. */
export async function cleanupExpired(platform: Pick<Platform, "repo" | "storage">, config: AppConfig): Promise<{ sites: string[]; staleJobs: number }> {
  const { repo, storage } = platform;
  const sites = await repo.usage.expiredAnonymousSites(config.tiers.anonymous.keepDays);
  for (const id of sites) {
    // Files first: a site row without files is harmless, files without a row would never be found again.
    await storage.deletePrefix(`sites/${id}/`);
    await repo.db.query("delete from sites where id = $1 and account_id is null", [id]);
  }
  const staleJobs = await repo.usage.endStaleJobs(30);
  await repo.usage.clearOldIpKeys();
  await repo.accounts.cleanup();
  return { sites, staleJobs };
}

const day = (d: Date) => d.toISOString().slice(0, 10);
const eur = (n: number) => `€${n.toFixed(2)}`;
const startOfDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

export function spendMonitor(repo: Repo, config: AppConfig, out: Log = console) {
  const warned = new Set<string>();
  let lastLine = "";
  const size = (pool: Pool) => config.tiers.pools[pool] * config.limits.dailyModelSpendCapEur;

  /** "[spend] 2026-10-01 total €4.12 of €10.00 · anonymous €1.20 of €3.00 (40%) · …" for one UTC day. */
  async function dailyLine(d: Date): Promise<string> {
    const from = startOfDay(d);
    const to = new Date(from.getTime() + 86400_000);
    const by = await repo.usage.spendByPool(from, to);
    const total = by.anonymous + by.free + by.paid + by.untagged;
    const parts = POOLS.map((p) => `${p} ${eur(by[p])} of ${eur(size(p))} (${Math.round((by[p] / (size(p) || 1)) * 100)}%)`);
    return `[spend] ${day(from)} total ${eur(total)} of ${eur(config.limits.dailyModelSpendCapEur)} · ${parts.join(" · ")} · untagged ${eur(by.untagged)}`;
  }

  return {
    dailyLine,
    /**
     * Warns once per pool and day when its logged spend passes warnAt (held estimates and the admin's
     * holds are not spend; they're in the line for context). Returns the warnings.
     */
    async check(now = new Date()): Promise<string[]> {
      const lines: string[] = [];
      for (const pool of POOLS) {
        const s = await repo.usage.pool(pool);
        const key = `${day(now)}:${pool}`;
        if (size(pool) > 0 && s.spent >= config.tiers.pools.warnAt * size(pool) && !warned.has(key)) {
          warned.add(key);
          const line = `[spend] WARNING pool ${pool} at ${Math.round((s.spent / size(pool)) * 100)}% (${eur(s.spent)} of ${eur(size(pool))}, ${eur(s.held)} held for running jobs) on ${day(now)}`;
          out.warn(line);
          lines.push(line);
        }
      }
      return lines;
    },
    /** The previous UTC day's line, once per day (and today's so far the first time). */
    async daily(now = new Date()): Promise<string | null> {
      const today = day(now);
      if (lastLine === today) return null;
      const line = lastLine === "" ? `${await dailyLine(now)} (so far)` : await dailyLine(new Date(startOfDay(now).getTime() - 1));
      lastLine = today;
      out.log(line);
      return line;
    },
  };
}
