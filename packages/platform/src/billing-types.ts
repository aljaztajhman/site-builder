/**
 * The billing contract shared by the backend (billing*.ts, apps/web/src/billing.ts, the worker's invoice job) and
 * the owner-facing UI (/narocnina, the plan sheet, the invoice view). Types only. Plan: .claude/plans/m4-payments.md.
 * Card payments through Stripe, monthly and yearly; a site is published only with an active plan; Postavi issues
 * its own numbered invoices (owner, 2026-10-19).
 */

/** Config keys of the paid plans (config `plans.standard` = Osnovni, `plans.premium` = Plus). */
export type PlanKey = "standard" | "premium";
export type BillingInterval = "month" | "year";

/** Stripe's subscription states we act on; anything else is stored as "incomplete". */
export type SubscriptionStatus = "active" | "trialing" | "past_due" | "canceled" | "incomplete";

export interface SubscriptionView {
  plan: PlanKey;
  interval: BillingInterval;
  status: SubscriptionStatus;
  /** End of the paid period (ISO 8601). The next charge, or the last day when cancelAtPeriodEnd. */
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  /** The founding price applies (first year €99, then the yearly price less the renewal discount). */
  founding: boolean;
  /** Paid rights hold now: active/trialing, or past_due within the grace days. */
  entitled: boolean;
}

export interface InvoiceListItem {
  id: string;
  /** e.g. "2026-00001": per year, gap-free. */
  number: string;
  issuedAt: string;
  totalEur: number;
  /** HTML view; the PDF is at `${url}.pdf`. */
  url: string;
}

export interface PlanPrice {
  name: string;
  monthEur: number;
  yearEur: number;
}

/** GET /api/billing for the signed-in owner. */
export interface BillingSummary {
  /** config `plans.billingEnabled` (or env BILLING_ENABLED on staging). When false, nothing below can be bought. */
  enabled: boolean;
  subscription: SubscriptionView | null;
  /** Rights from the admin's allow-list (design partners) without a subscription. */
  grantedByAdmin: boolean;
  invoices: InvoiceListItem[];
  prices: Record<PlanKey, PlanPrice>;
  /** Founding offer on Osnovni yearly while places are left; null when none are left or billing is off. */
  founding: { left: number; firstYearEur: number; renewalEur: number } | null;
  /** The optional "we set it up with you" service, €; per plan whether a yearly plan includes it. */
  setup: { eur: number; includedYearly: Record<PlanKey, boolean> };
}

/** POST /api/billing/checkout body. */
export interface CheckoutRequest {
  plan: PlanKey;
  interval: BillingInterval;
  /** Add the setup service to the first invoice (ignored where the plan includes it). */
  setup?: boolean;
}
/** POST /api/billing/checkout and /api/billing/portal answer. */
export interface RedirectAnswer {
  url: string;
}
/** Error codes of the billing API (Slovene `message` alongside). */
export type BillingErrorCode = "billing_off" | "already_subscribed" | "no_subscription" | "not_signed_in" | "provider_error";

/** VAT on invoices (config `billing.vat.mode`): prices are gross either way. */
export type VatMode = "included" | "exempt";

export interface InvoiceLine {
  text: string;
  qty: number;
  /** Gross unit price, € (incl. VAT when the mode is "included"). */
  unitGrossEur: number;
}

/** Everything the invoice view (HTML and PDF) prints. Amounts in €, rounded to cents. */
export interface InvoiceView {
  id: string;
  number: string;
  issuedAt: string;
  /** Date of service = start of the paid period. */
  serviceFrom: string;
  serviceTo: string;
  paidAt: string;
  paymentMethod: "card";
  seller: {
    name: string;
    address: string;
    taxId: string;
    registrationNo: string;
    iban?: string;
    email: string;
  };
  buyer: {
    name: string;
    email: string;
    address?: string;
    /** The buyer's VAT/tax id when they gave one at checkout. */
    taxId?: string;
  };
  lines: InvoiceLine[];
  vat: { mode: VatMode; rate: number; netEur: number; vatEur: number };
  totalEur: number;
  /** Fiscal verification (FURS): null unless config `billing.fiscal.mode` is not "none". */
  fiscal: { zoi: string; eor: string } | null;
  /** Legal sentences printed under the totals (VAT exemption, "Plačano s kartico", …). */
  notes: string[];
}
