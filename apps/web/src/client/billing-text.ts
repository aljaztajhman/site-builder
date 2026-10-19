/**
 * Slovene words and numbers for billing, shared by the server-rendered /narocnina page and the plan sheet in the
 * editor bundle (no DOM, no Node imports). Prices come from GET /api/billing (config); nothing here is a price.
 */
import type { BillingInterval, BillingSummary, PlanKey, SubscriptionView } from "@sb/platform";

const TZ = "Europe/Ljubljana";
const whole = new Intl.NumberFormat("sl-SI", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const cents = new Intl.NumberFormat("sl-SI", { style: "currency", currency: "EUR" });

/** "190 €", or "12,50 €" when there are cents. */
export const euros = (n: number): string => (Number.isInteger(n) ? whole : cents).format(n);
/** "19. oktober 2026" */
export const longDate = (iso: string): string => new Date(iso).toLocaleDateString("sl-SI", { timeZone: TZ, day: "numeric", month: "long", year: "numeric" });

export const PLAN_KEYS: PlanKey[] = ["standard", "premium"];
export const INTERVAL_LABEL: Record<BillingInterval, string> = { month: "mesečno", year: "letno" };
export const PER: Record<BillingInterval, string> = { month: "na mesec", year: "na leto" };

/** "še 37 prostih mest" (Slovene dual and plural). */
export function placesLeft(n: number): string {
  const m = n % 100;
  const word = m === 1 ? "prosto mesto" : m === 2 ? "prosti mesti" : m === 3 || m === 4 ? "prosta mesta" : "prostih mest";
  return `še ${n} ${word}`;
}

/** The plan's price for an interval: "190 € na leto". */
export const priceText = (s: BillingSummary, plan: PlanKey, interval: BillingInterval): string =>
  `${euros(interval === "year" ? s.prices[plan].yearEur : s.prices[plan].monthEur)} ${PER[interval]}`;

/** What a year costs less than twelve months, or 0. */
export const yearlySaving = (s: BillingSummary, plan: PlanKey): number => Math.max(0, s.prices[plan].monthEur * 12 - s.prices[plan].yearEur);

/** Whether the founding price applies to this choice (Osnovni yearly, places left). */
export const foundingApplies = (s: BillingSummary, plan: PlanKey, interval: BillingInterval): boolean => !!s.founding && s.founding.left > 0 && plan === "standard" && interval === "year";

/** "Ustanovna cena: prvo leto 99 €, nato 152 € na leto · še 37 prostih mest" */
export function foundingLine(s: BillingSummary): string | null {
  if (!s.founding || s.founding.left <= 0) return null;
  return `Ustanovna cena za ${s.prices.standard.name} letno: prvo leto ${euros(s.founding.firstYearEur)}, nato ${euros(s.founding.renewalEur)} na leto · ${placesLeft(s.founding.left)}`;
}

/** Whether this plan's yearly price includes the setup service. */
export const setupIncluded = (s: BillingSummary, plan: PlanKey, interval: BillingInterval): boolean => interval === "year" && s.setup.includedYearly[plan];

/** What the first payment is: the period's price (or the founding year) and the setup service when added. */
export function firstPayment(s: BillingSummary, plan: PlanKey, interval: BillingInterval, setup: boolean): number {
  const period = foundingApplies(s, plan, interval) ? s.founding!.firstYearEur : interval === "year" ? s.prices[plan].yearEur : s.prices[plan].monthEur;
  return period + (setup && !setupIncluded(s, plan, interval) ? s.setup.eur : 0);
}

/** The plan sheet's line above the button: today's amount and what follows. */
export function payLine(s: BillingSummary, plan: PlanKey, interval: BillingInterval, setup: boolean): string {
  const then = foundingApplies(s, plan, interval) ? s.founding!.renewalEur : interval === "year" ? s.prices[plan].yearEur : s.prices[plan].monthEur;
  return `Danes plačate ${euros(firstPayment(s, plan, interval, setup))}, nato ${euros(then)} ${interval === "year" ? "vsako leto" : "vsak mesec"}.`;
}

export type SubscriptionState = "none" | "active" | "ending" | "past_due" | "canceled" | "incomplete" | "granted";

/** Which /narocnina state the owner is in. A live subscription wins over an admin grant. */
export function subscriptionState(s: Pick<BillingSummary, "subscription" | "grantedByAdmin">): SubscriptionState {
  const sub = s.subscription;
  if (sub && sub.status !== "canceled" && sub.status !== "incomplete") {
    if (sub.status === "past_due") return "past_due";
    return sub.cancelAtPeriodEnd ? "ending" : "active";
  }
  if (s.grantedByAdmin) return "granted";
  if (sub?.status === "canceled") return "canceled";
  if (sub?.status === "incomplete") return "incomplete";
  return "none";
}

export const planLine = (s: BillingSummary, sub: SubscriptionView): string => `${s.prices[sub.plan].name}, ${INTERVAL_LABEL[sub.interval]}`;
