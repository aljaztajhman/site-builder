/**
 * Optional environment variables the web service runs without. None of them stops the server: each
 * missing one turns off only the feature that needs it (which then refuses with a Slovene message), and
 * the server names them all in one line at startup.
 */

export interface MissingVar {
  name: string;
  /** What is off (or falls back) without it. */
  effect: string;
}

export function missingEnv(env: NodeJS.ProcessEnv = process.env): MissingVar[] {
  const deployed = env.NODE_ENV === "production";
  const out: MissingVar[] = [];
  if (!env.SESSION_SECRET) out.push({ name: "SESSION_SECRET", effect: "cookie, form-token and IP-hash keys derived from ACCESS_PASSWORD; changing the password signs everyone out" });
  const mail = deployed ? "owners can't sign in by email (the admin password works)" : "sign-in links are printed to this console";
  if (!env.RESEND_API_KEY) out.push({ name: "RESEND_API_KEY", effect: mail });
  if (!env.EMAIL_FROM) out.push({ name: "EMAIL_FROM", effect: mail });
  const bot = deployed ? "previews without an account are refused (signed-in owners can still generate)" : "the anonymous intake skips the bot check";
  if (!env.TURNSTILE_SITE_KEY) out.push({ name: "TURNSTILE_SITE_KEY", effect: bot });
  if (!env.TURNSTILE_SECRET_KEY) out.push({ name: "TURNSTILE_SECRET_KEY", effect: bot });
  if (!env.ANTHROPIC_API_KEY) out.push({ name: "ANTHROPIC_API_KEY", effect: "the intake's junk check runs in the worker's pipeline instead (after queueing)" });
  if (!env.APP_URL && !env.RAILWAY_PUBLIC_DOMAIN) {
    out.push({ name: "APP_URL", effect: deployed ? "no public address for sign-in links, so email sign-in is refused" : "sign-in links use the request's own address" });
  }
  return out;
}

/** The startup line, or null when everything is set. */
export function missingEnvLine(missing: MissingVar[]): string | null {
  if (!missing.length) return null;
  return `[web] not set: ${missing.map((m) => `${m.name} (${m.effect})`).join("; ")}`;
}
