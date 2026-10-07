import type { ReactNode } from "react";
import { COST_POOLS, RUN_KINDS, type CostPool, type CostReport, type RunKind } from "@sb/platform";
import { Doc, TopBar, html } from "./pages.tsx";
import { formatDateTime, formatEur } from "./ui/labels.ts";

/**
 * The admin's cost history (/admin/costs): model and image spend over the last days, from `model_calls`
 * (Repo.costs). Read-only; settled calls only, calls in flight shown apart.
 */

/** The window in UTC days: 30 by default, at most 90 (?days=). */
export const COST_DAYS = { default: 30, max: 90, choices: [7, 30, 90] } as const;

export function costDays(raw: string | undefined): number {
  const n = raw && /^\d{1,4}$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isFinite(n) || n < 1) return COST_DAYS.default;
  return Math.min(n, COST_DAYS.max);
}

const POOL_LABEL: Record<CostPool, string> = { anonymous: "Brez prijave", free: "Brezplačni računi", paid: "Naročniki in skrbnik", untagged: "Brez oznake" };
const RUN_LABEL: Record<RunKind, string> = { "generate:home": "Domača stran", "generate:full": "Celotna stran", edit: "Urejanje v klepetu", alt: "Opisi fotografij" };
const STAGE_LABEL: Record<string, string> = {
  classify: "Razvrstitev opisa",
  brief: "Povzetek",
  design: "Oblikovanje",
  content: "Vsebina",
  critique: "Kritika",
  edit: "Urejanje v klepetu",
  altText: "Opisi fotografij",
  fullBuild: "Celotna stran",
  imageGen: "Generirane slike",
  judge: "Ocenjevanje (eval)",
};

/** Small amounts (a photo description is a few tenths of a cent) keep three decimals. */
const eur3 = new Intl.NumberFormat("sl-SI", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 3 });
const fmt = (n: number) => eur3.format(n);
const int = new Intl.NumberFormat("sl-SI");
/** Zadnjih 30 dni, with the Slovene number forms. */
export function lastDays(n: number): string {
  const m = n % 100;
  if (m === 1) return n === 1 ? "Zadnji dan" : `Zadnji ${n} dan`;
  if (m === 2) return `Zadnja ${n} dneva`;
  if (m === 3 || m === 4) return `Zadnji ${n} dnevi`;
  return `Zadnjih ${n} dni`;
}
const pct = (n: number) => `${Math.round(n * 100)} %`;
const dayLabel = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("sl-SI", { timeZone: "UTC", weekday: "short", day: "numeric", month: "numeric" });

/** A table in its own scroll box (the page itself never scrolls sideways at 360 px). */
function Table({ id, caption, children }: { id: string; caption: string; children: ReactNode }) {
  return (
    <div className="table-scroll" role="region" aria-labelledby={id} tabIndex={0}>
      <table>
        <caption id={id}>{caption}</caption>
        {children}
      </table>
    </div>
  );
}

export interface CostsPageProps {
  csrf: string;
  report: CostReport;
  spendToday: number;
  /** The daily cap and each pool's share of it, from config (today's values; earlier caps aren't kept). */
  cap: number;
  poolShares: Record<"anonymous" | "free" | "paid", number>;
}

export function costsPage({ csrf, report: r, spendToday, cap, poolShares }: CostsPageProps): string {
  const poolCap = (p: CostPool) => (p === "untagged" ? null : poolShares[p] * cap);
  const runs = RUN_KINDS.filter((k) => r.runs.some((x) => x.kind === k) || k !== "alt");
  const activeDays = r.perDay.filter((d) => d.calls > 0).length;
  return html(
    <Doc title="Poraba skozi čas">
      <TopBar spend={{ today: spendToday, cap }} csrf={csrf} admin>
        <a className="btn quiet sm" href="/sites">
          Strani
        </a>
      </TopBar>
      <main className="messages costs">
        <h1>Poraba skozi čas</h1>
        <p className="muted">
          {`${lastDays(r.days)} po UTC (${dayLabel(r.perDay.at(-1)!.day)} do ${dayLabel(r.perDay[0]!.day)}), iz dnevnika klicev modela in slik. Štejejo samo zaključeni klici; klici v teku (rezervacije po oceni) niso všteti nikjer spodaj in so prikazani ločeno. Omejitve so današnje iz nastavitev; starejših ne hranimo.`}
        </p>
        <nav className="row windows" aria-label="Obdobje">
          {COST_DAYS.choices.map((d) => (
            <a key={d} className={d === r.days ? "btn sm primary" : "btn sm"} href={`/admin/costs?days=${d}`} aria-current={d === r.days ? "page" : undefined}>
              {`${d} dni`}
            </a>
          ))}
          <a className="btn quiet sm" href="/admin">
            Nazaj na skrbnika
          </a>
        </nav>

        <article className="message">
          <dl>
            <dt>Skupaj</dt>
            <dd className="num">{`${formatEur(r.eur)}, klicev: ${int.format(r.calls)}`}</dd>
            <dt>Na dan</dt>
            <dd className="num">{`${formatEur(r.eur / r.days)} v povprečju, dnevi s porabo: ${activeDays}`}</dd>
            <dt>Dnevna omejitev</dt>
            <dd className="num">{formatEur(cap)}</dd>
            <dt>V teku zdaj</dt>
            <dd className="num">
              {r.pending.calls
                ? `klicev: ${int.format(r.pending.calls)}, rezervirano ${fmt(r.pending.eur)}${r.pending.oldest ? `, najstarejši ${formatDateTime(r.pending.oldest)}` : ""}`
                : "Nič"}
            </dd>
          </dl>
        </article>

        <h2>Na opravilo</h2>
        <p className="muted">Opravilo je eno ustvarjanje ali eno urejanje (vrstica v ai_jobs) z vsemi njegovimi klici, šteto na dan začetka. Klici brez opravila (eval, starejši zapisi) tu niso všteti.</p>
        {r.runs.length ? (
          <Table id="t-runs" caption="Cena na opravilo">
            <thead>
              <tr>
                <th scope="col">Vrsta</th>
                <th scope="col" className="num">Opravil</th>
                <th scope="col" className="num">Skupaj</th>
                <th scope="col" className="num">Povprečje</th>
                <th scope="col" className="num">Mediana</th>
                <th scope="col" className="num">p90</th>
              </tr>
            </thead>
            <tbody>
              {r.runs.map((x) => (
                <tr key={x.kind}>
                  <th scope="row">{RUN_LABEL[x.kind]}</th>
                  <td className="num">{int.format(x.runs)}</td>
                  <td className="num">{fmt(x.eur)}</td>
                  <td className="num">{fmt(x.eur / x.runs)}</td>
                  <td className="num">{fmt(x.median)}</td>
                  <td className="num">{fmt(x.p90)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <p className="muted">V tem obdobju ni bilo opravil.</p>
        )}

        <h2>Po fazah</h2>
        <p className="muted">Cena faze na opravilo: klici iste faze v istem opravilu so sešteti.</p>
        {r.stages.length ? (
          <Table id="t-stages" caption="Cena po fazah">
            <thead>
              <tr>
                <th scope="col">Faza</th>
                <th scope="col" className="num">Klicev</th>
                <th scope="col" className="num">Opravil</th>
                <th scope="col" className="num">Skupaj</th>
                <th scope="col" className="num">Mediana</th>
                <th scope="col" className="num">p90</th>
              </tr>
            </thead>
            <tbody>
              {r.stages.map((s) => (
                <tr key={s.stage}>
                  <th scope="row">
                    {STAGE_LABEL[s.stage] ?? s.stage} <span className="muted">{s.stage}</span>
                  </th>
                  <td className="num">{int.format(s.calls)}</td>
                  <td className="num">{int.format(s.runs)}</td>
                  <td className="num">{fmt(s.eur)}</td>
                  <td className="num">{fmt(s.median)}</td>
                  <td className="num">{fmt(s.p90)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <p className="muted">V tem obdobju ni bilo klicev.</p>
        )}

        <h2>Po dnevih</h2>
        <p className="muted">{`Poraba po bazenih in delež dnevne omejitve (${formatEur(cap)}); rdeče, kjer je bazen presegel svoj delež. Opravila: število in povprečna cena.`}</p>
        <Table id="t-days" caption="Poraba po dnevih">
          <thead>
            <tr>
              <th scope="col">Dan</th>
              <th scope="col" className="num">Skupaj</th>
              <th scope="col" className="num">Delež omejitve</th>
              {COST_POOLS.map((p) => (
                <th scope="col" className="num" key={p}>
                  {POOL_LABEL[p]}
                  {poolCap(p) !== null && <span className="muted">{` do ${formatEur(poolCap(p)!)}`}</span>}
                </th>
              ))}
              {runs.map((k) => (
                <th scope="col" className="num" key={k}>
                  {RUN_LABEL[k]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {r.perDay.map((d) => (
              <tr key={d.day}>
                <th scope="row">
                  <time dateTime={d.day}>{dayLabel(d.day)}</time>
                </th>
                <td className={`num${d.eur > cap ? " bad" : ""}`}>{d.calls ? formatEur(d.eur) : "–"}</td>
                <td className={`num${d.eur > cap ? " bad" : ""}`}>{d.calls ? pct(cap > 0 ? d.eur / cap : 0) : "–"}</td>
                {COST_POOLS.map((p) => {
                  const limit = poolCap(p);
                  return (
                    <td className={`num${limit !== null && d.pools[p] > limit ? " bad" : ""}`} key={p}>
                      {d.pools[p] ? formatEur(d.pools[p]) : "–"}
                    </td>
                  );
                })}
                {runs.map((k) => (
                  <td className="num" key={k}>
                    {d.runs[k].runs ? `${int.format(d.runs[k].runs)} · ${fmt(d.runs[k].eur / d.runs[k].runs)}` : "–"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </Table>

        <h2>Največ porabe: računi</h2>
        {r.topAccounts.length ? (
          <Table id="t-accounts" caption="Računi z največ porabe v obdobju">
            <thead>
              <tr>
                <th scope="col">Račun</th>
                <th scope="col" className="num">Strani</th>
                <th scope="col" className="num">Klicev</th>
                <th scope="col" className="num">Skupaj</th>
              </tr>
            </thead>
            <tbody>
              {r.topAccounts.map((a) => (
                <tr key={a.accountId}>
                  <th scope="row">{a.email ?? a.accountId}</th>
                  <td className="num">{int.format(a.sites)}</td>
                  <td className="num">{int.format(a.calls)}</td>
                  <td className="num">{fmt(a.eur)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <p className="muted">V tem obdobju ni porabe, vezane na račun.</p>
        )}

        <h2>Največ porabe: strani</h2>
        {r.topSites.length ? (
          <Table id="t-sites" caption="Strani z največ porabe v obdobju">
            <thead>
              <tr>
                <th scope="col">Stran</th>
                <th scope="col">Lastnik</th>
                <th scope="col" className="num">Klicev</th>
                <th scope="col" className="num">Skupaj</th>
              </tr>
            </thead>
            <tbody>
              {r.topSites.map((s) => {
                const owner = s.accountId ? (s.ownerEmail ?? s.accountId) : s.name ? "brez prijave" : "–";
                return (
                  <tr key={s.siteId}>
                    <th scope="row">{s.name ? <a href={`/sites/${s.siteId}`}>{s.name}</a> : <span className="muted">{`${s.siteId} (izbrisana)`}</span>}</th>
                    <td>{owner}</td>
                    <td className="num">{int.format(s.calls)}</td>
                    <td className="num">{fmt(s.eur)}</td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        ) : (
          <p className="muted">V tem obdobju ni porabe, vezane na stran.</p>
        )}
      </main>
    </Doc>,
  );
}
