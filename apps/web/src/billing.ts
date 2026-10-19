import type { Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { AppConfig } from "@sb/config";
import {
  BillingStore,
  OPEN_STATUSES,
  billingEnabled,
  foundingCoupon,
  foundingRenewalEur,
  handleStripeEvent,
  isEntitled,
  lookupKey,
  subscriptionView,
  verifyStripeSignature,
  type BillingErrorCode,
  type BillingInterval,
  type BillingSummary,
  type InvoiceView,
  type PlanKey,
  type PriceSlot,
  type Repo,
  type Storage,
  type StripeApi,
  type StripeEvent,
} from "@sb/platform";
import { STRIPE_WEBHOOK_PATH, type AppEnv } from "./access.ts";

/**
 * Billing API (.claude/plans/m4-payments.md; contract in packages/platform/src/billing-types.ts). Card payments through
 * Stripe Checkout (mode subscription); plan changes, card updates and cancelling (at period end) in Stripe's Customer
 * Portal; Stripe's webhook keeps our subscription rows and issues Postavi's numbered invoices (platform billing.ts).
 *
 * - GET  /api/billing           the signed-in owner's BillingSummary
 * - POST /api/billing/checkout  { plan, interval, setup? } → { url } of a Stripe Checkout page
 * - POST /api/billing/portal    → { url } of the Stripe Customer Portal
 * - POST /api/billing/stripe    Stripe's webhook: raw body, Stripe-Signature checked; 200 handled or replayed, 400 bad signature/body
 * - GET  /racun/:id, /racun/:id.pdf   an invoice (its owner and the admin)
 */

export interface BillingRouteDeps {
  repo: Repo;
  storage: Storage;
  config: AppConfig;
  /** Stripe's API; null without STRIPE_SECRET_KEY (checkout and portal answer provider_error). */
  stripe: StripeApi | null;
  /** STRIPE_WEBHOOK_SECRET (whsec_…); without it every webhook is refused. */
  webhookSecret: string | null;
  /** Public origin for Stripe's return links; the request's own origin when not given (development). */
  appUrl?: string;
  /** The invoice page (Unit B's invoice-view.tsx once merged). */
  renderInvoiceHtml: (view: InvoiceView) => string;
  /** BILLING_ENABLED and the like (tests). */
  env?: Record<string, string | undefined>;
  /** How long found Stripe price ids are reused, ms (tests: 0). */
  priceCacheMs?: number;
}

const MESSAGES: Record<BillingErrorCode | "bad_request", string> = {
  billing_off: "Plačila še niso odprta. Ko odpremo, boste naročnino sklenili tukaj.",
  already_subscribed: "Naročnino že imate. Paket ali kartico zamenjate v naročnini.",
  no_subscription: "Naročnine še nimate.",
  not_signed_in: "Prijavite se z e-pošto, s katero ste naredili stran.",
  provider_error: "Plačilni sistem se ni odzval. Poskusite znova čez nekaj minut.",
  bad_request: "Izberite paket in obdobje plačevanja.",
};

const refuse = (c: Context, status: 400 | 401 | 403 | 409 | 503, code: BillingErrorCode | "bad_request") => c.json({ error: code, code, message: MESSAGES[code] }, status);

const isPlan = (v: unknown): v is PlanKey => v === "standard" || v === "premium";
const isInterval = (v: unknown): v is BillingInterval => v === "month" || v === "year";

export function registerBillingRoutes(app: Hono<AppEnv>, deps: BillingRouteDeps): void {
  const { repo, storage, config } = deps;
  const store = new BillingStore(repo.db);
  const on = () => billingEnabled(config, deps.env ?? process.env);
  const grace = config.billing.pastDueGraceDays;
  const base = (c: Context) => deps.appUrl ?? new URL(c.req.url).origin;

  // Stripe price ids by lookup key, found once and reused (a sync moves a key to a new price; the cache ages out).
  let priceCache: { at: number; ids: Map<string, string> } | null = null;
  async function priceIds(stripe: StripeApi, keys: string[]): Promise<Map<string, string>> {
    const fresh = priceCache && Date.now() - priceCache.at < (deps.priceCacheMs ?? 10 * 60_000) && keys.every((k) => priceCache!.ids.has(k));
    if (!fresh) {
      const ids = new Map<string, string>();
      for (const p of await stripe.pricesByLookupKeys(keys)) if (p.lookup_key) ids.set(p.lookup_key, p.id);
      priceCache = { at: Date.now(), ids };
    }
    return priceCache!.ids;
  }

  async function foundingLeft(): Promise<number | null> {
    const f = config.plans.standard.foundingOffer;
    if (!f || !foundingCoupon(config)) return null;
    return Math.max(0, f.customers - (await repo.accounts.foundingTaken()));
  }

  app.get("/api/billing", async (c) => {
    const v = c.get("viewer");
    if (v.kind === "anonymous") return refuse(c, 401, "not_signed_in");
    const enabled = on();
    const sub = v.kind === "account" ? await store.subscriptionOf(v.account.id) : null;
    const now = new Date();
    const allowed = v.kind === "account" ? await repo.accounts.allowed(v.account.email_key) : null;
    const left = enabled ? await foundingLeft() : null;
    const f = config.plans.standard.foundingOffer;
    const summary: BillingSummary = {
      enabled,
      subscription: sub ? subscriptionView(sub, now, grace) : null,
      grantedByAdmin: !!allowed && !(sub && isEntitled(sub, now, grace)),
      invoices: v.kind === "account" ? await store.invoicesOf(v.account.id) : [],
      prices: {
        standard: { name: config.plans.standard.name, monthEur: config.plans.standard.monthlyEur, yearEur: config.plans.standard.yearlyEur },
        premium: { name: config.plans.premium.name, monthEur: config.plans.premium.monthlyEur, yearEur: config.plans.premium.yearlyEur },
      },
      founding: f && left ? { left, firstYearEur: f.firstYearEur, renewalEur: foundingRenewalEur(config)! } : null,
      setup: { eur: config.plans.standard.setupService.eur, includedYearly: { standard: config.plans.standard.setupService.includedYearly, premium: config.plans.premium.setupService.includedYearly } },
    };
    c.header("cache-control", "private, no-store");
    return c.json(summary);
  });

  app.use("/api/billing/checkout", bodyLimit({ maxSize: 4 * 1024 }));
  app.post("/api/billing/checkout", async (c) => {
    const v = c.get("viewer");
    if (v.kind !== "account") return refuse(c, v.kind === "anonymous" ? 401 : 403, "not_signed_in");
    if (!on()) return refuse(c, 403, "billing_off");
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || !isPlan(body.plan) || !isInterval(body.interval) || (body.setup !== undefined && typeof body.setup !== "boolean")) return refuse(c, 400, "bad_request");
    const plan = body.plan;
    const interval = body.interval;
    const sub = await store.subscriptionOf(v.account.id);
    if (sub && OPEN_STATUSES.includes(sub.status)) return refuse(c, 409, "already_subscribed");
    const stripe = deps.stripe;
    if (!stripe) return refuse(c, 503, "provider_error");

    // Founding: Osnovni yearly while places are left; the renewal price, and a one-time coupon for year one.
    const coupon = foundingCoupon(config);
    const founding = plan === "standard" && interval === "year" && coupon !== null && ((await foundingLeft()) ?? 0) > 0;
    const slots: PriceSlot[] = [founding ? "standard_year_founding" : `${plan}_${interval}`];
    const setupIncluded = interval === "year" && config.plans[plan].setupService.includedYearly;
    if (body.setup === true && !setupIncluded) slots.push("setup");
    try {
      const keys = slots.map((s) => lookupKey(config, s));
      const ids = await priceIds(stripe, keys);
      const missing = keys.filter((k) => !ids.has(k));
      if (missing.length) {
        console.error(`[billing] Stripe has no price for ${missing.join(", ")}: run pnpm billing:sync-prices`);
        return refuse(c, 503, "provider_error");
      }
      let customer = await store.customerOf(v.account.id);
      if (!customer) {
        customer = (await stripe.createCustomer({ email: v.account.email, accountId: v.account.id })).id;
        await store.saveCustomer(v.account.id, customer);
        // Two checkouts at once: the first saved customer wins.
        customer = (await store.customerOf(v.account.id)) ?? customer;
      }
      const session = await stripe.createCheckoutSession({
        customer,
        lineItems: keys.map((k) => ({ price: ids.get(k)!, quantity: 1 })),
        successUrl: `${base(c)}/narocnina?uspeh=1`,
        cancelUrl: `${base(c)}/narocnina?preklic=1`,
        clientReferenceId: v.account.id,
        metadata: { account_id: v.account.id, plan, interval, founding: String(founding) },
        ...(founding ? { couponId: coupon!.id } : {}),
      });
      return c.json({ url: session.url });
    } catch (e) {
      console.error(`[billing] checkout: ${(e as Error).message}`);
      return refuse(c, 503, "provider_error");
    }
  });

  app.post("/api/billing/portal", async (c) => {
    const v = c.get("viewer");
    if (v.kind !== "account") return refuse(c, v.kind === "anonymous" ? 401 : 403, "not_signed_in");
    if (!on()) return refuse(c, 403, "billing_off");
    const customer = await store.customerOf(v.account.id);
    if (!customer || !(await store.subscriptionOf(v.account.id))) return refuse(c, 409, "no_subscription");
    if (!deps.stripe) return refuse(c, 503, "provider_error");
    try {
      return c.json({ url: (await deps.stripe.createPortalSession({ customer, returnUrl: `${base(c)}/narocnina` })).url });
    } catch (e) {
      console.error(`[billing] portal: ${(e as Error).message}`);
      return refuse(c, 503, "provider_error");
    }
  });

  // Stripe's events: the raw body is what was signed, so it is read as text before anything parses it.
  app.use(STRIPE_WEBHOOK_PATH, bodyLimit({ maxSize: 512 * 1024 }));
  app.post(STRIPE_WEBHOOK_PATH, async (c) => {
    if (!deps.webhookSecret || !deps.stripe) return c.json({ error: "not_configured" }, 503);
    const payload = await c.req.text();
    if (!verifyStripeSignature(payload, c.req.header("stripe-signature"), deps.webhookSecret, config.billing.webhookToleranceSeconds)) {
      return c.json({ error: "bad_signature" }, 400);
    }
    let event: StripeEvent;
    try {
      event = JSON.parse(payload) as StripeEvent;
    } catch {
      return c.json({ error: "bad_body" }, 400);
    }
    if (typeof event?.id !== "string" || typeof event.type !== "string" || typeof event.created !== "number" || typeof event.data?.object !== "object") {
      return c.json({ error: "bad_body" }, 400);
    }
    try {
      const result = await handleStripeEvent({ db: repo.db, config, stripe: deps.stripe }, event);
      return c.json({ received: true, result });
    } catch (e) {
      // Not handled: nothing was written, and Stripe delivers the event again.
      console.error(`[billing] event ${event.id} (${event.type}): ${(e as Error).message}`);
      return c.json({ error: "failed" }, 500);
    }
  });

  // An invoice: its owner and the admin; anyone else gets a 404, so ids can't be probed.
  app.get("/racun/:file", async (c) => {
    const m = /^(inv_[0-9a-f]{16})(\.pdf)?$/.exec(c.req.param("file"));
    if (!m) return c.notFound();
    const v = c.get("viewer");
    const inv = await store.invoice(m[1]!);
    if (!inv || !(v.kind === "admin" || (v.kind === "account" && inv.account_id === v.account.id))) return c.notFound();
    c.header("cache-control", "private, no-store");
    c.header("x-robots-tag", "noindex");
    if (!m[2]) return c.html(deps.renderInvoiceHtml(inv.view));
    const pdf = inv.pdf_key ? await storage.get(inv.pdf_key) : null;
    if (!pdf) return c.text("Račun v PDF še pripravljamo. Poskusite znova čez minuto.", 404);
    c.header("content-type", "application/pdf");
    c.header("content-disposition", `inline; filename="racun-${inv.number}.pdf"`);
    return c.body(pdf as Uint8Array<ArrayBuffer>);
  });
}
