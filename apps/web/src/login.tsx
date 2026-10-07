import type { Context, Hono } from "hono";
import type { AppConfig } from "@sb/config";
import { MailUnavailableError, isDisposableEmailDomain, normaliseEmail, type Mailer, type Repo } from "@sb/platform";
import { clearSession, issueSession, passwordMatches, loginThrottle, type AuthSettings } from "./auth.ts";
import {
  ACCOUNT_COOKIE,
  clearAccountSession,
  clientIp,
  csrfOk,
  hashToken,
  ipKey,
  issueAccountSession,
  newToken,
  safeNext,
  type AppEnv,
} from "./access.ts";
import { getCookie } from "hono/cookie";
import { Brand, Doc, html } from "./pages.tsx";
import type { Track } from "./analytics.ts";
import { cloudflareBeacon } from "./beacon.tsx";
import { PRODUCT_NAME } from "./ui/labels.ts";

/**
 * Sign-in. Business owners: email → magic link (sb-signin), no passwords. The link opens a page with
 * one button that signs in (a POST), so mail scanners that fetch links can't use it up. The admin keeps
 * the ACCESS_PASSWORD form, folded away on the same page.
 * Whether an address has an account never changes the answer (no account enumeration).
 */

export interface LoginDeps {
  repo: Repo;
  config: AppConfig;
  auth: AuthSettings;
  mailer: Mailer;
  /** Public origin for links in emails (APP_URL / RAILWAY_PUBLIC_DOMAIN); the request's own origin in development. */
  appUrl?: string;
  /** After a sign-in: what else the new session takes over (anonymous previews, in the limits). */
  onSignIn?: (c: Context<AppEnv>, accountId: string, token: { deviceId: string | null }) => Promise<void>;
  /** Product events (analytics.ts): a sign-in link asked for, a sign-in done. */
  track?: Track;
}

const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export function registerLoginRoutes(app: Hono<AppEnv>, deps: LoginDeps): void {
  const { repo, config, auth, mailer } = deps;
  const throttle = loginThrottle();
  const page = (c: Context<AppEnv>, p: Omit<LoginProps, "csrf">, status: 200 | 400 | 401 | 403 | 429 | 502 | 503 = 200) => c.html(loginPage({ ...p, csrf: c.get("csrf"), beacon: cloudflareBeacon(c, config) }), status);

  app.get("/login", (c) => page(c, { next: safeNext(c.req.query("next")) }));

  // The admin's password (unchanged; the password itself is the secret, and cross-site posts are refused).
  app.post("/login", async (c) => {
    const body = await c.req.parseBody();
    const next = safeNext(body.next);
    if (!throttle(clientIp(c))) return page(c, { next, adminError: "Preveč poskusov. Poskusite čez nekaj minut." }, 429);
    if (typeof body.password !== "string" || !passwordMatches(body.password, auth.password)) return page(c, { next, adminError: "Napačno geslo." }, 401);
    issueSession(c, auth);
    return c.redirect(next);
  });

  app.post("/login/email", async (c) => {
    const body = (await c.req.parseBody()) as Record<string, unknown>;
    const next = safeNext(body.next);
    const typed = typeof body.email === "string" ? body.email.slice(0, 254) : "";
    if (!csrfOk(c, body)) return page(c, { next, email: typed, error: "Obrazec je potekel. Poskusite znova." }, 403);
    const email = normaliseEmail(typed);
    if (!email) return page(c, { next, email: typed, error: "Vpišite veljaven e-poštni naslov, na primer ime@podjetje.si." }, 400);
    if (isDisposableEmailDomain(email.domain)) return page(c, { next, email: typed, error: "Naslovov za enkratno uporabo ne sprejemamo. Vpišite svoj stalni e-poštni naslov." }, 400);
    const ip = ipKey(auth.secret, clientIp(c));
    const limits = config.accounts.magicLink;
    if ((await repo.accounts.countLoginTokens({ emailKey: email.key }, 60)) >= limits.perEmailPerHour || (await repo.accounts.countLoginTokens({ ipKey: ip }, 60)) >= limits.perIpPerHour) {
      return page(c, { next, email: typed, error: "Preveč zahtev za prijavo. Poskusite čez nekaj minut." }, 429);
    }
    const base = deps.appUrl ?? (auth.secureCookies ? null : new URL(c.req.url).origin);
    if (!base) {
      console.error("[login] no APP_URL (or RAILWAY_PUBLIC_DOMAIN): can't build sign-in links");
      return page(c, { next, email: typed, error: "Prijava po e-pošti trenutno ni na voljo." }, 503);
    }
    const token = newToken();
    await repo.accounts.createLoginToken({ tokenHash: hashToken(token), email: email.email, emailKey: email.key, next, deviceId: c.get("deviceId"), ipKey: ip, ttlMinutes: limits.ttlMinutes });
    try {
      await mailer.send(magicLinkMail(email.email, `${base.replace(/\/$/, "")}/login/link?t=${token}`, limits.ttlMinutes, hashToken(token).slice(0, 40)));
    } catch (e) {
      if (e instanceof MailUnavailableError) {
        console.error("[login] RESEND_API_KEY is not set: sign-in links can't be sent");
        return page(c, { next, email: typed, error: "Prijava po e-pošti trenutno ni na voljo." }, 503);
      }
      console.error("[login] sending the sign-in link failed:", (e as Error).message);
      return page(c, { next, email: typed, error: "Sporočila nismo mogli poslati. Poskusite znova čez nekaj minut." }, 502);
    }
    await deps.track?.(c, { kind: "signin_requested" });
    return c.html(checkEmailPage({ email: email.email, minutes: limits.ttlMinutes }));
  });

  app.get("/login/link", async (c) => {
    const t = c.req.query("t") ?? "";
    const row = TOKEN.test(t) ? await repo.accounts.peekLoginToken(hashToken(t)) : null;
    c.header("cache-control", "no-store");
    return c.html(linkPage({ token: row ? t : null, email: row?.email ?? null, csrf: c.get("csrf") }), row ? 200 : 400);
  });

  app.post("/login/link", async (c) => {
    const body = (await c.req.parseBody()) as Record<string, unknown>;
    const t = typeof body.t === "string" ? body.t : "";
    if (!TOKEN.test(t)) return c.html(linkPage({ token: null, email: null, csrf: c.get("csrf") }), 400);
    // A stale form (the device cookie changed): show the button again with a fresh token instead of using the link up.
    if (!csrfOk(c, body)) {
      const row = await repo.accounts.peekLoginToken(hashToken(t));
      return c.html(linkPage({ token: row ? t : null, email: row?.email ?? null, csrf: c.get("csrf") }), row ? 403 : 400);
    }
    const used = await repo.accounts.useLoginToken(hashToken(t));
    if (!used) return c.html(linkPage({ token: null, email: null, csrf: c.get("csrf") }), 400);
    const account = await repo.accounts.signIn(used.email, used.email_key);
    const previous = getCookie(c, ACCOUNT_COOKIE);
    if (previous && previous.length <= 100) await repo.accounts.endSession(hashToken(previous));
    const session = newToken();
    await repo.accounts.createSession(hashToken(session), account.id, config.accounts.sessionDays);
    issueAccountSession(c, session, auth, config);
    // The device that asked for the link (where the funnel's earlier steps were), else this one.
    if (deps.track) {
      const allowed = await repo.accounts.allowed(account.email_key);
      await deps.track(c, { kind: "signin_done", accountId: account.id, tier: allowed ? "paid" : "free", plan: allowed?.plan ?? null }, used.device_id ? { deviceId: used.device_id } : {});
    }
    await deps.onSignIn?.(c, account.id, { deviceId: used.device_id });
    return c.redirect(safeNext(used.next), 303);
  });

  app.post("/logout", async (c) => {
    const body = (await c.req.parseBody()) as Record<string, unknown>;
    if (!csrfOk(c, body)) return c.text("Obrazec je potekel. Osvežite stran in poskusite znova.", 403);
    const token = getCookie(c, ACCOUNT_COOKIE);
    if (token && token.length <= 100) await repo.accounts.endSession(hashToken(token));
    clearAccountSession(c);
    clearSession(c);
    return c.redirect("/", 303);
  });
}

export function magicLinkMail(to: string, url: string, minutes: number, idempotencyKey: string) {
  const text = [
    "Pozdravljeni,",
    "",
    `za prijavo v ${PRODUCT_NAME} odprite to povezavo. Velja ${minutes} minut in jo lahko uporabite enkrat:`,
    url,
    "",
    "Če se niste prijavljali vi, sporočilo prezrite: brez te povezave se v vaš račun ne more prijaviti nihče.",
  ].join("\n");
  const html = `<p>Pozdravljeni,</p><p>za prijavo v ${PRODUCT_NAME} odprite to povezavo. Velja ${minutes} minut in jo lahko uporabite enkrat:</p><p><a href="${url}">Prijava v ${PRODUCT_NAME}</a></p><p>Če se niste prijavljali vi, sporočilo prezrite: brez te povezave se v vaš račun ne more prijaviti nihče.</p>`;
  return { to, subject: `Prijava v ${PRODUCT_NAME}`, text, html, idempotencyKey };
}

// ---------- Pages ----------

export interface LoginProps {
  next: string;
  csrf: string;
  email?: string;
  error?: string;
  adminError?: string;
  /** Cloudflare Web Analytics token for this response (beacon.tsx), or none. */
  beacon?: string | null;
}

const Hidden = ({ name, value }: { name: string; value: string }) => <input type="hidden" name={name} value={value} />;

export function loginPage({ next, csrf, email, error, adminError, beacon }: LoginProps): string {
  return html(
    <Doc title="Prijava" beacon={beacon}>
      <main className="login">
        <Brand href="/" />
        <h1>Prijava</h1>
        <p className="muted">Na vaš e-poštni naslov pošljemo povezavo za prijavo. Gesla ne potrebujete.</p>
        <form method="post" action="/login/email">
          <Hidden name="_csrf" value={csrf} />
          <Hidden name="next" value={next} />
          <label htmlFor="email">E-poštni naslov</label>
          <input
            id="email"
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            required
            autoFocus={!adminError}
            defaultValue={email}
            aria-describedby={error ? "email-err" : undefined}
            aria-invalid={error ? true : undefined}
          />
          {error && (
            <p id="email-err" className="help err" role="alert">
              {error}
            </p>
          )}
          <button className="btn primary block" type="submit">
            Pošlji povezavo
          </button>
        </form>
        <details className="note admin-login" open={adminError ? true : undefined}>
          <summary>Prijava za skrbnika</summary>
          <form method="post" action="/login">
            <Hidden name="next" value={next} />
            <label htmlFor="pw">Geslo za dostop</label>
            <input id="pw" type="password" name="password" autoComplete="current-password" required autoFocus={!!adminError} aria-describedby={adminError ? "pw-err" : undefined} aria-invalid={adminError ? true : undefined} />
            {adminError && (
              <p id="pw-err" className="help err" role="alert">
                {adminError}
              </p>
            )}
            <button className="btn block" type="submit">
              Prijava
            </button>
          </form>
        </details>
      </main>
    </Doc>,
  );
}

export function checkEmailPage({ email, minutes }: { email: string; minutes: number }): string {
  return html(
    <Doc title="Preverite e-pošto">
      <main className="login">
        <Brand href="/" />
        <h1>Preverite e-pošto</h1>
        <p>{`Na ${email} smo poslali povezavo za prijavo. Velja ${minutes} minut.`}</p>
        <p className="muted">Če sporočila ni v nekaj minutah, preverite mapo z neželeno pošto ali zahtevajte novo povezavo.</p>
        <a className="btn block" href="/login">
          Nova povezava
        </a>
      </main>
    </Doc>,
  );
}

export function linkPage({ token, email, csrf }: { token: string | null; email: string | null; csrf: string }): string {
  return html(
    <Doc title="Prijava">
      <main className="login">
        <Brand href="/" />
        {token ? (
          <>
            <h1>Prijava</h1>
            <p>{`Prijavljate se kot ${email}.`}</p>
            <form method="post" action="/login/link">
              <Hidden name="_csrf" value={csrf} />
              <Hidden name="t" value={token} />
              <button className="btn primary block" type="submit">
                Prijava
              </button>
            </form>
          </>
        ) : (
          <>
            <h1>Povezava ne velja več</h1>
            <p>Povezava za prijavo velja kratek čas in samo enkrat. Zahtevajte novo.</p>
            <a className="btn primary block" href="/login">
              Nova povezava
            </a>
          </>
        )}
      </main>
    </Doc>,
  );
}
