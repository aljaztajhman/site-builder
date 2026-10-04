import { loadConfig } from "@sb/config";
import { platformFromEnv } from "@sb/platform";
import { drainMs, startWorker } from "./worker.ts";

const config = loadConfig();
const platform = await platformFromEnv();
const worker = await startWorker(platform, config);
console.log("[worker] listening for generate, edit, alt (photo descriptions), prune (nightly version retention), check-url and domain jobs");

// SIGTERM (a Railway deploy): no new jobs; running ones get Railway's draining window (config worker),
// then the ones still running are marked interrupted so their sites offer a retry.
let stopping = false;
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    if (stopping) return;
    stopping = true;
    const drain = drainMs(config);
    console.log(`[worker] ${sig}: taking no new jobs, ${worker.running().length} running, waiting up to ${drain / 1000} s`);
    void worker
      .shutdown(drain)
      .then((r) => {
        if (r.interrupted.length) console.log(`[worker] marked ${r.interrupted.length} unfinished job(s) interrupted: ${r.interrupted.map((j) => `${j.queue} ${j.siteId}`).join(", ")}`);
      })
      .catch((e: unknown) => console.error("[worker] shutdown", e))
      .finally(() => void platform.close().finally(() => process.exit(0)));
  });
}
