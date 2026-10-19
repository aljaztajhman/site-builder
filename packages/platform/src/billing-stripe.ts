/**
 * Stripe's REST API with plain `fetch` (no SDK, like openprovider.ts and cloudflare-saas.ts): only the calls billing
 * needs. Field names from Stripe's API reference (https://docs.stripe.com/api): form-encoded POST bodies with
 * bracketed nested keys, Bearer secret key, `Idempotency-Key` on creates. Never logs the key or a request body.
 *
 * Both subscription shapes are read: before API version 2025-03-31 the period sits on the subscription
 * (`current_period_end`) and an invoice names its `subscription`; from then on the period sits on each subscription
 * item and the invoice names it under `parent.subscription_details`. The account's default API version decides.
 */

export const STRIPE_API = "https://api.stripe.com/v1";

export interface StripePrice {
  id: string;
  lookup_key: string | null;
  unit_amount: number | null;
  currency: string;
  recurring: { interval: "month" | "year" | "week" | "day" } | null;
  product: string | { id: string };
  active: boolean;
}

export interface StripeSubscription {
  id: string;
  customer: string;
  status: string;
  cancel_at_period_end: boolean;
  current_period_start?: number;
  current_period_end?: number;
  metadata: Record<string, string>;
  items: { data: { price: StripePrice; current_period_start?: number; current_period_end?: number }[] };
}

export interface StripeAddress {
  line1?: string | null;
  line2?: string | null;
  postal_code?: string | null;
  city?: string | null;
  country?: string | null;
}

export interface StripeInvoiceLine {
  description: string | null;
  /** Cents, before discounts. */
  amount: number;
  quantity: number | null;
  period: { start: number; end: number };
  price?: { id: string } | null;
  pricing?: { price_details?: { price?: string } } | null;
}

export interface StripeInvoice {
  id: string;
  customer: string;
  customer_email: string | null;
  customer_name: string | null;
  customer_address: StripeAddress | null;
  customer_tax_ids?: { type: string; value: string }[] | null;
  /** Cents actually paid. */
  amount_paid: number;
  currency: string;
  created: number;
  subscription?: string | null;
  parent?: { subscription_details?: { subscription?: string | null } | null } | null;
  status_transitions?: { paid_at?: number | null } | null;
  lines: { data: StripeInvoiceLine[] };
}

export interface StripeEvent {
  id: string;
  type: string;
  created: number;
  data: { object: Record<string, unknown> };
}

export interface CheckoutParams {
  customer: string;
  lineItems: { price: string; quantity: number }[];
  successUrl: string;
  cancelUrl: string;
  clientReferenceId: string;
  metadata: Record<string, string>;
  /** A one-time coupon on the first invoice (the founding year). */
  couponId?: string;
  /** Stripe drops a second create with the same key within 24 h (a double click). */
  idempotencyKey?: string;
}

export interface StripeApi {
  createCustomer(p: { email: string; accountId: string }): Promise<{ id: string }>;
  pricesByLookupKeys(keys: string[]): Promise<StripePrice[]>;
  createCheckoutSession(p: CheckoutParams): Promise<{ id: string; url: string }>;
  createPortalSession(p: { customer: string; returnUrl: string }): Promise<{ url: string }>;
  getSubscription(id: string): Promise<StripeSubscription>;
  // pnpm billing:sync-prices
  getProduct(id: string): Promise<{ id: string } | null>;
  createProduct(p: { id: string; name: string }): Promise<{ id: string }>;
  createPrice(p: { product: string; lookupKey: string; unitAmountCents: number; currency: string; interval: "month" | "year" | null; nickname: string }): Promise<StripePrice>;
  getCoupon(id: string): Promise<{ id: string; amount_off: number | null; duration: string } | null>;
  createCoupon(p: { id: string; name: string; amountOffCents: number; currency: string }): Promise<{ id: string }>;
}

export class StripeError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
  ) {
    super(message);
    this.name = "StripeError";
  }
}

/** `{a: {b: [1]}}` → `a[b][0]=1`, Stripe's form encoding. Undefined values are left out. */
export function formEncode(params: Record<string, unknown>): string {
  const out = new URLSearchParams();
  const walk = (v: unknown, key: string): void => {
    if (v === undefined || v === null) return;
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${key}[${i}]`));
    else if (typeof v === "object") for (const [k, x] of Object.entries(v as Record<string, unknown>)) walk(x, `${key}[${k}]`);
    else out.append(key, String(v));
  };
  for (const [k, v] of Object.entries(params)) walk(v, k);
  return out.toString();
}

export function stripeRest(opts: { secretKey: string; fetch?: typeof fetch; timeoutMs?: number; base?: string }): StripeApi {
  const doFetch = opts.fetch ?? fetch;
  const base = opts.base ?? STRIPE_API;
  async function call<T>(method: "GET" | "POST", path: string, params?: Record<string, unknown>, idempotencyKey?: string): Promise<T> {
    const body = params ? formEncode(params) : "";
    const url = method === "GET" && body ? `${base}${path}?${body}` : `${base}${path}`;
    const res = await doFetch(url, {
      method,
      headers: {
        authorization: `Bearer ${opts.secretKey}`,
        ...(method === "POST" ? { "content-type": "application/x-www-form-urlencoded" } : {}),
        ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
      },
      ...(method === "POST" ? { body } : {}),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: string } };
    if (!res.ok) throw new StripeError(`Stripe ${method} ${path}: HTTP ${res.status} ${json.error?.message ?? ""}`.trim(), res.status, json.error?.code ?? null);
    return json as T;
  }
  const orNull = async <T>(p: Promise<T>): Promise<T | null> => {
    try {
      return await p;
    } catch (e) {
      if (e instanceof StripeError && e.status === 404) return null;
      throw e;
    }
  };
  return {
    createCustomer: (p) => call("POST", "/customers", { email: p.email, metadata: { account_id: p.accountId } }, `customer-${p.accountId}`),
    async pricesByLookupKeys(keys) {
      if (!keys.length) return [];
      const r = await call<{ data: StripePrice[] }>("GET", "/prices", { lookup_keys: keys, active: true, limit: 100 });
      return r.data;
    },
    createCheckoutSession: (p) =>
      call(
        "POST",
        "/checkout/sessions",
        {
          mode: "subscription",
          customer: p.customer,
          line_items: p.lineItems,
          success_url: p.successUrl,
          cancel_url: p.cancelUrl,
          client_reference_id: p.clientReferenceId,
          metadata: p.metadata,
          subscription_data: { metadata: p.metadata },
          ...(p.couponId ? { discounts: [{ coupon: p.couponId }] } : {}),
          // A business buyer's VAT number goes on the invoice; Stripe saves the name and address it asks for on the customer.
          tax_id_collection: { enabled: true },
          billing_address_collection: "required",
          customer_update: { name: "auto", address: "auto" },
          locale: "sl",
        },
        p.idempotencyKey,
      ),
    createPortalSession: (p) => call("POST", "/billing_portal/sessions", { customer: p.customer, return_url: p.returnUrl }),
    getSubscription: (id) => call("GET", `/subscriptions/${encodeURIComponent(id)}`),
    getProduct: (id) => orNull(call("GET", `/products/${encodeURIComponent(id)}`)),
    createProduct: (p) => call("POST", "/products", { id: p.id, name: p.name }, `product-${p.id}`),
    createPrice: (p) =>
      call("POST", "/prices", {
        product: p.product,
        currency: p.currency,
        unit_amount: p.unitAmountCents,
        lookup_key: p.lookupKey,
        // A changed amount gets a new Price; the lookup key moves to it, so new checkouts use it.
        transfer_lookup_key: true,
        nickname: p.nickname,
        ...(p.interval ? { recurring: { interval: p.interval } } : {}),
      }),
    getCoupon: (id) => orNull(call("GET", `/coupons/${encodeURIComponent(id)}`)),
    createCoupon: (p) => call("POST", "/coupons", { id: p.id, name: p.name, amount_off: p.amountOffCents, currency: p.currency, duration: "once" }, `coupon-${p.id}`),
  };
}

/** Stripe from env: null without STRIPE_SECRET_KEY (billing can't run; the routes answer provider_error). */
export function stripeFromEnv(env: NodeJS.ProcessEnv = process.env): StripeApi | null {
  return env.STRIPE_SECRET_KEY ? stripeRest({ secretKey: env.STRIPE_SECRET_KEY }) : null;
}

/** Tests: an in-memory Stripe holding customers, prices, coupons, checkout sessions and subscriptions. No network. */
export function memoryStripe(): StripeApi & {
  customers: Map<string, { id: string; email: string; accountId: string }>;
  prices: StripePrice[];
  products: Set<string>;
  coupons: Map<string, { id: string; amount_off: number | null; duration: string }>;
  sessions: (CheckoutParams & { id: string; url: string })[];
  portals: { customer: string; returnUrl: string }[];
  subscriptions: Map<string, StripeSubscription>;
  calls: string[];
} {
  let n = 0;
  const id = (p: string) => `${p}_test${String(++n).padStart(6, "0")}`;
  const s = {
    customers: new Map<string, { id: string; email: string; accountId: string }>(),
    prices: [] as StripePrice[],
    products: new Set<string>(),
    coupons: new Map<string, { id: string; amount_off: number | null; duration: string }>(),
    sessions: [] as (CheckoutParams & { id: string; url: string })[],
    portals: [] as { customer: string; returnUrl: string }[],
    subscriptions: new Map<string, StripeSubscription>(),
    calls: [] as string[],
  };
  return {
    ...s,
    async createCustomer(p) {
      s.calls.push("createCustomer");
      const c = { id: id("cus"), email: p.email, accountId: p.accountId };
      s.customers.set(c.id, c);
      return { id: c.id };
    },
    async pricesByLookupKeys(keys) {
      s.calls.push("pricesByLookupKeys");
      return s.prices.filter((p) => p.active && p.lookup_key && keys.includes(p.lookup_key));
    },
    async createCheckoutSession(p) {
      s.calls.push("createCheckoutSession");
      const session = { ...p, id: id("cs"), url: `https://checkout.stripe.test/${n}` };
      s.sessions.push(session);
      return { id: session.id, url: session.url };
    },
    async createPortalSession(p) {
      s.calls.push("createPortalSession");
      s.portals.push(p);
      return { url: `https://billing.stripe.test/${p.customer}` };
    },
    async getSubscription(subId) {
      s.calls.push("getSubscription");
      const sub = s.subscriptions.get(subId);
      if (!sub) throw new StripeError(`No such subscription: ${subId}`, 404, "resource_missing");
      return structuredClone(sub);
    },
    async getProduct(pid) {
      return s.products.has(pid) ? { id: pid } : null;
    },
    async createProduct(p) {
      s.calls.push("createProduct");
      s.products.add(p.id);
      return { id: p.id };
    },
    async createPrice(p) {
      s.calls.push("createPrice");
      for (const old of s.prices) if (old.lookup_key === p.lookupKey) old.lookup_key = null;
      const price: StripePrice = { id: id("price"), lookup_key: p.lookupKey, unit_amount: p.unitAmountCents, currency: p.currency, recurring: p.interval ? { interval: p.interval } : null, product: p.product, active: true };
      s.prices.push(price);
      return price;
    },
    async getCoupon(cid) {
      return s.coupons.get(cid) ?? null;
    },
    async createCoupon(p) {
      s.calls.push("createCoupon");
      s.coupons.set(p.id, { id: p.id, amount_off: p.amountOffCents, duration: "once" });
      return { id: p.id };
    },
  };
}
