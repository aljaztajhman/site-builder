import type { Context, Hono } from "hono";
import type { AppConfig } from "@sb/config";
import { UrlRefusedError, hostIsPrivate, normaliseUrl, urlCheckFindings, type Resolve, type UrlCheckResult } from "@sb/engine";
import type { Queue, Repo, UrlCheckRow } from "@sb/platform";
import { clientIp, csrfOk, ipKey, type AppEnv } from "./access.ts";
import { Brand, Doc, html } from "./pages.tsx";
import { TOKEN_FIELD, TURNSTILE_SCRIPT, type BotCheck } from "./turnstile.ts";

/**
 * The public website checker ("Brezplačen pregled spletne strani", /pregled; GO-TO-MARKET.md #6): a
 * business types its site's address and gets, in plain Slovene, what a phone visitor meets: speed, tap
 * targets, the call button, cookies before consent and the ZEPT company details. No model calls; the
 * worker runs it (`check-url`). Bot check, a per-visitor and a daily limit (config.checker); private
 * addresses are refused here already and again in the worker.
 */

export interface CheckerDeps {
  repo: Repo;
  queue: Queue;
  config: AppConfig;
  secret: string;
  botCheck: BotCheck;
  /** DNS for the early private-address refusal (tests pass their own). */
  resolve?: Resolve;
}

const SAFE_CHECK_ID = /^chk_[0-9a-f]{24}$/;
const THINGS: Record<number, string> = { 1: "eno stvar", 2: "dve stvari", 3: "tri stvari", 4: "štiri stvari" };

export function registerCheckerRoutes(app: Hono<AppEnv>, d: CheckerDeps): void {
  const { repo, queue, config } = d;
  const form = (c: Context<AppEnv>, p: { url?: string; error?: string }, status: 200 | 400 | 403 | 429 | 503 = 200) =>
    c.html(checkerPage({ csrf: c.get("csrf"), siteKey: d.botCheck.mode === "on" ? d.botCheck.siteKey : null, closed: d.botCheck.mode === "unavailable", ...p }), status);

  app.get("/pregled", (c) => form(c, {}));

  app.post("/pregled", async (c) => {
    const body = (await c.req.parseBody()) as Record<string, unknown>;
    const typed = typeof body.url === "string" ? body.url.slice(0, 2000) : "";
    if (!csrfOk(c, body)) return form(c, { url: typed, error: "Obrazec je potekel. Pošljite ga še enkrat." }, 403);
    if (d.botCheck.mode === "unavailable") return form(c, { url: typed, error: "Pregled trenutno ni na voljo." }, 503);
    const url = normaliseUrl(typed);
    if (!url) return form(c, { url: typed, error: "Vpišite naslov spletne strani, na primer www.vasepodjetje.si." }, 400);
    const ip = ipKey(d.secret, clientIp(c));
    if ((await repo.checks.count({ ipKey: ip }, 24)) >= config.checker.perIpPerDay) {
      return form(c, { url: typed, error: `Danes ste pregledali že ${config.checker.perIpPerDay} strani. Poskusite znova jutri.` }, 429);
    }
    if ((await repo.checks.count("all", 24)) >= config.checker.perDay) {
      return form(c, { url: typed, error: "Danes smo pregledali že veliko strani. Poskusite znova jutri." }, 429);
    }
    if (!(await d.botCheck.verify(body[TOKEN_FIELD]))) return form(c, { url: typed, error: "Preverjanje, da niste robot, ni uspelo. Počakajte trenutek in pošljite znova." }, 403);
    try {
      if (await hostIsPrivate(url.hostname, d.resolve)) return form(c, { url: typed, error: "Ta naslov ni javna spletna stran." }, 400);
    } catch (e) {
      return form(c, { url: typed, error: e instanceof UrlRefusedError ? e.message : "Strani na tem naslovu nismo mogli odpreti. Preverite naslov." }, 400);
    }
    const id = await repo.checks.create({ url: url.href, host: url.hostname, ipKey: ip, deviceId: c.get("deviceId") ?? null });
    await queue.send("check-url", { checkId: id });
    return c.redirect(`/pregled/${id}`, 303);
  });

  app.get("/pregled/:id", async (c) => {
    const id = c.req.param("id");
    const row = SAFE_CHECK_ID.test(id) ? await repo.checks.get(id) : null;
    if (!row) return c.notFound();
    c.header("cache-control", "no-store");
    // While the worker runs, the page reloads itself every 3 s (no script needed).
    if (row.status === "queued" || row.status === "running") c.header("refresh", "3");
    return c.html(reportPage(row));
  });
}

interface CheckerProps {
  csrf: string;
  siteKey: string | null;
  closed: boolean;
  url?: string;
  error?: string;
}

export function checkerPage({ csrf, siteKey, closed, url, error }: CheckerProps): string {
  return html(
    <Doc title="Brezplačen pregled spletne strani">
      <main className="login checker">
        <Brand href="/" />
        <h1>Pregled spletne strani</h1>
        <p className="muted">
          Vpišite naslov svoje spletne strani. Odpremo jo kot obiskovalec na telefonu in v dobri minuti povemo, kaj deluje in kaj bi popravili: hitrost, gumbe, klic s tapom, piškotke in
          podatke o podjetju.
        </p>
        <form method="post" action="/pregled">
          <input type="hidden" name="_csrf" value={csrf} />
          <label htmlFor="url">Naslov strani</label>
          <input
            id="url"
            name="url"
            type="text"
            inputMode="url"
            autoComplete="url"
            placeholder="www.vasepodjetje.si"
            required
            defaultValue={url}
            aria-describedby={error ? "url-err" : "url-help"}
            aria-invalid={error ? true : undefined}
          />
          {error ? (
            <p id="url-err" className="help err" role="alert">
              {error}
            </p>
          ) : (
            <p id="url-help" className="help">
              Brezplačno, brez prijave. Pregledamo samo prvo stran.
            </p>
          )}
          {siteKey && <div className="cf-turnstile" data-sitekey={siteKey} data-language="sl" />}
          <button className="btn primary block" type="submit" disabled={closed || undefined}>
            Preglej stran
          </button>
        </form>
        <p className="help">Naslov in rezultat hranimo 30 dni, da lahko povezavo do rezultata delite. Vsebine strani ne shranimo.</p>
      </main>
      {siteKey && <script src={TURNSTILE_SCRIPT} async defer />}
    </Doc>,
  );
}

export function reportPage(row: UrlCheckRow): string {
  const waiting = row.status === "queued" || row.status === "running";
  const result = row.status === "done" ? (row.result as UrlCheckResult) : null;
  const findings = result ? urlCheckFindings(result) : [];
  const toFix = findings.filter((f) => !f.ok);
  return html(
    <Doc title={`Pregled: ${row.host}`}>
      <main className="login checker">
        <Brand href="/" />
        <h1>{row.host}</h1>
        {waiting && (
          <p className="muted" role="status">
            Pregledujemo stran kot obiskovalec na telefonu. To traja dobro minuto; stran se osveži sama.
          </p>
        )}
        {row.status === "failed" && (
          <>
            <p className="help err" role="alert">
              {row.error ?? "Pregleda nismo mogli dokončati."}
            </p>
            <a className="btn block" href="/pregled">
              Poskusi z drugim naslovom
            </a>
          </>
        )}
        {result && (
          <>
            <p className="muted">
              {toFix.length === 0 ? "Na telefonu stran deluje dobro." : `Na telefonu smo našli ${THINGS[toFix.length] ?? `${toFix.length} stvari`}, ki bi jih popravili.`}{" "}
              Pregledano {new Date(result.checkedAt).toLocaleDateString("sl-SI", { day: "numeric", month: "long", year: "numeric" })}.
            </p>
            <ol className="findings">
              {[...toFix, ...findings.filter((f) => f.ok)].map((f) => (
                <li key={f.id} className={f.ok ? "ok" : "fix"}>
                  <span className="mark">{f.ok ? "V redu" : "Popravite"}</span>
                  <strong>{f.title}</strong>
                  <span>{f.detail}</span>
                </li>
              ))}
            </ol>
            <div className="note">
              <p>
                <strong>Kako bi lahko izgledala vaša stran?</strong> Opišite podjetje v nekaj stavkih in v minuti dobite brezplačen predogled nove strani, ki na telefonu deluje dobro.
              </p>
              <a className="btn primary block" href="/#zacni">
                Naredi predogled
              </a>
            </div>
            <p className="help">Samodejni pregled prve strani; ni pravni nasvet. Rezultat hranimo 30 dni.</p>
          </>
        )}
      </main>
    </Doc>,
  );
}
