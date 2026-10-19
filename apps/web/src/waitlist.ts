import { createHmac } from "node:crypto";
import type { Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { AppConfig } from "@sb/config";
import type { Repo } from "@sb/platform";
import { clientIp, type AppEnv } from "./access.ts";
import { EMAIL } from "./form-email.ts";

/**
 * The pre-launch waitlist ("Obvestite me ob odprtju"): the postavi.si homepage (static, infra/coming-soon) posts an
 * address with consent here, on the app's host. One email goes out at launch, then the list is deleted (/zasebnost#waitlist).
 *
 * A plain urlencoded POST, so the homepage's fetch is a CORS simple request (no preflight). Without JavaScript the
 * form posts as a page and gets a short Slovene page back. The platform domain's origins may read the answer; any
 * other browser origin is refused (requests without an Origin aren't from a page on another site). The IP is kept
 * only as a keyed hash for the rate limits, deleted after a day (Repo.joinWaitlist).
 */

export const WAITLIST_PATH = "/api/waitlist";
const SOURCE = /^[a-z0-9-]{1,32}$/;

type Code = "invalid_email" | "consent_required" | "rate_limited" | "forbidden_origin";
const MESSAGES: Record<"ok" | Code, string> = {
  ok: "Hvala. Ko odpremo, vam pišemo.",
  invalid_email: "Vpišite veljaven e-poštni naslov.",
  consent_required: "Označite soglasje, da vam ob odprtju lahko pošljemo e-pošto.",
  rate_limited: "Iz vašega omrežja je bilo pravkar preveč prijav. Poskusite znova čez nekaj minut.",
  forbidden_origin: "Zahteva z druge strani ni dovoljena.",
};

/** The browser origins that may sign up and read the answer: the platform domain and its www. */
export function waitlistOrigins(platformDomain: string | null): Set<string> {
  return new Set(platformDomain ? [`https://${platformDomain}`, `https://www.${platformDomain}`] : []);
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The answer to a form posted without JavaScript: the message and a way back to the homepage. */
const resultPage = (text: string, back: string) =>
  `<!doctype html><html lang="sl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(text)}</title><style>body{font:18px/1.5 system-ui,sans-serif;max-width:36rem;margin:0 auto;padding:3rem 1rem;color:#0f1f22}a{display:inline-block;margin-top:1rem;padding:.75rem 0;font-weight:600;color:#0d6a73}</style></head><body><main><h1>${escapeHtml(text)}</h1><a href="${escapeHtml(back)}">Nazaj na Postavi.si</a></main></body></html>`;

export function registerWaitlistRoutes(app: Hono<AppEnv>, deps: { repo: Repo; config: AppConfig; secret: string; platformDomain: string | null }): void {
  const { repo, config } = deps;
  const origins = waitlistOrigins(deps.platformDomain);
  const home = deps.platformDomain ? `https://${deps.platformDomain}/` : "/";
  const senderKey = (ip: string) => createHmac("sha256", deps.secret).update(`waitlist:${ip}`).digest("hex").slice(0, 32);

  app.use(WAITLIST_PATH, bodyLimit({ maxSize: 4 * 1024 }));
  app.post(WAITLIST_PATH, async (c: Context<AppEnv>) => {
    const wantsJson = (c.req.header("accept") ?? "").includes("application/json");
    const reply = (status: 200 | 400 | 403 | 429, code?: Code) => {
      const text = MESSAGES[code ?? "ok"];
      if (wantsJson) return c.json(code ? { error: code, message: text } : { ok: true, message: text }, status);
      return c.html(resultPage(text, home), status);
    };

    const origin = c.req.header("origin");
    c.header("Vary", "Origin");
    if (origin !== undefined) {
      if (origins.has(origin)) c.header("Access-Control-Allow-Origin", origin);
      else if (!sameHost(origin, c.req.header("host"))) return reply(403, "forbidden_origin");
    }

    const body = (await c.req.parseBody().catch(() => ({}))) as Record<string, unknown>;
    const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() : "");
    // Bots fill every field; answer as if it worked so they learn nothing.
    if (str("website")) return reply(200);
    const email = str("email");
    if (email.length > 254 || !EMAIL.test(email)) return reply(400, "invalid_email");
    if (str("consent") !== "1") return reply(400, "consent_required");
    const source = SOURCE.test(str("source")) ? str("source") : "";

    const joined = await repo.joinWaitlist({
      email,
      source,
      senderKey: senderKey(clientIp(c)),
      per10Min: config.limits.waitlistPerSenderPer10Min,
      perDay: config.limits.waitlistPerSenderPerDay,
    });
    // An address already on the list gets the same answer and uses up the same limit: nobody learns who signed up.
    return joined === "limited" ? reply(429, "rate_limited") : reply(200);
  });
}

/** The app's own pages (a form on app.postavi.si itself). */
function sameHost(origin: string, host: string | undefined): boolean {
  try {
    return !!host && new URL(origin).host === host;
  } catch {
    return false;
  }
}
