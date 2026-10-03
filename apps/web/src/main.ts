import { serve } from "@hono/node-server";
import { loadConfig } from "@sb/config";
import { mailerFromEnv, platformFromEnv } from "@sb/platform";
import { drainMs, intakeClassifier, startWorker } from "@sb/worker/worker";
import { createApp } from "./app.ts";
import { retryFormNotifications } from "./form-email.ts";
import { sendMonthlyReports } from "./stats.ts";
import { authSettingsFromEnv } from "./auth.ts";
import { missingEnv, missingEnvLine } from "./env-check.ts";

const config = loadConfig();
const auth = authSettingsFromEnv();
const platform = await platformFromEnv();

// PGlite is single-process: with it (Docker-less dev) the web service also runs the job handlers.
const inline = process.env.RUN_WORKER_INLINE === "true" || platform.db.kind === "pglite";
const worker = inline ? await startWorker(platform, config) : null;
if (worker) console.log("[web] running job handlers in-process");

// Links in sign-in emails point here. Railway provides its public domain; APP_URL overrides it (custom domain).
const appUrl = process.env.APP_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : undefined);
const mailer = mailerFromEnv();
// Optional variables never stop the server: what's missing is named once, and only its feature is off.
const missing = missingEnvLine(missingEnv());
if (missing) console.warn(missing);

// The intake's junk check asks the classifier before a generation is queued (fails open: the pipeline asks again).
const app = createApp({ platform, config, auth, mailer, classifyIntake: intakeClassifier(platform, config), ...(appUrl ? { appUrl } : {}) });
const port = Number(process.env.PORT || 3000);
serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, (info) => console.log(`[web] http://localhost:${info.port}`));

// Contact-form emails that failed or timed out are retried here (the web service holds the mail settings).
const formRetry = setInterval(
  () => void retryFormNotifications({ repo: platform.repo, config, mailer, ...(appUrl ? { appUrl } : {}) }).catch((e: unknown) => console.error("[web] form email retry", e)),
  config.formEmail.retryEveryMinutes * 60_000,
);
formRetry.unref();
// Last month's cookieless counts to each published site's owner, once (stats.ts; also the web service's mail settings).
const reports = () => void sendMonthlyReports({ repo: platform.repo, config, mailer, ...(appUrl ? { appUrl } : {}) }).catch((e: unknown) => console.error("[web] monthly reports", e));
const reportTimer = setInterval(reports, 60 * 60_000);
reportTimer.unref();
setTimeout(reports, 60_000).unref();

// In-process job handlers drain like the worker service's (apps/worker/src/main.ts) before the database closes.
let stopping = false;
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    if (stopping) return;
    stopping = true;
    clearInterval(formRetry);
    clearInterval(reportTimer);
    void (worker ? worker.shutdown(drainMs(config)).catch((e: unknown) => console.error("[web] worker shutdown", e)) : Promise.resolve())
      .finally(() => void platform.close().finally(() => process.exit(0)));
  });
}
