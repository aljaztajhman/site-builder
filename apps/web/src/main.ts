import { serve } from "@hono/node-server";
import { loadConfig } from "@sb/config";
import { platformFromEnv } from "@sb/platform";
import { startWorker } from "@sb/worker/worker";
import { createApp } from "./app.ts";
import { authSettingsFromEnv } from "./auth.ts";

const config = loadConfig();
const auth = authSettingsFromEnv();
const platform = await platformFromEnv();

// PGlite is single-process: with it (Docker-less dev) the web service also runs the job handlers.
const inline = process.env.RUN_WORKER_INLINE === "true" || platform.db.kind === "pglite";
if (inline) {
  await startWorker(platform, config);
  console.log("[web] running job handlers in-process");
}

const app = createApp({ platform, config, auth });
const port = Number(process.env.PORT || 3000);
serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, (info) => console.log(`[web] http://localhost:${info.port}`));

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => void platform.close().finally(() => process.exit(0)));
}
