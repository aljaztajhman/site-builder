import { platformFromEnv } from "@sb/platform";
import { startWorker } from "./worker.ts";

const platform = await platformFromEnv();
await startWorker(platform);
console.log("[worker] listening for generate, edit and publish jobs");

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    console.log(`[worker] ${sig}, draining`);
    void platform.close().finally(() => process.exit(0));
  });
}
