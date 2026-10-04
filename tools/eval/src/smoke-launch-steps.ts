/**
 * The deployed smoke test with the free-generation limits (it-smoke-test-limits), as one command:
 * `pnpm smoke:launch <site-id>`. Its anonymous steps need Cloudflare's always-pass Turnstile keys on the web service
 * for the length of the run. Those keys are swapped by the owner on Railway, never by this script; the script only
 * reads which kind of site key the landing page shows (a public value) and prints the steps. It never reads, prints
 * or stores the real keys.
 */

/** Cloudflare's documented always-pass test keys (developers.cloudflare.com/turnstile/troubleshooting/testing/): public. */
export const TURNSTILE_TEST_SITE_KEY = "1x00000000000000000000AA";
export const TURNSTILE_TEST_SECRET_KEY = "1x0000000000000000000000000000000AA";

/** Model spend of one run (remote-smoke.ts: one chat edit ~€0.02; remote-limits.ts: ~€0.40). */
export const SMOKE_EUR = 0.42;

/** Which Turnstile site key the deployed landing page carries: Cloudflare's test key, a real one, or none (no bot check). */
export function turnstileKeyKind(landingHtml: string): "test" | "production" | "none" {
  const m = /class="cf-turnstile"[^>]*data-sitekey="([^"]*)"/.exec(landingHtml) ?? /data-sitekey="([^"]*)"[^>]*class="cf-turnstile"/.exec(landingHtml);
  if (!m?.[1]) return "none";
  return m[1] === TURNSTILE_TEST_SITE_KEY ? "test" : "production";
}

/** The owner's steps before the run (swap in the test keys) and after it (restore the real ones). */
export function swapSteps(o: { url: string; siteId: string }): { before: string[]; after: string[] } {
  return {
    before: [
      `Budget: one run costs about €${SMOKE_EUR.toFixed(2)} in model calls; HQ meta/budget must allow kind "smoke" (or an approved approval) first.`,
      "Railway → project → environment \"preview\" → service web → Variables.",
      "Keep the current TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY where you keep secrets (Cloudflare dashboard → Turnstile shows them again). Don't paste them into chat, HQ or a terminal log.",
      `Set TURNSTILE_SITE_KEY = ${TURNSTILE_TEST_SITE_KEY} and TURNSTILE_SECRET_KEY = ${TURNSTILE_TEST_SECRET_KEY} (Cloudflare's public always-pass test keys), then deploy the staged changes.`,
      `Run: REMOTE_URL=${o.url} REMOTE_PASSWORD=<the access password> pnpm smoke:launch ${o.siteId}`,
    ],
    after: [
      "Railway → the same Variables: set TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY back to the real values and deploy.",
      `Check: pnpm smoke:launch ${o.siteId} --check says "production keys" (no model call), and the landing page's widget shows again.`,
      "Log the run's cost in HQ spend (kind smoke) from the [cost] lines or the admin page.",
    ],
  };
}
