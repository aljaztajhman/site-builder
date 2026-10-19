import type { ReactNode } from "react";
import type { BillingSummary, InvoiceListItem } from "@sb/platform";
import { Doc, TopBar, html } from "./pages.tsx";
import { PRODUCT_NAME } from "./ui/labels.ts";
import { clientScriptUrl } from "./client-bundle.ts";
import { euros, foundingLine, longDate, planLine, priceText, subscriptionState, type SubscriptionState } from "./client/billing-text.ts";

/**
 * /narocnina, the owner's plan page (M4 payments): what they pay, when the next charge is, how to change or cancel
 * (Stripe's customer portal), and their invoices. The backend (apps/web/src/billing.ts) mounts it with the owner's
 * GET /api/billing summary; client/billing.ts wires the buttons. States: no plan, active, ending at the period's
 * end, payment failed (past_due), canceled, granted by the admin; ?uspeh=1 and ?preklic=1 come back from Checkout.
 */
export interface NarocninaProps {
  summary: BillingSummary;
  email: string;
  csrf: string;
  /** From Stripe Checkout: ?uspeh=1 (paid) or ?preklic=1 (left without paying). */
  notice?: "uspeh" | "preklic" | null;
  /**
   * past_due only: the last day paid rights hold (the failed charge plus config's grace days). The contract's
   * SubscriptionView has no such field yet; without it the page says "nekaj dni".
   */
  graceEndsAt?: string | null;
}

const STATUS: Record<SubscriptionState, { label: string; tone: string }> = {
  none: { label: "Brez naročnine", tone: "plain" },
  active: { label: "Aktivna", tone: "live" },
  ending: { label: "Preklicana", tone: "busy" },
  past_due: { label: "Plačilo ni uspelo", tone: "err" },
  canceled: { label: "Potekla", tone: "plain" },
  incomplete: { label: "Plačilo ni zaključeno", tone: "busy" },
  granted: { label: "Dodeljena", tone: "live" },
};

/** A button the script shows (it needs the script: Checkout and the portal are API calls). */
const Action = ({ action, primary, children }: { action: "plans" | "portal"; primary?: boolean; children: ReactNode }) => (
  <button className={primary ? "btn primary" : "btn"} type="button" data-billing-action={action} hidden>
    {children}
  </button>
);

function Notice({ notice, entitled, email }: { notice: NarocninaProps["notice"]; entitled: boolean; email: string }) {
  if (notice === "preklic") return <p className="note" role="status">Plačila niste zaključili, zato vam ničesar nismo zaračunali. Paket lahko izberete kadarkoli.</p>;
  if (notice !== "uspeh") return null;
  return entitled ? (
    <p className="note ok" role="status">{`Hvala, plačilo je uspelo. Stran lahko zdaj objavite. Račun smo poslali na ${email}.`}</p>
  ) : (
    // Stripe answers the page before its webhook reaches us: the plan shows a moment later.
    <p className="note" role="status">Hvala, plačilo obdelujemo. Osvežite stran čez nekaj trenutkov.</p>
  );
}

function Status({ summary, graceEndsAt }: { summary: BillingSummary; graceEndsAt: string | null }) {
  const state = subscriptionState(summary);
  const sub = summary.subscription;
  const pill = <span className={`pill ${STATUS[state].tone}`}>{STATUS[state].label}</span>;
  const rows: [string, ReactNode][] = [];
  let text: ReactNode = null;
  let actions: ReactNode = null;
  if (sub && (state === "active" || state === "ending" || state === "past_due")) {
    rows.push(["Paket", planLine(summary, sub)]);
    if (sub.founding) rows.push(["Cena", "Ustanovna cena"]);
  }
  switch (state) {
    case "active":
      rows.push(["Naslednje plačilo", longDate(sub!.currentPeriodEnd)]);
      text = <p className="help">Paket, kartico in preklic urejate na varni strani Stripe. Preklic velja do konca plačanega obdobja.</p>;
      actions = <Action action="portal">Spremeni ali prekliči</Action>;
      break;
    case "ending":
      rows.push(["Velja do", longDate(sub!.currentPeriodEnd)]);
      text = <p className="help">{`Naročnino ste preklicali. Do ${longDate(sub!.currentPeriodEnd)} stran objavljate in urejate kot doslej. Če si premislite, jo obnovite.`}</p>;
      actions = <Action action="portal">Obnovi ali spremeni</Action>;
      break;
    case "past_due":
      text = (
        <p className="note warn">
          {sub!.entitled
            ? `Zadnje plačilo s kartico ni uspelo. Posodobite kartico ${graceEndsAt ? `do ${longDate(graceEndsAt)}` : "v nekaj dneh"}, sicer strani ne boste mogli več objavljati.`
            : "Zadnje plačilo s kartico ni uspelo, zato strani zdaj ne morete objavljati. Ko plačate, je objava spet mogoča."}
        </p>
      );
      actions = (
        <Action action="portal" primary>
          Plačaj zdaj
        </Action>
      );
      break;
    case "granted":
      text = <p className="help">{`Paket vam je dodelila ekipa ${PRODUCT_NAME}. Plačilo ni potrebno.`}</p>;
      break;
    case "canceled":
      text = <p className="help">{`Naročnina je potekla ${longDate(sub!.currentPeriodEnd)}. Za novo objavo izberite paket.`}</p>;
      actions = summary.enabled ? (
        <Action action="plans" primary>
          Izberite paket
        </Action>
      ) : null;
      break;
    case "incomplete":
    case "none":
      text = summary.enabled ? (
        <p className="help">
          {state === "incomplete" ? "Plačilo ni bilo zaključeno. " : ""}
          Za objavo strani izberite paket. Plačate s kartico, mesečno ali letno, in stran objavite takoj po plačilu.
        </p>
      ) : (
        <p className="help">Plačevanje še ni na voljo. Ko bo, boste paket izbrali tukaj.</p>
      );
      actions = summary.enabled ? (
        <Action action="plans" primary>
          Izberite paket
        </Action>
      ) : null;
      break;
  }
  const founding = (state === "none" || state === "canceled" || state === "incomplete") && summary.enabled ? foundingLine(summary) : null;
  return (
    <section className="message billing-status" aria-labelledby="plan-title">
      <div className="billing-head">
        <h2 id="plan-title">Vaš paket</h2>
        {pill}
      </div>
      {rows.length > 0 && (
        <dl>
          {rows.map(([k, v]) => [<dt key={`${k}-t`}>{k}</dt>, <dd key={`${k}-d`}>{v}</dd>])}
        </dl>
      )}
      {text}
      {(state === "none" || state === "canceled" || state === "incomplete") && summary.enabled && (
        <ul className="billing-prices">
          {(["standard", "premium"] as const).map((k) => (
            <li key={k}>
              <strong>{summary.prices[k].name}</strong>
              <span className="num">{`${priceText(summary, k, "month")} ali ${priceText(summary, k, "year")}`}</span>
            </li>
          ))}
        </ul>
      )}
      {founding && <p className="help">{founding}</p>}
      {actions && <div className="billing-actions">{actions}</div>}
      <p className="help err" role="alert" id="billing-error" hidden />
    </section>
  );
}

function Invoices({ invoices }: { invoices: InvoiceListItem[] }) {
  return (
    <section className="message billing-invoices" aria-labelledby="invoices-title">
      <h2 id="invoices-title">Računi</h2>
      {invoices.length ? (
        <ul className="invoice-list">
          {invoices.map((i) => (
            <li key={i.id}>
              <span className="inv-no num">{`Račun ${i.number}`}</span>
              <span className="muted num">{`${longDate(i.issuedAt)} · ${euros(i.totalEur)}`}</span>
              <span className="inv-links">
                <a className="btn sm" href={i.url} aria-label={`Odpri račun ${i.number}`}>
                  Odpri
                </a>
                <a className="btn sm" href={`${i.url}.pdf`} aria-label={`Prenesi račun ${i.number} (PDF)`}>
                  PDF
                </a>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="help">Računov še ni. Po vsakem plačilu račun pošljemo po e-pošti in ga dodamo sem.</p>
      )}
    </section>
  );
}

export function renderNarocnina({ summary, email, csrf, notice = null, graceEndsAt = null }: NarocninaProps): string {
  return html(
    <Doc title="Naročnina" script={clientScriptUrl("billing")}>
      <TopBar csrf={csrf} billing>
        <a className="btn quiet sm" href="/sites">
          Moje strani
        </a>
      </TopBar>
      <main className="messages narocnina" id="narocnina" data-billing={JSON.stringify(summary)}>
        <h1>Naročnina</h1>
        <Notice notice={notice} entitled={summary.subscription?.entitled === true || summary.grantedByAdmin} email={email} />
        <Status summary={summary} graceEndsAt={graceEndsAt} />
        <Invoices invoices={summary.invoices} />
        <p className="help">{`Prijavljeni ste kot ${email}.`}</p>
      </main>
    </Doc>,
  );
}

/** ?uspeh=1 / ?preklic=1 from Stripe Checkout's return URLs. */
export const narocninaNotice = (q: (k: string) => string | undefined): NarocninaProps["notice"] => (q("uspeh") === "1" ? "uspeh" : q("preklic") === "1" ? "preklic" : null);
