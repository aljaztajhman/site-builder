/**
 * Runs `fn` over `items` with at most `limit` running at once, and returns the results in input order.
 * For storage round trips (a publish writes 50-100 files; one at a time that is seconds on S3). The first
 * failure rejects; calls already running finish but their results are dropped.
 */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!, i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, worker));
  return out;
}

/** Storage calls in flight at once for one publish, export or media load. */
export const STORAGE_CONCURRENCY = 8;
