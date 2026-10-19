import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { AppConfig } from "@sb/config";
import type { Db, Query } from "./db.ts";
import type { BillingInterval, InvoiceLine, InvoiceListItem, InvoiceView, PlanKey, SubscriptionStatus, SubscriptionView } from "./billing-types.ts";
import type { StripeApi, StripeEvent, StripeInvoice, StripeSubscription } from "./billing-stripe.ts";

/**
 * Card payments through Stripe (owner, 2026-10-19; .claude/plans/m4-payments.md). Stripe holds the subscription and
 * takes the money; this module keeps what we act on: each account's subscription as Stripe last reported it (webhook
 * events, idempotent by event id), whether it gives paid rights now, and Postavi's own invoices, numbered per year
 * without gaps. Prices come from config (`plans.*`) and are found at Stripe by lookup key (`pnpm billing:sync-prices`).
 */

// ---------- Switch and price keys ----------

/** Billing is on: config `plans.billingEnabled`, or env BILLING_ENABLED=true (staging, Stripe test mode). */
export function billingEnabled(config: AppConfig, env: Record<string, string | undefined> = process.env): boolean {
  return config.plans.billingEnabled || env.BILLING_ENABLED === "true";
}

export type PriceSlot = `${PlanKey}_${BillingInterval}` | "standard_year_founding" | "setup";

/** `postavi_standard_year_v1`: the lookup key a price is found by at Stripe. */
export const lookupKey = (config: AppConfig, slot: PriceSlot): string => `${config.billing.lookupKeyPrefix}_${slot}_${config.billing.lookupKeyVersion}`;

const cents = (eur: number): number => Math.round(eur * 100);
export const round2 = (n: number): number => Math.round(n * 100) / 100;

/** The founding renewal price (yearly less the lifetime discount), € gross; null without a founding offer. */
export function foundingRenewalEur(config: AppConfig): number | null {
  const f = config.plans.standard.foundingOffer;
  if (!f) return null;
  return round2((config.plans.standard.yearlyEur * (100 - (f.renewalDiscountPercent ?? 0))) / 100);
}

export interface DesiredPrice {
  slot: PriceSlot;
  lookupKey: string;
  /** Our Stripe product id (`postavi_standard`, `postavi_setup`). */
  product: string;
  productName: string;
  unitAmountCents: number;
  interval: BillingInterval | null;
  nickname: string;
}

/** Every Stripe Price billing needs, from config. */
export function desiredPrices(config: AppConfig): DesiredPrice[] {
  const pre = config.billing.lookupKeyPrefix;
  const out: DesiredPrice[] = [];
  for (const plan of ["standard", "premium"] as const) {
    const p = config.plans[plan];
    for (const interval of ["month", "year"] as const) {
      out.push({
        slot: `${plan}_${interval}`,
        lookupKey: lookupKey(config, `${plan}_${interval}`),
        product: `${pre}_${plan}`,
        productName: p.name,
        unitAmountCents: cents(interval === "month" ? p.monthlyEur : p.yearlyEur),
        interval,
        nickname: `${p.name} ${interval === "month" ? "mesečno" : "letno"}`,
      });
    }
  }
  const renewal = foundingRenewalEur(config);
  if (renewal !== null) {
    out.push({
      slot: "standard_year_founding",
      lookupKey: lookupKey(config, "standard_year_founding"),
      product: `${pre}_standard`,
      productName: config.plans.standard.name,
      unitAmountCents: cents(renewal),
      interval: "year",
      nickname: `${config.plans.standard.name} letno, ustanovna cena`,
    });
  }
  out.push({
    slot: "setup",
    lookupKey: lookupKey(config, "setup"),
    product: `${pre}_setup`,
    productName: "Postavitev strani",
    unitAmountCents: cents(config.plans.standard.setupService.eur),
    interval: null,
    nickname: "Postavitev strani",
  });
  return out;
}

/** The one-time coupon that makes a founding customer's first year cost `firstYearEur`; null without the offer. */
export function foundingCoupon(config: AppConfig): { id: string; name: string; amountOffCents: number } | null {
  const f = config.plans.standard.foundingOffer;
  const renewal = foundingRenewalEur(config);
  if (!f || renewal === null || renewal <= f.firstYearEur) return null;
  return { id: `${config.billing.lookupKeyPrefix}_founding_first_year_${config.billing.lookupKeyVersion}`, name: "Ustanovna cena, prvo leto", amountOffCents: cents(renewal - f.firstYearEur) };
}

/**
 * What a lookup key sells, or null when it isn't one of ours. Any version counts (`…_v1`, `…_v2`): a subscription
 * keeps the price it was sold at after the prices move on.
 */
export function slotOfLookupKey(config: AppConfig, key: string | null | undefined): { plan: PlanKey; interval: BillingInterval; founding: boolean } | "setup" | null {
  if (!key || !key.startsWith(`${config.billing.lookupKeyPrefix}_`)) return null;
  const rest = key.slice(config.billing.lookupKeyPrefix.length + 1);
  if (/^setup_v\d+$/.test(rest)) return "setup";
  const m = /^(standard|premium)_(month|year)(_founding)?_v\d+$/.exec(rest);
  if (!m || (m[3] && (m[1] !== "standard" || m[2] !== "year"))) return null;
  return { plan: m[1] as PlanKey, interval: m[2] as BillingInterval, founding: !!m[3] };
}

/** Seller details still holding a `[[…]]` placeholder (the company doesn't exist yet). */
export function companyPlaceholders(config: AppConfig): string[] {
  return Object.entries(config.billing.company)
    .filter(([, v]) => typeof v === "string" && v.includes("[["))
    .map(([k]) => k);
}

// ---------- Rights ----------

export function mapStatus(s: string): SubscriptionStatus {
  if (s === "active" || s === "trialing" || s === "past_due" || s === "canceled") return s;
  if (s === "incomplete_expired" || s === "unpaid") return "canceled";
  return "incomplete";
}

/**
 * Paid rights hold: active or trialing, or past_due for at most `graceDays` since the failed payment; and never once
 * the paid period ended more than a day ago (a lost event can't leave rights open forever).
 */
export function isEntitled(sub: { status: SubscriptionStatus; past_due_since: string | Date | null; current_period_end?: string | Date | null }, now: Date, graceDays: number): boolean {
  if (sub.current_period_end && new Date(sub.current_period_end).getTime() < now.getTime() - 86400_000) return false;
  if (sub.status === "active" || sub.status === "trialing") return true;
  if (sub.status !== "past_due") return false;
  const since = sub.past_due_since ? new Date(sub.past_due_since).getTime() : now.getTime();
  return now.getTime() - since <= graceDays * 86400_000;
}

// ---------- Webhook signature ----------

/** Stripe-Signature for a payload (the fake Stripe in tests signs like Stripe does). */
export function signStripePayload(payload: string, secret: string, timestampSec: number): string {
  const v1 = createHmac("sha256", secret).update(`${timestampSec}.${payload}`, "utf8").digest("hex");
  return `t=${timestampSec},v1=${v1}`;
}

/**
 * Checks a `Stripe-Signature` header (`t=<unix>,v1=<hex>[,v1=…]`): HMAC-SHA256 of `<t>.<raw body>` with the endpoint's
 * signing secret, compared in constant time; the timestamp must be within `toleranceSec` of now (replays of old
 * deliveries are refused here; replays of a recent one are caught by the event id).
 */
export function verifyStripeSignature(payload: string, header: string | undefined, secret: string, toleranceSec: number, nowMs = Date.now()): boolean {
  if (!header || !secret) return false;
  let t: number | null = null;
  const sigs: string[] = [];
  for (const part of header.split(",")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k === "t" && /^\d+$/.test(v)) t = Number(v);
    else if (k === "v1" && /^[0-9a-f]{64}$/.test(v)) sigs.push(v);
  }
  if (t === null || !sigs.length) return false;
  if (Math.abs(nowMs / 1000 - t) > toleranceSec) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(`${t}.${payload}`, "utf8").digest("hex"));
  return sigs.some((s) => timingSafeEqual(Buffer.from(s), expected));
}

// ---------- Fiscal verification ----------

/**
 * FURS fiscal verification of an invoice (ZOI/EOR). Only "none" exists: card payments through Stripe, a licensed
 * payment institution, probably need none (FURS FAQ 220; the accountant confirms). A real verifier plugs in here.
 */
export interface FiscalVerifier {
  mode: "none";
  verify(view: InvoiceView): Promise<InvoiceView["fiscal"]>;
}

export function fiscalVerifierFor(config: AppConfig): FiscalVerifier {
  const mode = config.billing.fiscal.mode;
  if (mode !== "none") throw new Error(`unknown fiscal mode ${String(mode)}`);
  return { mode, verify: async () => null };
}

// ---------- Invoice view ----------

export const VAT_EXEMPT_NOTE = "DDV ni obračunan na podlagi 1. odstavka 94. člena ZDDV-1.";
export const PAID_BY_CARD_NOTE = "Plačano s kartico.";

const iso = (unixSec: number): string => new Date(unixSec * 1000).toISOString();

/** The year an invoice is numbered in: Slovenia's calendar year at the moment it was paid. */
export function invoiceYear(at: Date): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Ljubljana", year: "numeric" }).format(at));
}

export const invoiceNumber = (year: number, seq: number): string => `${year}-${String(seq).padStart(5, "0")}`;

export const subscriptionIdOf = (inv: StripeInvoice): string | null => inv.subscription ?? inv.parent?.subscription_details?.subscription ?? null;

const lineText = (config: AppConfig, slot: ReturnType<typeof slotOfLookupKey>, from: string, to: string): string | null => {
  if (slot === "setup") return "Postavitev strani (enkratna storitev)";
  if (!slot) return null;
  const d = (s: string) => new Date(s).toLocaleDateString("sl-SI", { timeZone: "Europe/Ljubljana" });
  return `Naročnina ${config.plans[slot.plan].name}, ${slot.interval === "year" ? "letna" : "mesečna"} (${d(from)}–${d(to)})`;
};

/**
 * What an invoice prints, from Stripe's paid invoice: lines with our Slovene texts (price ids mapped back to our
 * lookup keys), a discount line for whatever the lines and the paid total differ by (the founding coupon), VAT split
 * from the gross total by config `billing.vat`, the seller from config `billing.company`.
 */
export function buildInvoiceView(p: { id: string; number: string; issuedAt: Date; invoice: StripeInvoice; config: AppConfig; priceKeys: Map<string, string | null>; founding: boolean }): InvoiceView {
  const { invoice: inv, config } = p;
  const total = round2(inv.amount_paid / 100);
  const subLine = inv.lines.data.find((l) => l.period.end > l.period.start) ?? inv.lines.data[0];
  const serviceFrom = subLine ? iso(subLine.period.start) : iso(inv.created);
  const serviceTo = subLine ? iso(subLine.period.end) : iso(inv.created);
  const lines: InvoiceLine[] = inv.lines.data.map((l) => {
    const qty = l.quantity && l.quantity > 0 ? l.quantity : 1;
    const priceId = l.price?.id ?? l.pricing?.price_details?.price ?? null;
    const slot = slotOfLookupKey(config, priceId ? (p.priceKeys.get(priceId) ?? null) : null);
    const text = lineText(config, slot, iso(l.period.start), iso(l.period.end)) ?? l.description ?? "Storitev";
    return { text, qty, unitGrossEur: round2(l.amount / 100 / qty) };
  });
  const sum = round2(lines.reduce((s, l) => s + l.qty * l.unitGrossEur, 0));
  const diff = round2(total - sum);
  if (Math.abs(diff) >= 0.01) lines.push({ text: p.founding ? "Popust: ustanovna cena za prvo leto" : "Popust", qty: 1, unitGrossEur: diff });
  const exempt = config.billing.vat.mode === "exempt";
  const rate = exempt ? 0 : config.billing.vat.rate;
  const net = round2(total / (1 + rate));
  const a = inv.customer_address;
  const address = a ? [a.line1, a.line2, [a.postal_code, a.city].filter(Boolean).join(" "), a.country && a.country !== "SI" ? a.country : null].filter(Boolean).join(", ") : "";
  const taxId = inv.customer_tax_ids?.[0]?.value;
  const c = config.billing.company;
  const paidAt = inv.status_transitions?.paid_at ?? inv.created;
  return {
    id: p.id,
    number: p.number,
    issuedAt: p.issuedAt.toISOString(),
    serviceFrom,
    serviceTo,
    paidAt: iso(paidAt),
    paymentMethod: "card",
    seller: { name: c.name, address: c.address, taxId: c.taxId, registrationNo: c.registrationNo, ...(c.iban ? { iban: c.iban } : {}), email: c.email },
    buyer: { name: inv.customer_name || inv.customer_email || "", email: inv.customer_email ?? "", ...(address ? { address } : {}), ...(taxId ? { taxId } : {}) },
    lines,
    vat: { mode: exempt ? "exempt" : "included", rate, netEur: net, vatEur: round2(total - net) },
    totalEur: total,
    fiscal: null,
    notes: [PAID_BY_CARD_NOTE, ...(exempt ? [VAT_EXEMPT_NOTE] : [])],
  };
}

// ---------- Store ----------

export interface SubscriptionRow {
  id: string;
  account_id: string;
  stripe_customer_id: string;
  plan: PlanKey;
  billing_interval: BillingInterval;
  status: SubscriptionStatus;
  current_period_start: string | null;
  current_period_end: string;
  cancel_at_period_end: boolean;
  founding: boolean;
  past_due_since: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvoiceRow {
  id: string;
  stripe_invoice_id: string;
  account_id: string | null;
  subscription_id: string | null;
  number: string;
  year: number;
  seq: number;
  issued_at: string;
  total_eur: string | number;
  view: InvoiceView;
  pdf_key: string | null;
  emailed_at: string | null;
}

const isoOf = (v: string | Date | null): string | null => (v === null ? null : new Date(v).toISOString());

export function subscriptionView(row: SubscriptionRow, now: Date, graceDays: number): SubscriptionView {
  return {
    plan: row.plan,
    interval: row.billing_interval,
    status: row.status,
    currentPeriodEnd: isoOf(row.current_period_end)!,
    cancelAtPeriodEnd: row.cancel_at_period_end,
    founding: row.founding,
    entitled: isEntitled(row, now, graceDays),
    ...(row.status === "past_due" ? { graceEndsAt: new Date(new Date(row.past_due_since ?? now).getTime() + graceDays * 86400_000).toISOString() } : {}),
  };
}

/** Statuses that hold a subscription open (a second checkout is refused). */
export const OPEN_STATUSES: readonly SubscriptionStatus[] = ["active", "trialing", "past_due"];

/** Billing rows: Stripe customers, subscriptions, invoices, handled events. */
export class BillingStore {
  constructor(private readonly db: Db) {}

  async customerOf(accountId: string): Promise<string | null> {
    const { rows } = await this.db.query<{ stripe_customer_id: string }>("select stripe_customer_id from billing_customers where account_id = $1", [accountId]);
    return rows[0]?.stripe_customer_id ?? null;
  }

  async saveCustomer(accountId: string, customerId: string): Promise<void> {
    await this.db.query("insert into billing_customers (account_id, stripe_customer_id) values ($1, $2) on conflict (account_id) do nothing", [accountId, customerId]);
  }

  /** The account's subscription that matters: an open one first, else the latest. */
  async subscriptionOf(accountId: string): Promise<SubscriptionRow | null> {
    const { rows } = await this.db.query<SubscriptionRow>(
      `select * from subscriptions where account_id = $1
        order by case when status in ('active', 'trialing', 'past_due') then 0 else 1 end, updated_at desc limit 1`,
      [accountId],
    );
    return rows[0] ?? null;
  }

  /** Paid rights from a subscription now: its plan and since when (the allowance months count from there). */
  async entitlement(accountId: string, now: Date, graceDays: number): Promise<{ plan: PlanKey; since: string; founding: boolean } | null> {
    const s = await this.subscriptionOf(accountId);
    return s && isEntitled(s, now, graceDays) ? { plan: s.plan, since: isoOf(s.created_at)!, founding: s.founding } : null;
  }

  /**
   * The account had the founding price before (a founding subscription in any state) or paid us anything: the founding
   * coupon is for a first purchase only. Stripe can't limit a coupon per customer (max_redemptions counts everyone), so
   * this check is the limit.
   */
  async foundingUsedOrPaid(accountId: string): Promise<boolean> {
    const { rows } = await this.db.query(
      "select 1 from subscriptions where account_id = $1 and founding union all select 1 from invoices where account_id = $1 limit 1",
      [accountId],
    );
    return rows.length > 0;
  }

  async invoicesOf(accountId: string): Promise<InvoiceListItem[]> {
    const { rows } = await this.db.query<InvoiceRow>("select * from invoices where account_id = $1 order by issued_at desc, seq desc", [accountId]);
    return rows.map((r) => ({ id: r.id, number: r.number, issuedAt: isoOf(r.issued_at)!, totalEur: Number(r.total_eur), url: `/racun/${r.id}` }));
  }

  async invoice(id: string): Promise<InvoiceRow | null> {
    const { rows } = await this.db.query<InvoiceRow>("select * from invoices where id = $1", [id]);
    return rows[0] ?? null;
  }

  /** Invoices whose PDF or email is still to do, oldest first. */
  async pendingDocuments(limit = 10): Promise<InvoiceRow[]> {
    const { rows } = await this.db.query<InvoiceRow>("select * from invoices where emailed_at is null order by issued_at limit $1", [limit]);
    return rows;
  }

  async setPdf(id: string, key: string): Promise<void> {
    await this.db.query("update invoices set pdf_key = $2 where id = $1", [id, key]);
  }

  async markEmailed(id: string): Promise<void> {
    await this.db.query("update invoices set emailed_at = now() where id = $1", [id]);
  }

  async eventSeen(id: string): Promise<boolean> {
    const { rows } = await this.db.query("select 1 from stripe_events where id = $1", [id]);
    return rows.length > 0;
  }
}

// ---------- Webhook events ----------

export interface BillingDeps {
  db: Db;
  config: AppConfig;
  stripe: StripeApi;
  fiscal?: FiscalVerifier;
}

export type EventResult = "handled" | "duplicate" | "ignored";

const SUBSCRIPTION_EVENTS = new Set(["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"]);

/** A subscription as we store it, from Stripe's object. Null when it sells nothing of ours (another product). */
function subscriptionFields(config: AppConfig, sub: StripeSubscription): { plan: PlanKey; interval: BillingInterval; founding: boolean; start: string | null; end: string } | null {
  // The plan comes from what the subscription's price sells (its lookup key, any version), never from metadata.
  const item = sub.items.data.map((i) => ({ i, slot: slotOfLookupKey(config, i.price.lookup_key) })).find((x) => x.slot && x.slot !== "setup");
  if (!item || !item.slot || item.slot === "setup") return null;
  const endSec = item.i.current_period_end ?? sub.current_period_end;
  const startSec = item.i.current_period_start ?? sub.current_period_start;
  if (!endSec) return null;
  return { plan: item.slot.plan, interval: item.slot.interval, founding: item.slot.founding, start: startSec ? iso(startSec) : null, end: iso(endSec) };
}

/** An event about a Stripe customer no account of ours is known for: thrown so the webhook answers 500 and Stripe retries. */
export class UnknownCustomerError extends Error {
  constructor(customerId: string) {
    super(`Stripe customer ${customerId} belongs to no account`);
    this.name = "UnknownCustomerError";
  }
}

async function accountOfCustomer(q: Query, customerId: string): Promise<string | null> {
  const { rows } = await q<{ account_id: string }>("select account_id from billing_customers where stripe_customer_id = $1", [customerId]);
  return rows[0]?.account_id ?? null;
}

/** `now`: when we handle it; a newly past_due subscription's grace counts from the first failure we see. */
async function upsertSubscription(q: Query, config: AppConfig, sub: StripeSubscription, now: Date): Promise<boolean> {
  const f = subscriptionFields(config, sub);
  if (!f) return false;
  const accountId = await accountOfCustomer(q, sub.customer);
  if (!accountId) throw new UnknownCustomerError(sub.customer);
  const status = mapStatus(sub.status);
  const at = now;
  await q(
    `insert into subscriptions (id, account_id, stripe_customer_id, plan, billing_interval, status, current_period_start, current_period_end,
        cancel_at_period_end, founding, past_due_since, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, case when $6 = 'past_due' then $11::timestamptz end, now())
     on conflict (id) do update set plan = excluded.plan, billing_interval = excluded.billing_interval, status = excluded.status,
       current_period_start = excluded.current_period_start, current_period_end = excluded.current_period_end,
       cancel_at_period_end = excluded.cancel_at_period_end, founding = excluded.founding,
       past_due_since = case when excluded.status = 'past_due' then coalesce(subscriptions.past_due_since, excluded.past_due_since) end,
       updated_at = now()`,
    [sub.id, accountId, sub.customer, f.plan, f.interval, status, f.start, f.end, sub.cancel_at_period_end, f.founding, at.toISOString()],
  );
  return true;
}

/** A new invoice id: `inv_` and 16 hex characters. */
const newInvoiceId = (): string => `inv_${randomBytes(8).toString("hex")}`;

/**
 * Numbers and stores Postavi's invoice for a paid Stripe invoice, in the caller's transaction: the year's counter row
 * is taken (and locked) by the upsert, so concurrent invoices queue up and a rollback gives the number back.
 */
async function issueInvoice(q: Query, deps: BillingDeps, inv: StripeInvoice, priceKeys: Map<string, string | null>): Promise<string | null> {
  if (inv.amount_paid <= 0) return null;
  const { rows: exists } = await q("select 1 from invoices where stripe_invoice_id = $1", [inv.id]);
  if (exists.length) return null;
  const accountId = await accountOfCustomer(q, inv.customer);
  if (!accountId) throw new UnknownCustomerError(inv.customer);
  const subId = subscriptionIdOf(inv);
  const { rows: subRows } = subId ? await q<{ founding: boolean }>("select founding from subscriptions where id = $1", [subId]) : { rows: [] };
  // Issued on the day it was paid (Stripe's paid_at), and numbered in that day's year in Ljubljana, however late we handle it.
  const paidAt = new Date((inv.status_transitions?.paid_at ?? inv.created) * 1000);
  const at = paidAt;
  const year = invoiceYear(paidAt);
  const { rows: counter } = await q<{ last: number }>(
    "insert into invoice_counters (year, last) values ($1, 1) on conflict (year) do update set last = invoice_counters.last + 1 returning last",
    [year],
  );
  const seq = Number(counter[0]!.last);
  const id = newInvoiceId();
  const number = invoiceNumber(year, seq);
  const view = buildInvoiceView({ id, number, issuedAt: at, invoice: inv, config: deps.config, priceKeys, founding: subRows[0]?.founding ?? false });
  view.fiscal = await (deps.fiscal ?? fiscalVerifierFor(deps.config)).verify(view);
  await q(
    `insert into invoices (id, stripe_invoice_id, account_id, subscription_id, number, year, seq, issued_at, total_eur, view)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [id, inv.id, accountId, subId, number, year, seq, at.toISOString(), view.totalEur, JSON.stringify(view)],
  );
  return number;
}

/**
 * Handles one verified webhook event in one transaction: the event id is recorded (a replay returns "duplicate"); the
 * Stripe subscription's lock is taken (a transaction-scoped advisory lock on its id), and only then is Stripe asked
 * for its current state, so two events about one subscription run one after the other and the later one writes the
 * later state (an "active" snapshot fetched before a deletion can't land after it). Then the subscription and any
 * invoice are written. A throw (Stripe down, a customer we don't know) leaves nothing behind and Stripe delivers again.
 */
export async function handleStripeEvent(deps: BillingDeps, event: StripeEvent, now = new Date()): Promise<EventResult> {
  const { db, config, stripe } = deps;
  if (await new BillingStore(db).eventSeen(event.id)) return "duplicate";
  const obj = event.data.object;
  let subId: string | null = null;
  let invoice: StripeInvoice | null = null;
  if (event.type === "checkout.session.completed") subId = typeof obj.subscription === "string" ? obj.subscription : null;
  else if (SUBSCRIPTION_EVENTS.has(event.type)) subId = typeof obj.id === "string" ? obj.id : null;
  else if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
    invoice = obj as unknown as StripeInvoice;
    subId = subscriptionIdOf(invoice);
  }
  const known = subId !== null || invoice !== null;
  return db.transaction(async (q) => {
    const { rows } = await q("insert into stripe_events (id, type) values ($1, $2) on conflict (id) do nothing returning id", [event.id, event.type]);
    if (!rows.length) return "duplicate";
    if (!known) return "ignored";
    if (subId) await q("select pg_advisory_xact_lock($1, hashtext($2))", [SUBSCRIPTION_LOCK, subId]);
    const sub = subId ? await stripe.getSubscription(subId) : null;
    // A checkout's customer may be new to us when the session was made elsewhere (the dashboard): remember it.
    if (event.type === "checkout.session.completed" && typeof obj.customer === "string" && typeof obj.client_reference_id === "string") {
      const { rows: acc } = await q("select 1 from accounts where id = $1", [obj.client_reference_id]);
      if (acc.length) await q("insert into billing_customers (account_id, stripe_customer_id) values ($1, $2) on conflict do nothing", [obj.client_reference_id, obj.customer]);
    }
    if (sub) await upsertSubscription(q, config, sub, now);
    if (event.type === "invoice.paid" && invoice) {
      const priceKeys = new Map<string, string | null>();
      for (const p of await stripe.pricesByLookupKeys(desiredPrices(config).map((d) => d.lookupKey))) priceKeys.set(p.id, p.lookup_key);
      // Prices replaced by a later sync still name their slot through the subscription's own item.
      for (const it of sub?.items.data ?? []) if (!priceKeys.has(it.price.id)) priceKeys.set(it.price.id, it.price.lookup_key);
      await issueInvoice(q, deps, invoice, priceKeys);
    }
    return "handled";
  });
}

/** The advisory lock class for one Stripe subscription's events (the other key is its id's hash). */
const SUBSCRIPTION_LOCK = 727_274_025;
