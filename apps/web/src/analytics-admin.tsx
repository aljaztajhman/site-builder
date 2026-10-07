import type { Context, Hono } from "hono";
import { Fragment } from "react";
import type { AppConfig } from "@sb/config";
import { engineSummary, type EngineSummary, type EventKind, type FunnelStep, type Repo } from "@sb/platform";
import type { AppEnv } from "./access.ts";
import { Doc, TopBar, html } from "./pages.tsx";
import { formatDateTime, formatEur } from "./ui/labels.ts";

/**
 * The admin's view of Stranko's own events (docs/plans/analytics.md Steps 1 and 3, it-analytics; admin only, see
 * access.ts): /admin/funnel, how far people get and how long each step takes; /admin/engine, what generation jobs
 * took, cost and where they failed (per job; the € per stage over time is the cost history's). Both read
 * product_events for the last 7 or 30 days (?dni=30), one query per table, and are there whether or not
 * config analytics.events writes anything.
 */

export interface AnalyticsAdminDeps {
  repo: Repo;
  config: AppConfig;
}

const WINDOWS = [7, 30] as const;
type Window = (typeof WINDOWS)[number];
const windowOf = (c: Context): Window => (c.req.query("dni") === "30" ? 30 : 7);
const since = (days: number, now = new Date()) => new Date(now.getTime() - days * 86400_000);

export function registerAnalyticsAdminRoutes(app: Hono<AppEnv>, { repo, config }: AnalyticsAdminDeps): void {
  app.get("/admin/funnel", async (c) => {
    const days = windowOf(c);
    const from = since(days);
    const [steps, refusals, limits, previews, fullSites, upsellsShown, upsellsClicked, other] = await Promise.all([
      repo.events.funnel(from),
      repo.events.countBy("intake_refused", "reason", from),
      repo.events.countBy("limit_hit", "which", from),
      repo.events.medianByTier("preview_ready", from),
      repo.events.medianByTier("site_generated", from),
      repo.events.countBy("upsell_shown", "where", from),
      repo.events.countBy("upsell_clicked", "where", from),
      Promise.all(OTHER.map(async (kind) => ({ kind, n: (await repo.events.daily(kind, from)).reduce((s, d) => s + d.n, 0) }))),
    ]);
    return c.html(funnelPage({ csrf: c.get("csrf"), days, on: config.analytics.events, steps, refusals, limits, previews, fullSites, upsellsShown, upsellsClicked, other }));
  });

  app.get("/admin/engine", async (c) => {
    const days = windowOf(c);
    const summary = engineSummary(await repo.events.generations(since(days)));
    return c.html(enginePage({ csrf: c.get("csrf"), days, on: config.analytics.events, summary }));
  });
}

// ---------- Words ----------

const STEP_LABEL: Partial<Record<EventKind, string>> = {
  landing_view: "Ogledi prve strani",
  intake_submitted: "Oddani opisi",
  preview_ready: "Pripravljeni predogledi",
  preview_opened: "Odprti predogledi",
  signin_done: "Prijave",
  preview_claimed: "Prevzeti predogledi",
  plan_changed: "Dodeljeni paketi",
  site_generated: "Celotne strani",
  published: "Objave",
};
const OTHER: EventKind[] = ["signin_requested", "edit_chat", "edit_direct", "exported", "domain_connected"];
const OTHER_LABEL: Partial<Record<EventKind, string>> = {
  signin_requested: "Zahtevane prijavne povezave",
  edit_chat: "Spremembe s pomočnikom",
  edit_direct: "Neposredne spremembe",
  exported: "Prenosi strani",
  domain_connected: "Povezane domene",
};
const TIER_LABEL: Record<string, string> = { anonymous: "brez prijave", free: "brezplačni račun", paid: "naročnik", admin: "skrbnik", "": "neznano" };
const OUTCOME_LABEL: Record<string, string> = { done: "uspešno", failed: "neuspešno", refused: "zavrnjeno", unknown: "neznano" };

/** "42 s", "3 min", "2,5 h", "3 dni". */
export function formatSeconds(s: number | null): string {
  if (s === null) return "–";
  if (s < 90) return `${Math.round(s)} s`;
  if (s < 90 * 60) return `${Math.round(s / 60)} min`;
  if (s < 36 * 3600) return `${(s / 3600).toLocaleString("sl-SI", { maximumFractionDigits: 1 })} h`;
  return `${(s / 86400).toLocaleString("sl-SI", { maximumFractionDigits: 1 })} dni`;
}
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)} %` : "–");
const eurOrDash = (n: number | null) => (n === null ? "–" : formatEur(n));

// ---------- Pages ----------

function Nav({ here, days }: { here: "funnel" | "engine"; days: Window }) {
  const path = here === "funnel" ? "/admin/funnel" : "/admin/engine";
  return (
    <nav className="row" aria-label="Analitika">
      <a className="btn sm" href="/admin/funnel" aria-current={here === "funnel" ? "page" : undefined}>
        Lijak
      </a>
      <a className="btn sm" href="/admin/engine" aria-current={here === "engine" ? "page" : undefined}>
        Motor
      </a>
      <span className="muted">Obdobje:</span>
      {WINDOWS.map((d) => (
        <a key={d} className={d === days ? "btn sm primary" : "btn sm quiet"} href={`${path}?dni=${d}`} aria-current={d === days ? "true" : undefined}>
          {`${d} dni`}
        </a>
      ))}
    </nav>
  );
}

function Off({ on }: { on: boolean }) {
  if (on) return null;
  return <p className="note">Beleženje dogodkov je izklopljeno (config analytics.events). Spodaj so samo že zapisani dogodki.</p>;
}

function CountTable({ caption, head, rows }: { caption: string; head: string; rows: { value: string; n: number }[] }) {
  if (!rows.length) return <p className="muted">{`${caption}: nič.`}</p>;
  return (
    <table>
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          <th scope="col">{head}</th>
          <th scope="col" className="num">
            Število
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.value}>
            <td>{r.value || "–"}</td>
            <td className="num">{r.n}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TierTable({ caption, rows }: { caption: string; rows: { tier: string; n: number; seconds: number | null; eur: number | null }[] }) {
  if (!rows.length) return <p className="muted">{`${caption}: nič.`}</p>;
  return (
    <table>
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          <th scope="col">Raven</th>
          <th scope="col" className="num">
            Število
          </th>
          <th scope="col" className="num">
            Čas (mediana)
          </th>
          <th scope="col" className="num">
            € (mediana)
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.tier}>
            <td>{TIER_LABEL[r.tier] ?? r.tier}</td>
            <td className="num">{r.n}</td>
            <td className="num">{formatSeconds(r.seconds)}</td>
            <td className="num">{eurOrDash(r.eur)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export interface FunnelPageProps {
  csrf: string;
  days: Window;
  on: boolean;
  steps: FunnelStep[];
  refusals: { value: string; n: number }[];
  limits: { value: string; n: number }[];
  previews: { tier: string; n: number; seconds: number | null; eur: number | null }[];
  fullSites: { tier: string; n: number; seconds: number | null; eur: number | null }[];
  upsellsShown: { value: string; n: number }[];
  upsellsClicked: { value: string; n: number }[];
  other: { kind: EventKind; n: number }[];
}

export function funnelPage(p: FunnelPageProps): string {
  return html(
    <Doc title="Lijak">
      <TopBar csrf={p.csrf} admin>
        <a className="btn quiet sm" href="/sites">
          Strani
        </a>
      </TopBar>
      <main className="messages analytics">
        <h1>Lijak</h1>
        <Nav here="funnel" days={p.days} />
        <Off on={p.on} />
        <section className="message" aria-labelledby="h-steps">
          <h2 id="h-steps">{`Koraki, zadnjih ${p.days} dni`}</h2>
          <p className="muted">
            »Naprej« je delež tistih s tem korakom (po napravi, strani ali računu), ki so prišli do naslednjega; čas je mediana od prvega koraka do prvega naslednjega. Paket je do plačevanja dodelitev s
            seznama v Skrbniku, zato je pred celotno stranjo in objavo.
          </p>
          <table>
            <caption className="sr-only">Koraki lijaka</caption>
            <thead>
              <tr>
                <th scope="col">Korak</th>
                <th scope="col" className="num">
                  Število
                </th>
                <th scope="col" className="num">
                  Naprej
                </th>
                <th scope="col" className="num">
                  Čas do naslednjega
                </th>
              </tr>
            </thead>
            <tbody>
              {p.steps.map((s) => (
                <tr key={s.kind}>
                  <th scope="row">{STEP_LABEL[s.kind] ?? s.kind}</th>
                  <td className="num">{s.events}</td>
                  <td className="num">{s.from === null ? "" : `${pct(s.reached ?? 0, s.from)} (${s.reached}/${s.from})`}</td>
                  <td className="num">{s.from === null ? "" : formatSeconds(s.medianSeconds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="message" aria-labelledby="h-previews">
          <h2 id="h-previews">Predogledi in celotne strani</h2>
          <p className="muted">Čas do prve shranjene različice in € vseh klicev opravila, po ravni naročnika.</p>
          <h3>Predogledi</h3>
          <TierTable caption="Predogledi po ravni" rows={p.previews} />
          <h3>Celotne strani</h3>
          <TierTable caption="Celotne strani po ravni" rows={p.fullSites} />
        </section>
        <section className="message" aria-labelledby="h-refusals">
          <h2 id="h-refusals">Zavrnjeni opisi</h2>
          <CountTable caption="Zavrnjeni opisi po razlogu" head="Razlog" rows={p.refusals} />
        </section>
        <section className="message" aria-labelledby="h-limits">
          <h2 id="h-limits">Dosežene omejitve</h2>
          <CountTable caption="Dosežene omejitve po vrsti" head="Omejitev" rows={p.limits} />
        </section>
        <section className="message" aria-labelledby="h-upsells">
          <h2 id="h-upsells">Ponudbe paketov</h2>
          <h3>Prikazane</h3>
          <CountTable caption="Prikazane ponudbe" head="Kje" rows={p.upsellsShown} />
          <h3>Kliknjene</h3>
          <CountTable caption="Kliknjene ponudbe" head="Kje" rows={p.upsellsClicked} />
        </section>
        <section className="message" aria-labelledby="h-other">
          <h2 id="h-other">Drugo</h2>
          <dl>
            {p.other.map((o) => (
              <Fragment key={o.kind}>
                <dt>{OTHER_LABEL[o.kind] ?? o.kind}</dt>
                <dd className="num">{o.n}</dd>
              </Fragment>
            ))}
          </dl>
        </section>
      </main>
    </Doc>,
  );
}

export function enginePage({ csrf, days, on, summary: s }: { csrf: string; days: Window; on: boolean; summary: EngineSummary }): string {
  return html(
    <Doc title="Motor">
      <TopBar csrf={csrf} admin>
        <a className="btn quiet sm" href="/sites">
          Strani
        </a>
      </TopBar>
      <main className="messages analytics">
        <h1>Motor</h1>
        <Nav here="engine" days={days} />
        <Off on={on} />
        <section className="message" aria-labelledby="h-jobs">
          <h2 id="h-jobs">{`Ustvarjanja, zadnjih ${days} dni`}</h2>
          <dl>
            <dt>Opravil</dt>
            <dd className="num">{`${s.jobs}${s.jobs ? ` (${Object.entries(s.outcomes).map(([k, n]) => `${OUTCOME_LABEL[k] ?? k} ${n}`).join(", ")})` : ""}`}</dd>
            <dt>Čas (mediana)</dt>
            <dd className="num">{`${formatSeconds(s.medianSeconds)}, do prve različice ${formatSeconds(s.medianFirstVersionSeconds)}`}</dd>
            <dt>€ na opravilo (mediana)</dt>
            <dd className="num">{eurOrDash(s.medianEur)}</dd>
            <dt>Omejitve</dt>
            <dd className="num">{`dnevna poraba ${s.capHits.spend}, slike paketa ${s.capHits.pictures}`}</dd>
            <dt>Ustvarjene slike</dt>
            <dd className="num">{`${s.pictures.total} v ${s.pictures.jobs} opravilih`}</dd>
            <dt>Ponovljeni klici vsebine</dt>
            <dd className="num">{s.retries}</dd>
          </dl>
        </section>
        <section className="message" aria-labelledby="h-stages">
          <h2 id="h-stages">Po korakih</h2>
          {s.stages.length ? (
            <table>
              <caption className="sr-only">Koraki ustvarjanja</caption>
              <thead>
                <tr>
                  <th scope="col">Korak</th>
                  <th scope="col" className="num">
                    Opravil
                  </th>
                  <th scope="col" className="num">
                    Čas
                  </th>
                  <th scope="col" className="num">
                    €
                  </th>
                </tr>
              </thead>
              <tbody>
                {s.stages.map((st) => (
                  <tr key={st.stage}>
                    <th scope="row">{st.stage}</th>
                    <td className="num">{st.jobs}</td>
                    <td className="num">{formatSeconds(st.seconds)}</td>
                    <td className="num">{eurOrDash(st.eur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted">Ni opravil.</p>
          )}
        </section>
        <section className="message" aria-labelledby="h-fail">
          <h2 id="h-fail">Kje se ustavi</h2>
          <h3>Neuspešna opravila po koraku</h3>
          <CountTable caption="Neuspešna opravila po koraku" head="Korak" rows={s.failuresByStage.map((f) => ({ value: f.stage, n: f.n }))} />
          <h3>Padli pregledi</h3>
          <CountTable caption="Padli pregledi" head="Pregled" rows={s.checksFailed.map((f) => ({ value: f.check, n: f.n }))} />
        </section>
        <section className="message" aria-labelledby="h-slow">
          <h2 id="h-slow">Najpočasnejša</h2>
          {s.slowest.length ? (
            <ol>
              {s.slowest.map((j) => (
                <li key={`${j.at}-${j.siteId}`}>
                  {j.siteId ? <a href={`/sites/${j.siteId}`}>{formatDateTime(j.at)}</a> : formatDateTime(j.at)}
                  <span className="num">{` · ${formatSeconds(j.seconds)} · ${formatEur(j.eur)} · ${OUTCOME_LABEL[j.outcome] ?? j.outcome} · ${TIER_LABEL[j.tier ?? ""] ?? j.tier}`}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted">Ni opravil.</p>
          )}
        </section>
        <section className="message" aria-labelledby="h-dir">
          <h2 id="h-dir">Smeri</h2>
          <CountTable caption="Izbrane smeri" head="Smer" rows={s.directions.map((d) => ({ value: d.direction, n: d.n }))} />
        </section>
      </main>
    </Doc>,
  );
}

/** The links on /admin to these pages. */
export const AnalyticsLinks = () => (
  <p className="row">
    <a className="btn sm" href="/admin/funnel">
      Lijak
    </a>
    <a className="btn sm" href="/admin/engine">
      Motor
    </a>
  </p>
);
