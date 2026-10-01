/**
 * Bot check on the anonymous intake (`sb-bot-check`): Cloudflare Turnstile. Keys come from env
 * (TURNSTILE_SITE_KEY, TURNSTILE_SECRET_KEY). Without keys in development the check is skipped with a
 * log line; deployed without keys, anonymous generation is refused rather than left unguarded.
 * The widget's script loads only when the visitor starts on the form (client/home.ts), and the
 * visitor's IP is not sent to siteverify.
 */

export const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";
export const TURNSTILE_SCRIPT = `${TURNSTILE_ORIGIN}/turnstile/v0/api.js`;
export const SITEVERIFY_URL = `${TURNSTILE_ORIGIN}/turnstile/v0/siteverify`;
/** The form field the widget fills. */
export const TOKEN_FIELD = "cf-turnstile-response";

export interface BotCheck {
  /** on: verify tokens; skip: development without keys; unavailable: deployed without keys (refuse). */
  mode: "on" | "skip" | "unavailable";
  /** For the widget (mode "on"). */
  siteKey: string | null;
  verify(token: unknown): Promise<boolean>;
}

export function turnstile(opts: { siteKey: string; secretKey: string; fetch?: typeof fetch; timeoutMs?: number }): BotCheck {
  const doFetch = opts.fetch ?? fetch;
  return {
    mode: "on",
    siteKey: opts.siteKey,
    async verify(token) {
      // Tokens are at most 2048 characters (Cloudflare's server-side validation docs).
      if (typeof token !== "string" || !token || token.length > 2048) return false;
      try {
        const res = await doFetch(SITEVERIFY_URL, {
          method: "POST",
          body: new URLSearchParams({ secret: opts.secretKey, response: token }),
          signal: AbortSignal.timeout(opts.timeoutMs ?? 5000),
        });
        const body = (await res.json()) as { success?: unknown; "error-codes"?: unknown };
        if (body.success !== true) console.warn(`[turnstile] token refused: ${JSON.stringify(body["error-codes"] ?? [])}`);
        return body.success === true;
      } catch (e) {
        // Cloudflare unreachable: refuse (anonymous intake waits) rather than open the door.
        console.error("[turnstile] siteverify failed:", (e as Error).message);
        return false;
      }
    },
  };
}

export function botCheckFromEnv(env: NodeJS.ProcessEnv, deployed: boolean, doFetch?: typeof fetch): BotCheck {
  const siteKey = env.TURNSTILE_SITE_KEY;
  const secretKey = env.TURNSTILE_SECRET_KEY;
  if (siteKey && secretKey) return turnstile({ siteKey, secretKey, ...(doFetch ? { fetch: doFetch } : {}) });
  if (deployed) {
    console.error("[web] TURNSTILE_SITE_KEY / TURNSTILE_SECRET_KEY not set: anonymous previews are refused until they are (signed-in owners can still generate)");
    return { mode: "unavailable", siteKey: null, verify: async () => false };
  }
  console.log("[web] TURNSTILE keys not set: the anonymous intake skips the bot check (development only)");
  return { mode: "skip", siteKey: null, verify: async () => true };
}
